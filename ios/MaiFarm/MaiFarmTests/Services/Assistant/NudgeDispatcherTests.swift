//
//  NudgeDispatcherTests.swift
//  MaiFarmTests
//
//  Unit tests for NudgeDispatcher retry logic and cancellation
//

import XCTest
@testable import MaiFarm

final class NudgeDispatcherTests: XCTestCase {

    var dispatcher: NudgeDispatcher!
    var testConfig: NudgeDispatcherConfig!

    override func setUp() async throws {
        // Use shorter delays for testing
        testConfig = NudgeDispatcherConfig(
            retryDelay1: 0.5,           // 0.5 seconds
            retryDelay2: 1.0,           // 1 second
            maxNudgesPerEpisode: 2,
            minTimeBetweenEpisodes: 1.0 // 1 second
        )
        dispatcher = NudgeDispatcher(sessionId: "test-session", config: testConfig)
    }

    override func tearDown() async throws {
        await dispatcher.reset()
        dispatcher = nil
    }

    // MARK: - Basic Nudge Sending Tests

    func testSendNudge() async throws {
        let isAwaitingBefore = await dispatcher.isAwaitingResponse
        XCTAssertFalse(isAwaitingBefore, "Should not be awaiting before send")

        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test stall")

        let isAwaitingAfter = await dispatcher.isAwaitingResponse
        XCTAssertTrue(isAwaitingAfter, "Should be awaiting after send")

        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .awaitingResponse)
        XCTAssertEqual(status.nudgesSent, 1)
    }

    func testNudgeHistory() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let history = await dispatcher.getHistory()

        XCTAssertEqual(history.count, 1)
        XCTAssertEqual(history.first?.sessionId, "test-session")
        XCTAssertEqual(history.first?.attemptNumber, 1)
        XCTAssertFalse(history.first?.acknowledged ?? true)
    }

    // MARK: - Max Nudges Per Episode Tests

    func testMaxNudgesPerEpisode() async throws {
        // Send first nudge
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "first")

        // Wait for retry
        try await Task.sleep(nanoseconds: UInt64(0.6 * 1_000_000_000))

        // Should have sent follow-up
        let status1 = await dispatcher.getStatus()
        // Note: The automatic retry will have fired

        // Try to send another - should be blocked by max
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "third")

        let history = await dispatcher.getHistory()
        XCTAssertLessThanOrEqual(history.count, testConfig.maxNudgesPerEpisode)
    }

    // MARK: - Activity Cancellation Tests

    func testActivityCancelsRetries() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let isAwaitingBefore = await dispatcher.isAwaitingResponse
        XCTAssertTrue(isAwaitingBefore)

        // Simulate activity detected
        await dispatcher.onActivityDetected()

        let isAwaitingAfter = await dispatcher.isAwaitingResponse
        XCTAssertFalse(isAwaitingAfter, "Should stop awaiting on activity")

        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .cooldown)
    }

    func testActivityResetsCounts() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        // Wait briefly then trigger activity
        try await Task.sleep(nanoseconds: 200_000_000)
        await dispatcher.onActivityDetected()

        // Should be in cooldown now
        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.nudgesSent, 0, "Nudge count should reset after activity")
    }

    // MARK: - Acknowledgment Tests

    func testNudgeAcknowledgment() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let history1 = await dispatcher.getHistory()
        let nudgeId = history1.first!.id

        await dispatcher.onNudgeAcknowledged(nudgeId: nudgeId, response: "acknowledged")

        let isAwaiting = await dispatcher.isAwaitingResponse
        XCTAssertFalse(isAwaiting)

        let history2 = await dispatcher.getHistory()
        XCTAssertTrue(history2.first?.acknowledged ?? false)
    }

    func testAckCancelsRetries() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let history = await dispatcher.getHistory()
        let nudgeId = history.first!.id

        // Acknowledge before retry fires
        await dispatcher.onNudgeAcknowledged(nudgeId: nudgeId)

        // Wait past retry delay
        try await Task.sleep(nanoseconds: UInt64(0.6 * 1_000_000_000))

        // Should still only have 1 nudge
        let finalHistory = await dispatcher.getHistory()
        XCTAssertEqual(finalHistory.count, 1, "Ack should cancel retry")
    }

    // MARK: - Cooldown Tests

    func testCooldownBetweenEpisodes() async throws {
        // First episode
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "first")
        await dispatcher.onActivityDetected() // End episode

        // Immediately try another nudge
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "second")

        // Should be blocked by cooldown
        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .cooldown)
        XCTAssertEqual(status.nudgesSent, 0, "Should not have sent during cooldown")
    }

    func testCooldownExpires() async throws {
        // First episode
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "first")
        await dispatcher.onActivityDetected()

        // Wait for cooldown to expire
        try await Task.sleep(nanoseconds: UInt64(1.1 * 1_000_000_000))

        // Should be able to send now
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "new episode")

        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .awaitingResponse)
        XCTAssertEqual(status.nudgesSent, 1)
    }

    // MARK: - Status Tests

    func testIdleStatus() async throws {
        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .idle)
        XCTAssertNil(status.currentEpisodeId)
        XCTAssertEqual(status.nudgesSent, 0)
    }

    func testAwaitingResponseStatus() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .awaitingResponse)
        XCTAssertNotNil(status.currentEpisodeId)
        XCTAssertNotNil(status.lastNudgeTime)
        XCTAssertNotNil(status.awaitingResponseSince)
    }

    // MARK: - Reset Tests

    func testReset() async throws {
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "test")

        let isAwaitingBefore = await dispatcher.isAwaitingResponse
        XCTAssertTrue(isAwaitingBefore)

        await dispatcher.reset()

        let isAwaitingAfter = await dispatcher.isAwaitingResponse
        XCTAssertFalse(isAwaitingAfter)

        let status = await dispatcher.getStatus()
        XCTAssertEqual(status.state, .idle)
        XCTAssertNil(status.currentEpisodeId)
        XCTAssertEqual(status.nudgesSent, 0)

        let history = await dispatcher.getHistory()
        XCTAssertTrue(history.isEmpty)
    }

    // MARK: - Nudge Message Tests

    func testNudgeMessageFormat() async throws {
        await dispatcher.sendNudge(summaryPath: "/sessions/abc/ASSISTANT.md", reason: nil)

        let history = await dispatcher.getHistory()
        XCTAssertEqual(history.count, 1)
        XCTAssertTrue(history.first?.summaryPath.contains("ASSISTANT.md") ?? false)
    }

    // MARK: - Episode ID Tests

    func testEpisodeIdUniqueness() async throws {
        // First episode
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "first")
        let status1 = await dispatcher.getStatus()
        let episodeId1 = status1.currentEpisodeId

        await dispatcher.onActivityDetected()

        // Wait for cooldown
        try await Task.sleep(nanoseconds: UInt64(1.1 * 1_000_000_000))

        // Second episode
        await dispatcher.sendNudge(summaryPath: "/test/path", reason: "second")
        let status2 = await dispatcher.getStatus()
        let episodeId2 = status2.currentEpisodeId

        XCTAssertNotEqual(episodeId1, episodeId2, "Episodes should have unique IDs")
    }

    // MARK: - Concurrent Safety Tests

    func testConcurrentNudges() async throws {
        // Send multiple nudges concurrently
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<5 {
                group.addTask {
                    await self.dispatcher.sendNudge(summaryPath: "/test/path", reason: "concurrent")
                }
            }
        }

        // Should only have max nudges per episode
        let history = await dispatcher.getHistory()
        XCTAssertLessThanOrEqual(history.count, testConfig.maxNudgesPerEpisode)
    }
}
