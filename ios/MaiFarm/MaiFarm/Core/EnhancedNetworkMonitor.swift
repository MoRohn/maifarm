//
//  EnhancedNetworkMonitor.swift
//  MaiFarm
//
//  Enhanced network path monitoring with offline queue management
//  Provides detailed connection status and graceful offline handling
//

import Foundation
import Network
import SwiftUI
import Combine
import os.log

// MARK: - Enhanced Network Monitor

@MainActor
final class NetworkMonitor: ObservableObject, @unchecked Sendable {
    static let shared = NetworkMonitor()

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "app.maifarm.networkMonitor", qos: .utility)
    private let logger = Logger(subsystem: "app.maifarm", category: "Network")

    // MARK: - Published State

    @Published private(set) var isConnected: Bool = true
    @Published private(set) var connectionType: ConnectionType = .unknown
    @Published private(set) var isExpensive: Bool = false // Cellular or hotspot
    @Published private(set) var isConstrained: Bool = false // Low Data Mode
    @Published private(set) var connectionQuality: ConnectionQuality = .good
    @Published private(set) var lastOnlineTime: Date?
    @Published private(set) var offlineDuration: TimeInterval = 0

    // Connection history for pattern detection
    private var connectionHistory: [(Date, Bool)] = []
    private let maxHistoryItems = 20

    // Offline timer
    private var offlineTimer: Timer?

    // MARK: - Types

    enum ConnectionType: String {
        case wifi = "Wi-Fi"
        case cellular = "Cellular"
        case ethernet = "Ethernet"
        case unknown = "Unknown"

        var systemImage: String {
            switch self {
            case .wifi: return "wifi"
            case .cellular: return "antenna.radiowaves.left.and.right"
            case .ethernet: return "cable.connector"
            case .unknown: return "network.slash"
            }
        }
    }

    enum ConnectionQuality: String {
        case excellent = "Excellent"
        case good = "Good"
        case fair = "Fair"
        case poor = "Poor"
        case offline = "Offline"

        var color: Color {
            switch self {
            case .excellent: return .green
            case .good: return Color(red: 0.6, green: 0.8, blue: 0.2)
            case .fair: return .yellow
            case .poor: return .orange
            case .offline: return .red
            }
        }

        var systemImage: String {
            switch self {
            case .excellent: return "wifi"
            case .good: return "wifi"
            case .fair: return "wifi.exclamationmark"
            case .poor: return "wifi.exclamationmark"
            case .offline: return "wifi.slash"
            }
        }
    }

    // MARK: - Initialization

    private init() {
        startMonitoring()
    }

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.handlePathUpdate(path)
            }
        }
        monitor.start(queue: queue)

        logger.info("Network monitoring started")
    }

    private func handlePathUpdate(_ path: NWPath) {
        let wasConnected = isConnected
        isConnected = path.status == .satisfied

        // Determine connection type
        if path.usesInterfaceType(.wifi) {
            connectionType = .wifi
        } else if path.usesInterfaceType(.cellular) {
            connectionType = .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            connectionType = .ethernet
        } else {
            connectionType = .unknown
        }

        isExpensive = path.isExpensive
        isConstrained = path.isConstrained

        // Update connection quality
        updateConnectionQuality(path)

        // Track connection history
        connectionHistory.append((Date(), isConnected))
        if connectionHistory.count > maxHistoryItems {
            connectionHistory.removeFirst()
        }

        // Handle connection state changes
        if isConnected && !wasConnected {
            handleReconnection()
        } else if !isConnected && wasConnected {
            handleDisconnection()
        }

        logger.info("Network status: \(self.isConnected ? "Connected" : "Disconnected") via \(self.connectionType.rawValue)")
    }

    private func updateConnectionQuality(_ path: NWPath) {
        if !isConnected {
            connectionQuality = .offline
            return
        }

        // Assess quality based on multiple factors
        var qualityScore = 3 // Start at good

        // Cellular is generally lower quality than Wi-Fi
        if connectionType == .cellular {
            qualityScore -= 1
        }

        // Expensive connections (hotspot, cellular) may have limits
        if isExpensive {
            qualityScore -= 1
        }

        // Constrained (Low Data Mode) indicates user wants limited usage
        if isConstrained {
            qualityScore -= 1
        }

        // Check for frequent disconnections (instability)
        let recentDisconnections = connectionHistory.suffix(5).filter { !$0.1 }.count
        if recentDisconnections >= 2 {
            qualityScore -= 1
        }

        switch qualityScore {
        case 3...: connectionQuality = .excellent
        case 2: connectionQuality = .good
        case 1: connectionQuality = .fair
        default: connectionQuality = .poor
        }
    }

    private func handleDisconnection() {
        lastOnlineTime = Date()
        offlineDuration = 0

        // Start offline duration timer
        offlineTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                if let lastOnline = self?.lastOnlineTime {
                    self?.offlineDuration = Date().timeIntervalSince(lastOnline)
                }
            }
        }

        // Post notification
        NotificationCenter.default.post(name: .networkStatusChanged, object: nil, userInfo: ["connected": false])

        // Show toast
        AppState.shared.showToast("Working offline - changes will sync later", type: .warning)
        HapticManager.shared.notify(.warning)

        logger.warning("Device went offline")
    }

    private func handleReconnection() {
        offlineTimer?.invalidate()
        offlineTimer = nil
        let wasOfflineFor = offlineDuration
        offlineDuration = 0

        // Post notification
        NotificationCenter.default.post(name: .networkStatusChanged, object: nil, userInfo: ["connected": true])

        // Trigger sync
        Task {
            await syncPendingOperations()
        }

        // Show toast with duration
        let message = wasOfflineFor > 60
            ? "Back online - syncing \(formatDuration(wasOfflineFor)) of changes"
            : "Back online - syncing changes"
        AppState.shared.showToast(message, type: .success)
        HapticManager.shared.notify(.success)

        logger.info("Device back online after \(wasOfflineFor)s")
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        if seconds < 60 {
            return "\(Int(seconds))s"
        } else if seconds < 3600 {
            return "\(Int(seconds / 60))m"
        } else {
            return "\(Int(seconds / 3600))h"
        }
    }

    // MARK: - Public Interface

    /// Check if network conditions are suitable for a specific operation
    func canPerform(_ operation: NetworkOperation) -> (allowed: Bool, reason: String?) {
        guard isConnected else {
            return (false, "You're offline. This action will be queued for when you're back online.")
        }

        switch operation {
        case .quickTask:
            // Quick tasks require reasonable connectivity
            if connectionQuality == .poor {
                return (true, "Connection quality is poor. The task may take longer.")
            }
            return (true, nil)

        case .createFarm:
            // Farms require stable connectivity
            if connectionQuality == .poor {
                return (false, "Connection too unstable for farm creation. Please wait for better connectivity.")
            }
            if isConstrained {
                return (true, "Low Data Mode is on. Farm monitoring may be limited.")
            }
            return (true, nil)

        case .streamTerminal:
            // Terminal streaming needs good connectivity
            if connectionQuality == .poor || connectionQuality == .fair {
                return (true, "Terminal updates may be delayed due to connection quality.")
            }
            return (true, nil)

        case .downloadHarvest:
            // Large downloads should respect expensive/constrained
            if isConstrained {
                return (false, "Low Data Mode is on. Disable it to download harvests.")
            }
            if isExpensive {
                return (true, "You're on cellular. This may use significant data.")
            }
            return (true, nil)

        case .sync:
            return (true, nil)
        }
    }

    enum NetworkOperation {
        case quickTask
        case createFarm
        case streamTerminal
        case downloadHarvest
        case sync
    }

    /// Get recommended polling interval based on network conditions
    var recommendedPollingInterval: TimeInterval {
        guard isConnected else { return 60 }

        switch connectionQuality {
        case .excellent: return 5
        case .good: return 10
        case .fair: return 20
        case .poor: return 30
        case .offline: return 60
        }
    }

    /// Get recommended streaming mode based on network conditions
    var recommendedStreamingMode: StreamingMode {
        guard isConnected else { return .paused }

        if isConstrained || connectionQuality == .poor {
            return .efficient
        } else if isExpensive || connectionQuality == .fair {
            return .balanced
        } else {
            return .realtime
        }
    }

    enum StreamingMode {
        case realtime // Full real-time streaming
        case balanced // Reduced frequency
        case efficient // Minimal updates, batch mode
        case paused // No streaming

        var updateInterval: TimeInterval {
            switch self {
            case .realtime: return 0.1
            case .balanced: return 1.0
            case .efficient: return 5.0
            case .paused: return Double.infinity
            }
        }
    }

    // MARK: - Sync Operations

    private func syncPendingOperations() async {
        let pendingCount = await OfflineQueue.shared.getPendingOperations().count
        if pendingCount > 0 {
            logger.info("Syncing \(pendingCount) pending operations")
            // The actual sync is handled by AppState/OfflineQueue
        }
    }

    // MARK: - Backward Compatibility

    /// Check connectivity with a quick network request (backward compatibility)
    func checkConnectivity() async -> Bool {
        guard isConnected else { return false }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5
        config.waitsForConnectivity = false

        let session = URLSession(configuration: config)

        // Use a well-known Apple connectivity check URL
        guard let connectivityURL = URL(string: "https://www.apple.com/library/test/success.html") else {
            logger.error("Failed to create connectivity check URL")
            return false
        }

        do {
            let (_, response) = try await session.data(from: connectivityURL)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode == 200
            }
        } catch {
            logger.warning("Connectivity check failed: \(error.localizedDescription)")
        }
        return false
    }
}

// MARK: - Network Status View

struct NetworkStatusView: View {
    @ObservedObject var monitor = NetworkMonitor.shared

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: monitor.connectionQuality.systemImage)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(monitor.connectionQuality.color)

            if !monitor.isConnected {
                Text("Offline")
                    .font(.caption)
                    .foregroundColor(.secondary)

                if monitor.offlineDuration > 60 {
                    Text("(\(formatDuration(monitor.offlineDuration)))")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            } else if monitor.connectionQuality != .excellent {
                Text(monitor.connectionType.rawValue)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(8)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        if seconds < 60 {
            return "\(Int(seconds))s"
        } else if seconds < 3600 {
            return "\(Int(seconds / 60))m"
        } else {
            return "\(Int(seconds / 3600))h"
        }
    }
}

// MARK: - Network Status Banner

struct NetworkStatusBanner: View {
    @ObservedObject var monitor = NetworkMonitor.shared
    @State private var isExpanded = false

    var body: some View {
        if !monitor.isConnected || monitor.connectionQuality == .poor {
            VStack(spacing: 0) {
                Button(action: { withAnimation { isExpanded.toggle() } }) {
                    HStack {
                        Image(systemName: monitor.isConnected ? "wifi.exclamationmark" : "wifi.slash")
                            .font(.system(size: 14, weight: .semibold))

                        Text(monitor.isConnected ? "Poor Connection" : "You're Offline")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        Spacer()

                        if AppState.shared.pendingOperations > 0 {
                            Text("\(AppState.shared.pendingOperations) pending")
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.white.opacity(0.2))
                                .cornerRadius(4)
                        }

                        Image(systemName: "chevron.down")
                            .font(.caption)
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)

                if isExpanded {
                    VStack(alignment: .leading, spacing: 8) {
                        Divider()
                            .background(Color.white.opacity(0.3))

                        Text(monitor.isConnected
                            ? "Your connection is unstable. Some features may be delayed."
                            : "Changes you make will be saved and synced when you're back online."
                        )
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.9))

                        if !monitor.isConnected && monitor.offlineDuration > 0 {
                            HStack {
                                Image(systemName: "clock")
                                    .font(.caption)
                                Text("Offline for \(formatDuration(monitor.offlineDuration))")
                                    .font(.caption)
                            }
                            .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
            .background(monitor.isConnected ? Color.orange : Color.red.opacity(0.9))
            .accessibleTransition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        if seconds < 60 {
            return "\(Int(seconds)) seconds"
        } else if seconds < 3600 {
            let minutes = Int(seconds / 60)
            return "\(minutes) minute\(minutes == 1 ? "" : "s")"
        } else {
            let hours = Int(seconds / 3600)
            return "\(hours) hour\(hours == 1 ? "" : "s")"
        }
    }
}

// MARK: - Network Aware View Modifier

struct NetworkAwareModifier: ViewModifier {
    @ObservedObject var monitor = NetworkMonitor.shared
    let operation: NetworkMonitor.NetworkOperation
    @State private var showingWarning = false
    @State private var warningMessage = ""

    func body(content: Content) -> some View {
        content
            .disabled(!monitor.isConnected && operation != .sync)
            .opacity(monitor.isConnected ? 1.0 : 0.6)
            .onTapGesture {
                let check = monitor.canPerform(operation)
                if let warning = check.reason {
                    warningMessage = warning
                    showingWarning = true
                }
            }
            .alert("Network Notice", isPresented: $showingWarning) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(warningMessage)
            }
    }
}

extension View {
    func networkAware(for operation: NetworkMonitor.NetworkOperation) -> some View {
        self.modifier(NetworkAwareModifier(operation: operation))
    }
}

// MARK: - Offline Indicator Overlay

struct OfflineOverlay: ViewModifier {
    @ObservedObject var monitor = NetworkMonitor.shared

    func body(content: Content) -> some View {
        ZStack(alignment: .top) {
            content

            NetworkStatusBanner()
        }
    }
}

extension View {
    func withOfflineIndicator() -> some View {
        self.modifier(OfflineOverlay())
    }
}
