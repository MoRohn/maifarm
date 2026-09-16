//
//  StallDetector.swift
//  MaiFarm
//
//  Multi-signal stall detection for farming sessions
//  Confirms stall using multiple signals to avoid false positives
//

import Foundation
import os.log

// MARK: - Stall Detector Configuration

struct StallDetectorConfig {
    /// Time without any events before considering a stall (seconds)
    let inactivityThreshold: TimeInterval

    /// Additional confirmation window after stall conditions are met (seconds)
    let hysteresisWindow: TimeInterval

    /// Time to wait for streaming output before declaring stall
    let streamingGracePeriod: TimeInterval

    /// Minimum session duration before stall detection activates
    let minimumSessionDuration: TimeInterval

    /// Whether to consider agent heartbeats as activity
    let countHeartbeatsAsActivity: Bool

    static let `default` = StallDetectorConfig(
        inactivityThreshold: 30.0,       // 30 seconds of no events
        hysteresisWindow: 10.0,          // 10 second confirmation
        streamingGracePeriod: 5.0,       // 5 seconds for streaming
        minimumSessionDuration: 30.0,    // Don't detect stalls in first 30s
        countHeartbeatsAsActivity: false // Heartbeats don't count as real activity
    )

    /// More aggressive detection for quick tasks
    static let quickTask = StallDetectorConfig(
        inactivityThreshold: 20.0,
        hysteresisWindow: 5.0,
        streamingGracePeriod: 3.0,
        minimumSessionDuration: 15.0,
        countHeartbeatsAsActivity: false
    )

    /// More lenient for long-running farms
    static let longSession = StallDetectorConfig(
        inactivityThreshold: 45.0,
        hysteresisWindow: 15.0,
        streamingGracePeriod: 10.0,
        minimumSessionDuration: 60.0,
        countHeartbeatsAsActivity: false
    )
}

// MARK: - Stall Status

struct StallStatus {
    let isStalled: Bool
    let reason: String?
    let inactivityDuration: TimeInterval
    let signalsChecked: [StallSignal]
    let timestamp: Date

    struct StallSignal {
        let name: String
        let passed: Bool
        let detail: String?
    }

    static let notStalled = StallStatus(
        isStalled: false,
        reason: nil,
        inactivityDuration: 0,
        signalsChecked: [],
        timestamp: Date()
    )
}

// MARK: - Stall Detector

/// Detects when farming activity has stalled using multiple signals
actor StallDetector {
    let config: StallDetectorConfig
    private let logger = Logger(subsystem: "app.maifarm", category: "StallDetector")

    // State tracking
    private var lastEventTime: Date = Date()
    private var lastSignificantEventTime: Date = Date()
    private var sessionStartTime: Date?

    // Agent tracking
    private var agentLastActivity: [String: Date] = [:]
    private var agentStates: [String: String] = [:]

    // Tool tracking
    private var inflightToolCalls: Set<String> = []
    private var lastToolCallTime: Date?

    // Streaming tracking
    private var isStreamingActive = false
    private var lastStreamChunkTime: Date?

    // Stall confirmation
    private var stallConditionsMetAt: Date?
    private var lastConfirmedStall: Date?

    // MARK: - Initialization

    init(config: StallDetectorConfig = .default) {
        self.config = config
    }

    // MARK: - Event Recording

    /// Record an event for stall detection
    func recordEvent(_ event: SessionEvent) {
        let now = Date()
        lastEventTime = now

        // Track by event type
        switch event.type {
        case .sessionStarted:
            sessionStartTime = now
            lastSignificantEventTime = now

        case .agentStarted, .agentMessage, .agentOutput, .agentThinking:
            lastSignificantEventTime = now
            if let agentId = event.agentId {
                agentLastActivity[agentId] = now
                agentStates[agentId] = "active"
            }
            isStreamingActive = false

        case .agentCompleted, .agentFailed:
            lastSignificantEventTime = now
            if let agentId = event.agentId {
                agentLastActivity[agentId] = now
                agentStates[agentId] = event.type == .agentCompleted ? "completed" : "failed"
            }

        case .agentIdle:
            if let agentId = event.agentId {
                agentStates[agentId] = "idle"
            }

        case .agentHeartbeat:
            if let agentId = event.agentId {
                agentLastActivity[agentId] = now
            }
            if config.countHeartbeatsAsActivity {
                lastSignificantEventTime = now
            }

        case .toolInvocation:
            lastSignificantEventTime = now
            lastToolCallTime = now
            if let correlationId = event.correlationId {
                inflightToolCalls.insert(correlationId)
            }

        case .toolResult, .toolError:
            lastSignificantEventTime = now
            if let correlationId = event.correlationId {
                inflightToolCalls.remove(correlationId)
            }

        case .terminalOutput:
            // Terminal output indicates streaming
            lastStreamChunkTime = now
            isStreamingActive = true

        case .orchestratorNudgeReceived:
            // Reset stall detection when nudge is received
            stallConditionsMetAt = nil
            lastSignificantEventTime = now

        case .orchestratorNudgeAck:
            // Nudge acknowledged - reset detection
            stallConditionsMetAt = nil

        default:
            // Other events count as activity
            lastSignificantEventTime = now
        }

        // Reset streaming if we get non-terminal activity
        if event.type != .terminalOutput && isStreamingActive {
            let timeSinceLastChunk = now.timeIntervalSince(lastStreamChunkTime ?? now)
            if timeSinceLastChunk > config.streamingGracePeriod {
                isStreamingActive = false
            }
        }
    }

    // MARK: - Stall Checking

    /// Check if the session is stalled
    func checkStall(context: SessionContextSnapshot) -> StallStatus {
        let now = Date()
        var signals: [StallStatus.StallSignal] = []

        // Signal 1: Session duration check
        let sessionDuration = context.startedAt.distance(to: now)
        let minDurationPassed = sessionDuration >= config.minimumSessionDuration
        signals.append(StallStatus.StallSignal(
            name: "minimum_duration",
            passed: minDurationPassed,
            detail: "Session: \(Int(sessionDuration))s (min: \(Int(config.minimumSessionDuration))s)"
        ))

        if !minDurationPassed {
            return StallStatus(
                isStalled: false,
                reason: "Session too new for stall detection",
                inactivityDuration: 0,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Signal 2: Inactivity timer
        let inactivityDuration = lastSignificantEventTime.distance(to: now)
        let isInactive = inactivityDuration >= config.inactivityThreshold
        signals.append(StallStatus.StallSignal(
            name: "inactivity_timer",
            passed: isInactive,
            detail: "Inactive: \(Int(inactivityDuration))s (threshold: \(Int(config.inactivityThreshold))s)"
        ))

        if !isInactive {
            stallConditionsMetAt = nil
            return StallStatus(
                isStalled: false,
                reason: nil,
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Signal 3: Agent state check
        let runningAgents = context.agentStates.values.filter {
            $0.status == "running" || $0.status == "active"
        }.count
        let agentsIdle = runningAgents == 0
        signals.append(StallStatus.StallSignal(
            name: "agents_idle",
            passed: agentsIdle,
            detail: "Running agents: \(runningAgents)"
        ))

        if !agentsIdle {
            stallConditionsMetAt = nil
            return StallStatus(
                isStalled: false,
                reason: "Agents still running",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Signal 4: Inflight tool calls check
        let noInflightTools = inflightToolCalls.isEmpty
        signals.append(StallStatus.StallSignal(
            name: "no_inflight_tools",
            passed: noInflightTools,
            detail: "Inflight tools: \(inflightToolCalls.count)"
        ))

        if !noInflightTools {
            stallConditionsMetAt = nil
            return StallStatus(
                isStalled: false,
                reason: "Tool calls in progress",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Signal 5: Streaming check
        let notStreaming = !isStreamingActive || (lastStreamChunkTime.map { now.timeIntervalSince($0) > config.streamingGracePeriod } ?? true)
        signals.append(StallStatus.StallSignal(
            name: "not_streaming",
            passed: notStreaming,
            detail: "Streaming: \(isStreamingActive ? "active" : "inactive")"
        ))

        if !notStreaming {
            stallConditionsMetAt = nil
            return StallStatus(
                isStalled: false,
                reason: "Streaming output in progress",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Signal 6: Farm status check
        let farmNotRunning = context.status != "running" && context.status != "active"
        signals.append(StallStatus.StallSignal(
            name: "farm_status",
            passed: !farmNotRunning, // Inverted - we want it to NOT be in terminal state
            detail: "Farm status: \(context.status)"
        ))

        // If farm has completed/failed, don't trigger stall
        if context.status == "completed" || context.status == "failed" {
            return StallStatus(
                isStalled: false,
                reason: "Farm has ended",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // All signals passed - check hysteresis
        if stallConditionsMetAt == nil {
            stallConditionsMetAt = now
            signals.append(StallStatus.StallSignal(
                name: "hysteresis",
                passed: false,
                detail: "Starting confirmation window (\(Int(config.hysteresisWindow))s)"
            ))

            logger.info("Stall conditions met, starting hysteresis window")

            return StallStatus(
                isStalled: false,
                reason: "Awaiting confirmation",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // Check if hysteresis window has passed
        let hysteresisElapsed = stallConditionsMetAt!.distance(to: now)
        let hysteresisPassed = hysteresisElapsed >= config.hysteresisWindow
        signals.append(StallStatus.StallSignal(
            name: "hysteresis",
            passed: hysteresisPassed,
            detail: "Elapsed: \(Int(hysteresisElapsed))s (window: \(Int(config.hysteresisWindow))s)"
        ))

        if !hysteresisPassed {
            return StallStatus(
                isStalled: false,
                reason: "Confirming stall (\(Int(config.hysteresisWindow - hysteresisElapsed))s remaining)",
                inactivityDuration: inactivityDuration,
                signalsChecked: signals,
                timestamp: now
            )
        }

        // STALL CONFIRMED
        lastConfirmedStall = now
        stallConditionsMetAt = nil // Reset for next detection cycle

        let reason = generateStallReason(
            inactivityDuration: inactivityDuration,
            context: context
        )

        logger.warning("STALL CONFIRMED: \(reason)")

        return StallStatus(
            isStalled: true,
            reason: reason,
            inactivityDuration: inactivityDuration,
            signalsChecked: signals,
            timestamp: now
        )
    }

    // MARK: - Helper Methods

    private func generateStallReason(
        inactivityDuration: TimeInterval,
        context: SessionContextSnapshot
    ) -> String {
        var reasons: [String] = []

        reasons.append("No activity for \(Int(inactivityDuration)) seconds")

        if context.activeAgentCount == 0 {
            reasons.append("All \(context.totalAgents) agents idle")
        }

        if context.progress < 1.0 {
            reasons.append("Progress at \(Int(context.progress * 100))%")
        }

        if context.tasksCompleted == 0 {
            reasons.append("No tasks completed yet")
        }

        return reasons.joined(separator: ". ")
    }

    // MARK: - Reset

    /// Reset all stall detection state
    func reset() {
        let now = Date()
        lastEventTime = now
        lastSignificantEventTime = now
        sessionStartTime = now
        agentLastActivity.removeAll()
        agentStates.removeAll()
        inflightToolCalls.removeAll()
        lastToolCallTime = nil
        isStreamingActive = false
        lastStreamChunkTime = nil
        stallConditionsMetAt = nil
        lastConfirmedStall = nil
    }

    /// Get time since last significant event
    func getInactivityDuration() -> TimeInterval {
        Date().timeIntervalSince(lastSignificantEventTime)
    }

    /// Check if stall detection is in confirmation phase
    func isInConfirmationPhase() -> Bool {
        stallConditionsMetAt != nil
    }

    /// Get last confirmed stall time
    func getLastConfirmedStall() -> Date? {
        lastConfirmedStall
    }
}

// MARK: - Stall Detector Metrics

extension StallDetector {
    /// Get current detection metrics
    func getMetrics() -> StallDetectorMetrics {
        StallDetectorMetrics(
            inactivityDuration: Date().timeIntervalSince(lastSignificantEventTime),
            trackedAgents: agentStates.count,
            activeAgents: agentStates.values.filter { $0 == "running" || $0 == "active" }.count,
            inflightToolCalls: inflightToolCalls.count,
            isStreamingActive: isStreamingActive,
            isInConfirmation: stallConditionsMetAt != nil,
            lastConfirmedStall: lastConfirmedStall
        )
    }
}

struct StallDetectorMetrics {
    let inactivityDuration: TimeInterval
    let trackedAgents: Int
    let activeAgents: Int
    let inflightToolCalls: Int
    let isStreamingActive: Bool
    let isInConfirmation: Bool
    let lastConfirmedStall: Date?

    var formattedInactivity: String {
        if inactivityDuration < 60 {
            return "\(Int(inactivityDuration))s"
        } else {
            let minutes = Int(inactivityDuration / 60)
            let seconds = Int(inactivityDuration.truncatingRemainder(dividingBy: 60))
            return "\(minutes)m \(seconds)s"
        }
    }
}
