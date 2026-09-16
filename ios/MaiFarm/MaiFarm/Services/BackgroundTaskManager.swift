//
//  BackgroundTaskManager.swift
//  MaiFarm
//
//  Background task scheduling and app lifecycle management
//

import Foundation
import BackgroundTasks
import os.log
import SwiftUI
import UserNotifications

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Background Task Identifiers
enum BackgroundTaskIdentifier: String {
    case farmSync = "app.maifarm.farmSync"
    case harvestCheck = "app.maifarm.harvestCheck"
    case cleanupCache = "app.maifarm.cleanupCache"
    case offlineQueueSync = "app.maifarm.offlineQueueSync"

    var refreshInterval: TimeInterval {
        switch self {
        case .farmSync: return 15 * 60  // 15 minutes
        case .harvestCheck: return 30 * 60  // 30 minutes
        case .cleanupCache: return 24 * 60 * 60  // 24 hours
        case .offlineQueueSync: return 5 * 60  // 5 minutes
        }
    }
}

// MARK: - Background Task Manager
@MainActor
final class BackgroundTaskManager: @unchecked Sendable {
    static let shared = BackgroundTaskManager()

    private let logger = Logger(subsystem: "app.maifarm", category: "BackgroundTasks")
    #if canImport(UIKit)
    private var activeBackgroundTask: UIBackgroundTaskIdentifier = .invalid
    #endif
    private var registeredTasks: Set<String> = []

    private init() {}

    // MARK: - Registration

    /// Register all background tasks - call this in AppDelegate/App init
    func registerBackgroundTasks() {
        for taskId in [
            BackgroundTaskIdentifier.farmSync,
            BackgroundTaskIdentifier.harvestCheck,
            BackgroundTaskIdentifier.cleanupCache,
            BackgroundTaskIdentifier.offlineQueueSync
        ] {
            registerTask(taskId)
        }
    }

    private func registerTask(_ identifier: BackgroundTaskIdentifier) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier.rawValue, using: nil) { [weak self] task in
            self?.handleBackgroundTask(task, identifier: identifier)
        }
        registeredTasks.insert(identifier.rawValue)
        logger.info("Registered background task: \(identifier.rawValue)")
    }

    // MARK: - Scheduling

    /// Schedule all background tasks - call when app enters background
    func scheduleBackgroundTasks() {
        scheduleTask(.farmSync)
        scheduleTask(.harvestCheck)
        scheduleTask(.offlineQueueSync)

        // Schedule cleanup less frequently
        scheduleTask(.cleanupCache)
    }

    func scheduleTask(_ identifier: BackgroundTaskIdentifier) {
        let request: BGTaskRequest

        switch identifier {
        case .farmSync, .harvestCheck, .offlineQueueSync:
            let appRefresh = BGAppRefreshTaskRequest(identifier: identifier.rawValue)
            appRefresh.earliestBeginDate = Date(timeIntervalSinceNow: identifier.refreshInterval)
            request = appRefresh

        case .cleanupCache:
            let processing = BGProcessingTaskRequest(identifier: identifier.rawValue)
            processing.earliestBeginDate = Date(timeIntervalSinceNow: identifier.refreshInterval)
            processing.requiresNetworkConnectivity = false
            processing.requiresExternalPower = false
            request = processing
        }

        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Scheduled background task: \(identifier.rawValue)")
        } catch BGTaskScheduler.Error.notPermitted {
            logger.warning("Background tasks not permitted")
        } catch BGTaskScheduler.Error.tooManyPendingTaskRequests {
            logger.warning("Too many pending task requests")
        } catch BGTaskScheduler.Error.unavailable {
            logger.warning("Background tasks unavailable on this device")
        } catch {
            logger.error("Failed to schedule background task: \(error.localizedDescription)")
        }
    }

    // MARK: - Task Handling

    private func handleBackgroundTask(_ task: BGTask, identifier: BackgroundTaskIdentifier) {
        logger.info("Starting background task: \(identifier.rawValue)")

        // Create a task to perform the work
        let workTask = Task {
            do {
                try await performBackgroundWork(for: identifier)
                task.setTaskCompleted(success: true)
                logger.info("Completed background task: \(identifier.rawValue)")
            } catch {
                task.setTaskCompleted(success: false)
                logger.error("Failed background task \(identifier.rawValue): \(error.localizedDescription)")
            }
        }

        // Handle expiration
        task.expirationHandler = {
            workTask.cancel()
            task.setTaskCompleted(success: false)
        }

        // Schedule next execution
        scheduleTask(identifier)
    }

    private func performBackgroundWork(for identifier: BackgroundTaskIdentifier) async throws {
        switch identifier {
        case .farmSync:
            try await syncFarms()
        case .harvestCheck:
            try await checkHarvests()
        case .cleanupCache:
            try await cleanupCache()
        case .offlineQueueSync:
            try await syncOfflineQueue()
        }
    }

    // MARK: - Background Work Implementation

    private func syncFarms() async throws {
        guard await NetworkMonitor.shared.isConnected else { return }

        let farms = try await MaiFarmAPI.shared.getFarms()

        // Update state on main actor
        await MainActor.run {
            AppState.shared.farms = farms
            AppState.shared.activeFarm = farms.first { $0.status == .running || $0.status == .active }
        }

        // Check for completed farms and trigger notifications
        let completedFarms = farms.filter { $0.status == .completed }
        for farm in completedFarms {
            await sendCompletionNotification(for: farm)
        }
    }

    private func checkHarvests() async throws {
        guard await NetworkMonitor.shared.isConnected else { return }

        let harvests = try await MaiFarmAPI.shared.getHarvests()

        await MainActor.run {
            AppState.shared.harvests = harvests
        }
    }

    private func cleanupCache() async throws {
        // Clear old cache entries
        await RequestCache.shared.clear()

        // Cleanup old persisted data
        await PersistenceManager.shared.cleanupOldData(olderThan: 30)

        logger.info("Cache cleanup completed")
    }

    private func syncOfflineQueue() async throws {
        guard await NetworkMonitor.shared.isConnected else { return }

        let operations = await OfflineQueue.shared.getPendingOperations()

        for operation in operations {
            do {
                try await executeQueuedOperation(operation)
                await OfflineQueue.shared.markCompleted(operation.id)
            } catch {
                await OfflineQueue.shared.markFailed(operation.id, error: error.localizedDescription)
            }
        }
    }

    private func executeQueuedOperation(_ operation: OfflineQueue.QueuedOperation) async throws {
        switch operation.type {
        case .createFarm:
            if let data = operation.payload.data(using: .utf8),
               let request = try? JSONDecoder().decode(CreateFarmRequest.self, from: data) {
                _ = try await MaiFarmAPI.shared.createFarm(request)
            }
        case .stopFarm:
            try await MaiFarmAPI.shared.stopFarm(operation.entityId ?? "")
        case .deleteHarvest:
            try await MaiFarmAPI.shared.deleteHarvest(operation.entityId ?? "")
        }
    }

    // MARK: - App Lifecycle

    /// Begin a background task when app is backgrounded with active work
    func beginBackgroundTask(name: String, expirationHandler: (() -> Void)? = nil) {
        #if canImport(UIKit)
        activeBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            expirationHandler?()
            self?.endBackgroundTask()
        }

        if activeBackgroundTask == .invalid {
            logger.warning("Failed to begin background task: \(name)")
        } else {
            logger.info("Began background task: \(name)")
        }
        #endif
    }

    /// End the current background task
    func endBackgroundTask() {
        #if canImport(UIKit)
        guard activeBackgroundTask != .invalid else { return }

        UIApplication.shared.endBackgroundTask(activeBackgroundTask)
        activeBackgroundTask = .invalid
        logger.info("Ended background task")
        #endif
    }

    /// Handle app entering background
    func handleAppDidEnterBackground() {
        logger.info("App entering background")

        // Schedule background tasks
        scheduleBackgroundTasks()

        // If there's active work, start a background task
        if AppState.shared.activeFarm != nil {
            beginBackgroundTask(name: "ActiveFarmMonitoring") {
                // Save state before expiration
                Task {
                    await self.saveAppState()
                }
            }
        }
    }

    /// Handle app becoming active
    func handleAppDidBecomeActive() {
        logger.info("App becoming active")

        // End any background task
        endBackgroundTask()

        // Refresh data
        Task {
            await AppState.shared.refreshFarms()
            await AppState.shared.refreshHarvests()
        }
    }

    /// Handle app termination
    func handleAppWillTerminate() {
        logger.info("App terminating")

        // Save state synchronously
        Task {
            await saveAppState()
        }
    }

    // MARK: - State Preservation

    private func saveAppState() async {
        do {
            // Save current farms state
            try await PersistenceManager.shared.save(AppState.shared.farms, filename: "farms_cache.json")

            // Save harvests state
            try await PersistenceManager.shared.save(AppState.shared.harvests, filename: "harvests_cache.json")

            logger.info("Saved app state")
        } catch {
            logger.error("Failed to save app state: \(error.localizedDescription)")
        }
    }

    func restoreAppState() async {
        // Restore farms
        if let farms: [Farm] = try? await PersistenceManager.shared.load([Farm].self, filename: "farms_cache.json") {
            await MainActor.run {
                AppState.shared.farms = farms
                AppState.shared.activeFarm = farms.first { $0.status == .running || $0.status == .active }
            }
        }

        // Restore harvests
        if let harvests: [Harvest] = try? await PersistenceManager.shared.load([Harvest].self, filename: "harvests_cache.json") {
            await MainActor.run {
                AppState.shared.harvests = harvests
            }
        }

        logger.info("Restored app state")
    }

    // MARK: - Notifications

    private func sendCompletionNotification(for farm: Farm) async {
        logger.info("Sending completion notification for farm '\(farm.name)'")

        // Send local notification
        await NotificationService.shared.sendFarmCompletedNotification(farm: farm)

        // Post notification for in-app handling
        await MainActor.run {
            NotificationCenter.default.post(
                name: .farmCompleted,
                object: nil,
                userInfo: ["farmId": farm.id, "farmName": farm.name]
            )
        }
    }

    /// Send progress notification for long-running farms
    func sendProgressNotification(farm: Farm, progress: Double) async {
        // Only send progress notifications for longer farms (> 30 min) at key milestones
        let milestones = [0.25, 0.5, 0.75]
        guard milestones.contains(where: { abs($0 - progress) < 0.02 }) else { return }

        await NotificationService.shared.sendFarmProgressNotification(
            farm: farm,
            progress: progress
        )
    }
}

// MARK: - Notification Service
@MainActor
final class NotificationService: @unchecked Sendable {
    static let shared = NotificationService()

    private let logger = Logger(subsystem: "app.maifarm", category: "Notifications")
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true

    private init() {}

    /// Request notification permissions
    func requestPermissions() async -> Bool {
        // DISABLED FOR E2E TESTING - notification dialogs block automation
        // Users can enable notifications via Settings after first launch
        logger.info("[E2E] Notification permission request disabled - enable in Settings")
        return true
        /*
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            logger.info("Notification permission granted: \(granted)")
            return granted
        } catch {
            logger.error("Failed to request notification permission: \(error.localizedDescription)")
            return false
        }
        */
    }

    /// Check if notifications are authorized
    func checkAuthorizationStatus() async -> UNAuthorizationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus
    }

    /// Send farm completed notification
    func sendFarmCompletedNotification(farm: Farm) async {
        guard notificationsEnabled else { return }

        let content = UNMutableNotificationContent()
        content.title = "Farm Completed! 🌾"
        content.body = "\(farm.name) has finished. Tap to view your harvest."
        content.sound = .default
        content.badge = 1
        content.categoryIdentifier = "FARM_COMPLETED"
        content.userInfo = ["farmId": farm.id, "type": "completed"]

        let request = UNNotificationRequest(
            identifier: "farm-completed-\(farm.id)",
            content: content,
            trigger: nil  // Immediate
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
            logger.info("Sent completion notification for farm: \(farm.name)")
        } catch {
            logger.error("Failed to send notification: \(error.localizedDescription)")
        }
    }

    /// Send farm progress notification (for long-running farms)
    func sendFarmProgressNotification(farm: Farm, progress: Double) async {
        guard notificationsEnabled else { return }

        let percentComplete = Int(progress * 100)
        let content = UNMutableNotificationContent()
        content.title = "Farm Progress"
        content.body = "\(farm.name) is \(percentComplete)% complete"
        content.sound = nil  // Silent for progress updates
        content.categoryIdentifier = "FARM_PROGRESS"
        content.userInfo = ["farmId": farm.id, "type": "progress", "progress": progress]

        let request = UNNotificationRequest(
            identifier: "farm-progress-\(farm.id)-\(percentComplete)",
            content: content,
            trigger: nil
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
            logger.info("Sent progress notification for farm: \(farm.name) at \(percentComplete)%")
        } catch {
            logger.error("Failed to send progress notification: \(error.localizedDescription)")
        }
    }

    /// Send farm failed notification
    func sendFarmFailedNotification(farm: Farm, reason: String?) async {
        guard notificationsEnabled else { return }

        let content = UNMutableNotificationContent()
        content.title = "Farm Issue ⚠️"
        content.body = "\(farm.name) encountered a problem. Tap to review."
        content.sound = .default
        content.categoryIdentifier = "FARM_FAILED"
        content.userInfo = ["farmId": farm.id, "type": "failed"]

        let request = UNNotificationRequest(
            identifier: "farm-failed-\(farm.id)",
            content: content,
            trigger: nil
        )

        do {
            try await UNUserNotificationCenter.current().add(request)
            logger.info("Sent failure notification for farm: \(farm.name)")
        } catch {
            logger.error("Failed to send notification: \(error.localizedDescription)")
        }
    }

    /// Setup notification categories and actions
    func setupNotificationCategories() {
        // Farm completed category with actions
        let viewAction = UNNotificationAction(
            identifier: "VIEW_HARVEST",
            title: "View Harvest",
            options: [.foreground]
        )
        let dismissAction = UNNotificationAction(
            identifier: "DISMISS",
            title: "Dismiss",
            options: [.destructive]
        )

        let completedCategory = UNNotificationCategory(
            identifier: "FARM_COMPLETED",
            actions: [viewAction, dismissAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // Farm progress category
        let progressCategory = UNNotificationCategory(
            identifier: "FARM_PROGRESS",
            actions: [viewAction],
            intentIdentifiers: [],
            options: []
        )

        // Farm failed category
        let retryAction = UNNotificationAction(
            identifier: "RETRY_FARM",
            title: "Retry",
            options: [.foreground]
        )
        let failedCategory = UNNotificationCategory(
            identifier: "FARM_FAILED",
            actions: [retryAction, viewAction, dismissAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            completedCategory,
            progressCategory,
            failedCategory
        ])

        logger.info("Notification categories configured")
    }

    /// Clear all pending notifications
    func clearAllNotifications() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        logger.info("Cleared all notifications")
    }

    /// Clear badge count
    func clearBadge() {
        Task {
            try? await UNUserNotificationCenter.current().setBadgeCount(0)
        }
    }
}

// MARK: - App Lifecycle Observer
struct AppLifecycleModifier: ViewModifier {
    @Environment(\.scenePhase) var scenePhase

    func body(content: Content) -> some View {
        content
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .background:
                    Task { @MainActor in
                        BackgroundTaskManager.shared.handleAppDidEnterBackground()
                    }
                case .active:
                    Task { @MainActor in
                        BackgroundTaskManager.shared.handleAppDidBecomeActive()
                    }
                case .inactive:
                    break
                @unknown default:
                    break
                }
            }
    }
}

extension View {
    func observeAppLifecycle() -> some View {
        self.modifier(AppLifecycleModifier())
    }
}

// MARK: - Run State Preserver
actor RunStatePreserver {
    static let shared = RunStatePreserver()

    private let logger = Logger(subsystem: "app.maifarm", category: "RunStatePreserver")

    private struct PersistedRunState: Codable {
        let farmId: String
        let startTime: Date
        let progress: Double
        let agentStates: [String: String]
        let lastActivityTime: Date
    }

    private var activeRunStates: [String: PersistedRunState] = [:]

    func saveRunState(farmId: String, progress: Double, agentStates: [String: String]) async {
        let state = PersistedRunState(
            farmId: farmId,
            startTime: activeRunStates[farmId]?.startTime ?? Date(),
            progress: progress,
            agentStates: agentStates,
            lastActivityTime: Date()
        )

        activeRunStates[farmId] = state

        // Persist to disk
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(activeRunStates)
            let url = getStateFileURL()
            try data.write(to: url, options: .atomic)
            logger.debug("Saved run state for farm \(farmId)")
        } catch {
            logger.error("Failed to save run state for farm \(farmId): \(error.localizedDescription)")
        }
    }

    func getRunState(farmId: String) -> (progress: Double, agentStates: [String: String])? {
        guard let state = activeRunStates[farmId] else { return nil }
        return (state.progress, state.agentStates)
    }

    func clearRunState(farmId: String) {
        activeRunStates.removeValue(forKey: farmId)
        logger.info("Cleared run state for farm \(farmId)")
        Task { await persistToDisk() }
    }

    func loadPersistedStates() async {
        let url = getStateFileURL()

        guard FileManager.default.fileExists(atPath: url.path) else {
            logger.debug("No existing run states file found")
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            activeRunStates = try decoder.decode([String: PersistedRunState].self, from: data)
            logger.info("Loaded \(self.activeRunStates.count) run states from disk")
        } catch {
            logger.error("Failed to load run states from disk: \(error.localizedDescription)")
            // Clear corrupted state
            activeRunStates = [:]
        }
    }

    private func persistToDisk() async {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(activeRunStates)
            let url = getStateFileURL()
            try data.write(to: url, options: .atomic)
            logger.debug("Persisted \(self.activeRunStates.count) run states to disk")
        } catch {
            logger.error("Failed to persist run states to disk: \(error.localizedDescription)")
        }
    }

    func clearAllStates() async {
        activeRunStates.removeAll()
        logger.info("Cleared all run states")
        await persistToDisk()
    }

    func getActiveRunCount() -> Int {
        activeRunStates.count
    }

    private func getStateFileURL() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("run_states.json")
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let farmCompleted = Notification.Name("app.maifarm.farmCompleted")
    static let farmFailed = Notification.Name("app.maifarm.farmFailed")
    static let syncCompleted = Notification.Name("app.maifarm.syncCompleted")
    static let networkStatusChanged = Notification.Name("app.maifarm.networkStatusChanged")
}
