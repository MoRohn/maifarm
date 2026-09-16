//
//  DeviceOptimizedMonitoringService.swift
//  MaiFarm
//
//  Device-aware live monitoring, terminal streaming, and real-time metrics
//  Intelligently adapts monitoring UI and streaming based on device capabilities
//

import SwiftUI
import Combine
import os.log

// MARK: - Device Optimized Monitoring Service

@MainActor
final class DeviceOptimizedMonitoringService: ObservableObject, @unchecked Sendable {
    static let shared = DeviceOptimizedMonitoringService()

    // Published state
    @Published var currentProfile: MonitoringProfile
    @Published var activeConnections: [String: TerminalConnection] = [:]
    @Published var liveMetrics: LiveFarmMetrics = LiveFarmMetrics()
    @Published var connectionState: ConnectionState = .disconnected
    @Published var streamingQuality: StreamingQuality = .balanced

    // Configuration
    private let deviceManager = DeviceCapabilityManager.shared
    private let logger = Logger(subsystem: "app.maifarm", category: "Monitoring")
    private var cancellables = Set<AnyCancellable>()
    private var reconnectTask: Task<Void, Never>?
    private var metricsTimer: Timer?

    // WebSocket state
    private var webSocketTask: URLSessionWebSocketTask?
    private var pingTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var currentFarmId: String?

    // Circuit breaker for error resilience
    private var consecutiveErrors = 0
    private let maxConsecutiveErrors = 5
    private var circuitBreakerOpen = false
    private var lastErrorTime: Date?

    init() {
        self.currentProfile = MonitoringProfile.forDevice(DeviceCapabilityManager.shared.deviceType)
        setupNetworkMonitoring()
        setupMetricsCollection()
        setupMemoryPressureMonitoring()
    }

    // MARK: - Memory Pressure Monitoring

    private func setupMemoryPressureMonitoring() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleMemoryPressure()
        }
        #endif
    }

    private func handleMemoryPressure() {
        logger.warning("Memory pressure detected - trimming terminal buffers")

        // Aggressively trim all terminal buffers
        let reducedMaxLines = max(50, currentProfile.terminalBufferSize / 4)

        for (id, var connection) in activeConnections {
            if connection.outputLines.count > reducedMaxLines {
                connection.outputLines = Array(connection.outputLines.suffix(reducedMaxLines))
                activeConnections[id] = connection
            }
        }

        // Reset live metrics to free memory
        liveMetrics = LiveFarmMetrics()

        logger.info("Buffer trimming complete - reduced to \(reducedMaxLines) lines per terminal")
    }

    /// Manually trim buffers (can be called from outside)
    func trimBuffers(to maxLines: Int? = nil) {
        let targetLines = maxLines ?? currentProfile.terminalBufferSize / 2

        for (id, var connection) in activeConnections {
            if connection.outputLines.count > targetLines {
                connection.outputLines = Array(connection.outputLines.suffix(targetLines))
                activeConnections[id] = connection
            }
        }
    }

    // MARK: - Setup

    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                if connected && self?.connectionState == .disconnected {
                    Task { await self?.reconnectIfNeeded() }
                }
            }
            .store(in: &cancellables)
    }

    private func setupMetricsCollection() {
        // Adjust collection interval based on device
        let interval = currentProfile.metricsRefreshInterval
        metricsTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateLiveMetrics()
            }
        }
    }

    // MARK: - Connection Management

    func connect(to farmId: String) async throws {
        guard connectionState != .connected else { return }

        // Check circuit breaker
        if circuitBreakerOpen {
            // Allow retry after cooldown period (30 seconds)
            if let lastError = lastErrorTime,
               Date().timeIntervalSince(lastError) < 30 {
                throw APIError.rateLimited(retryAfter: 30)
            }
            // Reset circuit breaker after cooldown
            circuitBreakerOpen = false
            consecutiveErrors = 0
        }

        connectionState = .connecting
        currentFarmId = farmId
        logger.info("Connecting to farm monitoring: \(farmId)")

        do {
            // Get WebSocket URL from API
            let wsURL = try await MaiFarmAPI.shared.getWebSocketURL(for: farmId)

            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 30
            config.timeoutIntervalForResource = 300
            let session = URLSession(configuration: config)
            webSocketTask = session.webSocketTask(with: wsURL)
            webSocketTask?.resume()

            // Start receiving messages (non-blocking task)
            await startReceiving()

            // Start ping/pong for connection health
            startPingPong()

            // Restart metrics timer if needed
            if metricsTimer == nil {
                setupMetricsCollection()
            }

            connectionState = .connected
            logger.info("Connected to farm monitoring: \(farmId)")

            HapticManager.shared.notify(.success)

        } catch {
            connectionState = .error(error.localizedDescription)
            logger.error("Failed to connect: \(error.localizedDescription)")

            // Schedule reconnect based on device profile
            scheduleReconnect(for: farmId)
            throw error
        }
    }

    func disconnect() {
        logger.info("Disconnecting from monitoring...")

        // Cancel all tasks first
        receiveTask?.cancel()
        receiveTask = nil
        pingTask?.cancel()
        pingTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil

        // Invalidate timer
        metricsTimer?.invalidate()
        metricsTimer = nil

        // Close WebSocket
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        // Reset state
        connectionState = .disconnected
        currentFarmId = nil
        consecutiveErrors = 0
        circuitBreakerOpen = false

        // Clear buffers to free memory
        activeConnections.removeAll()
        liveMetrics = LiveFarmMetrics()

        logger.info("Disconnected from monitoring - all resources cleaned up")
    }

    private func startReceiving() async {
        // Use task-based loop instead of recursion to prevent stack overflow
        receiveTask = Task { [weak self] in
            guard let self = self else { return }

            while !Task.isCancelled {
                guard let webSocket = self.webSocketTask,
                      self.connectionState == .connected else {
                    break
                }

                do {
                    let message = try await webSocket.receive()

                    // Check cancellation after await
                    guard !Task.isCancelled else { break }

                    switch message {
                    case .string(let text):
                        await self.handleMessageSafely(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            await self.handleMessageSafely(text)
                        }
                    @unknown default:
                        self.logger.warning("Unknown WebSocket message type received")
                    }

                    // Reset error count on successful receive
                    self.consecutiveErrors = 0

                } catch {
                    guard !Task.isCancelled else { break }

                    self.consecutiveErrors += 1
                    self.lastErrorTime = Date()

                    if self.consecutiveErrors >= self.maxConsecutiveErrors {
                        self.circuitBreakerOpen = true
                        self.connectionState = .error("Connection unstable - circuit breaker activated")
                        self.logger.error("Circuit breaker activated after \(self.consecutiveErrors) consecutive errors")
                        break
                    }

                    if self.connectionState == .connected {
                        self.connectionState = .error(error.localizedDescription)
                        self.logger.error("WebSocket receive error: \(error.localizedDescription)")
                    }
                    break
                }
            }

            // Schedule reconnect if needed
            if let farmId = self.currentFarmId,
               self.connectionState != .disconnected,
               !self.circuitBreakerOpen {
                self.scheduleReconnect(for: farmId)
            }
        }
    }

    /// Safely handle messages with error boundaries
    private func handleMessageSafely(_ text: String) async {
        do {
            guard let data = text.data(using: .utf8) else {
                logger.warning("Failed to convert message to data")
                return
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            let message = try decoder.decode(MonitoringMessage.self, from: data)
            await processMessage(message)

        } catch {
            // Don't crash on malformed messages - just log and continue
            logger.warning("Failed to decode monitoring message: \(error.localizedDescription)")
        }
    }

    /// Process decoded message with proper type handling
    private func processMessage(_ message: MonitoringMessage) async {
        // Publish to SessionEventBus for Assistant to consume
        if let farmId = currentFarmId {
            await SessionEventBus.shared.publishFromMonitoring(message, sessionId: farmId)
        }

        switch message.type {
        case .terminalOutput:
            if let output = message.terminalOutput {
                await processTerminalOutput(output)
            }
        case .agentStatus:
            if let status = message.agentStatus {
                await processAgentStatus(status)
            }
        case .farmMetrics:
            if let metrics = message.metrics {
                await processMetrics(metrics)
            }
        case .farmStatus:
            if let status = message.farmStatus {
                await processFarmStatus(status)
            }
        }
    }

    // Old handleMessage removed - replaced by handleMessageSafely and processMessage

    private func startPingPong() {
        pingTask = Task {
            while connectionState == .connected {
                try? await Task.sleep(nanoseconds: UInt64(currentProfile.pingInterval * 1_000_000_000))
                webSocketTask?.sendPing { [weak self] error in
                    if let error = error {
                        self?.logger.warning("Ping failed: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    private func scheduleReconnect(for farmId: String) {
        guard currentProfile.autoReconnect else { return }

        reconnectTask?.cancel()
        reconnectTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(currentProfile.reconnectDelay * 1_000_000_000))

            guard !Task.isCancelled else { return }

            for attempt in 1...currentProfile.maxReconnectAttempts {
                do {
                    try await connect(to: farmId)
                    return
                } catch {
                    logger.warning("Reconnect attempt \(attempt) failed")
                    let backoff = currentProfile.reconnectDelay * Double(attempt)
                    try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
                }
            }

            connectionState = .failed
        }
    }

    private func reconnectIfNeeded() async {
        // Reconnect logic handled by scheduleReconnect
    }

    // MARK: - Terminal Output Processing

    private func processTerminalOutput(_ output: TerminalOutputMessage) async {
        let agentId = output.agentId

        if var connection = activeConnections[agentId] {
            // Apply device-specific buffer management
            connection.appendOutput(output.content, maxLines: currentProfile.terminalBufferSize)
            connection.lastActivity = Date()
            activeConnections[agentId] = connection
        } else {
            // Create new connection
            var connection = TerminalConnection(agentId: agentId, agentName: output.agentName ?? agentId)
            connection.appendOutput(output.content, maxLines: currentProfile.terminalBufferSize)
            activeConnections[agentId] = connection
        }
    }

    private func processAgentStatus(_ status: AgentStatusMessage) async {
        if var connection = activeConnections[status.agentId] {
            connection.status = status.status
            connection.currentTask = status.currentTask
            activeConnections[status.agentId] = connection
        }
    }

    private func processMetrics(_ metrics: FarmMetricsMessage) async {
        liveMetrics.tokensUsed = metrics.tokensUsed
        liveMetrics.estimatedCost = metrics.estimatedCost
        liveMetrics.tasksCompleted = metrics.tasksCompleted
        liveMetrics.filesGenerated = metrics.filesGenerated
        liveMetrics.lastUpdated = Date()
    }

    private func processFarmStatus(_ status: FarmStatusMessage) async {
        liveMetrics.farmStatus = status.status
        liveMetrics.progress = status.progress
        liveMetrics.timeRemaining = status.estimatedTimeRemaining

        if status.status == "completed" {
            HapticManager.shared.celebrate()
        }
    }

    private func updateLiveMetrics() {
        // Update derived metrics
        liveMetrics.connectionQuality = calculateConnectionQuality()
        liveMetrics.activeAgentCount = activeConnections.filter { $0.value.status == "active" }.count
    }

    private func calculateConnectionQuality() -> ConnectionQuality {
        guard connectionState == .connected else { return .poor }

        // Calculate based on recent activity
        let recentActivity = activeConnections.values.filter {
            $0.lastActivity.timeIntervalSinceNow > -10
        }.count

        if recentActivity == activeConnections.count && activeConnections.count > 0 {
            return .excellent
        } else if recentActivity > 0 {
            return .good
        }
        return .fair
    }

    // MARK: - Streaming Quality Control

    func adjustStreamingQuality(_ quality: StreamingQuality) {
        streamingQuality = quality

        // Send quality preference to server
        let message = StreamingQualityMessage(quality: quality.rawValue)
        if let data = try? JSONEncoder().encode(message) {
            webSocketTask?.send(.data(data)) { _ in }
        }

        logger.info("Streaming quality adjusted to: \(quality.rawValue)")
    }

    // MARK: - Terminal Layout Helpers

    func optimalTerminalLayout(for agentCount: Int) -> TerminalLayout {
        currentProfile.optimalLayout(for: agentCount)
    }

    func terminalConfiguration(for context: TerminalContext) -> TerminalConfig {
        currentProfile.terminalConfig(for: context)
    }
}

// MARK: - Monitoring Profile

struct MonitoringProfile {
    let deviceType: DeviceCapabilityManager.DeviceType
    let displayName: String

    // Connection settings
    let pingInterval: TimeInterval
    let reconnectDelay: TimeInterval
    let maxReconnectAttempts: Int
    let autoReconnect: Bool

    // Buffer settings
    let terminalBufferSize: Int  // Max lines to keep
    let outputChunkSize: Int     // Lines to display at once
    let scrollbackLines: Int     // History to keep

    // Display settings
    let maxVisibleTerminals: Int
    let supportsSplitView: Bool
    let supportsMultiWindow: Bool
    let supportsPictureInPicture: Bool

    // Metrics settings
    let metricsRefreshInterval: TimeInterval
    let showDetailedMetrics: Bool
    let showCostTracking: Bool

    // Terminal layouts
    let supportedLayouts: [TerminalLayout]
    let defaultLayout: TerminalLayout

    // Performance
    let streamingMode: StreamingMode
    let renderThrottleMs: Int

    // MARK: - Factory

    static func forDevice(_ type: DeviceCapabilityManager.DeviceType) -> MonitoringProfile {
        switch type {
        case .iPhone:
            return iPhoneProfile
        case .iPad:
            return iPadProfile
        case .mac:
            return macProfile
        }
    }

    // MARK: - Layout Calculator

    func optimalLayout(for agentCount: Int) -> TerminalLayout {
        switch deviceType {
        case .iPhone:
            return .single  // Always single on iPhone
        case .iPad:
            if agentCount <= 1 {
                return .single
            } else if agentCount <= 2 {
                return .splitHorizontal
            } else {
                return .grid2x2
            }
        case .mac:
            if agentCount <= 1 {
                return .single
            } else if agentCount <= 2 {
                return .splitHorizontal
            } else if agentCount <= 4 {
                return .grid2x2
            } else {
                return .grid3x2
            }
        }
    }

    func terminalConfig(for context: TerminalContext) -> TerminalConfig {
        switch context {
        case .fullScreen:
            return TerminalConfig(
                fontSize: deviceType == .iPhone ? 12 : 14,
                lineHeight: 1.4,
                showLineNumbers: deviceType != .iPhone,
                showTimestamps: true,
                maxLines: terminalBufferSize,
                theme: .default
            )
        case .splitView:
            return TerminalConfig(
                fontSize: deviceType == .mac ? 13 : 11,
                lineHeight: 1.3,
                showLineNumbers: false,
                showTimestamps: false,
                maxLines: terminalBufferSize / 2,
                theme: .compact
            )
        case .miniView:
            return TerminalConfig(
                fontSize: 10,
                lineHeight: 1.2,
                showLineNumbers: false,
                showTimestamps: false,
                maxLines: 50,
                theme: .minimal
            )
        case .pictureInPicture:
            return TerminalConfig(
                fontSize: 9,
                lineHeight: 1.1,
                showLineNumbers: false,
                showTimestamps: false,
                maxLines: 20,
                theme: .minimal
            )
        }
    }

    // MARK: - iPhone Profile

    static let iPhoneProfile = MonitoringProfile(
        deviceType: .iPhone,
        displayName: "Mobile Monitor",
        pingInterval: 30,
        reconnectDelay: 5,
        maxReconnectAttempts: 3,
        autoReconnect: true,
        terminalBufferSize: 200,
        outputChunkSize: 50,
        scrollbackLines: 500,
        maxVisibleTerminals: 1,
        supportsSplitView: false,
        supportsMultiWindow: false,
        supportsPictureInPicture: false,
        metricsRefreshInterval: 5,
        showDetailedMetrics: false,
        showCostTracking: true,
        supportedLayouts: [.single, .carousel],
        defaultLayout: .single,
        streamingMode: .efficient,
        renderThrottleMs: 100
    )

    // MARK: - iPad Profile

    static let iPadProfile = MonitoringProfile(
        deviceType: .iPad,
        displayName: "Tablet Monitor",
        pingInterval: 20,
        reconnectDelay: 3,
        maxReconnectAttempts: 5,
        autoReconnect: true,
        terminalBufferSize: 500,
        outputChunkSize: 100,
        scrollbackLines: 2000,
        maxVisibleTerminals: 4,
        supportsSplitView: true,
        supportsMultiWindow: true,
        supportsPictureInPicture: true,
        metricsRefreshInterval: 3,
        showDetailedMetrics: true,
        showCostTracking: true,
        supportedLayouts: [.single, .splitHorizontal, .splitVertical, .grid2x2, .carousel],
        defaultLayout: .splitHorizontal,
        streamingMode: .balanced,
        renderThrottleMs: 50
    )

    // MARK: - Mac Profile

    static let macProfile = MonitoringProfile(
        deviceType: .mac,
        displayName: "Workstation Monitor",
        pingInterval: 15,
        reconnectDelay: 2,
        maxReconnectAttempts: 10,
        autoReconnect: true,
        terminalBufferSize: 2000,
        outputChunkSize: 200,
        scrollbackLines: 10000,
        maxVisibleTerminals: 9,
        supportsSplitView: true,
        supportsMultiWindow: true,
        supportsPictureInPicture: true,
        metricsRefreshInterval: 1,
        showDetailedMetrics: true,
        showCostTracking: true,
        supportedLayouts: [.single, .splitHorizontal, .splitVertical, .grid2x2, .grid3x2, .grid3x3, .carousel, .floating],
        defaultLayout: .grid2x2,
        streamingMode: .realtime,
        renderThrottleMs: 16  // ~60fps
    )
}

// MARK: - Supporting Types

enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)
    case failed

    var displayName: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .error(let msg): return "Error: \(msg)"
        case .failed: return "Connection Failed"
        }
    }

    var color: Color {
        switch self {
        case .disconnected: return .gray
        case .connecting: return .orange
        case .connected: return .green
        case .error: return .red
        case .failed: return .red
        }
    }
}

enum StreamingQuality: String, CaseIterable {
    case low = "low"
    case balanced = "balanced"
    case high = "high"
    case realtime = "realtime"

    var displayName: String {
        switch self {
        case .low: return "Battery Saver"
        case .balanced: return "Balanced"
        case .high: return "High Quality"
        case .realtime: return "Real-time"
        }
    }

    var refreshRate: Int {  // ms
        switch self {
        case .low: return 500
        case .balanced: return 100
        case .high: return 50
        case .realtime: return 16
        }
    }
}

enum StreamingMode: String {
    case efficient = "efficient"  // Batched updates, lower power
    case balanced = "balanced"    // Moderate refresh
    case realtime = "realtime"    // Immediate updates
}

enum TerminalLayout: String, CaseIterable, Identifiable {
    case single = "single"
    case splitHorizontal = "split_h"
    case splitVertical = "split_v"
    case grid2x2 = "grid_2x2"
    case grid3x2 = "grid_3x2"
    case grid3x3 = "grid_3x3"
    case carousel = "carousel"
    case floating = "floating"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .single: return "Single"
        case .splitHorizontal: return "Split Horizontal"
        case .splitVertical: return "Split Vertical"
        case .grid2x2: return "2x2 Grid"
        case .grid3x2: return "3x2 Grid"
        case .grid3x3: return "3x3 Grid"
        case .carousel: return "Carousel"
        case .floating: return "Floating Windows"
        }
    }

    var icon: String {
        switch self {
        case .single: return "rectangle"
        case .splitHorizontal: return "rectangle.split.2x1"
        case .splitVertical: return "rectangle.split.1x2"
        case .grid2x2: return "rectangle.split.2x2"
        case .grid3x2: return "rectangle.split.3x3"
        case .grid3x3: return "rectangle.split.3x3.fill"
        case .carousel: return "rectangle.stack"
        case .floating: return "macwindow.on.rectangle"
        }
    }

    var terminalCount: Int {
        switch self {
        case .single: return 1
        case .splitHorizontal, .splitVertical: return 2
        case .grid2x2: return 4
        case .grid3x2: return 6
        case .grid3x3: return 9
        case .carousel, .floating: return -1  // Dynamic
        }
    }
}

enum TerminalContext {
    case fullScreen
    case splitView
    case miniView
    case pictureInPicture
}

struct TerminalConfig {
    let fontSize: CGFloat
    let lineHeight: CGFloat
    let showLineNumbers: Bool
    let showTimestamps: Bool
    let maxLines: Int
    let theme: TerminalTheme

    enum TerminalTheme {
        case `default`
        case compact
        case minimal
        case highContrast
    }
}

enum ConnectionQuality: String {
    case excellent = "Excellent"
    case good = "Good"
    case fair = "Fair"
    case poor = "Poor"

    var color: Color {
        switch self {
        case .excellent: return .green
        case .good: return .blue
        case .fair: return .orange
        case .poor: return .red
        }
    }

    var icon: String {
        switch self {
        case .excellent: return "wifi"
        case .good: return "wifi"
        case .fair: return "wifi.exclamationmark"
        case .poor: return "wifi.slash"
        }
    }
}

// MARK: - Terminal Connection

struct TerminalConnection: Identifiable {
    let id: String
    let agentId: String
    let agentName: String
    var status: String = "initializing"
    var currentTask: String?
    var outputLines: [TerminalLine] = []
    var lastActivity: Date = Date()
    var isExpanded: Bool = false

    init(agentId: String, agentName: String) {
        self.id = agentId
        self.agentId = agentId
        self.agentName = agentName
    }

    mutating func appendOutput(_ content: String, maxLines: Int) {
        let lines = content.components(separatedBy: .newlines)
        for line in lines where !line.isEmpty {
            outputLines.append(TerminalLine(content: line))
        }

        // Trim buffer
        if outputLines.count > maxLines {
            outputLines.removeFirst(outputLines.count - maxLines)
        }
    }

    var recentOutput: String {
        outputLines.suffix(10).map { $0.content }.joined(separator: "\n")
    }
}

struct TerminalLine: Identifiable {
    let id = UUID()
    let content: String
    let timestamp: Date = Date()
    let type: LineType = .output

    enum LineType {
        case output
        case error
        case system
        case command
    }
}

// MARK: - Live Metrics

struct LiveFarmMetrics {
    var farmStatus: String = "idle"
    var progress: Double = 0
    var timeRemaining: TimeInterval?
    var tokensUsed: Int = 0
    var estimatedCost: Double = 0
    var tasksCompleted: Int = 0
    var filesGenerated: Int = 0
    var activeAgentCount: Int = 0
    var connectionQuality: ConnectionQuality = .good
    var lastUpdated: Date = Date()

    var formattedTimeRemaining: String {
        guard let remaining = timeRemaining else { return "Calculating..." }
        let minutes = Int(remaining / 60)
        if minutes >= 60 {
            return "\(minutes / 60)h \(minutes % 60)m"
        }
        return "\(minutes)m"
    }

    var formattedCost: String {
        String(format: "$%.4f", estimatedCost)
    }
}

// MARK: - WebSocket Messages

struct MonitoringMessage: Codable {
    let type: MessageType
    let terminalOutput: TerminalOutputMessage?
    let agentStatus: AgentStatusMessage?
    let metrics: FarmMetricsMessage?
    let farmStatus: FarmStatusMessage?

    enum MessageType: String, Codable {
        case terminalOutput = "terminal:output"
        case agentStatus = "agent:status"
        case farmMetrics = "farm:metrics"
        case farmStatus = "farm:status"
    }
}

struct TerminalOutputMessage: Codable {
    let agentId: String
    let agentName: String?
    let content: String
    let timestamp: Date?
}

struct AgentStatusMessage: Codable {
    let agentId: String
    let status: String
    let currentTask: String?
}

struct FarmMetricsMessage: Codable {
    let tokensUsed: Int
    let estimatedCost: Double
    let tasksCompleted: Int
    let filesGenerated: Int
}

struct FarmStatusMessage: Codable {
    let status: String
    let progress: Double
    let estimatedTimeRemaining: TimeInterval?
}

struct StreamingQualityMessage: Codable {
    let type: String = "streaming:quality"
    let quality: String
}

// MARK: - SwiftUI Views

struct ConnectionStatusBadge: View {
    let state: ConnectionState

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(state.color)
                .frame(width: 8, height: 8)

            Text(state.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(state.color.opacity(0.1))
        .cornerRadius(12)
    }
}

struct StreamingQualitySelector: View {
    @Binding var quality: StreamingQuality
    let profile: MonitoringProfile

    var body: some View {
        Menu {
            ForEach(StreamingQuality.allCases, id: \.self) { option in
                Button(action: { quality = option }) {
                    HStack {
                        Text(option.displayName)
                        if quality == option {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.caption)
                Text(quality.displayName)
                    .font(.caption)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(8)
        }
    }
}

struct TerminalLayoutPicker: View {
    @Binding var layout: TerminalLayout
    let profile: MonitoringProfile

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(profile.supportedLayouts) { option in
                    Button(action: {
                        layout = option
                        HapticManager.shared.selectionChanged()
                    }) {
                        VStack(spacing: 4) {
                            Image(systemName: option.icon)
                                .font(.title3)
                            Text(option.displayName)
                                .font(.caption2)
                        }
                        .frame(width: 70, height: 60)
                        .background(layout == option ? Color.accentColor : Color(.secondarySystemBackground))
                        .foregroundColor(layout == option ? .white : .primary)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }
}

struct LiveMetricsBar: View {
    let metrics: LiveFarmMetrics
    let profile: MonitoringProfile

    var body: some View {
        HStack(spacing: profile.deviceType == .iPhone ? 12 : 20) {
            MetricItem(
                icon: "chart.line.uptrend.xyaxis",
                value: "\(Int(metrics.progress * 100))%",
                label: "Progress",
                color: .green
            )

            if profile.showDetailedMetrics {
                MetricItem(
                    icon: "person.2",
                    value: "\(metrics.activeAgentCount)",
                    label: "Agents",
                    color: .blue
                )

                MetricItem(
                    icon: "doc.text",
                    value: "\(metrics.filesGenerated)",
                    label: "Files",
                    color: .purple
                )
            }

            if profile.showCostTracking {
                MetricItem(
                    icon: "dollarsign.circle",
                    value: metrics.formattedCost,
                    label: "Cost",
                    color: .orange
                )
            }

            MetricItem(
                icon: "clock",
                value: metrics.formattedTimeRemaining,
                label: "Remaining",
                color: .secondary
            )
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

struct MetricItem: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundColor(color)
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

struct ConnectionQualityIndicator: View {
    let quality: ConnectionQuality

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: quality.icon)
                .font(.caption)
            Text(quality.rawValue)
                .font(.caption)
        }
        .foregroundColor(quality.color)
    }
}

// MARK: - Terminal View Components

struct TerminalOutputView: View {
    let connection: TerminalConnection
    let config: TerminalConfig
    @State private var isAutoScrolling = true

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Circle()
                    .fill(connection.status == "active" ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)

                Text(connection.agentName)
                    .font(.caption)
                    .fontWeight(.medium)

                if let task = connection.currentTask {
                    Text("• \(task)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Button(action: { isAutoScrolling.toggle() }) {
                    Image(systemName: isAutoScrolling ? "arrow.down.circle.fill" : "arrow.down.circle")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(.tertiarySystemBackground))

            // Output
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(connection.outputLines.suffix(config.maxLines)) { line in
                            TerminalLineView(line: line, config: config)
                        }
                    }
                    .padding(8)
                    .id("bottom")
                }
                .font(.system(size: config.fontSize, design: .monospaced))
                .background(Color.black.opacity(0.9))
                .onChange(of: connection.outputLines.count) { _, _ in
                    if isAutoScrolling {
                        withAnimation(.easeOut(duration: 0.1)) {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(.separator), lineWidth: 0.5)
        )
    }
}

struct TerminalLineView: View {
    let line: TerminalLine
    let config: TerminalConfig

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if config.showTimestamps {
                Text(formatTimestamp(line.timestamp))
                    .foregroundColor(.gray)
                    .font(.system(size: config.fontSize - 2, design: .monospaced))
            }

            Text(line.content)
                .foregroundColor(colorForType(line.type))
                .lineSpacing(config.lineHeight)
        }
    }

    private func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }

    private func colorForType(_ type: TerminalLine.LineType) -> Color {
        switch type {
        case .output: return .white
        case .error: return .red
        case .system: return .cyan
        case .command: return .yellow
        }
    }
}

struct MiniTerminalView: View {
    let connection: TerminalConnection

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Circle()
                    .fill(connection.status == "active" ? Color.green : Color.orange)
                    .frame(width: 6, height: 6)
                Text(connection.agentName)
                    .font(.caption2)
                    .fontWeight(.medium)
                Spacer()
            }

            Text(connection.recentOutput)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(.white.opacity(0.8))
                .lineLimit(3)
        }
        .padding(6)
        .background(Color.black.opacity(0.85))
        .cornerRadius(6)
    }
}

// MARK: - Grid Layouts

struct TerminalGrid: View {
    let connections: [TerminalConnection]
    let layout: TerminalLayout
    let profile: MonitoringProfile

    var body: some View {
        switch layout {
        case .single:
            if let first = connections.first {
                TerminalOutputView(
                    connection: first,
                    config: profile.terminalConfig(for: .fullScreen)
                )
            }

        case .splitHorizontal:
            HStack(spacing: 4) {
                ForEach(connections.prefix(2)) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .splitView)
                    )
                }
            }

        case .splitVertical:
            VStack(spacing: 4) {
                ForEach(connections.prefix(2)) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .splitView)
                    )
                }
            }

        case .grid2x2:
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 4) {
                ForEach(connections.prefix(4)) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .splitView)
                    )
                }
            }

        case .grid3x2:
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 4) {
                ForEach(connections.prefix(6)) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .miniView)
                    )
                }
            }

        case .grid3x3:
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 4) {
                ForEach(connections.prefix(9)) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .miniView)
                    )
                }
            }

        case .carousel:
            TerminalCarousel(connections: connections, profile: profile)

        case .floating:
            // Floating windows only on Mac
            ZStack {
                ForEach(connections) { connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .splitView)
                    )
                    .frame(width: 400, height: 300)
                }
            }
        }
    }
}

struct TerminalCarousel: View {
    let connections: [TerminalConnection]
    let profile: MonitoringProfile
    @State private var selectedIndex = 0

    var body: some View {
        VStack(spacing: 8) {
            TabView(selection: $selectedIndex) {
                ForEach(Array(connections.enumerated()), id: \.element.id) { index, connection in
                    TerminalOutputView(
                        connection: connection,
                        config: profile.terminalConfig(for: .fullScreen)
                    )
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Custom page indicator
            HStack(spacing: 8) {
                ForEach(Array(connections.enumerated()), id: \.element.id) { index, connection in
                    Button(action: { selectedIndex = index }) {
                        VStack(spacing: 2) {
                            Circle()
                                .fill(connection.status == "active" ? Color.green : Color.orange)
                                .frame(width: 6, height: 6)
                            Text(connection.agentName)
                                .font(.caption2)
                                .foregroundColor(selectedIndex == index ? .primary : .secondary)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(selectedIndex == index ? Color.accentColor.opacity(0.2) : Color.clear)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
