//
//  StallDetectionAnalytics.swift
//  MaiFarm
//
//  Analytics tracking for stall detection accuracy
//  Tracks true positives, false positives, and detection metrics
//

import Foundation
import os.log

// MARK: - Detection Event

struct StallDetectionEvent: Codable, Identifiable {
    let id: UUID
    let sessionId: String
    let farmMode: String
    let engine: String
    let timestamp: Date

    // Detection context
    let inactivityDuration: TimeInterval
    let signalsChecked: [String]
    let config: DetectionConfigSnapshot

    // Outcome
    var outcome: DetectionOutcome?
    var outcomeTimestamp: Date?
    var feedbackSource: FeedbackSource?

    struct DetectionConfigSnapshot: Codable {
        let inactivityThreshold: TimeInterval
        let hysteresisWindow: TimeInterval
        let streamingGracePeriod: TimeInterval
    }

    enum DetectionOutcome: String, Codable {
        case truePositive   // Stall was real, nudge helped
        case falsePositive  // Stall was not real, activity resumed naturally
        case trueNegative   // Correctly didn't trigger
        case falseNegative  // Missed a stall (user reported)
        case unknown        // Not yet determined
    }

    enum FeedbackSource: String, Codable {
        case automatic      // System determined
        case userExplicit   // User provided feedback
        case inferred       // Inferred from behavior
    }
}

// MARK: - Session Analytics

struct SessionAnalytics: Codable {
    let sessionId: String
    let startTime: Date
    var endTime: Date?

    // Detection counts
    var stallsDetected: Int = 0
    var nudgesSent: Int = 0
    var nudgesAcknowledged: Int = 0

    // Timing metrics
    var averageInactivityBeforeStall: TimeInterval = 0
    var maxInactivityDuration: TimeInterval = 0
    var totalIdleTime: TimeInterval = 0

    // Accuracy metrics
    var truePositives: Int = 0
    var falsePositives: Int = 0
    var trueNegatives: Int = 0
    var falseNegatives: Int = 0

    // Computed metrics
    var precision: Double {
        let total = truePositives + falsePositives
        return total > 0 ? Double(truePositives) / Double(total) : 1.0
    }

    var recall: Double {
        let total = truePositives + falseNegatives
        return total > 0 ? Double(truePositives) / Double(total) : 1.0
    }

    var f1Score: Double {
        let p = precision
        let r = recall
        return (p + r) > 0 ? 2 * (p * r) / (p + r) : 0
    }

    var accuracy: Double {
        let total = truePositives + trueNegatives + falsePositives + falseNegatives
        return total > 0 ? Double(truePositives + trueNegatives) / Double(total) : 1.0
    }
}

// MARK: - Aggregate Analytics

struct AggregateAnalytics: Codable {
    var totalSessions: Int = 0
    var totalStallsDetected: Int = 0
    var totalNudgesSent: Int = 0
    var totalNudgesAcknowledged: Int = 0

    // Outcomes
    var totalTruePositives: Int = 0
    var totalFalsePositives: Int = 0
    var totalTrueNegatives: Int = 0
    var totalFalseNegatives: Int = 0

    // By mode
    var byMode: [String: ModeAnalytics] = [:]

    // By engine
    var byEngine: [String: EngineAnalytics] = [:]

    // Time series (hourly buckets)
    var hourlyBuckets: [String: HourlyBucket] = [:]

    struct ModeAnalytics: Codable {
        var sessions: Int = 0
        var stallsDetected: Int = 0
        var truePositives: Int = 0
        var falsePositives: Int = 0
        var averageTimeToDetection: TimeInterval = 0
    }

    struct EngineAnalytics: Codable {
        var sessions: Int = 0
        var stallsDetected: Int = 0
        var truePositives: Int = 0
        var falsePositives: Int = 0
    }

    struct HourlyBucket: Codable {
        var stallsDetected: Int = 0
        var nudgesSent: Int = 0
        var responseRate: Double = 0
    }

    // Computed
    var overallPrecision: Double {
        let total = totalTruePositives + totalFalsePositives
        return total > 0 ? Double(totalTruePositives) / Double(total) : 1.0
    }

    var overallAccuracy: Double {
        let total = totalTruePositives + totalTrueNegatives + totalFalsePositives + totalFalseNegatives
        return total > 0 ? Double(totalTruePositives + totalTrueNegatives) / Double(total) : 1.0
    }

    var nudgeResponseRate: Double {
        totalNudgesSent > 0 ? Double(totalNudgesAcknowledged) / Double(totalNudgesSent) : 0
    }
}

// MARK: - Stall Detection Analytics

/// Tracks and analyzes stall detection accuracy
actor StallDetectionAnalytics {
    static let shared = StallDetectionAnalytics()

    private let logger = Logger(subsystem: "app.maifarm", category: "StallAnalytics")

    // Storage
    private var events: [StallDetectionEvent] = []
    private var sessionAnalytics: [String: SessionAnalytics] = [:]
    private var aggregateAnalytics = AggregateAnalytics()

    // Configuration
    private let maxEventsToKeep = 1000
    private let maxSessionsToKeep = 100

    // File paths
    private var eventsFilePath: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("stall_analytics_events.json")
    }

    private var analyticsFilePath: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("stall_analytics_aggregate.json")
    }

    // MARK: - Initialization

    private init() {
        Task {
            await loadData()
        }
    }

    // MARK: - Event Recording

    /// Record a stall detection event
    func recordDetection(
        sessionId: String,
        farmMode: String,
        engine: String,
        inactivityDuration: TimeInterval,
        signalsChecked: [String],
        config: StallDetectorConfig
    ) -> UUID {
        let eventId = UUID()

        let event = StallDetectionEvent(
            id: eventId,
            sessionId: sessionId,
            farmMode: farmMode,
            engine: engine,
            timestamp: Date(),
            inactivityDuration: inactivityDuration,
            signalsChecked: signalsChecked,
            config: StallDetectionEvent.DetectionConfigSnapshot(
                inactivityThreshold: config.inactivityThreshold,
                hysteresisWindow: config.hysteresisWindow,
                streamingGracePeriod: config.streamingGracePeriod
            ),
            outcome: nil,
            outcomeTimestamp: nil,
            feedbackSource: nil
        )

        events.append(event)

        // Update session analytics
        updateSessionAnalytics(sessionId: sessionId, inactivityDuration: inactivityDuration)

        // Update aggregate
        aggregateAnalytics.totalStallsDetected += 1
        updateModeAnalytics(mode: farmMode)
        updateEngineAnalytics(engine: engine)
        updateHourlyBucket()

        // Trim if needed
        if events.count > maxEventsToKeep {
            events.removeFirst(events.count - maxEventsToKeep)
        }

        logger.debug("Recorded detection event: \(eventId)")

        Task { await saveData() }

        return eventId
    }

    /// Record a nudge being sent
    func recordNudgeSent(sessionId: String) {
        aggregateAnalytics.totalNudgesSent += 1

        if var session = sessionAnalytics[sessionId] {
            session.nudgesSent += 1
            sessionAnalytics[sessionId] = session
        }

        updateHourlyBucket(nudgeSent: true)
    }

    /// Record a nudge acknowledgment
    func recordNudgeAcknowledged(sessionId: String) {
        aggregateAnalytics.totalNudgesAcknowledged += 1

        if var session = sessionAnalytics[sessionId] {
            session.nudgesAcknowledged += 1
            sessionAnalytics[sessionId] = session
        }
    }

    // MARK: - Outcome Recording

    /// Record the outcome of a detection
    func recordOutcome(
        eventId: UUID,
        outcome: StallDetectionEvent.DetectionOutcome,
        source: StallDetectionEvent.FeedbackSource = .automatic
    ) {
        guard let index = events.firstIndex(where: { $0.id == eventId }) else {
            logger.warning("Event not found for outcome recording: \(eventId)")
            return
        }

        events[index].outcome = outcome
        events[index].outcomeTimestamp = Date()
        events[index].feedbackSource = source

        // Update counters
        switch outcome {
        case .truePositive:
            aggregateAnalytics.totalTruePositives += 1
            if var session = sessionAnalytics[events[index].sessionId] {
                session.truePositives += 1
                sessionAnalytics[events[index].sessionId] = session
            }

        case .falsePositive:
            aggregateAnalytics.totalFalsePositives += 1
            if var session = sessionAnalytics[events[index].sessionId] {
                session.falsePositives += 1
                sessionAnalytics[events[index].sessionId] = session
            }

        case .trueNegative:
            aggregateAnalytics.totalTrueNegatives += 1
            if var session = sessionAnalytics[events[index].sessionId] {
                session.trueNegatives += 1
                sessionAnalytics[events[index].sessionId] = session
            }

        case .falseNegative:
            aggregateAnalytics.totalFalseNegatives += 1
            if var session = sessionAnalytics[events[index].sessionId] {
                session.falseNegatives += 1
                sessionAnalytics[events[index].sessionId] = session
            }

        case .unknown:
            break
        }

        // Notify adaptive thresholds
        Task {
            await AdaptiveThresholdManager.shared.recordStall(
                mode: SessionContextSnapshot.FarmMode(rawValue: events[index].farmMode) ?? .createFarm,
                engine: events[index].engine,
                wasRealStall: outcome == .truePositive,
                inactivityDuration: events[index].inactivityDuration
            )
        }

        logger.info("Recorded outcome \(outcome.rawValue) for event \(eventId)")

        Task { await saveData() }
    }

    /// Automatically determine outcome based on activity after detection
    func autoRecordOutcome(
        eventId: UUID,
        activityResumed: Bool,
        timeSinceDetection: TimeInterval
    ) {
        let outcome: StallDetectionEvent.DetectionOutcome

        if activityResumed && timeSinceDetection < 10 {
            // Activity resumed very quickly - likely false positive
            outcome = .falsePositive
        } else if activityResumed && timeSinceDetection < 60 {
            // Activity resumed after nudge - true positive
            outcome = .truePositive
        } else if !activityResumed && timeSinceDetection > 120 {
            // Still stalled - definitely true positive
            outcome = .truePositive
        } else {
            outcome = .unknown
        }

        if outcome != .unknown {
            recordOutcome(eventId: eventId, outcome: outcome, source: .automatic)
        }
    }

    // MARK: - Session Management

    /// Start tracking a new session
    func startSession(sessionId: String) {
        sessionAnalytics[sessionId] = SessionAnalytics(
            sessionId: sessionId,
            startTime: Date()
        )

        aggregateAnalytics.totalSessions += 1

        // Trim old sessions
        if sessionAnalytics.count > maxSessionsToKeep {
            let oldest = sessionAnalytics.sorted { $0.value.startTime < $1.value.startTime }
            for (key, _) in oldest.prefix(sessionAnalytics.count - maxSessionsToKeep) {
                sessionAnalytics.removeValue(forKey: key)
            }
        }
    }

    /// End session tracking
    func endSession(sessionId: String) {
        if var session = sessionAnalytics[sessionId] {
            session.endTime = Date()
            sessionAnalytics[sessionId] = session
        }

        Task { await saveData() }
    }

    // MARK: - Private Helpers

    private func updateSessionAnalytics(sessionId: String, inactivityDuration: TimeInterval) {
        if var session = sessionAnalytics[sessionId] {
            session.stallsDetected += 1

            // Update running average
            let count = Double(session.stallsDetected)
            session.averageInactivityBeforeStall = (session.averageInactivityBeforeStall * (count - 1) + inactivityDuration) / count

            session.maxInactivityDuration = max(session.maxInactivityDuration, inactivityDuration)

            sessionAnalytics[sessionId] = session
        }
    }

    private func updateModeAnalytics(mode: String) {
        var analytics = aggregateAnalytics.byMode[mode] ?? AggregateAnalytics.ModeAnalytics()
        analytics.stallsDetected += 1
        aggregateAnalytics.byMode[mode] = analytics
    }

    private func updateEngineAnalytics(engine: String) {
        var analytics = aggregateAnalytics.byEngine[engine] ?? AggregateAnalytics.EngineAnalytics()
        analytics.stallsDetected += 1
        aggregateAnalytics.byEngine[engine] = analytics
    }

    private func updateHourlyBucket(nudgeSent: Bool = false) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HH"
        let bucketKey = formatter.string(from: Date())

        var bucket = aggregateAnalytics.hourlyBuckets[bucketKey] ?? AggregateAnalytics.HourlyBucket()

        if nudgeSent {
            bucket.nudgesSent += 1
        } else {
            bucket.stallsDetected += 1
        }

        aggregateAnalytics.hourlyBuckets[bucketKey] = bucket

        // Keep only last 168 hours (1 week)
        if aggregateAnalytics.hourlyBuckets.count > 168 {
            let sortedKeys = aggregateAnalytics.hourlyBuckets.keys.sorted()
            for key in sortedKeys.prefix(aggregateAnalytics.hourlyBuckets.count - 168) {
                aggregateAnalytics.hourlyBuckets.removeValue(forKey: key)
            }
        }
    }

    // MARK: - Persistence

    private func loadData() async {
        // Load events
        if let data = try? Data(contentsOf: eventsFilePath) {
            events = (try? JSONDecoder().decode([StallDetectionEvent].self, from: data)) ?? []
            logger.info("Loaded \(self.events.count) detection events")
        }

        // Load aggregate analytics
        if let data = try? Data(contentsOf: analyticsFilePath) {
            aggregateAnalytics = (try? JSONDecoder().decode(AggregateAnalytics.self, from: data)) ?? AggregateAnalytics()
            logger.info("Loaded aggregate analytics")
        }
    }

    private func saveData() async {
        // Save events
        if let data = try? JSONEncoder().encode(events) {
            try? data.write(to: eventsFilePath, options: .atomic)
        }

        // Save aggregate
        if let data = try? JSONEncoder().encode(aggregateAnalytics) {
            try? data.write(to: analyticsFilePath, options: .atomic)
        }
    }

    // MARK: - Queries

    /// Get aggregate analytics
    func getAggregateAnalytics() -> AggregateAnalytics {
        aggregateAnalytics
    }

    /// Get session analytics
    func getSessionAnalytics(sessionId: String) -> SessionAnalytics? {
        sessionAnalytics[sessionId]
    }

    /// Get recent events
    func getRecentEvents(limit: Int = 20) -> [StallDetectionEvent] {
        Array(events.suffix(limit))
    }

    /// Get events for a session
    func getEvents(for sessionId: String) -> [StallDetectionEvent] {
        events.filter { $0.sessionId == sessionId }
    }

    /// Get accuracy report
    func getAccuracyReport() -> AccuracyReport {
        AccuracyReport(
            totalEvents: events.count,
            classifiedEvents: events.filter { $0.outcome != nil && $0.outcome != .unknown }.count,
            truePositives: aggregateAnalytics.totalTruePositives,
            falsePositives: aggregateAnalytics.totalFalsePositives,
            trueNegatives: aggregateAnalytics.totalTrueNegatives,
            falseNegatives: aggregateAnalytics.totalFalseNegatives,
            precision: aggregateAnalytics.overallPrecision,
            accuracy: aggregateAnalytics.overallAccuracy,
            nudgeResponseRate: aggregateAnalytics.nudgeResponseRate,
            byMode: aggregateAnalytics.byMode.mapValues { mode in
                AccuracyReport.ModeReport(
                    stallCount: mode.stallsDetected,
                    truePositives: mode.truePositives,
                    falsePositives: mode.falsePositives
                )
            }
        )
    }

    /// Clear all analytics data
    func clearAllData() async {
        events.removeAll()
        sessionAnalytics.removeAll()
        aggregateAnalytics = AggregateAnalytics()

        try? FileManager.default.removeItem(at: eventsFilePath)
        try? FileManager.default.removeItem(at: analyticsFilePath)

        logger.info("Cleared all analytics data")
    }
}

// MARK: - Accuracy Report

struct AccuracyReport {
    let totalEvents: Int
    let classifiedEvents: Int
    let truePositives: Int
    let falsePositives: Int
    let trueNegatives: Int
    let falseNegatives: Int
    let precision: Double
    let accuracy: Double
    let nudgeResponseRate: Double
    let byMode: [String: ModeReport]

    struct ModeReport {
        let stallCount: Int
        let truePositives: Int
        let falsePositives: Int

        var precision: Double {
            let total = truePositives + falsePositives
            return total > 0 ? Double(truePositives) / Double(total) : 1.0
        }
    }

    var formattedPrecision: String {
        String(format: "%.1f%%", precision * 100)
    }

    var formattedAccuracy: String {
        String(format: "%.1f%%", accuracy * 100)
    }

    var formattedResponseRate: String {
        String(format: "%.1f%%", nudgeResponseRate * 100)
    }

    var classificationRate: Double {
        totalEvents > 0 ? Double(classifiedEvents) / Double(totalEvents) : 0
    }
}

// MARK: - SwiftUI Observable Wrapper

@MainActor
class StallAnalyticsObservable: ObservableObject {
    @Published var aggregateAnalytics = AggregateAnalytics()
    @Published var accuracyReport: AccuracyReport?
    @Published var recentEvents: [StallDetectionEvent] = []

    private var refreshTask: Task<Void, Never>?

    init() {
        startRefreshing()
    }

    func startRefreshing() {
        refreshTask = Task {
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds
            }
        }
    }

    func refresh() async {
        aggregateAnalytics = await StallDetectionAnalytics.shared.getAggregateAnalytics()
        accuracyReport = await StallDetectionAnalytics.shared.getAccuracyReport()
        recentEvents = await StallDetectionAnalytics.shared.getRecentEvents()
    }

    deinit {
        refreshTask?.cancel()
    }
}
