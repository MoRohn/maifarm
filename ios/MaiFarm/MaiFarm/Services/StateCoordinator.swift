//
//  StateCoordinator.swift
//  MaiFarm
//
//  Centralized state management with Swift concurrency and offline-first support
//

import Foundation
import SwiftUI
import Combine
import os.log

// MARK: - App State
@MainActor
final class AppState: ObservableObject, @unchecked Sendable {
    static let shared = AppState()

    // Core state
    @Published var isAuthenticated = false
    @Published var isOnline = true
    @Published var isSyncing = false
    @Published var syncError: String?

    // Domain state
    @Published var farms: [Farm] = []
    @Published var activeFarm: Farm?
    @Published var harvests: [Harvest] = []
    @Published var pendingOperations: Int = 0

    // UI state
    @Published var selectedTab = 0
    @Published var showingError = false
    @Published var errorMessage: String?
    @Published var showingToast = false
    @Published var toastMessage: String = ""
    @Published var toastType: ToastType = .info

    enum ToastType {
        case success, error, warning, info
    }

    private let logger = Logger(subsystem: "app.maifarm", category: "State")
    private var cancellables = Set<AnyCancellable>()
    private let stateCoordinator = StateCoordinator.shared

    // Background/foreground handling
    @Published var isInBackground = false
    private var autoRefreshTimer: Timer?
    private var wasRefreshingBeforeBackground = false

    private init() {
        setupNetworkMonitoring()
        setupAutoRefresh()
        setupScenePhaseMonitoring()
    }

    /// Setup scene phase monitoring for background/foreground transitions
    private func setupScenePhaseMonitoring() {
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleEnterBackground()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleEnterForeground()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleMemoryWarning()
            }
            .store(in: &cancellables)
        #endif
    }

    private func handleEnterBackground() {
        logger.info("App entering background - pausing auto-refresh")
        isInBackground = true
        wasRefreshingBeforeBackground = autoRefreshTimer != nil
        autoRefreshTimer?.invalidate()
        autoRefreshTimer = nil

        // Disconnect WebSocket monitoring to save battery
        Task {
            DeviceOptimizedMonitoringService.shared.disconnect()
        }
    }

    private func handleEnterForeground() {
        logger.info("App entering foreground - resuming operations")
        isInBackground = false

        // Restart auto-refresh if it was running
        if wasRefreshingBeforeBackground {
            setupAutoRefresh()
        }

        // Refresh data immediately
        Task {
            await refreshFarms()

            // Reconnect to active farm if any
            if let activeFarm = activeFarm {
                try? await DeviceOptimizedMonitoringService.shared.connect(to: activeFarm.id)
            }
        }
    }

    private func handleMemoryWarning() {
        logger.warning("Memory warning received - clearing caches")

        // Clear non-essential data
        harvests = []

        // Notify monitoring service to trim buffers
        Task {
            await RequestCache.shared.clear()
        }
    }

    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.isOnline = connected
                if connected {
                    Task { await self?.syncPendingOperations() }
                }
            }
            .store(in: &cancellables)
    }

    private func setupAutoRefresh() {
        // Cancel existing timer if any
        autoRefreshTimer?.invalidate()

        // Refresh farms every 30 seconds when authenticated and not in background
        autoRefreshTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self,
                      self.isAuthenticated,
                      self.isOnline,
                      !self.isInBackground else { return }
                await self.refreshFarms()
            }
        }
    }

    // MARK: - Public Actions

    func refreshFarms() async {
        // Guard against background refresh
        guard !isInBackground else {
            logger.debug("Skipping refresh - app is in background")
            return
        }

        do {
            let fetchedFarms = try await MaiFarmAPI.shared.getFarms()

            // Safely update on main thread
            await MainActor.run {
                self.farms = fetchedFarms
                self.activeFarm = fetchedFarms.first { $0.status == .running || $0.status == .active }
            }

            logger.info("Refreshed \(fetchedFarms.count) farms")
        } catch is CancellationError {
            logger.debug("Farm refresh cancelled")
        } catch {
            handleError(error)
        }
    }

    func refreshHarvests() async {
        do {
            harvests = try await MaiFarmAPI.shared.getHarvests()
            logger.info("Refreshed \(self.harvests.count) harvests")
        } catch {
            handleError(error)
        }
    }

    func createFarm(
        name: String,
        agents: Int,
        duration: Int,
        provider: String,
        goal: String? = nil,
        executionDeviceId: String? = nil
    ) async -> Farm? {
        do {
            let request = CreateFarmRequest(
                name: name,
                agentCount: agents,
                duration: duration,
                provider: provider,
                goal: goal,
                executionDeviceId: executionDeviceId
            )

            let farm = try await MaiFarmAPI.shared.createFarm(request)
            farms.insert(farm, at: 0)
            activeFarm = farm
            showToast("Farm '\(name)' created!", type: .success)
            HapticManager.shared.notify(.success)
            return farm
        } catch {
            handleError(error)
            return nil
        }
    }

    func stopFarm(_ id: String) async {
        do {
            try await MaiFarmAPI.shared.stopFarm(id)
            if let index = farms.firstIndex(where: { $0.id == id }) {
                // Update local state immediately
                farms[index] = Farm(
                    id: farms[index].id,
                    name: farms[index].name,
                    status: .completed,
                    agents: farms[index].agents,
                    createdAt: farms[index].createdAt,
                    updatedAt: Date(),
                    progress: 1.0,
                    duration: farms[index].duration,
                    provider: farms[index].provider
                )
            }
            if activeFarm?.id == id {
                activeFarm = nil
            }
            showToast("Farm stopped", type: .info)
            HapticManager.shared.notify(.warning)
        } catch {
            handleError(error)
        }
    }

    func recoverFarm(_ id: String) async {
        do {
            let farm = try await MaiFarmAPI.shared.recoverFarm(id)
            if let index = farms.firstIndex(where: { $0.id == id }) {
                farms[index] = farm
            }
            showToast("Farm recovered", type: .success)
        } catch {
            handleError(error)
        }
    }

    func deleteFarm(_ id: String) async {
        do {
            try await MaiFarmAPI.shared.deleteFarm(id)
            farms.removeAll { $0.id == id }
            if activeFarm?.id == id {
                activeFarm = nil
            }
            showToast("Farm deleted", type: .success)
            HapticManager.shared.notify(.success)
        } catch {
            handleError(error)
        }
    }

    func deleteFarmByName(_ name: String) async {
        guard let farm = farms.first(where: { $0.name == name }) else {
            showToast("Farm not found", type: .error)
            return
        }
        await deleteFarm(farm.id)
    }

    func stopFarmByName(_ name: String) async {
        guard let farm = farms.first(where: { $0.name == name }) else {
            showToast("Farm not found", type: .error)
            return
        }
        await stopFarm(farm.id)
    }

    func deleteHarvest(_ id: String) async {
        do {
            try await MaiFarmAPI.shared.deleteHarvest(id)
            harvests.removeAll { $0.id == id }
            showToast("Harvest deleted", type: .info)
        } catch {
            handleError(error)
        }
    }

    // MARK: - Offline Queue Sync

    private func syncPendingOperations() async {
        guard isOnline else { return }

        isSyncing = true
        defer { isSyncing = false }

        let operations = await OfflineQueue.shared.getPendingOperations()
        pendingOperations = operations.count

        for operation in operations {
            do {
                try await executeQueuedOperation(operation)
                await OfflineQueue.shared.markCompleted(operation.id)
                pendingOperations -= 1
            } catch {
                logger.error("Failed to sync operation \(operation.id): \(error.localizedDescription)")
                await OfflineQueue.shared.markFailed(operation.id, error: error.localizedDescription)
            }
        }

        if pendingOperations == 0 && !operations.isEmpty {
            showToast("Changes synced", type: .success)
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

    // MARK: - Error Handling

    func handleError(_ error: Error) {
        // Defensive guard - ensure we're on main thread
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.handleError(error)
            }
            return
        }

        let apiError = error as? APIError ?? .unknown(error)

        switch apiError {
        case .networkUnavailable:
            syncError = "Working offline"
            showToast("Working offline - changes will sync later", type: .warning)
        case .unauthorized:
            isAuthenticated = false
            showToast("Please sign in again", type: .error)
        case .rateLimited(let retryAfter):
            let message = retryAfter.map { "Please wait \(Int($0))s" } ?? "Please slow down"
            showToast(message, type: .warning)
        case .cancelled:
            // Don't show error for cancelled operations
            logger.debug("Operation cancelled")
            return
        case .timeout:
            showToast("Request timed out - please try again", type: .warning)
        default:
            showToast(apiError.localizedDescription, type: .error)
        }

        logger.error("Error: \(error.localizedDescription)")
        HapticManager.shared.notify(.error)
    }

    /// Safe operation wrapper with automatic error handling
    func safeOperation<T>(_ operation: () async throws -> T) async -> T? {
        do {
            return try await operation()
        } catch is CancellationError {
            logger.debug("Operation cancelled")
            return nil
        } catch {
            handleError(error)
            return nil
        }
    }

    func showToast(_ message: String, type: ToastType) {
        toastMessage = message
        toastType = type
        showingToast = true

        // Auto-dismiss after 3 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.showingToast = false
        }
    }

    func showError(_ message: String) {
        errorMessage = message
        showingError = true
    }
}

// MARK: - State Coordinator (Actor for thread-safe operations)
actor StateCoordinator {
    static let shared = StateCoordinator()

    private var farmListeners: [String: AsyncStream<Farm>.Continuation] = [:]
    private var activeStreams: [String: Task<Void, Never>] = [:]

    func subscribeFarmUpdates(_ farmId: String) -> AsyncStream<Farm> {
        AsyncStream { continuation in
            farmListeners[farmId] = continuation

            continuation.onTermination = { [weak self] _ in
                Task { await self?.unsubscribe(farmId) }
            }
        }
    }

    func publishFarmUpdate(_ farm: Farm) {
        farmListeners[farm.id]?.yield(farm)
    }

    func unsubscribe(_ farmId: String) {
        farmListeners.removeValue(forKey: farmId)
        activeStreams[farmId]?.cancel()
        activeStreams.removeValue(forKey: farmId)
    }
}

// MARK: - Offline Queue
actor OfflineQueue {
    static let shared = OfflineQueue()

    private var operations: [QueuedOperation] = []
    private let maxRetries = 3
    private let logger = Logger(subsystem: "app.maifarm", category: "OfflineQueue")

    struct QueuedOperation: Codable {
        let id: String
        let type: OperationType
        let payload: String
        let entityId: String?
        let createdAt: Date
        var retryCount: Int
        var lastError: String?

        enum OperationType: String, Codable {
            case createFarm
            case stopFarm
            case deleteHarvest
        }
    }

    private init() {
        Task { await loadFromDisk() }
    }

    func enqueue(_ type: QueuedOperation.OperationType, payload: String, entityId: String? = nil) {
        let operation = QueuedOperation(
            id: UUID().uuidString,
            type: type,
            payload: payload,
            entityId: entityId,
            createdAt: Date(),
            retryCount: 0,
            lastError: nil
        )
        operations.append(operation)
        logger.info("Enqueued offline operation: \(type.rawValue) with id \(operation.id)")
        Task { await saveToDisk() }
    }

    func getPendingOperations() -> [QueuedOperation] {
        operations.filter { $0.retryCount < maxRetries }
    }

    func markCompleted(_ id: String) {
        operations.removeAll { $0.id == id }
        logger.info("Marked operation as completed: \(id)")
        Task { await saveToDisk() }
    }

    func markFailed(_ id: String, error: String) {
        if let index = operations.firstIndex(where: { $0.id == id }) {
            operations[index].retryCount += 1
            operations[index].lastError = error
            logger.warning("Operation \(id) failed (attempt \(self.operations[index].retryCount)): \(error)")
        }
        Task { await saveToDisk() }
    }

    private func saveToDisk() async {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        do {
            let data = try encoder.encode(operations)
            let url = getQueueFileURL()
            try data.write(to: url, options: .atomic)
            logger.debug("Saved \(self.operations.count) operations to disk")
        } catch {
            logger.error("Failed to save offline queue to disk: \(error.localizedDescription)")
        }
    }

    private func loadFromDisk() async {
        let url = getQueueFileURL()

        guard FileManager.default.fileExists(atPath: url.path) else {
            logger.debug("No existing offline queue file found")
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            operations = try decoder.decode([QueuedOperation].self, from: data)
            logger.info("Loaded \(self.operations.count) operations from disk")
        } catch {
            logger.error("Failed to load offline queue from disk: \(error.localizedDescription)")
            // Clear corrupted data
            operations = []
        }
    }

    func clearAll() {
        operations.removeAll()
        logger.info("Cleared all offline operations")
        Task { await saveToDisk() }
    }

    func getOperationCount() -> Int {
        operations.count
    }

    func getFailedOperations() -> [QueuedOperation] {
        operations.filter { $0.retryCount >= maxRetries }
    }

    private func getQueueFileURL() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("offline_queue.json")
    }
}

// MARK: - Farm State Machine
enum FarmLifecycleState: String, CaseIterable {
    case idle
    case launching
    case running
    case paused
    case harvesting
    case completed
    case failed
    case recovering

    var canTransitionTo: [FarmLifecycleState] {
        switch self {
        case .idle:
            return [.launching]
        case .launching:
            return [.running, .failed]
        case .running:
            return [.paused, .harvesting, .failed]
        case .paused:
            return [.running, .harvesting, .failed]
        case .harvesting:
            return [.completed, .failed]
        case .completed:
            return [.idle] // Can restart
        case .failed:
            return [.recovering, .idle]
        case .recovering:
            return [.running, .failed, .idle]
        }
    }

    func canTransition(to newState: FarmLifecycleState) -> Bool {
        canTransitionTo.contains(newState)
    }
}

@MainActor
class FarmStateMachine: ObservableObject {
    @Published private(set) var currentState: FarmLifecycleState = .idle
    @Published private(set) var stateHistory: [(FarmLifecycleState, Date)] = []
    @Published private(set) var error: Error?

    private let logger = Logger(subsystem: "app.maifarm", category: "FarmStateMachine")

    func transition(to newState: FarmLifecycleState) -> Bool {
        guard currentState.canTransition(to: newState) else {
            logger.warning("Invalid state transition from \(self.currentState.rawValue) to \(newState.rawValue)")
            return false
        }

        let previousState = currentState
        currentState = newState
        stateHistory.append((newState, Date()))
        error = nil

        logger.info("State transition: \(previousState.rawValue) -> \(newState.rawValue)")

        // Trigger haptic feedback on state changes
        switch newState {
        case .running:
            HapticManager.shared.impact(.medium)
        case .completed:
            HapticManager.shared.notify(.success)
        case .failed:
            HapticManager.shared.notify(.error)
        default:
            HapticManager.shared.impact(.light)
        }

        return true
    }

    func handleFailure(_ error: Error) {
        self.error = error
        _ = transition(to: .failed)
    }

    func reset() {
        currentState = .idle
        stateHistory = []
        error = nil
    }
}

// MARK: - Persistence Manager
actor PersistenceManager {
    static let shared = PersistenceManager()

    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private var documentsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    func save<T: Encodable>(_ object: T, filename: String) async throws {
        let url = documentsDirectory.appendingPathComponent(filename)
        let data = try encoder.encode(object)
        try data.write(to: url, options: .atomic)
    }

    func load<T: Decodable>(_ type: T.Type, filename: String) async throws -> T {
        let url = documentsDirectory.appendingPathComponent(filename)
        let data = try Data(contentsOf: url)
        return try decoder.decode(type, from: data)
    }

    func delete(_ filename: String) async throws {
        let url = documentsDirectory.appendingPathComponent(filename)
        try fileManager.removeItem(at: url)
    }

    func exists(_ filename: String) async -> Bool {
        let url = documentsDirectory.appendingPathComponent(filename)
        return fileManager.fileExists(atPath: url.path)
    }

    // Cleanup old data
    func cleanupOldData(olderThan days: Int) async {
        guard let cutoffDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) else { return }

        do {
            let files = try fileManager.contentsOfDirectory(
                at: documentsDirectory,
                includingPropertiesForKeys: [.creationDateKey]
            )

            for file in files {
                if let attrs = try? fileManager.attributesOfItem(atPath: file.path),
                   let creationDate = attrs[.creationDate] as? Date,
                   creationDate < cutoffDate {
                    try? fileManager.removeItem(at: file)
                }
            }
        } catch {
            // Ignore cleanup errors
        }
    }
}
