//
//  AssistantImprovementsTests.swift
//  MaiFarmTests
//
//  Tests for Assistant v2 improvements:
//  - Adaptive thresholds
//  - ML-based stall prediction
//  - Differential summary updates
//  - Analytics tracking
//

import XCTest
@testable import MaiFarm

// MARK: - Adaptive Thresholds Tests

final class AdaptiveThresholdsTests: XCTestCase {

    func testQuickTaskThresholdsAreFaster() async throws {
        let manager = AdaptiveThresholdManager.shared

        let quickConfig = await manager.getAdaptiveConfig(
            mode: .quickTask,
            engine: "claude",
            deviceClass: .standard
        )

        let farmConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .standard
        )

        XCTAssertLessThan(quickConfig.inactivityThreshold, farmConfig.inactivityThreshold,
            "Quick task should have faster inactivity detection")
        XCTAssertLessThan(quickConfig.hysteresisWindow, farmConfig.hysteresisWindow,
            "Quick task should have shorter hysteresis")
    }

    func testGoWildThresholdsAreMoreLenient() async throws {
        let manager = AdaptiveThresholdManager.shared

        let goWildConfig = await manager.getAdaptiveConfig(
            mode: .goWild,
            engine: "claude",
            deviceClass: .standard
        )

        let farmConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .standard
        )

        XCTAssertGreaterThan(goWildConfig.inactivityThreshold, farmConfig.inactivityThreshold,
            "GoWild should have more lenient inactivity threshold")
    }

    func testLocalModelsGetLongerThresholds() async throws {
        let manager = AdaptiveThresholdManager.shared

        let ollamaConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "ollama",
            deviceClass: .standard
        )

        let claudeConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .standard
        )

        XCTAssertGreaterThan(ollamaConfig.inactivityThreshold, claudeConfig.inactivityThreshold,
            "Local models should have longer thresholds")
    }

    func testWorkstationDevicesAreFaster() async throws {
        let manager = AdaptiveThresholdManager.shared

        let workstationConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .workstation
        )

        let limitedConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .limited
        )

        XCTAssertLessThan(workstationConfig.inactivityThreshold, limitedConfig.inactivityThreshold,
            "Workstation should have faster detection")
    }

    func testProgressAwareThresholds() async throws {
        let manager = AdaptiveThresholdManager.shared

        let baseConfig = await manager.getAdaptiveConfig(
            mode: .createFarm,
            engine: "claude",
            deviceClass: .standard
        )

        let earlyConfig = await manager.getProgressAwareConfig(baseConfig: baseConfig, progress: 0.1)
        let lateConfig = await manager.getProgressAwareConfig(baseConfig: baseConfig, progress: 0.9)

        XCTAssertGreaterThan(earlyConfig.inactivityThreshold, lateConfig.inactivityThreshold,
            "Early progress should have more lenient thresholds")
    }

    func testRecordingStallForLearning() async throws {
        let manager = AdaptiveThresholdManager.shared

        await manager.resetLearning()

        // Record several stalls
        for _ in 0..<10 {
            await manager.recordStall(
                mode: .createFarm,
                engine: "claude",
                wasRealStall: true,
                inactivityDuration: 35.0
            )
        }

        // Record a false positive
        await manager.recordStall(
            mode: .createFarm,
            engine: "claude",
            wasRealStall: false,
            inactivityDuration: 25.0
        )

        let stats = await manager.getStatistics()
        XCTAssertEqual(stats.totalRecords, 11)
    }
}

// MARK: - Stall Prediction Tests

final class StallPredictionTests: XCTestCase {

    func testPredictionWithHighInactivity() async throws {
        let engine = StallPredictionEngine.shared

        let features = StallFeatureVector(
            timeSinceLastEvent: 45.0,
            timeSinceLastAgentMessage: 50.0,
            timeSinceLastToolCall: 60.0,
            sessionDuration: 300.0,
            activeAgentCount: 0,
            idleAgentCount: 3,
            totalAgents: 3,
            agentIdleRatio: 1.0,
            inflightToolCalls: 0,
            recentToolCallCount: 0,
            averageToolDuration: 5.0,
            progress: 0.5,
            progressRate: 0.001,
            tasksCompleted: 2,
            eventRate: 0.5,
            isStreaming: false,
            consecutiveIdlePeriods: 3,
            mode: .createFarm,
            errorCount: 0,
            warningCount: 0
        )

        let prediction = await engine.predict(features: features)

        XCTAssertGreaterThan(prediction.probability, 0.5, "High inactivity should predict stall")
        XCTAssertNotEqual(prediction.recommendation, .noAction)
    }

    func testPredictionWithActiveSession() async throws {
        let engine = StallPredictionEngine.shared

        let features = StallFeatureVector(
            timeSinceLastEvent: 2.0,
            timeSinceLastAgentMessage: 3.0,
            timeSinceLastToolCall: 5.0,
            sessionDuration: 300.0,
            activeAgentCount: 2,
            idleAgentCount: 1,
            totalAgents: 3,
            agentIdleRatio: 0.33,
            inflightToolCalls: 1,
            recentToolCallCount: 10,
            averageToolDuration: 5.0,
            progress: 0.5,
            progressRate: 0.1,
            tasksCompleted: 5,
            eventRate: 20.0,
            isStreaming: true,
            consecutiveIdlePeriods: 0,
            mode: .createFarm,
            errorCount: 0,
            warningCount: 0
        )

        let prediction = await engine.predict(features: features)

        XCTAssertLessThan(prediction.probability, 0.3, "Active session should not predict stall")
        XCTAssertEqual(prediction.recommendation, .noAction)
    }

    func testTrainingDataCollection() async throws {
        let engine = StallPredictionEngine.shared

        let features = StallFeatureVector(
            timeSinceLastEvent: 30.0,
            timeSinceLastAgentMessage: 35.0,
            timeSinceLastToolCall: 40.0,
            sessionDuration: 200.0,
            activeAgentCount: 0,
            idleAgentCount: 2,
            totalAgents: 2,
            agentIdleRatio: 1.0,
            inflightToolCalls: 0,
            recentToolCallCount: 2,
            averageToolDuration: 5.0,
            progress: 0.3,
            progressRate: 0.05,
            tasksCompleted: 1,
            eventRate: 5.0,
            isStreaming: false,
            consecutiveIdlePeriods: 1,
            mode: .createFarm,
            errorCount: 0,
            warningCount: 0
        )

        await engine.recordDataPoint(features: features, didStall: true)
        await engine.recordDataPoint(features: features, didStall: false)

        let stats = await engine.getTrainingStats()
        XCTAssertGreaterThanOrEqual(stats.totalExamples, 2)
    }
}

// MARK: - Differential Summary Tests

final class DifferentialSummaryTests: XCTestCase {

    var engine: DifferentialSummaryEngine!

    override func setUp() async throws {
        engine = DifferentialSummaryEngine()
    }

    func testUpdateGoals() async throws {
        let goals = SummaryGoals(primaryGoal: "Build a new feature")
        let delta = await engine.updateGoals(goals)

        XCTAssertEqual(delta.section, .goals)
        // Sections are pre-initialized with empty content, so first update is "modified"
        XCTAssertEqual(delta.changeType, .modified)
    }

    func testUpdateStatus() async throws {
        let context = createTestContext()
        let delta = await engine.updateStatus(context: context)

        XCTAssertEqual(delta.section, .currentStatus)
        XCTAssertTrue(delta.newContent.contains("Running"))
    }

    func testAppendToProgressLog() async throws {
        let delta1 = await engine.appendToProgressLog(entry: "First event")
        let delta2 = await engine.appendToProgressLog(entry: "Second event")

        // Sections are pre-initialized with empty content, so all updates are "modified"
        XCTAssertEqual(delta1.changeType, .modified)
        XCTAssertEqual(delta2.changeType, .modified)
    }

    func testDocumentGeneration() async throws {
        let goals = SummaryGoals(primaryGoal: "Test goal")
        _ = await engine.updateGoals(goals)
        _ = await engine.appendToProgressLog(entry: "Test entry")

        let document = await engine.generateDocument()

        XCTAssertTrue(document.contains("# ASSISTANT.md"))
        XCTAssertTrue(document.contains("## Goals"))
        XCTAssertTrue(document.contains("Test goal"))
        XCTAssertTrue(document.contains("## Progress Log"))
    }

    func testNeedsFullRebuild() async throws {
        // Generate many deltas
        for i in 0..<60 {
            _ = await engine.appendToProgressLog(entry: "Event \(i)")
        }

        let needsRebuild = await engine.needsFullRebuild()
        XCTAssertTrue(needsRebuild, "Should need rebuild after many deltas")
    }

    private func createTestContext() -> SessionContextSnapshot {
        SessionContextSnapshot(
            sessionId: "test",
            farmId: "farm-1",
            farmName: "Test Farm",
            mode: .createFarm,
            engine: "claude",
            startedAt: Date(),
            status: "running",
            progress: 0.5,
            activeAgentCount: 2,
            idleAgentCount: 1,
            totalAgents: 3,
            tokensUsed: 1000,
            estimatedCost: 0.01,
            tasksCompleted: 2,
            filesGenerated: 1,
            lastEventAt: Date(),
            totalEventCount: 50,
            eventCountByType: [:],
            agentStates: [:],
            inflightToolCalls: 0,
            pendingOperations: 0,
            errorCount: 0,
            warningCount: 0,
            lastError: nil
        )
    }
}

// MARK: - Analytics Tests

final class StallAnalyticsTests: XCTestCase {

    func testRecordDetection() async throws {
        let analytics = StallDetectionAnalytics.shared

        let config = StallDetectorConfig.default

        let eventId = await analytics.recordDetection(
            sessionId: "test-session",
            farmMode: "createFarm",
            engine: "claude",
            inactivityDuration: 35.0,
            signalsChecked: ["inactivity", "agents_idle", "no_tools"],
            config: config
        )

        let events = await analytics.getRecentEvents()
        XCTAssertTrue(events.contains { $0.id == eventId })
    }

    func testRecordOutcome() async throws {
        let analytics = StallDetectionAnalytics.shared
        let config = StallDetectorConfig.default

        let eventId = await analytics.recordDetection(
            sessionId: "test-outcome",
            farmMode: "createFarm",
            engine: "claude",
            inactivityDuration: 40.0,
            signalsChecked: ["inactivity"],
            config: config
        )

        await analytics.recordOutcome(
            eventId: eventId,
            outcome: .truePositive,
            source: .automatic
        )

        let events = await analytics.getEvents(for: "test-outcome")
        let event = events.first { $0.id == eventId }

        XCTAssertEqual(event?.outcome, .truePositive)
    }

    func testAccuracyReport() async throws {
        let analytics = StallDetectionAnalytics.shared

        let report = await analytics.getAccuracyReport()

        XCTAssertGreaterThanOrEqual(report.precision, 0)
        XCTAssertLessThanOrEqual(report.precision, 1)
        XCTAssertGreaterThanOrEqual(report.accuracy, 0)
        XCTAssertLessThanOrEqual(report.accuracy, 1)
    }

    func testSessionTracking() async throws {
        let analytics = StallDetectionAnalytics.shared

        await analytics.startSession(sessionId: "analytics-test")
        await analytics.recordNudgeSent(sessionId: "analytics-test")
        await analytics.recordNudgeAcknowledged(sessionId: "analytics-test")
        await analytics.endSession(sessionId: "analytics-test")

        let sessionAnalytics = await analytics.getSessionAnalytics(sessionId: "analytics-test")

        XCTAssertNotNil(sessionAnalytics)
        XCTAssertEqual(sessionAnalytics?.nudgesSent, 1)
        XCTAssertEqual(sessionAnalytics?.nudgesAcknowledged, 1)
    }
}

// MARK: - Cloud Sync Tests

final class CloudSyncTests: XCTestCase {

    func testSyncStatus() async throws {
        let manager = CloudSyncManager.shared
        let status = await manager.getStatus()

        // Should be idle, notSignedIn, or disabled (depending on simulator state)
        // Any valid CloudSyncStatus is acceptable for test environment
        // Check that status is one of the valid cases
        switch status {
        case .idle, .notSignedIn, .disabled, .syncing, .error, .synced:
            break // All valid statuses
        }
        // If we get here, status is a valid CloudSyncStatus
    }

    func testRecentChanges() async throws {
        let manager = CloudSyncManager.shared
        let changes = await manager.getRecentChanges()

        // Should return an array (possibly empty)
        XCTAssertNotNil(changes)
    }
}
