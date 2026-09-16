//
//  AssistantService.swift
//  MaiFarm
//
//  Core Assistant agent that runs in parallel with Orchestrator
//  Captures context, maintains summaries, detects stalls, and sends nudges
//

import Foundation
import os.log
import Combine

// MARK: - Assistant Service

/// Main Assistant service that runs in parallel with the Orchestrator
/// Responsibilities:
/// 1. Continuously capture session context
/// 2. Maintain up-to-date markdown summary
/// 3. Detect stalls using multi-signal approach with adaptive thresholds
/// 4. Send nudge prompts when stalled with push notifications
/// 5. Track analytics for stall detection accuracy
/// 6. Sync summaries to iCloud
actor AssistantService {
    @MainActor static let shared = AssistantService()

    // MARK: - Dependencies

    // Store reference to eventBus (accessed through MainActor)
    private var _eventBus: SessionEventBus?

    @MainActor
    private func getEventBus() -> SessionEventBus {
        SessionEventBus.shared
    }

    private let logger = Logger(subsystem: "app.maifarm", category: "Assistant")

    // MARK: - State

    private var isRunning = false
    private var currentSessionId: String?
    private var contextSnapshot: SessionContextSnapshot?
    private var recentEvents: [SessionEvent] = []

    // Sub-components (initialized on start)
    private var eventPersistence: SessionEventPersistence?
    private var summaryGenerator: AssistantSummaryGenerator?
    private var stallDetector: StallDetector?
    private var nudgeDispatcher: NudgeDispatcher?

    // Enhanced components (v2)
    private var differentialEngine: DifferentialSummaryEngine?
    private var predictionEngine: StallPredictionEngine { StallPredictionEngine.shared }
    private var adaptiveThresholds: AdaptiveThresholdManager { AdaptiveThresholdManager.shared }
    private var cloudSync: CloudSyncManager { CloudSyncManager.shared }
    private var analytics: StallDetectionAnalytics { StallDetectionAnalytics.shared }

    // Helper to access MainActor-isolated notification service
    private func getNotificationService() async -> StallNotificationService {
        await MainActor.run { StallNotificationService.shared }
    }

    // Configuration
    private let config: AssistantConfig
    private var currentFarmMode: SessionContextSnapshot.FarmMode = .createFarm
    private var currentEngine: String = "claude"
    private var farmDuration: Int = 60

    // Analytics tracking
    private var pendingDetectionEventId: UUID?

    // Tasks
    private var eventSubscriptionTask: Task<Void, Never>?
    private var summaryUpdateTask: Task<Void, Never>?
    private var stallMonitorTask: Task<Void, Never>?
    private var predictionTask: Task<Void, Never>?
    private var syncTask: Task<Void, Never>?

    // MARK: - Initialization

    private init(config: AssistantConfig = .default) {
        self.config = config
    }

    // MARK: - Lifecycle

    /// Start the Assistant for a new farm session
    func start(
        sessionId: String,
        farmId: String,
        farmName: String,
        mode: SessionContextSnapshot.FarmMode,
        engine: String,
        agentCount: Int,
        duration: Int,
        goal: String? = nil
    ) async throws {
        guard !isRunning else {
            logger.warning("Assistant already running for session \(self.currentSessionId ?? "unknown")")
            return
        }

        logger.info("Starting Assistant for session \(sessionId)")

        currentSessionId = sessionId
        isRunning = true

        // Initialize context snapshot
        contextSnapshot = SessionContextSnapshot(
            sessionId: sessionId,
            farmId: farmId,
            farmName: farmName,
            mode: mode,
            engine: engine,
            startedAt: Date(),
            status: "starting",
            progress: 0,
            activeAgentCount: 0,
            idleAgentCount: 0,
            totalAgents: agentCount,
            tokensUsed: 0,
            estimatedCost: 0,
            tasksCompleted: 0,
            filesGenerated: 0,
            lastEventAt: Date(),
            totalEventCount: 0,
            eventCountByType: [:],
            agentStates: [:],
            inflightToolCalls: 0,
            pendingOperations: 0,
            errorCount: 0,
            warningCount: 0,
            lastError: nil
        )

        // Store mode and engine for adaptive thresholds
        currentFarmMode = mode
        currentEngine = engine
        farmDuration = duration

        // Initialize sub-components
        eventPersistence = try SessionEventPersistence(sessionId: sessionId)
        summaryGenerator = AssistantSummaryGenerator(
            sessionId: sessionId,
            config: config.summaryConfig
        )

        // Use adaptive thresholds based on mode, engine, and device
        let deviceClass = AdaptiveThresholdManager.DeviceClass.current()
        let adaptiveConfig = await adaptiveThresholds.getDurationAwareConfig(
            mode: mode,
            engine: engine,
            deviceClass: deviceClass,
            farmDurationMinutes: duration
        )

        stallDetector = StallDetector(config: adaptiveConfig)
        nudgeDispatcher = NudgeDispatcher(
            sessionId: sessionId,
            config: config.nudgeConfig
        )

        // Initialize v2 components
        differentialEngine = DifferentialSummaryEngine()

        // Start analytics tracking
        await analytics.startSession(sessionId: sessionId)

        // Set initial goal if provided
        if let goal = goal {
            await summaryGenerator?.updateGoals(SessionGoals(primaryGoal: goal))
        }

        // Start session on event bus
        await getEventBus().startSession(
            sessionId: sessionId,
            farmId: farmId,
            farmName: farmName,
            mode: mode.rawValue,
            engine: engine,
            agentCount: agentCount,
            duration: duration
        )

        // Start background tasks
        startEventSubscription()
        startSummaryUpdateLoop()
        startStallMonitorLoop()
        startPredictionLoop()
        startCloudSyncLoop()

        logger.info("Assistant started successfully for session \(sessionId)")
    }

    /// Stop the Assistant
    func stop() async {
        guard isRunning else { return }

        logger.info("Stopping Assistant for session \(self.currentSessionId ?? "unknown")")

        isRunning = false

        // Cancel all tasks
        eventSubscriptionTask?.cancel()
        summaryUpdateTask?.cancel()
        stallMonitorTask?.cancel()
        predictionTask?.cancel()
        syncTask?.cancel()

        // Wait for cancellation
        await eventSubscriptionTask?.value
        await summaryUpdateTask?.value
        await stallMonitorTask?.value
        await predictionTask?.value
        await syncTask?.value

        // End session on event bus
        if let snapshot = contextSnapshot {
            await getEventBus().endSession(
                finalStatus: snapshot.status,
                totalTokens: snapshot.tokensUsed,
                totalCost: snapshot.estimatedCost
            )
        }

        // Final summary write
        if let generator = summaryGenerator, let snapshot = contextSnapshot {
            await generator.generateFinalSummary(context: snapshot)
        }

        // End analytics session
        if let sessionId = currentSessionId {
            await analytics.endSession(sessionId: sessionId)

            // Final cloud sync
            try? await cloudSync.uploadSession(sessionId: sessionId)
        }

        // Cleanup
        await eventPersistence?.flush()

        currentSessionId = nil
        contextSnapshot = nil
        eventPersistence = nil
        summaryGenerator = nil
        stallDetector = nil
        nudgeDispatcher = nil
        differentialEngine = nil
        recentEvents.removeAll()

        logger.info("Assistant stopped")
    }

    // MARK: - Event Subscription

    private func startEventSubscription() {
        eventSubscriptionTask = Task { [weak self] in
            guard let self = self, let sessionId = await self.currentSessionId else { return }

            let stream = await self.getEventBus().subscribeStream(
                id: "assistant-\(sessionId)",
                filter: .forSession(sessionId)
            )

            for await event in stream {
                guard !Task.isCancelled else { break }
                await self.handleEvent(event)
            }
        }
    }

    private func handleEvent(_ event: SessionEvent) async {
        guard isRunning else { return }

        // 1. Update context snapshot
        contextSnapshot?.update(with: event)

        // 2. Track recent events for prediction
        recentEvents.append(event)
        if recentEvents.count > 100 {
            recentEvents.removeFirst(recentEvents.count - 100)
        }

        // 3. Persist event
        await eventPersistence?.append(event)

        // 4. Feed to stall detector
        await stallDetector?.recordEvent(event)

        // 5. Check if nudge is no longer needed (activity resumed)
        if await nudgeDispatcher?.isAwaitingResponse == true {
            await nudgeDispatcher?.onActivityDetected()

            // Record outcome for analytics if we have a pending detection
            if let eventId = pendingDetectionEventId {
                let timeSinceDetection = await stallDetector?.getInactivityDuration() ?? 0
                await analytics.autoRecordOutcome(
                    eventId: eventId,
                    activityResumed: true,
                    timeSinceDetection: timeSinceDetection
                )
                pendingDetectionEventId = nil
            }
        }

        // 6. Feed relevant events to summary generator
        if shouldIncludeInSummary(event) {
            await summaryGenerator?.ingestEvent(event)
        }

        // 7. Update differential engine
        await updateDifferentialSummary(with: event)
    }

    private func shouldIncludeInSummary(_ event: SessionEvent) -> Bool {
        // Exclude high-frequency, low-value events
        switch event.type {
        case .terminalOutput, .agentHeartbeat, .metricsUpdate:
            return false
        default:
            return true
        }
    }

    // MARK: - Summary Update Loop

    private func startSummaryUpdateLoop() {
        summaryUpdateTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self?.config.summaryUpdateInterval ?? 3) * 1_000_000_000)

                guard !Task.isCancelled else { break }
                guard let self = self, await self.isRunning else { break }

                await self.updateSummary()
            }
        }
    }

    private func updateSummary() async {
        guard let generator = summaryGenerator,
              let snapshot = contextSnapshot else {
            return
        }

        await generator.updateSummary(context: snapshot)
    }

    // MARK: - Stall Monitor Loop

    private func startStallMonitorLoop() {
        stallMonitorTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self?.config.stallCheckInterval ?? 5) * 1_000_000_000)

                guard !Task.isCancelled else { break }
                guard let self = self, await self.isRunning else { break }

                await self.checkForStall()
            }
        }
    }

    private func checkForStall() async {
        guard let detector = stallDetector,
              let dispatcher = nudgeDispatcher,
              let snapshot = contextSnapshot,
              let sessionId = currentSessionId else {
            return
        }

        // Skip if already nudging
        if await dispatcher.isAwaitingResponse {
            return
        }

        // Check stall conditions
        let stallStatus = await detector.checkStall(context: snapshot)

        if stallStatus.isStalled {
            logger.info("Stall detected: \(stallStatus.reason ?? "unknown")")

            // Record analytics event
            let detectionEventId = await analytics.recordDetection(
                sessionId: sessionId,
                farmMode: currentFarmMode.rawValue,
                engine: currentEngine,
                inactivityDuration: stallStatus.inactivityDuration,
                signalsChecked: stallStatus.signalsChecked.map { $0.name },
                config: await detector.config
            )
            pendingDetectionEventId = detectionEventId

            // Get current summary path
            let summaryPath = await summaryGenerator?.getSummaryFilePath() ?? ""

            // Send nudge
            await dispatcher.sendNudge(
                summaryPath: summaryPath,
                reason: stallStatus.reason
            )

            // Record nudge sent in analytics
            await analytics.recordNudgeSent(sessionId: sessionId)

            // Send push notification if app is backgrounded
            let notificationService = await getNotificationService()
            await notificationService.sendStallNotification(
                sessionId: sessionId,
                farmName: snapshot.farmName,
                stallReason: stallStatus.reason,
                inactivityDuration: stallStatus.inactivityDuration,
                nudgeId: await dispatcher.getStatus().currentEpisodeId
            )
        }
    }

    // MARK: - Prediction Loop

    private func startPredictionLoop() {
        predictionTask = Task { [weak self] in
            while !Task.isCancelled {
                // Run prediction every 10 seconds
                try? await Task.sleep(nanoseconds: 10_000_000_000)

                guard !Task.isCancelled else { break }
                guard let self = self, await self.isRunning else { break }

                await self.runPrediction()
            }
        }
    }

    private func runPrediction() async {
        guard let detector = stallDetector,
              let snapshot = contextSnapshot,
              let sessionId = currentSessionId else {
            return
        }

        // Extract features
        let features = await predictionEngine.extractFeatures(
            from: snapshot,
            recentEvents: recentEvents,
            detector: detector
        )

        // Run prediction
        let prediction = await predictionEngine.predict(features: features)

        // Log if significant
        if prediction.probability > 0.5 {
            logger.debug("Stall prediction: \(String(format: "%.1f%%", prediction.probability * 100)) - \(String(describing: prediction.recommendation))")
        }

        // Send early warning notification if needed
        if prediction.recommendation == .preemptiveNudge {
            let notificationService = await getNotificationService()
            await notificationService.sendPredictionWarning(
                sessionId: sessionId,
                farmName: snapshot.farmName,
                prediction: prediction
            )
        }
    }

    // MARK: - Cloud Sync Loop

    private func startCloudSyncLoop() {
        syncTask = Task { [weak self] in
            while !Task.isCancelled {
                // Sync every 60 seconds
                try? await Task.sleep(nanoseconds: 60_000_000_000)

                guard !Task.isCancelled else { break }
                guard let self = self, await self.isRunning else { break }

                await self.syncToCloud()
            }
        }
    }

    private func syncToCloud() async {
        guard let sessionId = currentSessionId else { return }

        do {
            try await cloudSync.uploadSession(sessionId: sessionId)
        } catch {
            logger.debug("Cloud sync skipped: \(error.localizedDescription)")
        }
    }

    // MARK: - Differential Summary

    private func updateDifferentialSummary(with event: SessionEvent) async {
        guard let engine = differentialEngine,
              let snapshot = contextSnapshot else {
            return
        }

        // Update relevant sections based on event type
        switch event.type {
        case .agentMessage, .agentOutput:
            _ = await engine.appendToProgressLog(entry: "Agent activity: \(event.agentName ?? "unknown")")

        case .toolInvocation:
            if case .toolCall(let toolName, _) = event.data {
                _ = await engine.appendToProgressLog(entry: "Tool invoked: \(toolName)")
            }

        case .errorOccurred:
            if case .error(_, let message, _) = event.data {
                var issues = SummaryIssues()
                issues.errors.append(SummaryIssues.Issue(message: message, timestamp: event.timestamp))
                _ = await engine.updateIssues(issues)
            }

        case .fileCreated:
            if case .artifactCreated(let name, _, let path, _) = event.data {
                var artifacts = SummaryArtifacts()
                artifacts.filesCreated.append(path ?? name)
                _ = await engine.updateArtifacts(artifacts)
            }

        default:
            break
        }

        // Update status section
        _ = await engine.updateStatus(context: snapshot)
    }

    // MARK: - Public Queries

    /// Get the current summary file path
    func getSummaryPath() async -> String? {
        await summaryGenerator?.getSummaryFilePath()
    }

    /// Get current session ID
    func getSessionId() -> String? {
        currentSessionId
    }

    /// Check if running
    func isActive() -> Bool {
        isRunning
    }

    /// Get current context snapshot
    func getContextSnapshot() -> SessionContextSnapshot? {
        contextSnapshot
    }

    /// Get summary content
    func getSummaryContent() async -> String? {
        await summaryGenerator?.getCurrentSummary()
    }

    /// Get stall status
    func getStallStatus() async -> StallStatus? {
        guard let snapshot = contextSnapshot else { return nil }
        return await stallDetector?.checkStall(context: snapshot)
    }

    /// Get nudge status
    func getNudgeStatus() async -> NudgeStatus? {
        await nudgeDispatcher?.getStatus()
    }

    /// Force summary refresh
    func refreshSummary() async {
        await updateSummary()
    }

    /// Get session directory path
    func getSessionDirectoryPath() -> URL? {
        guard let sessionId = currentSessionId else { return nil }
        return AssistantStorageManager.sessionDirectory(for: sessionId)
    }

    // MARK: - Analytics & Prediction Queries

    /// Get stall prediction for current session
    func getStallPrediction() async -> StallPrediction? {
        guard let detector = stallDetector,
              let snapshot = contextSnapshot else {
            return nil
        }

        let features = await predictionEngine.extractFeatures(
            from: snapshot,
            recentEvents: recentEvents,
            detector: detector
        )

        return await predictionEngine.predict(features: features)
    }

    /// Get accuracy report
    func getAccuracyReport() async -> AccuracyReport {
        await analytics.getAccuracyReport()
    }

    /// Get cloud sync status
    func getCloudSyncStatus() async -> CloudSyncStatus {
        await cloudSync.getStatus()
    }

    /// Force cloud sync
    func forceCloudSync() async throws {
        guard let sessionId = currentSessionId else { return }
        try await cloudSync.uploadSession(sessionId: sessionId)
    }

    /// Record user feedback on stall detection
    func recordStallFeedback(wasRealStall: Bool) async {
        guard let eventId = pendingDetectionEventId else { return }

        let outcome: StallDetectionEvent.DetectionOutcome = wasRealStall ? .truePositive : .falsePositive

        await analytics.recordOutcome(
            eventId: eventId,
            outcome: outcome,
            source: .userExplicit
        )

        pendingDetectionEventId = nil
    }

    /// Get adaptive threshold statistics
    func getThresholdStatistics() async -> ThresholdStatistics {
        await adaptiveThresholds.getStatistics()
    }

    /// Get differential summary statistics
    func getDifferentialStats() async -> DifferentialStatistics? {
        await differentialEngine?.getStatistics()
    }
}

// MARK: - Assistant Configuration

struct AssistantConfig {
    let summaryUpdateInterval: TimeInterval
    let stallCheckInterval: TimeInterval
    let summaryConfig: SummaryGeneratorConfig
    let stallConfig: StallDetectorConfig
    let nudgeConfig: NudgeDispatcherConfig

    static let `default` = AssistantConfig(
        summaryUpdateInterval: 3.0, // Debounced summary updates every 3s
        stallCheckInterval: 5.0,    // Check for stalls every 5s
        summaryConfig: .default,
        stallConfig: .default,
        nudgeConfig: .default
    )

    /// Configuration for low-memory devices
    static let lowMemory = AssistantConfig(
        summaryUpdateInterval: 5.0,
        stallCheckInterval: 10.0,
        summaryConfig: SummaryGeneratorConfig(
            maxRecentEvents: 25,
            maxProgressLogEntries: 15,
            compressionThreshold: 500,
            updateDebounceMs: 1500,
            useLLMSummarization: false
        ),
        stallConfig: .default,
        nudgeConfig: .default
    )
}

// MARK: - Assistant Storage Manager

/// Manages file storage for Assistant session data
struct AssistantStorageManager {
    static let baseDirectoryName = "MaiFarm"
    static let sessionsDirectoryName = "Sessions"

    /// Get the base documents directory for MaiFarm
    static var baseDirectory: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return docs.appendingPathComponent(baseDirectoryName)
    }

    /// Get the sessions directory
    static var sessionsDirectory: URL {
        baseDirectory.appendingPathComponent(sessionsDirectoryName)
    }

    /// Get the directory for a specific session
    static func sessionDirectory(for sessionId: String) -> URL {
        sessionsDirectory.appendingPathComponent(sessionId)
    }

    /// Create session directory structure
    static func createSessionDirectory(sessionId: String) throws -> URL {
        let sessionDir = sessionDirectory(for: sessionId)

        try FileManager.default.createDirectory(
            at: sessionDir,
            withIntermediateDirectories: true,
            attributes: nil
        )

        return sessionDir
    }

    /// Get events file path for a session
    static func eventsFilePath(for sessionId: String) -> URL {
        sessionDirectory(for: sessionId).appendingPathComponent("events.jsonl")
    }

    /// Get summary file path for a session
    static func summaryFilePath(for sessionId: String) -> URL {
        sessionDirectory(for: sessionId).appendingPathComponent("ASSISTANT.md")
    }

    /// List all session IDs
    static func listSessionIds() -> [String] {
        guard let contents = try? FileManager.default.contentsOfDirectory(
            at: sessionsDirectory,
            includingPropertiesForKeys: [.isDirectoryKey]
        ) else {
            return []
        }

        return contents.compactMap { url in
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                return url.lastPathComponent
            }
            return nil
        }
    }

    /// Delete session data
    static func deleteSession(sessionId: String) throws {
        let sessionDir = sessionDirectory(for: sessionId)
        if FileManager.default.fileExists(atPath: sessionDir.path) {
            try FileManager.default.removeItem(at: sessionDir)
        }
    }

    /// Delete all session data older than specified days
    static func cleanupOldSessions(olderThan days: Int) {
        guard let cutoffDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) else {
            return
        }

        for sessionId in listSessionIds() {
            let sessionDir = sessionDirectory(for: sessionId)

            do {
                let attrs = try FileManager.default.attributesOfItem(atPath: sessionDir.path)
                if let modDate = attrs[.modificationDate] as? Date, modDate < cutoffDate {
                    try FileManager.default.removeItem(at: sessionDir)
                }
            } catch {
                // Ignore errors during cleanup
            }
        }
    }

    /// Get total storage used by all sessions
    static func getTotalStorageUsed() -> Int64 {
        var total: Int64 = 0

        for sessionId in listSessionIds() {
            let sessionDir = sessionDirectory(for: sessionId)
            total += directorySize(at: sessionDir)
        }

        return total
    }

    private static func directorySize(at url: URL) -> Int64 {
        var size: Int64 = 0

        if let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let fileURL as URL in enumerator {
                if let fileSize = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    size += Int64(fileSize)
                }
            }
        }

        return size
    }
}
