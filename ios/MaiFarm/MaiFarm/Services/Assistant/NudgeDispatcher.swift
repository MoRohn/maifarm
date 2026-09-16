//
//  NudgeDispatcher.swift
//  MaiFarm
//
//  Handles sending nudge prompts to Orchestrator when stalls are detected
//  Implements retry logic with bounded attempts and cancellation on activity
//

import Foundation
import os.log

// MARK: - Nudge Dispatcher Configuration

struct NudgeDispatcherConfig {
    /// Time to wait for response after first nudge (seconds)
    let retryDelay1: TimeInterval

    /// Time to wait for response after second nudge (seconds)
    let retryDelay2: TimeInterval

    /// Maximum number of nudges per stall episode
    let maxNudgesPerEpisode: Int

    /// Minimum time between stall episodes (seconds)
    let minTimeBetweenEpisodes: TimeInterval

    static let `default` = NudgeDispatcherConfig(
        retryDelay1: 30.0,        // 30 seconds after first nudge
        retryDelay2: 90.0,        // 90 seconds after second nudge (optional third)
        maxNudgesPerEpisode: 2,   // Initial + one follow-up
        minTimeBetweenEpisodes: 120.0 // 2 minutes between episodes
    )

    /// More aggressive for quick tasks
    static let quickTask = NudgeDispatcherConfig(
        retryDelay1: 20.0,
        retryDelay2: 45.0,
        maxNudgesPerEpisode: 2,
        minTimeBetweenEpisodes: 60.0
    )
}

// MARK: - Nudge Status

struct NudgeStatus {
    let state: NudgeState
    let currentEpisodeId: String?
    let nudgesSent: Int
    let lastNudgeTime: Date?
    let awaitingResponseSince: Date?

    enum NudgeState: String {
        case idle
        case awaitingResponse = "awaiting_response"
        case cooldown
    }
}

// MARK: - Nudge Record

struct NudgeRecord: Codable, Identifiable {
    let id: String
    let episodeId: String
    let sessionId: String
    let timestamp: Date
    let summaryPath: String
    let reason: String?
    let attemptNumber: Int
    var acknowledged: Bool = false
    var acknowledgedAt: Date?
}

// MARK: - Nudge Dispatcher

/// Dispatches nudge prompts to the Orchestrator with retry logic
actor NudgeDispatcher {
    private let sessionId: String
    private let config: NudgeDispatcherConfig
    private let logger = Logger(subsystem: "app.maifarm", category: "NudgeDispatcher")

    // State
    private var currentEpisodeId: String?
    private var nudgesSentInEpisode: Int = 0
    private var lastNudgeTime: Date?
    private var lastEpisodeEndTime: Date?
    private var awaitingResponse: Bool = false
    private var awaitingResponseSince: Date?

    // History
    private var nudgeHistory: [NudgeRecord] = []

    // Retry task
    private var retryTask: Task<Void, Never>?

    // MARK: - Initialization

    init(sessionId: String, config: NudgeDispatcherConfig = .default) {
        self.sessionId = sessionId
        self.config = config
    }

    // MARK: - Public Properties

    var isAwaitingResponse: Bool {
        awaitingResponse
    }

    // MARK: - Nudge Sending

    /// Send a nudge to the Orchestrator
    func sendNudge(summaryPath: String, reason: String?) async {
        // Check if we should send a nudge
        guard shouldSendNudge() else {
            logger.info("Skipping nudge - not allowed at this time")
            return
        }

        // Start new episode if needed
        if currentEpisodeId == nil {
            currentEpisodeId = UUID().uuidString
            nudgesSentInEpisode = 0
            logger.info("Starting new nudge episode: \(self.currentEpisodeId!)")
        }

        nudgesSentInEpisode += 1
        lastNudgeTime = Date()
        awaitingResponse = true
        awaitingResponseSince = Date()

        // Create nudge record
        let nudgeId = UUID().uuidString
        let record = NudgeRecord(
            id: nudgeId,
            episodeId: currentEpisodeId!,
            sessionId: sessionId,
            timestamp: Date(),
            summaryPath: summaryPath,
            reason: reason,
            attemptNumber: nudgesSentInEpisode
        )
        nudgeHistory.append(record)

        logger.info("Sending nudge #\(self.nudgesSentInEpisode) (ID: \(nudgeId))")

        // Build the nudge message
        let nudgeMessage = buildNudgeMessage(summaryPath: summaryPath)

        // Send to backend
        await dispatchToOrchestrator(nudgeId: nudgeId, message: nudgeMessage)

        // Publish event
        await SessionEventBus.shared.publishNudgeSent(
            sessionId: sessionId,
            nudgeId: nudgeId,
            content: nudgeMessage
        )

        // Schedule retry
        scheduleRetry(summaryPath: summaryPath)
    }

    /// Called when activity is detected (cancels pending retries)
    func onActivityDetected() async {
        guard awaitingResponse else { return }

        logger.info("Activity detected - canceling pending nudge retries")

        // Cancel retry task
        retryTask?.cancel()
        retryTask = nil

        // Reset state
        awaitingResponse = false
        awaitingResponseSince = nil

        // End episode
        endEpisode()
    }

    /// Called when nudge is explicitly acknowledged
    func onNudgeAcknowledged(nudgeId: String, response: String? = nil) async {
        logger.info("Nudge acknowledged: \(nudgeId)")

        // Mark record as acknowledged
        if let index = nudgeHistory.firstIndex(where: { $0.id == nudgeId }) {
            nudgeHistory[index].acknowledged = true
            nudgeHistory[index].acknowledgedAt = Date()
        }

        // Publish event
        await SessionEventBus.shared.publishNudgeAck(
            sessionId: sessionId,
            nudgeId: nudgeId,
            response: response
        )

        // Cancel retries and end episode
        retryTask?.cancel()
        retryTask = nil
        awaitingResponse = false
        awaitingResponseSince = nil
        endEpisode()
    }

    // MARK: - Status

    func getStatus() -> NudgeStatus {
        let state: NudgeStatus.NudgeState
        if awaitingResponse {
            state = .awaitingResponse
        } else if let lastEnd = lastEpisodeEndTime {
            let elapsed = Date().timeIntervalSince(lastEnd)
            state = elapsed < config.minTimeBetweenEpisodes ? .cooldown : .idle
        } else {
            state = .idle
        }

        return NudgeStatus(
            state: state,
            currentEpisodeId: currentEpisodeId,
            nudgesSent: nudgesSentInEpisode,
            lastNudgeTime: lastNudgeTime,
            awaitingResponseSince: awaitingResponseSince
        )
    }

    /// Get nudge history
    func getHistory() -> [NudgeRecord] {
        nudgeHistory
    }

    // MARK: - Private Methods

    private func shouldSendNudge() -> Bool {
        // Check episode limit
        if nudgesSentInEpisode >= self.config.maxNudgesPerEpisode {
            logger.info("Max nudges reached for episode (\(self.nudgesSentInEpisode))")
            return false
        }

        // Check cooldown between episodes
        if let lastEnd = lastEpisodeEndTime {
            let elapsed = Date().timeIntervalSince(lastEnd)
            if elapsed < self.config.minTimeBetweenEpisodes {
                logger.info("In cooldown period (\(Int(self.config.minTimeBetweenEpisodes - elapsed))s remaining)")
                return false
            }
        }

        return true
    }

    private func buildNudgeMessage(summaryPath: String) -> String {
        """
        Use the context found here: \(summaryPath) to build a concept and continue to advance and enhance the existing context in order to perfect the final results.
        """
    }

    private func dispatchToOrchestrator(nudgeId: String, message: String) async {
        do {
            // Build nudge request
            let request = NudgeRequest(
                nudgeId: nudgeId,
                sessionId: sessionId,
                message: message
            )

            // Send to API
            try await MaiFarmAPI.shared.post("/assistant/nudge", body: request)

            logger.info("Nudge dispatched successfully: \(nudgeId)")
        } catch {
            logger.error("Failed to dispatch nudge: \(error.localizedDescription)")
        }
    }

    private func scheduleRetry(summaryPath: String) {
        retryTask?.cancel()

        retryTask = Task { [weak self] in
            guard let self = self else { return }

            // Determine retry delay based on attempt number
            let delay: TimeInterval
            switch await self.nudgesSentInEpisode {
            case 1:
                delay = await self.config.retryDelay1
            case 2:
                delay = await self.config.retryDelay2
            default:
                // No more retries
                return
            }

            // Wait for response
            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            } catch {
                // Task was cancelled
                return
            }

            // Check if still awaiting response
            guard !Task.isCancelled, await self.awaitingResponse else { return }

            // Send follow-up nudge
            await self.logger.info("No response after \(Int(delay))s - sending follow-up nudge")
            await self.sendNudge(summaryPath: summaryPath, reason: "Follow-up: no response to previous nudge")
        }
    }

    private func endEpisode() {
        if currentEpisodeId != nil {
            logger.info("Ending nudge episode: \(self.currentEpisodeId!) (sent \(self.nudgesSentInEpisode) nudges)")
        }

        currentEpisodeId = nil
        nudgesSentInEpisode = 0
        lastEpisodeEndTime = Date()
    }

    // MARK: - Reset

    func reset() {
        retryTask?.cancel()
        retryTask = nil
        currentEpisodeId = nil
        nudgesSentInEpisode = 0
        lastNudgeTime = nil
        lastEpisodeEndTime = nil
        awaitingResponse = false
        awaitingResponseSince = nil
        nudgeHistory.removeAll()
    }
}

// MARK: - Nudge Request Model

struct NudgeRequest: Codable {
    let nudgeId: String
    let sessionId: String
    let message: String
    let timestamp: Date

    init(nudgeId: String, sessionId: String, message: String) {
        self.nudgeId = nudgeId
        self.sessionId = sessionId
        self.message = message
        self.timestamp = Date()
    }

    enum CodingKeys: String, CodingKey {
        case nudgeId = "nudge_id"
        case sessionId = "session_id"
        case message
        case timestamp
    }
}

// MARK: - API Extension

extension MaiFarmAPI {
    /// Send a nudge to the orchestrator
    func sendAssistantNudge(_ request: NudgeRequest) async throws {
        let _: EmptyResponse = try await post("/assistant/nudge", body: request)
    }
}
