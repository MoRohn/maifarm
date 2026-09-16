//
//  StallNotificationService.swift
//  MaiFarm
//
//  Push notification support for stall alerts when app is backgrounded
//  Integrates with iOS notification system for timely alerts
//

import Foundation
import UserNotifications
import os.log

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Notification Configuration

struct StallNotificationConfig {
    /// Whether stall notifications are enabled
    var enabled: Bool = true

    /// Minimum time between stall notifications (seconds)
    let minTimeBetweenNotifications: TimeInterval = 120.0

    /// Whether to show notifications when app is in foreground
    var showInForeground: Bool = false

    /// Whether to include sound
    var includeSound: Bool = true

    /// Whether to include badge update
    var updateBadge: Bool = true

    /// Custom notification sound name (nil for default)
    var customSoundName: String? = nil

    /// Priority level for notifications
    var priority: NotificationPriority = .high

    enum NotificationPriority {
        case low
        case medium
        case high
        case critical

        var interruptionLevel: UNNotificationInterruptionLevel {
            switch self {
            case .low: return .passive
            case .medium: return .active
            case .high: return .timeSensitive
            case .critical: return .critical
            }
        }
    }
}

// MARK: - Stall Notification

struct StallNotification: Identifiable {
    let id = UUID()
    let sessionId: String
    let farmName: String
    let stallReason: String?
    let inactivityDuration: TimeInterval
    let timestamp: Date
    let nudgeId: String?

    var title: String {
        "Farm Stalled"
    }

    var body: String {
        let duration = Int(inactivityDuration)
        var message = "'\(farmName)' has been inactive for \(duration) seconds."

        if let reason = stallReason {
            message += " \(reason)"
        }

        return message
    }
}

// MARK: - Stall Notification Service

/// Manages push notifications for stall detection
@MainActor
final class StallNotificationService: ObservableObject, @unchecked Sendable {
    static let shared = StallNotificationService()

    private let logger = Logger(subsystem: "app.maifarm", category: "StallNotification")

    // Configuration
    @Published var config = StallNotificationConfig()

    // State
    @Published var lastNotificationTime: Date?
    @Published var pendingNotifications: [StallNotification] = []
    @Published var deliveredNotifications: [StallNotification] = []

    // Notification center
    private let notificationCenter = UNUserNotificationCenter.current()

    // Notification identifiers
    private let categoryIdentifier = "STALL_ALERT"
    private let viewActionIdentifier = "VIEW_FARM"
    private let nudgeActionIdentifier = "SEND_NUDGE"
    private let dismissActionIdentifier = "DISMISS"

    // MARK: - Initialization

    private init() {
        setupNotificationCategories()
    }

    // MARK: - Setup

    /// Request notification permissions
    func requestPermissions() async -> Bool {
        // DISABLED FOR E2E TESTING - notification dialogs block automation
        // Users can enable notifications via Settings after first launch
        logger.info("[E2E] Stall notification permission request disabled - enable in Settings")
        return true
        /*
        do {
            let granted = try await notificationCenter.requestAuthorization(
                options: [.alert, .badge, .sound, .criticalAlert]
            )

            logger.info("Notification permission granted: \(granted)")
            return granted
        } catch {
            logger.error("Failed to request notification permission: \(error.localizedDescription)")
            return false
        }
        */
    }

    /// Check current authorization status
    func checkAuthorizationStatus() async -> UNAuthorizationStatus {
        let settings = await notificationCenter.notificationSettings()
        return settings.authorizationStatus
    }

    /// Set up notification categories with actions
    private func setupNotificationCategories() {
        // View farm action
        let viewAction = UNNotificationAction(
            identifier: viewActionIdentifier,
            title: "View Farm",
            options: [.foreground]
        )

        // Send nudge action
        let nudgeAction = UNNotificationAction(
            identifier: nudgeActionIdentifier,
            title: "Send Nudge",
            options: []
        )

        // Dismiss action
        let dismissAction = UNNotificationAction(
            identifier: dismissActionIdentifier,
            title: "Dismiss",
            options: [.destructive]
        )

        // Create category
        let stallCategory = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [viewAction, nudgeAction, dismissAction],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "Farm activity stalled",
            options: [.customDismissAction]
        )

        notificationCenter.setNotificationCategories([stallCategory])
        logger.info("Stall notification category configured")
    }

    // MARK: - Send Notifications

    /// Send a stall notification
    func sendStallNotification(
        sessionId: String,
        farmName: String,
        stallReason: String?,
        inactivityDuration: TimeInterval,
        nudgeId: String? = nil
    ) async {
        guard config.enabled else {
            logger.debug("Stall notifications disabled")
            return
        }

        // Check rate limiting
        if let lastTime = lastNotificationTime {
            let timeSince = Date().timeIntervalSince(lastTime)
            if timeSince < config.minTimeBetweenNotifications {
                logger.debug("Rate limited: \(timeSince)s since last notification")
                return
            }
        }

        // Check if app is in foreground
        #if canImport(UIKit)
        let appState = await UIApplication.shared.applicationState
        if appState == .active && !config.showInForeground {
            logger.debug("App in foreground, skipping notification")
            return
        }
        #endif

        // Create notification
        let stallNotification = StallNotification(
            sessionId: sessionId,
            farmName: farmName,
            stallReason: stallReason,
            inactivityDuration: inactivityDuration,
            timestamp: Date(),
            nudgeId: nudgeId
        )

        // Build notification content
        let content = UNMutableNotificationContent()
        content.title = stallNotification.title
        content.body = stallNotification.body
        content.categoryIdentifier = categoryIdentifier
        content.threadIdentifier = "stall-\(sessionId)"
        content.userInfo = [
            "sessionId": sessionId,
            "farmName": farmName,
            "nudgeId": nudgeId ?? "",
            "type": "stall_alert"
        ]

        // Configure sound
        if config.includeSound {
            if let soundName = config.customSoundName {
                content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: soundName))
            } else {
                content.sound = .default
            }
        }

        // Configure badge
        if config.updateBadge {
            content.badge = NSNumber(value: deliveredNotifications.count + 1)
        }

        // Set interruption level
        if #available(iOS 15.0, *) {
            content.interruptionLevel = config.priority.interruptionLevel
        }

        // Create request
        let request = UNNotificationRequest(
            identifier: "stall-\(stallNotification.id)",
            content: content,
            trigger: nil // Immediate
        )

        // Schedule notification
        do {
            try await notificationCenter.add(request)

            lastNotificationTime = Date()
            deliveredNotifications.append(stallNotification)

            // Keep only last 20 delivered
            if deliveredNotifications.count > 20 {
                deliveredNotifications.removeFirst()
            }

            logger.info("Sent stall notification for session: \(sessionId)")
        } catch {
            logger.error("Failed to send stall notification: \(error.localizedDescription)")
        }
    }

    /// Send a prediction-based early warning notification
    func sendPredictionWarning(
        sessionId: String,
        farmName: String,
        prediction: StallPrediction
    ) async {
        guard config.enabled else { return }
        guard prediction.recommendation == .preemptiveNudge || prediction.recommendation == .immediateAction else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Stall Warning"
        content.body = "'\(farmName)' may stall soon. Consider checking progress."
        content.categoryIdentifier = categoryIdentifier
        content.threadIdentifier = "stall-prediction-\(sessionId)"
        content.userInfo = [
            "sessionId": sessionId,
            "type": "stall_warning",
            "probability": prediction.probability
        ]
        content.sound = nil // Silent for warnings

        if #available(iOS 15.0, *) {
            content.interruptionLevel = .passive
        }

        let request = UNNotificationRequest(
            identifier: "stall-warning-\(UUID())",
            content: content,
            trigger: nil
        )

        do {
            try await notificationCenter.add(request)
            logger.debug("Sent stall prediction warning for: \(sessionId)")
        } catch {
            logger.error("Failed to send prediction warning: \(error.localizedDescription)")
        }
    }

    // MARK: - Notification Management

    /// Clear all stall notifications
    func clearAllNotifications() {
        notificationCenter.removeAllPendingNotificationRequests()
        notificationCenter.removeAllDeliveredNotifications()
        deliveredNotifications.removeAll()
        clearBadge()
        logger.info("Cleared all stall notifications")
    }

    /// Clear notifications for a specific session
    func clearNotifications(for sessionId: String) {
        notificationCenter.removeDeliveredNotifications(
            withIdentifiers: deliveredNotifications
                .filter { $0.sessionId == sessionId }
                .map { "stall-\($0.id)" }
        )

        deliveredNotifications.removeAll { $0.sessionId == sessionId }
        updateBadge()
    }

    /// Clear badge
    func clearBadge() {
        Task {
            try? await notificationCenter.setBadgeCount(0)
        }
    }

    /// Update badge count
    private func updateBadge() {
        Task {
            try? await notificationCenter.setBadgeCount(deliveredNotifications.count)
        }
    }

    // MARK: - Handle Actions

    /// Handle notification action with extracted data (main actor safe)
    func handleNotificationAction(actionIdentifier: String, sessionId: String) async {
        switch actionIdentifier {
        case viewActionIdentifier:
            logger.info("View farm action for session: \(sessionId)")
            await navigateToFarm(sessionId: sessionId)

        case nudgeActionIdentifier:
            logger.info("Send nudge action for session: \(sessionId)")
            await sendNudgeForSession(sessionId: sessionId)

        case dismissActionIdentifier:
            logger.info("Dismissed stall notification for session: \(sessionId)")

        case UNNotificationDefaultActionIdentifier:
            // Default tap - open app and navigate
            await navigateToFarm(sessionId: sessionId)

        default:
            break
        }
    }

    private func navigateToFarm(sessionId: String) async {
        // Post notification for app to handle navigation
        NotificationCenter.default.post(
            name: .navigateToFarm,
            object: nil,
            userInfo: ["sessionId": sessionId]
        )
    }

    private func sendNudgeForSession(sessionId: String) async {
        // Trigger nudge through Assistant
        await AssistantService.shared.refreshSummary()

        // Post notification
        NotificationCenter.default.post(
            name: .stallNudgeRequested,
            object: nil,
            userInfo: ["sessionId": sessionId]
        )
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let navigateToFarm = Notification.Name("app.maifarm.navigateToFarm")
    static let stallNudgeRequested = Notification.Name("app.maifarm.stallNudgeRequested")
    static let stallAlertReceived = Notification.Name("app.maifarm.stallAlertReceived")
}

// MARK: - UNUserNotificationCenterDelegate

final class StallNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = StallNotificationDelegate()

    private let logger = Logger(subsystem: "app.maifarm", category: "NotificationDelegate")

    // Called when notification received while app in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let config = await StallNotificationService.shared.config

        if config.showInForeground {
            var options: UNNotificationPresentationOptions = [.banner]
            if config.includeSound {
                options.insert(.sound)
            }
            if config.updateBadge {
                options.insert(.badge)
            }
            return options
        }

        return []
    }

    // Called when user interacts with notification
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Extract sendable data before crossing actor boundary
        let actionIdentifier = response.actionIdentifier
        let userInfo = response.notification.request.content.userInfo
        guard let sessionId = userInfo["sessionId"] as? String else { return }

        await StallNotificationService.shared.handleNotificationAction(
            actionIdentifier: actionIdentifier,
            sessionId: sessionId
        )
    }
}

// MARK: - SwiftUI Integration

extension StallNotificationService {
    /// Get recent notifications for UI display
    func getRecentNotifications(limit: Int = 5) -> [StallNotification] {
        Array(deliveredNotifications.suffix(limit))
    }

    /// Toggle notification enabled state
    func toggleEnabled() {
        config.enabled.toggle()
        logger.info("Stall notifications \(self.config.enabled ? "enabled" : "disabled")")
    }

    /// Update priority
    func setPriority(_ priority: StallNotificationConfig.NotificationPriority) {
        config.priority = priority
        logger.info("Notification priority set to: \(String(describing: priority))")
    }
}

// MARK: - Background Extension

extension StallNotificationService {
    /// Schedule a delayed stall check notification
    func scheduleDelayedCheck(
        sessionId: String,
        farmName: String,
        delay: TimeInterval
    ) async {
        let content = UNMutableNotificationContent()
        content.title = "Farm Check-in"
        content.body = "How is '\(farmName)' progressing?"
        content.categoryIdentifier = categoryIdentifier
        content.userInfo = ["sessionId": sessionId, "type": "check_in"]
        content.sound = nil

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)

        let request = UNNotificationRequest(
            identifier: "check-\(sessionId)-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )

        do {
            try await notificationCenter.add(request)
            logger.debug("Scheduled check-in for \(delay)s")
        } catch {
            logger.error("Failed to schedule check-in: \(error.localizedDescription)")
        }
    }

    /// Cancel scheduled checks for a session
    func cancelScheduledChecks(for sessionId: String) {
        Task {
            let requests = await notificationCenter.pendingNotificationRequests()
            let toCancel = requests
                .filter { $0.identifier.hasPrefix("check-\(sessionId)") }
                .map { $0.identifier }

            notificationCenter.removePendingNotificationRequests(withIdentifiers: toCancel)
        }
    }
}
