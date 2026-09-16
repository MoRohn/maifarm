//
//  PushNotificationManager.swift
//  MaiFarm
//
//  Handles Apple Push Notification service (APNs) registration and
//  remote push notification handling for farm status updates and cross-device sync.
//

import Foundation
import UserNotifications
import os.log
import Combine

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Push Notification Types

/// Types of push notifications the app can receive
enum PushNotificationType: String, Codable {
    case farmStatusChange = "farm_status_change"
    case farmCompleted = "farm_completed"
    case farmFailed = "farm_failed"
    case farmLaunching = "farm_launching"
    case farmRunning = "farm_running"
    case farmRecovering = "farm_recovering"
    case harvestReady = "harvest_ready"
    case agentStatusChange = "agent_status_change"
    case agentError = "agent_error"
    case taskFailed = "task_failed"
    case handoffRequest = "handoff_request"
    case handoffAccepted = "handoff_accepted"
    case handoffCompleted = "handoff_completed"
    case handoffFailed = "handoff_failed"
    case crossDeviceSync = "cross_device_sync"
    case systemAlert = "system_alert"
    case unknown = "unknown"

    init(from rawValue: String?) {
        self = PushNotificationType(rawValue: rawValue ?? "") ?? .unknown
    }
}

/// Payload structure for farm status push notifications
struct FarmStatusPushPayload: Codable {
    let farmId: String
    let farmName: String
    let previousStatus: String?
    let newStatus: String
    let progress: Double?
    let agentCount: Int?
    let errorMessage: String?
    let timestamp: String?

    enum CodingKeys: String, CodingKey {
        case farmId = "farm_id"
        case farmName = "farm_name"
        case previousStatus = "previous_status"
        case newStatus = "new_status"
        case progress
        case agentCount = "agent_count"
        case errorMessage = "error_message"
        case timestamp
    }
}

/// Payload structure for handoff push notifications
struct HandoffPushPayload: Codable {
    let handoffId: String
    let farmId: String
    let farmName: String
    let sourceDeviceId: String
    let sourceDeviceName: String
    let targetDeviceId: String
    let targetDeviceName: String
    let handoffMode: String
    let timestamp: String?

    enum CodingKeys: String, CodingKey {
        case handoffId = "handoff_id"
        case farmId = "farm_id"
        case farmName = "farm_name"
        case sourceDeviceId = "source_device_id"
        case sourceDeviceName = "source_device_name"
        case targetDeviceId = "target_device_id"
        case targetDeviceName = "target_device_name"
        case handoffMode = "handoff_mode"
        case timestamp
    }
}

/// Generic push notification payload
struct PushNotificationPayload {
    let type: PushNotificationType
    let title: String
    let body: String
    let data: [String: Any]
    let receivedAt: Date

    /// Extract farm ID if present
    var farmId: String? {
        data["farm_id"] as? String ?? data["farmId"] as? String
    }

    /// Extract handoff ID if present
    var handoffId: String? {
        data["handoff_id"] as? String ?? data["handoffId"] as? String
    }
}

// MARK: - Push Notification Manager

/// Manages APNs registration and remote push notification handling
@MainActor
final class PushNotificationManager: NSObject, ObservableObject {
    static let shared = PushNotificationManager()

    private let logger = Logger(subsystem: "app.maifarm", category: "PushNotifications")

    // MARK: - Published State

    /// Current device push token (APNs)
    @Published private(set) var deviceToken: String?

    /// Whether push notifications are enabled
    @Published var isEnabled: Bool = true

    /// Whether registration with backend is complete
    @Published private(set) var isRegisteredWithBackend: Bool = false

    /// Last received push notification
    @Published private(set) var lastNotification: PushNotificationPayload?

    /// Recent notification history
    @Published private(set) var recentNotifications: [PushNotificationPayload] = []

    /// Registration error if any
    @Published private(set) var registrationError: String?

    // MARK: - Private State

    private let notificationCenter = UNUserNotificationCenter.current()
    private var cancellables = Set<AnyCancellable>()
    private var tokenRegistrationRetryCount = 0
    private let maxRetryAttempts = 3
    private var tokenRegistrationWorkItem: DispatchWorkItem?

    // Notification category identifiers
    private let farmStatusCategoryId = "FARM_STATUS"
    private let handoffCategoryId = "HANDOFF_REQUEST"
    private let harvestCategoryId = "HARVEST_READY"

    // MARK: - Initialization

    private override init() {
        super.init()
        setupNotificationCategories()
        observeAppLifecycle()
    }

    deinit {
        tokenRegistrationWorkItem?.cancel()
    }

    // MARK: - Setup

    /// Setup notification categories and actions
    private func setupNotificationCategories() {
        // Farm status category
        let viewFarmAction = UNNotificationAction(
            identifier: "VIEW_FARM",
            title: "View Farm",
            options: [.foreground]
        )
        let stopFarmAction = UNNotificationAction(
            identifier: "STOP_FARM",
            title: "Stop Farm",
            options: [.destructive, .authenticationRequired]
        )

        let farmStatusCategory = UNNotificationCategory(
            identifier: farmStatusCategoryId,
            actions: [viewFarmAction, stopFarmAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // Handoff request category
        let acceptHandoffAction = UNNotificationAction(
            identifier: "ACCEPT_HANDOFF",
            title: "Accept",
            options: [.foreground]
        )
        let declineHandoffAction = UNNotificationAction(
            identifier: "DECLINE_HANDOFF",
            title: "Decline",
            options: [.destructive]
        )

        let handoffCategory = UNNotificationCategory(
            identifier: handoffCategoryId,
            actions: [acceptHandoffAction, declineHandoffAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // Harvest ready category
        let viewHarvestAction = UNNotificationAction(
            identifier: "VIEW_HARVEST",
            title: "View Harvest",
            options: [.foreground]
        )
        let archiveHarvestAction = UNNotificationAction(
            identifier: "ARCHIVE_HARVEST",
            title: "Archive",
            options: []
        )

        let harvestCategory = UNNotificationCategory(
            identifier: harvestCategoryId,
            actions: [viewHarvestAction, archiveHarvestAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        notificationCenter.setNotificationCategories([
            farmStatusCategory,
            handoffCategory,
            harvestCategory
        ])

        logger.info("Push notification categories configured")
    }

    /// Observe app lifecycle for token refresh
    private func observeAppLifecycle() {
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor in
                    await self?.refreshTokenRegistration()
                }
            }
            .store(in: &cancellables)
        #endif
    }

    // MARK: - Permission & Registration

    /// Request notification permissions and register for remote notifications
    func requestPermissionsAndRegister() async -> Bool {
        do {
            // Request authorization
            let options: UNAuthorizationOptions = [.alert, .badge, .sound, .provisional]
            let granted = try await notificationCenter.requestAuthorization(options: options)

            if granted {
                logger.info("Notification permission granted")

                // Register for remote notifications
                await registerForRemoteNotifications()

                return true
            } else {
                logger.warning("Notification permission denied")
                return false
            }
        } catch {
            logger.error("Failed to request notification permission: \(error.localizedDescription)")
            registrationError = error.localizedDescription
            return false
        }
    }

    /// Register for remote notifications (APNs)
    func registerForRemoteNotifications() async {
        #if canImport(UIKit) && !targetEnvironment(simulator)
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
        logger.info("Registered for remote notifications")
        #else
        logger.info("Skipping remote notification registration on simulator/macOS")
        #endif
    }

    /// Check current notification authorization status
    func checkAuthorizationStatus() async -> UNAuthorizationStatus {
        let settings = await notificationCenter.notificationSettings()
        return settings.authorizationStatus
    }

    // MARK: - Device Token Handling

    /// Called when APNs device token is received
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()

        self.deviceToken = tokenString
        logger.info("Received APNs device token: \(tokenString.prefix(20))...")

        // Register token with backend
        Task {
            await registerTokenWithBackend(token: tokenString)
        }
    }

    /// Called when APNs registration fails
    func didFailToRegisterForRemoteNotifications(error: Error) {
        logger.error("Failed to register for remote notifications: \(error.localizedDescription)")
        registrationError = error.localizedDescription

        // Try again later
        scheduleTokenRetry()
    }

    /// Register device token with MaiFarm backend
    private func registerTokenWithBackend(token: String) async {
        guard let deviceId = CrossDeviceService.shared.currentDevice?.id else {
            logger.warning("Cannot register push token - no device ID")
            scheduleTokenRetry()
            return
        }

        do {
            let request = PushTokenRegistrationRequest(
                deviceId: deviceId,
                pushToken: token,
                tokenType: "apns"
            )

            try await MaiFarmAPI.shared.registerPushToken(request)

            isRegisteredWithBackend = true
            registrationError = nil
            tokenRegistrationRetryCount = 0

            logger.info("Push token registered with backend for device: \(deviceId)")
        } catch {
            logger.error("Failed to register push token with backend: \(error.localizedDescription)")
            registrationError = error.localizedDescription
            scheduleTokenRetry()
        }
    }

    /// Schedule retry for token registration
    private func scheduleTokenRetry() {
        guard tokenRegistrationRetryCount < maxRetryAttempts else {
            logger.warning("Max retry attempts reached for token registration")
            return
        }

        tokenRegistrationRetryCount += 1
        let delay = Double(tokenRegistrationRetryCount * 5) // 5s, 10s, 15s

        tokenRegistrationWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self = self, let token = self.deviceToken else { return }
                await self.registerTokenWithBackend(token: token)
            }
        }

        tokenRegistrationWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)

        logger.info("Scheduled token registration retry in \(delay)s (attempt \(self.tokenRegistrationRetryCount))")
    }

    /// Refresh token registration (called on app foreground)
    private func refreshTokenRegistration() async {
        guard let token = deviceToken, isEnabled else { return }

        // Re-register to ensure backend has current token
        await registerTokenWithBackend(token: token)
    }

    /// Remove push token from backend
    func removePushToken() async {
        guard let deviceId = CrossDeviceService.shared.currentDevice?.id else { return }

        do {
            try await MaiFarmAPI.shared.removePushToken(deviceId: deviceId)
            isRegisteredWithBackend = false
            logger.info("Push token removed from backend")
        } catch {
            logger.error("Failed to remove push token: \(error.localizedDescription)")
        }
    }

    // MARK: - Push Notification Handling

    /// Handle received remote notification
    func handleRemoteNotification(userInfo: [AnyHashable: Any]) async {
        logger.info("Received remote notification: \(userInfo)")

        // Parse notification payload
        let payload = parseNotificationPayload(userInfo: userInfo)

        // Store notification
        lastNotification = payload
        recentNotifications.insert(payload, at: 0)
        if recentNotifications.count > 50 {
            recentNotifications.removeLast()
        }

        // Post notification for app components
        NotificationCenter.default.post(
            name: .pushNotificationReceived,
            object: nil,
            userInfo: ["payload": payload]
        )

        // Handle notification based on type
        await handleNotificationByType(payload)
    }

    /// Parse notification payload from userInfo
    private func parseNotificationPayload(userInfo: [AnyHashable: Any]) -> PushNotificationPayload {
        let aps = userInfo["aps"] as? [String: Any] ?? [:]
        let alert = aps["alert"] as? [String: Any] ?? [:]

        let title = alert["title"] as? String ?? "MaiFarm"
        let body = alert["body"] as? String ?? ""

        // Extract type from custom data
        let typeString = userInfo["type"] as? String
        let type = PushNotificationType(from: typeString)

        // Build data dictionary from custom keys
        var data: [String: Any] = [:]
        for (key, value) in userInfo {
            if let keyString = key as? String, keyString != "aps" {
                data[keyString] = value
            }
        }

        return PushNotificationPayload(
            type: type,
            title: title,
            body: body,
            data: data,
            receivedAt: Date()
        )
    }

    /// Handle notification based on its type
    private func handleNotificationByType(_ payload: PushNotificationPayload) async {
        switch payload.type {
        case .farmStatusChange, .farmLaunching, .farmRunning, .farmRecovering:
            await handleFarmStatusNotification(payload)

        case .farmCompleted:
            await handleFarmCompletedNotification(payload)

        case .farmFailed:
            await handleFarmFailedNotification(payload)

        case .harvestReady:
            await handleHarvestReadyNotification(payload)

        case .handoffRequest:
            await handleHandoffRequestNotification(payload)

        case .handoffAccepted, .handoffCompleted, .handoffFailed:
            await handleHandoffStatusNotification(payload)

        case .crossDeviceSync:
            await handleCrossDeviceSyncNotification(payload)

        case .agentStatusChange, .agentError, .taskFailed:
            await handleAgentNotification(payload)

        case .systemAlert:
            await handleSystemAlertNotification(payload)

        case .unknown:
            logger.warning("Unknown notification type received")
        }
    }

    // MARK: - Type-specific Handlers

    private func handleFarmStatusNotification(_ payload: PushNotificationPayload) async {
        guard let farmId = payload.farmId else { return }

        logger.info("Farm status notification: \(farmId) - \(payload.data["new_status"] as? String ?? "unknown")")

        // Refresh farm data
        await AppState.shared.refreshFarms()

        // Notify farm status change
        NotificationCenter.default.post(
            name: .farmStatusChanged,
            object: nil,
            userInfo: ["farmId": farmId, "payload": payload.data]
        )
    }

    private func handleFarmCompletedNotification(_ payload: PushNotificationPayload) async {
        guard let farmId = payload.farmId else { return }

        logger.info("Farm completed notification: \(farmId)")

        // Refresh farms and harvests
        await AppState.shared.refreshFarms()
        await AppState.shared.refreshHarvests()

        // Play success haptic
        HapticManager.shared.notify(.success)

        // Show toast
        let farmName = payload.data["farm_name"] as? String ?? "Farm"
        AppState.shared.showToast("\(farmName) completed!", type: .success)

        NotificationCenter.default.post(
            name: .farmCompleted,
            object: nil,
            userInfo: ["farmId": farmId]
        )
    }

    private func handleFarmFailedNotification(_ payload: PushNotificationPayload) async {
        guard let farmId = payload.farmId else { return }

        logger.info("Farm failed notification: \(farmId)")

        await AppState.shared.refreshFarms()

        // Play error haptic
        HapticManager.shared.notify(.error)

        // Show toast
        let farmName = payload.data["farm_name"] as? String ?? "Farm"
        let errorMessage = payload.data["error_message"] as? String ?? "encountered an issue"
        AppState.shared.showToast("\(farmName) failed: \(errorMessage)", type: .error)

        NotificationCenter.default.post(
            name: .farmFailed,
            object: nil,
            userInfo: ["farmId": farmId, "error": errorMessage]
        )
    }

    private func handleHarvestReadyNotification(_ payload: PushNotificationPayload) async {
        guard let farmId = payload.farmId else { return }

        logger.info("Harvest ready notification: \(farmId)")

        await AppState.shared.refreshHarvests()

        HapticManager.shared.notify(.success)

        NotificationCenter.default.post(
            name: .harvestReady,
            object: nil,
            userInfo: ["farmId": farmId]
        )
    }

    private func handleHandoffRequestNotification(_ payload: PushNotificationPayload) async {
        guard let handoffId = payload.handoffId else { return }

        logger.info("Handoff request notification: \(handoffId)")

        // Refresh cross-device state
        await CrossDeviceService.shared.fetchPendingHandoffs()

        HapticManager.shared.notify(.warning)

        NotificationCenter.default.post(
            name: .handoffRequestReceived,
            object: nil,
            userInfo: ["handoffId": handoffId, "payload": payload.data]
        )
    }

    private func handleHandoffStatusNotification(_ payload: PushNotificationPayload) async {
        guard let handoffId = payload.handoffId else { return }

        logger.info("Handoff status notification: \(handoffId) - \(payload.type.rawValue)")

        await CrossDeviceService.shared.fetchPendingHandoffs()

        if payload.type == .handoffCompleted {
            HapticManager.shared.notify(.success)
        }

        NotificationCenter.default.post(
            name: .handoffStatusChanged,
            object: nil,
            userInfo: ["handoffId": handoffId, "status": payload.type.rawValue]
        )
    }

    private func handleCrossDeviceSyncNotification(_ payload: PushNotificationPayload) async {
        logger.info("Cross-device sync notification received")

        // Trigger sync
        await CrossDeviceService.shared.syncNow()
    }

    private func handleAgentNotification(_ payload: PushNotificationPayload) async {
        logger.info("Agent notification: \(payload.type.rawValue)")

        if payload.type == .agentError {
            HapticManager.shared.notify(.error)
        }

        await AppState.shared.refreshFarms()
    }

    private func handleSystemAlertNotification(_ payload: PushNotificationPayload) async {
        logger.info("System alert: \(payload.body)")

        HapticManager.shared.notify(.warning)
        AppState.shared.showToast(payload.body, type: .warning)
    }

    // MARK: - Notification Action Handling

    /// Handle user response to notification action
    func handleNotificationAction(
        actionIdentifier: String,
        notification: UNNotification
    ) async {
        let userInfo = notification.request.content.userInfo
        let payload = parseNotificationPayload(userInfo: userInfo)

        logger.info("Notification action: \(actionIdentifier) for type: \(payload.type.rawValue)")

        switch actionIdentifier {
        case "VIEW_FARM":
            if let farmId = payload.farmId {
                await navigateToFarm(farmId: farmId)
            }

        case "STOP_FARM":
            if let farmId = payload.farmId {
                await stopFarm(farmId: farmId)
            }

        case "VIEW_HARVEST":
            if let farmId = payload.farmId {
                await navigateToHarvest(farmId: farmId)
            }

        case "ARCHIVE_HARVEST":
            if let farmId = payload.farmId {
                await archiveHarvest(farmId: farmId)
            }

        case "ACCEPT_HANDOFF":
            if let handoffId = payload.handoffId {
                await acceptHandoff(handoffId: handoffId)
            }

        case "DECLINE_HANDOFF":
            if let handoffId = payload.handoffId {
                await declineHandoff(handoffId: handoffId)
            }

        case UNNotificationDefaultActionIdentifier:
            // Default tap - navigate based on type
            await handleDefaultAction(payload: payload)

        default:
            break
        }
    }

    // MARK: - Action Implementations

    private func navigateToFarm(farmId: String) async {
        await MainActor.run {
            AppState.shared.selectedTab = 1 // Farms tab
            NotificationCenter.default.post(
                name: .navigateToFarm,
                object: nil,
                userInfo: ["farmId": farmId]
            )
        }
    }

    private func navigateToHarvest(farmId: String) async {
        await MainActor.run {
            AppState.shared.selectedTab = 2 // Harvest tab
            NotificationCenter.default.post(
                name: .openFarmHarvest,
                object: nil,
                userInfo: ["farmId": farmId]
            )
        }
    }

    private func stopFarm(farmId: String) async {
        do {
            try await MaiFarmAPI.shared.stopFarm(farmId)
            logger.info("Farm stopped from notification action: \(farmId)")
        } catch {
            logger.error("Failed to stop farm: \(error.localizedDescription)")
        }
    }

    private func archiveHarvest(farmId: String) async {
        // Archive is handled automatically on completion
        logger.info("Archive action for harvest: \(farmId)")
    }

    private func acceptHandoff(handoffId: String) async {
        // Parse farm ID from pending handoffs
        if let pendingHandoffs = CrossDeviceService.shared.pendingHandoffs,
           let handoff = pendingHandoffs.first(where: { $0.id == handoffId }) {
            await CrossDeviceService.shared.acceptHandoff(handoff)
            logger.info("Handoff accepted from notification: \(handoffId)")
        }
    }

    private func declineHandoff(handoffId: String) async {
        do {
            try await MaiFarmAPI.shared.cancelHandoff(handoffId)
            logger.info("Handoff declined from notification: \(handoffId)")
        } catch {
            logger.error("Failed to decline handoff: \(error.localizedDescription)")
        }
    }

    private func handleDefaultAction(payload: PushNotificationPayload) async {
        switch payload.type {
        case .farmStatusChange, .farmLaunching, .farmRunning, .farmRecovering, .farmFailed:
            if let farmId = payload.farmId {
                await navigateToFarm(farmId: farmId)
            }

        case .farmCompleted, .harvestReady:
            if let farmId = payload.farmId {
                await navigateToHarvest(farmId: farmId)
            }

        case .handoffRequest:
            await MainActor.run {
                AppState.shared.selectedTab = 4 // Settings tab for cross-device
            }

        default:
            break
        }
    }

    // MARK: - Badge Management

    /// Clear notification badge
    func clearBadge() {
        Task {
            try? await notificationCenter.setBadgeCount(0)
        }
    }

    /// Update badge to reflect pending items
    func updateBadge(count: Int) {
        Task {
            try? await notificationCenter.setBadgeCount(count)
        }
    }
}

// MARK: - API Request Types

struct PushTokenRegistrationRequest: Codable {
    let deviceId: String
    let pushToken: String
    let tokenType: String

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case pushToken = "push_token"
        case tokenType = "token_type"
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let pushNotificationReceived = Notification.Name("app.maifarm.pushNotificationReceived")
    static let farmStatusChanged = Notification.Name("app.maifarm.farmStatusChanged")
    static let farmCompleted = Notification.Name("app.maifarm.farmCompleted")
    static let farmFailed = Notification.Name("app.maifarm.farmFailed")
    static let harvestReady = Notification.Name("app.maifarm.harvestReady")
    static let handoffRequestReceived = Notification.Name("app.maifarm.handoffRequestReceived")
    static let handoffStatusChanged = Notification.Name("app.maifarm.handoffStatusChanged")
}

// MARK: - UNUserNotificationCenterDelegate Extension

/// Notification delegate for handling foreground/background notifications
final class PushNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = PushNotificationDelegate()

    private let logger = Logger(subsystem: "app.maifarm", category: "PushDelegate")

    // Called when notification received while app in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // Parse the notification to decide presentation
        let userInfo = notification.request.content.userInfo
        let typeString = userInfo["type"] as? String
        let type = PushNotificationType(from: typeString)

        // Always show farm completed/failed notifications
        switch type {
        case .farmCompleted, .farmFailed, .handoffRequest:
            return [.banner, .sound, .badge]
        case .farmStatusChange, .farmLaunching, .farmRunning:
            // Show status changes as banners without sound
            return [.banner]
        default:
            return [.banner]
        }
    }

    // Called when user interacts with notification
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        await PushNotificationManager.shared.handleNotificationAction(
            actionIdentifier: response.actionIdentifier,
            notification: response.notification
        )
    }
}
