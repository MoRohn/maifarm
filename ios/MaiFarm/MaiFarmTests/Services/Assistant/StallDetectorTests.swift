//
//  StallDetectorTests.swift
//  MaiFarmTests
//
//  Unit tests for StallDetector multi-signal stall detection
//

import XCTest
@testable import MaiFarm

final class StallDetectorTests: XCTestCase {

    var detector: StallDetector!
    var testConfig: StallDetectorConfig!

    override func setUp() async throws {
        // Use shorter thresholds for testing
        testConfig = StallDetectorConfig(
            inactivityThreshold: 2.0,      // 2 seconds
            hysteresisWindow: 1.0,         // 1 second
            streamingGracePeriod: 0.5,     // 0.5 seconds
            minimumSessionDuration: 1.0,   // 1 second
            countHeartbeatsAsActivity: false
        )
        detector = StallDetector(config: testConfig)
    }

    override func tearDown() async throws {
        await detector.reset()
        detector = nil
    }

    // MARK: - Basic Stall Detection Tests

    func testNoStallDuringMinimumSessionDuration() async throws {
        let context = createTestContext(startedAt: Date())

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall during minimum session duration")
        XCTAssertEqual(status.reason, "Session too new for stall detection")
    }

    func testNoStallWithRecentActivity() async throws {
        // Create session that started 2 seconds ago
        let context = createTestContext(startedAt: Date().addingTimeInterval(-2))

        // Record recent activity
        let event = createTestEvent(type: .agentMessage)
        await detector.recordEvent(event)

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall with recent activity")
    }

    func testStallDetectedAfterInactivity() async throws {
        // Create session that started 5 seconds ago
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Wait for inactivity threshold plus hysteresis
        try await Task.sleep(nanoseconds: UInt64(3.5 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertTrue(status.isStalled, "Should detect stall after inactivity threshold")
        XCTAssertNotNil(status.reason)
    }

    // MARK: - Agent State Signal Tests

    func testNoStallWithActiveAgents() async throws {
        var context = createTestContext(startedAt: Date().addingTimeInterval(-5))
        context.agentStates["agent1"] = AgentContextState(
            agentId: "agent1",
            name: "Agent 1",
            status: "running"
        )
        context.activeAgentCount = 1

        // Wait for inactivity
        try await Task.sleep(nanoseconds: UInt64(3 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall with active agents")
        XCTAssertEqual(status.reason, "Agents still running")
    }

    func testStallWithAllAgentsIdle() async throws {
        var context = createTestContext(startedAt: Date().addingTimeInterval(-5))
        context.agentStates["agent1"] = AgentContextState(
            agentId: "agent1",
            name: "Agent 1",
            status: "idle"
        )
        context.activeAgentCount = 0

        // Wait for inactivity plus hysteresis
        try await Task.sleep(nanoseconds: UInt64(3.5 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertTrue(status.isStalled, "Should detect stall with all agents idle")
    }

    // MARK: - Tool Call Signal Tests

    func testNoStallWithInflightToolCalls() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Record a tool invocation without result
        let toolCall = createTestEvent(type: .toolInvocation)
        await detector.recordEvent(toolCall)

        // Wait for inactivity
        try await Task.sleep(nanoseconds: UInt64(3 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall with inflight tool calls")
        XCTAssertEqual(status.reason, "Tool calls in progress")
    }

    func testStallAfterToolCallCompletes() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Record tool call and result
        let correlationId = "tool-123"
        let toolCall = SessionEvent(
            sessionId: "test",
            type: .toolInvocation,
            correlationId: correlationId,
            data: .toolCall(toolName: "test", inputSummary: "test")
        )
        await detector.recordEvent(toolCall)

        let toolResult = SessionEvent(
            sessionId: "test",
            type: .toolResult,
            correlationId: correlationId,
            data: .toolResult(toolName: "test", outputSummary: "done", success: true)
        )
        await detector.recordEvent(toolResult)

        // Wait for inactivity plus hysteresis
        try await Task.sleep(nanoseconds: UInt64(3.5 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertTrue(status.isStalled, "Should detect stall after tool call completes")
    }

    // MARK: - Streaming Signal Tests

    func testNoStallDuringStreaming() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Simulate streaming output
        for _ in 0..<3 {
            let event = createTestEvent(type: .terminalOutput)
            await detector.recordEvent(event)
            try await Task.sleep(nanoseconds: 200_000_000) // 0.2 seconds
        }

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall during streaming")
        XCTAssertEqual(status.reason, "Streaming output in progress")
    }

    func testStallAfterStreamingStops() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Record terminal output then wait
        let event = createTestEvent(type: .terminalOutput)
        await detector.recordEvent(event)

        // Wait for streaming grace period plus inactivity plus hysteresis
        try await Task.sleep(nanoseconds: UInt64(4 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertTrue(status.isStalled, "Should detect stall after streaming stops")
    }

    // MARK: - Hysteresis Tests

    func testHysteresisWindow() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Wait for inactivity threshold
        try await Task.sleep(nanoseconds: UInt64(2.5 * 1_000_000_000))

        // First check should start hysteresis
        let firstStatus = await detector.checkStall(context: context)
        XCTAssertFalse(firstStatus.isStalled, "First check should start hysteresis, not stall")
        let inConfirmation1 = await detector.isInConfirmationPhase()
        XCTAssertTrue(inConfirmation1, "Should be in confirmation phase")

        // Wait less than hysteresis window
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

        let midStatus = await detector.checkStall(context: context)
        XCTAssertFalse(midStatus.isStalled, "Should still be confirming")

        // Wait for rest of hysteresis
        try await Task.sleep(nanoseconds: 600_000_000) // 0.6 seconds

        let finalStatus = await detector.checkStall(context: context)
        XCTAssertTrue(finalStatus.isStalled, "Should confirm stall after hysteresis")
    }

    func testHysteresisCancelledByActivity() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Wait for inactivity threshold
        try await Task.sleep(nanoseconds: UInt64(2.5 * 1_000_000_000))

        // Start hysteresis
        let firstStatus = await detector.checkStall(context: context)
        XCTAssertFalse(firstStatus.isStalled)
        let inConfirmation2 = await detector.isInConfirmationPhase()
        XCTAssertTrue(inConfirmation2)

        // Record activity to cancel hysteresis
        let event = createTestEvent(type: .agentMessage)
        await detector.recordEvent(event)

        // Should no longer be in confirmation
        let status = await detector.checkStall(context: context)
        XCTAssertFalse(status.isStalled, "Stall should be cancelled by activity")
        let inConfirmation3 = await detector.isInConfirmationPhase()
        XCTAssertFalse(inConfirmation3, "Confirmation should be cancelled")
    }

    // MARK: - Farm Status Signal Tests

    func testNoStallForCompletedFarm() async throws {
        var context = createTestContext(startedAt: Date().addingTimeInterval(-5))
        context.status = "completed"

        // Wait for inactivity
        try await Task.sleep(nanoseconds: UInt64(3 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall for completed farm")
        XCTAssertEqual(status.reason, "Farm has ended")
    }

    func testNoStallForFailedFarm() async throws {
        var context = createTestContext(startedAt: Date().addingTimeInterval(-5))
        context.status = "failed"

        try await Task.sleep(nanoseconds: UInt64(3 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        XCTAssertFalse(status.isStalled, "Should not detect stall for failed farm")
    }

    // MARK: - Nudge Handling Tests

    func testStallResetOnNudgeReceived() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        // Wait and trigger stall confirmation
        try await Task.sleep(nanoseconds: UInt64(2.5 * 1_000_000_000))
        _ = await detector.checkStall(context: context)
        let inConfirmation4 = await detector.isInConfirmationPhase()
        XCTAssertTrue(inConfirmation4)

        // Record nudge received
        let nudgeEvent = SessionEvent(
            sessionId: "test",
            type: .orchestratorNudgeReceived,
            data: .nudgeSent(nudgeId: "nudge-1", content: "test")
        )
        await detector.recordEvent(nudgeEvent)

        // Confirmation should be reset
        let inConfirmation5 = await detector.isInConfirmationPhase()
        XCTAssertFalse(inConfirmation5, "Confirmation should be reset on nudge")
    }

    // MARK: - Signal Checking Tests

    func testAllSignalsReported() async throws {
        let context = createTestContext(startedAt: Date().addingTimeInterval(-5))

        try await Task.sleep(nanoseconds: UInt64(3.5 * 1_000_000_000))

        let status = await detector.checkStall(context: context)

        // Check that all signals are reported
        let signalNames = status.signalsChecked.map { $0.name }
        XCTAssertTrue(signalNames.contains("minimum_duration"))
        XCTAssertTrue(signalNames.contains("inactivity_timer"))
        XCTAssertTrue(signalNames.contains("agents_idle"))
        XCTAssertTrue(signalNames.contains("no_inflight_tools"))
        XCTAssertTrue(signalNames.contains("not_streaming"))
    }

    // MARK: - Helper Methods

    private func createTestContext(startedAt: Date) -> SessionContextSnapshot {
        SessionContextSnapshot(
            sessionId: "test-session",
            farmId: "test-farm",
            farmName: "Test Farm",
            mode: .createFarm,
            engine: "claude",
            startedAt: startedAt,
            status: "running",
            progress: 0.5,
            activeAgentCount: 0,
            idleAgentCount: 0,
            totalAgents: 2,
            tokensUsed: 100,
            estimatedCost: 0.01,
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
    }

    private func createTestEvent(type: SessionEventType) -> SessionEvent {
        SessionEvent(
            sessionId: "test-session",
            type: type,
            data: .agentMessage(role: "assistant", content: "test message")
        )
    }
}
