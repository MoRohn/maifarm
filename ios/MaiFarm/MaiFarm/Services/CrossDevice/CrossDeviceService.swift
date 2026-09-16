//
//  CrossDeviceService.swift
//  MaiFarm
//
//  Cross-Device Synchronization Service
//  Manages device registration, farm handoffs, and cross-device state sync
//

import Foundation
import SwiftUI
import Combine
import os.log

// MARK: - Models

/// Alias for device selection in farm creation
/// UserDevice contains all properties needed for execution device selection
typealias ExecutionDevice = UserDevice

struct UserDevice: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let deviceId: String
    let deviceName: String
    let deviceType: DeviceKind
    let platform: String
    let osVersion: String?
    let appVersion: String?
    let computeTier: ComputeTier
    let supportsLocalModels: Bool
    let supportsBackgroundExecution: Bool
    let maxAgents: Int
    let maxFarmDurationMinutes: Int
    let isOnline: Bool
    let lastSeenAt: Date
    let isPrimaryDevice: Bool
    let acceptHandoffs: Bool
    let autoSyncEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case platform
        case osVersion = "os_version"
        case appVersion = "app_version"
        case computeTier = "compute_tier"
        case supportsLocalModels = "supports_local_models"
        case supportsBackgroundExecution = "supports_background_execution"
        case maxAgents = "max_agents"
        case maxFarmDurationMinutes = "max_farm_duration_minutes"
        case isOnline = "is_online"
        case lastSeenAt = "last_seen_at"
        case isPrimaryDevice = "is_primary_device"
        case acceptHandoffs = "accept_handoffs"
        case autoSyncEnabled = "auto_sync_enabled"
    }

    enum DeviceKind: String, Codable {
        case iphone
        case ipad
        case mac
        case web
    }

    enum ComputeTier: String, Codable {
        case limited
        case standard
        case performance
        case workstation
    }

    var icon: String {
        switch deviceType {
        case .iphone: return "iphone"
        case .ipad: return "ipad"
        case .mac: return "desktopcomputer"
        case .web: return "globe"
        }
    }

    var tierColor: Color {
        switch computeTier {
        case .workstation: return .purple
        case .performance: return .blue
        case .standard: return .green
        case .limited: return .orange
        }
    }
}

struct HandoffRequest: Codable, Identifiable {
    let id: String
    let userId: String
    let farmId: String
    let sourceDeviceId: String
    let targetDeviceId: String?
    let handoffType: HandoffType
    let status: HandoffStatus
    let farmStateSnapshot: FarmStateSnapshot
    let progressAtHandoff: Double?
    let reason: String?
    let errorMessage: String?
    let requestedAt: Date
    let acceptedAt: Date?
    let completedAt: Date?
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case farmId = "farm_id"
        case sourceDeviceId = "source_device_id"
        case targetDeviceId = "target_device_id"
        case handoffType = "handoff_type"
        case status
        case farmStateSnapshot = "farm_state_snapshot"
        case progressAtHandoff = "progress_at_handoff"
        case reason
        case errorMessage = "error_message"
        case requestedAt = "requested_at"
        case acceptedAt = "accepted_at"
        case completedAt = "completed_at"
        case expiresAt = "expires_at"
    }

    enum HandoffType: String, Codable {
        case transfer
        case clone
        case monitorOnly = "monitor_only"
    }

    enum HandoffStatus: String, Codable {
        case pending
        case accepted
        case inProgress = "in_progress"
        case completed
        case failed
        case cancelled
        case expired
    }

    struct FarmStateSnapshot: Codable {
        let id: String
        let name: String
        let status: String
        let provider: String
        let duration: Int?
        let progress: Double?
        let createdAt: Date?

        enum CodingKeys: String, CodingKey {
            case id, name, status, provider, duration, progress
            case createdAt = "created_at"
        }
    }

    var isExpired: Bool {
        expiresAt < Date()
    }
}

struct DeviceNotification: Codable, Identifiable {
    let id: String
    let userId: String
    let targetDeviceId: String?
    let notificationType: String
    let payload: [String: AnyCodable]
    let priority: Priority
    let delivered: Bool
    let deliveredAt: Date?
    let read: Bool
    let readAt: Date?
    let expiresAt: Date
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case targetDeviceId = "target_device_id"
        case notificationType = "notification_type"
        case payload
        case priority
        case delivered
        case deliveredAt = "delivered_at"
        case read
        case readAt = "read_at"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
    }

    enum Priority: String, Codable {
        case low, normal, high, critical
    }
}

// Helper for JSON any type
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let str = value as? String {
            try container.encode(str)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else {
            try container.encodeNil()
        }
    }
}

// MARK: - Cross Device Service

@MainActor
class CrossDeviceService: ObservableObject {
    static let shared = CrossDeviceService()

    // Published state
    @Published var devices: [UserDevice] = []
    @Published var currentDevice: UserDevice?
    @Published var pendingHandoffRequests: [HandoffRequest] = []
    @Published var notifications: [DeviceNotification] = []
    @Published var isRegistered = false
    @Published var isSyncing = false
    @Published var lastSyncError: String?

    // Settings
    @AppStorage("crossDevice_acceptHandoffs") var acceptHandoffs = true
    @AppStorage("crossDevice_autoSync") var autoSyncEnabled = true
    @AppStorage("crossDevice_deviceId") private var storedDeviceId = ""

    private let logger = Logger(subsystem: "app.maifarm", category: "CrossDevice")
    private var heartbeatTimer: Timer?
    private var pollTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    // Retry configuration
    private var registrationRetryCount = 0
    private let maxRegistrationRetries = 3
    private var registrationRetryTask: Task<Void, Never>?

    // Device ID (persistent across launches)
    var deviceId: String {
        if storedDeviceId.isEmpty {
            storedDeviceId = UUID().uuidString
        }
        return storedDeviceId
    }

    private init() {
        // Don't start heartbeat until registered
        // Heartbeat and polling are started after successful registration
    }

    deinit {
        // Clean up timers on deallocation
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        pollTimer?.invalidate()
        pollTimer = nil
        registrationRetryTask?.cancel()
        registrationRetryTask = nil
    }

    // MARK: - Device Registration

    /// Register this device with the server
    func registerDevice() async throws {
        // Cancel any pending retry task
        registrationRetryTask?.cancel()
        registrationRetryTask = nil

        let deviceManager = DeviceCapabilityManager.shared

        let registration = DeviceRegistrationRequest(
            deviceId: deviceId,
            deviceName: getDeviceName(),
            deviceType: getDeviceType(),
            platform: getPlatform(),
            osVersion: getOSVersion(),
            appVersion: getAppVersion(),
            computeTier: deviceManager.computeTier.rawValue.lowercased(),
            supportsLocalModels: deviceManager.computeTier.supportsLocalModels,
            supportsBackgroundExecution: getDeviceType() == "mac",
            maxAgents: deviceManager.computeTier.maxAgents,
            maxFarmDurationMinutes: deviceManager.computeTier.maxFarmDurationMinutes
        )

        do {
            let device = try await MaiFarmAPI.shared.registerDevice(registration)
            currentDevice = device
            isRegistered = true
            registrationRetryCount = 0  // Reset retry count on success
            lastSyncError = nil

            logger.info("Device registered: \(device.deviceName)")

            // Start heartbeat and polling only after successful registration
            setupHeartbeat()
            startPolling()
        } catch {
            logger.error("Device registration failed: \(error.localizedDescription)")
            lastSyncError = "Registration failed: \(error.localizedDescription)"

            // Schedule retry if not exceeded max retries
            if registrationRetryCount < maxRegistrationRetries {
                registrationRetryCount += 1
                let delay = Double(registrationRetryCount) * 5.0  // Exponential backoff: 5s, 10s, 15s
                logger.info("Scheduling registration retry \(self.registrationRetryCount) in \(delay) seconds")

                registrationRetryTask = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    guard !Task.isCancelled else { return }
                    do {
                        try await self?.registerDevice()
                    } catch {
                        // Error is logged inside registerDevice
                    }
                }
            } else {
                logger.warning("Max registration retries exceeded")
            }

            throw error
        }
    }

    /// Attempt to re-register device (e.g., after network reconnection)
    func retryRegistration() {
        registrationRetryCount = 0  // Reset counter for manual retry

        Task {
            do {
                try await registerDevice()
            } catch {
                logger.error("Manual registration retry failed: \(error.localizedDescription)")
            }
        }
    }

    /// Update device settings on server
    func updateDeviceSettings(
        deviceName: String? = nil,
        acceptHandoffs: Bool? = nil,
        autoSyncEnabled: Bool? = nil,
        isPrimaryDevice: Bool? = nil
    ) async throws {
        guard let device = currentDevice else { return }

        var settings: [String: Any] = [:]
        if let name = deviceName { settings["deviceName"] = name }
        if let accept = acceptHandoffs { settings["acceptHandoffs"] = accept }
        if let sync = autoSyncEnabled { settings["autoSyncEnabled"] = sync }
        if let primary = isPrimaryDevice { settings["isPrimaryDevice"] = primary }

        let updated = try await MaiFarmAPI.shared.updateDeviceSettings(
            deviceId: device.deviceId,
            settings: settings
        )

        currentDevice = updated

        // Update local settings
        if let accept = acceptHandoffs {
            self.acceptHandoffs = accept
        }
        if let sync = autoSyncEnabled {
            self.autoSyncEnabled = sync
        }
    }

    // MARK: - Devices List

    /// Fetch all user devices
    func fetchDevices() async throws {
        devices = try await MaiFarmAPI.shared.getUserDevices()
        logger.info("Fetched \(self.devices.count) devices")
    }

    /// Get devices eligible to execute a new farm
    func getExecutionDevices(minAgents: Int? = nil, minDuration: Int? = nil) async throws -> [UserDevice] {
        return try await MaiFarmAPI.shared.getExecutionDevices(
            minAgents: minAgents,
            minDuration: minDuration
        )
    }

    // MARK: - Farm Handoff

    /// Request handoff of a running farm to another device
    func requestFarmHandoff(
        farmId: String,
        targetDeviceId: String? = nil,
        handoffType: HandoffRequest.HandoffType = .transfer,
        reason: String? = nil
    ) async throws -> HandoffRequest {
        let request = try await MaiFarmAPI.shared.requestFarmHandoff(
            farmId: farmId,
            sourceDeviceId: deviceId,
            targetDeviceId: targetDeviceId,
            handoffType: handoffType.rawValue,
            reason: reason
        )

        logger.info("Handoff requested for farm \(farmId)")

        // Show local notification if iOS
        if targetDeviceId == nil {
            AppState.shared.showToast("Handoff request broadcast. Waiting for a device to accept.", type: .info)
        } else {
            AppState.shared.showToast("Handoff request sent. Waiting for acceptance.", type: .info)
        }

        return request
    }

    /// Get devices eligible to receive a farm handoff
    func getHandoffEligibleDevices(farmId: String) async throws -> [HandoffEligibleDevice] {
        return try await MaiFarmAPI.shared.getHandoffEligibleDevices(
            sourceDeviceId: deviceId,
            farmId: farmId
        )
    }

    /// Accept a handoff request
    func acceptHandoffRequest(_ request: HandoffRequest) async throws -> AcceptHandoffResult {
        let result = try await MaiFarmAPI.shared.acceptHandoffRequest(
            requestId: request.id,
            deviceId: deviceId
        )

        if result.success {
            // Remove from pending list
            pendingHandoffRequests.removeAll { $0.id == request.id }

            AppState.shared.showToast("Handoff accepted! Farm is now under your control.", type: .success)
            HapticManager.shared.notify(.success)
        }

        return result
    }

    /// Cancel a pending handoff request
    func cancelHandoffRequest(_ requestId: String) async throws {
        try await MaiFarmAPI.shared.cancelHandoffRequest(requestId: requestId)
        pendingHandoffRequests.removeAll { $0.id == requestId }
    }

    /// Fetch pending handoff requests for this device
    func fetchPendingHandoffRequests() async throws {
        pendingHandoffRequests = try await MaiFarmAPI.shared.getPendingHandoffRequests(
            deviceId: deviceId
        )

        // Notify if there are new requests
        if !pendingHandoffRequests.isEmpty {
            let count = pendingHandoffRequests.count
            logger.info("Found \(count) pending handoff requests")
        }
    }

    // MARK: - Notifications

    /// Fetch and optionally mark notifications as delivered
    func fetchNotifications(markDelivered: Bool = true) async throws {
        notifications = try await MaiFarmAPI.shared.getDeviceNotifications(
            deviceId: deviceId,
            markDelivered: markDelivered
        )

        // Process handoff notifications
        for notification in notifications where notification.notificationType == "handoff_request" {
            if let requestId = notification.payload["request_id"]?.value as? String {
                // Refresh pending requests
                try? await fetchPendingHandoffRequests()
            }
        }
    }

    /// Mark notifications as read
    func markNotificationsRead(_ notificationIds: [String]) async throws {
        try await MaiFarmAPI.shared.markNotificationsRead(notificationIds: notificationIds)
        notifications.removeAll { notificationIds.contains($0.id) }
    }

    // MARK: - Heartbeat & Polling

    private func setupHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.sendHeartbeat()
            }
        }
    }

    private func sendHeartbeat() async {
        guard isRegistered else { return }

        do {
            try await MaiFarmAPI.shared.sendDeviceHeartbeat(deviceId: deviceId)
        } catch {
            logger.warning("Heartbeat failed: \(error.localizedDescription)")
        }
    }

    private func startPolling() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.pollForUpdates()
            }
        }
    }

    private var consecutivePollFailures = 0
    private let maxConsecutivePollFailures = 5

    private func pollForUpdates() async {
        guard isRegistered, acceptHandoffs else { return }

        do {
            // Check for pending handoff requests
            try await fetchPendingHandoffRequests()

            // Check for notifications
            try await fetchNotifications()

            // Reset failure count on success
            if consecutivePollFailures > 0 {
                consecutivePollFailures = 0
                lastSyncError = nil
            }
        } catch {
            consecutivePollFailures += 1
            logger.warning("Polling failed (\(self.consecutivePollFailures)/\(self.maxConsecutivePollFailures)): \(error.localizedDescription)")

            // If too many consecutive failures, stop polling and notify user
            if consecutivePollFailures >= maxConsecutivePollFailures {
                lastSyncError = "Connection lost. Tap to retry."
                stopPolling()
                logger.error("Polling stopped after \(self.maxConsecutivePollFailures) consecutive failures")
            }
        }
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    // MARK: - Helpers

    private func getDeviceName() -> String {
        #if targetEnvironment(macCatalyst) || os(macOS)
        return Host.current().localizedName ?? "Mac"
        #else
        return UIDevice.current.name
        #endif
    }

    private func getDeviceType() -> String {
        #if targetEnvironment(macCatalyst) || os(macOS)
        return "mac"
        #else
        switch UIDevice.current.userInterfaceIdiom {
        case .phone: return "iphone"
        case .pad: return "ipad"
        default: return "iphone"
        }
        #endif
    }

    private func getPlatform() -> String {
        #if targetEnvironment(macCatalyst) || os(macOS)
        return "macos"
        #else
        return "ios"
        #endif
    }

    private func getOSVersion() -> String {
        #if targetEnvironment(macCatalyst) || os(macOS)
        return ProcessInfo.processInfo.operatingSystemVersionString
        #else
        return UIDevice.current.systemVersion
        #endif
    }

    private func getAppVersion() -> String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }

    // MARK: - Cleanup

    func cleanup() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        pollTimer?.invalidate()
        pollTimer = nil
        registrationRetryTask?.cancel()
        registrationRetryTask = nil
        consecutivePollFailures = 0
        isRegistered = false
        currentDevice = nil
        lastSyncError = nil
    }

    /// Resume syncing (e.g., after network reconnection or app foregrounding)
    func resumeSyncing() {
        guard isRegistered else {
            // If not registered, try to register
            retryRegistration()
            return
        }

        // Reset poll failure counter and restart polling
        consecutivePollFailures = 0
        lastSyncError = nil

        if pollTimer == nil {
            startPolling()
        }
        if heartbeatTimer == nil {
            setupHeartbeat()
        }

        // Immediately poll for updates
        Task {
            await pollForUpdates()
        }
    }
}

// MARK: - Supporting Types

struct DeviceRegistrationRequest: Codable {
    let deviceId: String
    let deviceName: String
    let deviceType: String
    let platform: String
    let osVersion: String?
    let appVersion: String?
    let computeTier: String
    let supportsLocalModels: Bool
    let supportsBackgroundExecution: Bool
    let maxAgents: Int
    let maxFarmDurationMinutes: Int

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case platform
        case osVersion = "os_version"
        case appVersion = "app_version"
        case computeTier = "compute_tier"
        case supportsLocalModels = "supports_local_models"
        case supportsBackgroundExecution = "supports_background_execution"
        case maxAgents = "max_agents"
        case maxFarmDurationMinutes = "max_farm_duration_minutes"
    }
}

struct HandoffEligibleDevice: Codable, Identifiable {
    let deviceId: String
    let deviceName: String
    let deviceType: String
    let computeTier: String
    let isOnline: Bool
    let lastSeenAt: Date
    let supportsLocalModels: Bool
    let maxAgents: Int

    var id: String { deviceId }

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case computeTier = "compute_tier"
        case isOnline = "is_online"
        case lastSeenAt = "last_seen_at"
        case supportsLocalModels = "supports_local_models"
        case maxAgents = "max_agents"
    }

    var icon: String {
        switch deviceType {
        case "mac": return "desktopcomputer"
        case "ipad": return "ipad"
        case "iphone": return "iphone"
        default: return "desktopcomputer"
        }
    }
}

struct AcceptHandoffResult: Codable {
    let success: Bool
    let error: String?
    let farmState: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case success, error
        case farmState = "farm_state"
    }
}
