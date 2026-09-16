//
//  SessionEventBus.swift
//  MaiFarm
//
//  Unified event bus for farm session events
//  Provides a central subscription point for all session activity
//

import Foundation
import Combine
import os.log

// MARK: - Session Event Bus

/// Thread-safe event bus for distributing session events to all subscribers
actor SessionEventBus {
    static let shared = SessionEventBus()

    // Subscribers
    private var subscribers: [String: EventSubscriber] = [:]
    private var continuations: [String: AsyncStream<SessionEvent>.Continuation] = [:]

    // Event buffer for late subscribers
    private var recentEvents: [SessionEvent] = []
    private let maxRecentEvents = 100

    // Session state
    private var activeSessionId: String?
    private var sessionStartTime: Date?

    private let logger = Logger(subsystem: "app.maifarm", category: "SessionEventBus")

    // MARK: - Event Publishing

    /// Publish an event to all subscribers
    func publish(_ event: SessionEvent) {
        // Add to recent events buffer
        recentEvents.append(event)
        if recentEvents.count > maxRecentEvents {
            recentEvents.removeFirst()
        }

        // Notify all subscribers
        for (_, subscriber) in subscribers {
            subscriber.receive(event)
        }

        // Notify async stream subscribers
        for (_, continuation) in continuations {
            continuation.yield(event)
        }

        logger.debug("Event published: \(event.type.rawValue) for session \(event.sessionId)")
    }

    /// Publish multiple events
    func publishBatch(_ events: [SessionEvent]) {
        for event in events {
            publish(event)
        }
    }

    // MARK: - Event Conversion from Monitoring

    /// Convert and publish a monitoring WebSocket message as a session event
    func publishFromMonitoring(_ message: MonitoringMessage, sessionId: String) {
        guard let event = SessionEvent.from(monitoringMessage: message, sessionId: sessionId) else {
            return
        }
        publish(event)
    }

    // MARK: - Subscription Management

    /// Subscribe with a closure-based callback
    func subscribe(id: String, filter: EventFilter? = nil, handler: @escaping @Sendable (SessionEvent) -> Void) {
        let subscriber = EventSubscriber(id: id, filter: filter, handler: handler)
        subscribers[id] = subscriber
        logger.info("Subscriber added: \(id)")
    }

    /// Subscribe with an async stream
    func subscribeStream(id: String, filter: EventFilter? = nil) -> AsyncStream<SessionEvent> {
        AsyncStream { continuation in
            continuations[id] = continuation

            continuation.onTermination = { [weak self] _ in
                Task {
                    await self?.unsubscribe(id: id)
                }
            }
        }
    }

    /// Unsubscribe
    func unsubscribe(id: String) {
        subscribers.removeValue(forKey: id)
        if let continuation = continuations.removeValue(forKey: id) {
            continuation.finish()
        }
        logger.info("Subscriber removed: \(id)")
    }

    // MARK: - Session Lifecycle

    /// Start tracking a new session
    func startSession(sessionId: String, farmId: String, farmName: String, mode: String, engine: String, agentCount: Int, duration: Int) {
        activeSessionId = sessionId
        sessionStartTime = Date()
        recentEvents.removeAll()

        let event = SessionEvent(
            sessionId: sessionId,
            type: .sessionStarted,
            data: .sessionStart(
                farmId: farmId,
                farmName: farmName,
                mode: mode,
                engine: engine,
                agentCount: agentCount,
                duration: duration
            )
        )
        publish(event)

        logger.info("Session started: \(sessionId) (\(farmName))")
    }

    /// End the current session
    func endSession(finalStatus: String, totalTokens: Int, totalCost: Double) {
        guard let sessionId = activeSessionId else { return }

        let event = SessionEvent(
            sessionId: sessionId,
            type: .sessionEnded,
            data: .sessionEnd(
                finalStatus: finalStatus,
                totalTokens: totalTokens,
                totalCost: totalCost
            )
        )
        publish(event)

        // Finish all async stream continuations
        for (_, continuation) in continuations {
            continuation.finish()
        }
        continuations.removeAll()

        activeSessionId = nil
        sessionStartTime = nil

        logger.info("Session ended: \(sessionId) with status \(finalStatus)")
    }

    // MARK: - Query

    /// Get recent events for a session
    func getRecentEvents(sessionId: String? = nil, limit: Int = 50) -> [SessionEvent] {
        let events = sessionId.map { sid in
            recentEvents.filter { $0.sessionId == sid }
        } ?? recentEvents

        return Array(events.suffix(limit))
    }

    /// Get current session ID
    func getActiveSessionId() -> String? {
        activeSessionId
    }

    /// Get session duration
    func getSessionDuration() -> TimeInterval? {
        sessionStartTime.map { Date().timeIntervalSince($0) }
    }

    /// Check if session is active
    func isSessionActive() -> Bool {
        activeSessionId != nil
    }
}

// MARK: - Event Subscriber

private final class EventSubscriber: @unchecked Sendable {
    let id: String
    let filter: EventFilter?
    let handler: @Sendable (SessionEvent) -> Void

    init(id: String, filter: EventFilter?, handler: @escaping @Sendable (SessionEvent) -> Void) {
        self.id = id
        self.filter = filter
        self.handler = handler
    }

    func receive(_ event: SessionEvent) {
        if let filter = filter, !filter.matches(event) {
            return
        }
        handler(event)
    }
}

// MARK: - Event Filter

/// Filter for subscribing to specific event types
struct EventFilter {
    var types: Set<SessionEventType>?
    var agentIds: Set<String>?
    var excludeTypes: Set<SessionEventType>?
    var sessionId: String?

    func matches(_ event: SessionEvent) -> Bool {
        if let sessionId = sessionId, event.sessionId != sessionId {
            return false
        }

        if let types = types, !types.contains(event.type) {
            return false
        }

        if let excludeTypes = excludeTypes, excludeTypes.contains(event.type) {
            return false
        }

        if let agentIds = agentIds, let eventAgentId = event.agentId {
            if !agentIds.contains(eventAgentId) {
                return false
            }
        }

        return true
    }

    // Convenience initializers
    static func only(types: Set<SessionEventType>) -> EventFilter {
        EventFilter(types: types)
    }

    static func exclude(types: Set<SessionEventType>) -> EventFilter {
        EventFilter(excludeTypes: types)
    }

    static func forAgent(_ agentId: String) -> EventFilter {
        EventFilter(agentIds: [agentId])
    }

    static func forSession(_ sessionId: String) -> EventFilter {
        EventFilter(sessionId: sessionId)
    }

    /// Filter for context-relevant events (excludes high-frequency terminal output)
    static var contextRelevant: EventFilter {
        EventFilter(excludeTypes: [.terminalOutput, .agentHeartbeat])
    }

    /// Filter for stall detection signals
    static var stallSignals: EventFilter {
        EventFilter(types: [
            .agentStarted, .agentCompleted, .agentFailed, .agentIdle, .agentHeartbeat,
            .toolInvocation, .toolResult, .toolError,
            .farmStatusChange, .metricsUpdate,
            .agentMessage, .agentOutput, .agentThinking
        ])
    }
}

// MARK: - Helper Events

extension SessionEventBus {
    /// Publish a user input event
    func publishUserInput(sessionId: String, content: String) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .userInput,
            data: .userInput(content: content)
        )
        publish(event)
    }

    /// Publish a user goal event
    func publishUserGoal(sessionId: String, goal: String, constraints: [String]? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .userGoal,
            data: .userGoal(goal: goal, constraints: constraints)
        )
        publish(event)
    }

    /// Publish an error event
    func publishError(sessionId: String, agentId: String? = nil, code: String? = nil, message: String, recoverable: Bool = true) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .errorOccurred,
            agentId: agentId,
            data: .error(code: code, message: message, recoverable: recoverable)
        )
        publish(event)
    }

    /// Publish a warning event
    func publishWarning(sessionId: String, agentId: String? = nil, message: String, severity: String? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .warningIssued,
            agentId: agentId,
            data: .warning(message: message, severity: severity)
        )
        publish(event)
    }

    /// Publish an artifact created event
    func publishArtifact(sessionId: String, agentId: String? = nil, name: String, type: String, path: String? = nil, summary: String? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .artifactCreated,
            agentId: agentId,
            data: .artifactCreated(name: name, type: type, path: path, sizeSummary: summary)
        )
        publish(event)
    }

    /// Publish a tool invocation event
    func publishToolCall(sessionId: String, agentId: String?, toolName: String, inputSummary: String, correlationId: String? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .toolInvocation,
            agentId: agentId,
            correlationId: correlationId ?? UUID().uuidString,
            data: .toolCall(toolName: toolName, inputSummary: inputSummary)
        )
        publish(event)
    }

    /// Publish a tool result event
    func publishToolResult(sessionId: String, agentId: String?, toolName: String, outputSummary: String, success: Bool, correlationId: String? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: success ? .toolResult : .toolError,
            agentId: agentId,
            correlationId: correlationId,
            data: .toolResult(toolName: toolName, outputSummary: outputSummary, success: success)
        )
        publish(event)
    }

    /// Publish nudge sent event
    func publishNudgeSent(sessionId: String, nudgeId: String, content: String) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .orchestratorNudgeReceived,
            data: .nudgeSent(nudgeId: nudgeId, content: content)
        )
        publish(event)
    }

    /// Publish nudge acknowledgment event
    func publishNudgeAck(sessionId: String, nudgeId: String, response: String? = nil) {
        let event = SessionEvent(
            sessionId: sessionId,
            type: .orchestratorNudgeAck,
            data: .nudgeAck(nudgeId: nudgeId, response: response)
        )
        publish(event)
    }
}

// MARK: - Combine Publisher

/// Combine publisher wrapper for the event bus
@MainActor
final class SessionEventPublisher: ObservableObject, @unchecked Sendable {
    @Published var lastEvent: SessionEvent?
    @Published var eventCount: Int = 0

    private var subscriptionId: String?

    func subscribe(filter: EventFilter? = nil) async {
        subscriptionId = UUID().uuidString

        await SessionEventBus.shared.subscribe(id: subscriptionId!, filter: filter) { [weak self] event in
            Task { @MainActor in
                self?.lastEvent = event
                self?.eventCount += 1
            }
        }
    }

    func unsubscribe() async {
        if let id = subscriptionId {
            await SessionEventBus.shared.unsubscribe(id: id)
            subscriptionId = nil
        }
    }

    deinit {
        if let id = subscriptionId {
            Task {
                await SessionEventBus.shared.unsubscribe(id: id)
            }
        }
    }
}
