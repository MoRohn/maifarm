//
//  MaiFarmTests.swift
//  MaiFarmTests
//
//  Created by Rohn Springfield on 12/29/25.
//

import Testing
import Foundation
@testable import MaiFarm

// MARK: - API Configuration Tests
struct APIConfigurationTests {

    @Test func testBaseURLIsValid() async throws {
        let config = APIConfiguration.shared
        #expect(config.baseURL.scheme == "http" || config.baseURL.scheme == "https")
        #expect(config.baseURL.host != nil)
    }

    @Test func testDefaultTimeoutIsReasonable() async throws {
        let config = APIConfiguration.shared
        #expect(config.timeout >= 10)
        #expect(config.timeout <= 120)
    }

    @Test func testRetryCountIsPositive() async throws {
        let config = APIConfiguration.shared
        #expect(config.retryCount > 0)
        #expect(config.retryCount <= 10)
    }

    @Test func testMaxConcurrentRequestsIsValid() async throws {
        let config = APIConfiguration.shared
        #expect(config.maxConcurrentRequests >= 1)
        #expect(config.maxConcurrentRequests <= 20)
    }
}

// MARK: - API Error Tests
struct APIErrorTests {

    @Test func testNetworkUnavailableIsTransient() async throws {
        let error = APIError.networkUnavailable
        #expect(error.isTransient == true)
    }

    @Test func testTimeoutIsTransient() async throws {
        let error = APIError.timeout
        #expect(error.isTransient == true)
    }

    @Test func testUnauthorizedIsNotTransient() async throws {
        let error = APIError.unauthorized
        #expect(error.isTransient == false)
    }

    @Test func testServerError500IsTransient() async throws {
        let error = APIError.serverError(statusCode: 500, message: nil)
        #expect(error.isTransient == true)
    }

    @Test func testServerError429IsTransient() async throws {
        let error = APIError.serverError(statusCode: 429, message: nil)
        #expect(error.isTransient == true)
    }

    @Test func testServerError400IsNotTransient() async throws {
        let error = APIError.serverError(statusCode: 400, message: nil)
        #expect(error.isTransient == false)
    }

    @Test func testRateLimitedIsTransient() async throws {
        let error = APIError.rateLimited(retryAfter: 30)
        #expect(error.isTransient == true)
    }

    @Test func testErrorDescriptionsAreNotEmpty() async throws {
        let errors: [APIError] = [
            .networkUnavailable,
            .timeout,
            .serverError(statusCode: 500, message: "Server error"),
            .decodingFailed(NSError(domain: "", code: 0)),
            .encodingFailed(NSError(domain: "", code: 0)),
            .invalidResponse,
            .unauthorized,
            .rateLimited(retryAfter: 30),
            .cancelled,
            .unknown(NSError(domain: "", code: 0))
        ]

        for error in errors {
            #expect(error.errorDescription != nil)
            #expect(!error.errorDescription!.isEmpty)
        }
    }
}

// MARK: - Farm Model Tests
struct FarmModelTests {

    @Test func testFarmStatusDisplayNames() async throws {
        let statuses: [Farm.FarmStatus] = [.idle, .launching, .running, .active, .completed, .failed, .recovering]

        for status in statuses {
            #expect(!status.displayName.isEmpty)
        }
    }

    @Test func testFarmStatusColors() async throws {
        let statuses: [Farm.FarmStatus] = [.idle, .launching, .running, .active, .completed, .failed, .recovering]

        for status in statuses {
            // All statuses should have a color defined
            let _ = status.color
        }
    }
}

// MARK: - File Handling Tests
struct FileHandlingTests {

    @Test func testStringSanitization() async throws {
        let unsafeFilename = "test/file:name*with<invalid>chars"
        let sanitized = unsafeFilename.sanitizedFilename

        #expect(!sanitized.contains("/"))
        #expect(!sanitized.contains(":"))
        #expect(!sanitized.contains("*"))
        #expect(!sanitized.contains("<"))
        #expect(!sanitized.contains(">"))
    }

    @Test func testFilenameLengthLimit() async throws {
        let veryLongName = String(repeating: "a", count: 200)
        let sanitized = veryLongName.sanitizedFilename

        #expect(sanitized.count <= 100)
    }

    @Test func testWhitespaceTrimmingInFilename() async throws {
        let paddedName = "  test filename  "
        let sanitized = paddedName.sanitizedFilename

        #expect(!sanitized.hasPrefix(" "))
        #expect(!sanitized.hasSuffix(" "))
    }
}

// MARK: - File Handling Error Tests
struct FileHandlingErrorTests {

    @Test func testFileHandlingErrorDescriptions() async throws {
        let errors: [FileHandlingError] = [
            .accessDenied,
            .directoryNotFound,
            .exportFailed("Test reason"),
            .importFailed("Test reason"),
            .invalidFormat,
            .fileTooLarge(100_000_000)
        ]

        for error in errors {
            #expect(error.errorDescription != nil)
            #expect(!error.errorDescription!.isEmpty)
        }
    }

    @Test func testFileTooLargeShowsSize() async throws {
        let error = FileHandlingError.fileTooLarge(50_000_000)
        #expect(error.errorDescription!.contains("50"))
    }
}

// MARK: - Farm Lifecycle State Machine Tests
struct FarmLifecycleStateTests {

    @Test func testIdleCanTransitionToLaunching() async throws {
        #expect(FarmLifecycleState.idle.canTransition(to: .launching) == true)
    }

    @Test func testIdleCannotTransitionToRunning() async throws {
        #expect(FarmLifecycleState.idle.canTransition(to: .running) == false)
    }

    @Test func testLaunchingCanTransitionToRunning() async throws {
        #expect(FarmLifecycleState.launching.canTransition(to: .running) == true)
    }

    @Test func testLaunchingCanTransitionToFailed() async throws {
        #expect(FarmLifecycleState.launching.canTransition(to: .failed) == true)
    }

    @Test func testRunningCanTransitionToHarvesting() async throws {
        #expect(FarmLifecycleState.running.canTransition(to: .harvesting) == true)
    }

    @Test func testRunningCanTransitionToPaused() async throws {
        #expect(FarmLifecycleState.running.canTransition(to: .paused) == true)
    }

    @Test func testFailedCanTransitionToRecovering() async throws {
        #expect(FarmLifecycleState.failed.canTransition(to: .recovering) == true)
    }

    @Test func testCompletedCanTransitionToIdle() async throws {
        #expect(FarmLifecycleState.completed.canTransition(to: .idle) == true)
    }

    @Test func testAllStatesHaveTransitions() async throws {
        for state in FarmLifecycleState.allCases {
            // Every state should have at least one valid transition
            #expect(!state.canTransitionTo.isEmpty)
        }
    }
}

// MARK: - Background Task Tests
struct BackgroundTaskTests {

    @Test func testBackgroundTaskIdentifiersAreUnique() async throws {
        let identifiers: [BackgroundTaskIdentifier] = [
            .farmSync,
            .harvestCheck,
            .cleanupCache,
            .offlineQueueSync
        ]

        let rawValues = identifiers.map { $0.rawValue }
        let uniqueValues = Set(rawValues)

        #expect(rawValues.count == uniqueValues.count)
    }

    @Test func testRefreshIntervalsArePositive() async throws {
        let identifiers: [BackgroundTaskIdentifier] = [
            .farmSync,
            .harvestCheck,
            .cleanupCache,
            .offlineQueueSync
        ]

        for identifier in identifiers {
            #expect(identifier.refreshInterval > 0)
        }
    }

    @Test func testCleanupCacheHasLongestInterval() async throws {
        let identifiers: [BackgroundTaskIdentifier] = [
            .farmSync,
            .harvestCheck,
            .cleanupCache,
            .offlineQueueSync
        ]

        let maxInterval = identifiers.map { $0.refreshInterval }.max()!
        #expect(BackgroundTaskIdentifier.cleanupCache.refreshInterval == maxInterval)
    }
}

// MARK: - Request Cache Tests
struct RequestCacheTests {

    @Test func testCachedResponseValidity() async throws {
        // Test that cache validity works correctly
        let validResponse = RequestCache.CachedResponse(
            data: Data(),
            timestamp: Date(),
            ttl: 300
        )
        #expect(validResponse.isValid == true)
    }

    @Test func testExpiredCachedResponse() async throws {
        // Test that expired cache is invalid
        let expiredResponse = RequestCache.CachedResponse(
            data: Data(),
            timestamp: Date(timeIntervalSinceNow: -400), // 400 seconds ago
            ttl: 300 // 5 minute TTL
        )
        #expect(expiredResponse.isValid == false)
    }
}

// MARK: - Create Farm Request Tests
struct CreateFarmRequestTests {

    @Test func testDefaultProviderIsClaude() async throws {
        let request = CreateFarmRequest(
            name: "Test Farm",
            agentCount: 3,
            duration: 60
        )
        #expect(request.provider == "claude")
    }

    @Test func testCreateFarmRequestEncoding() async throws {
        let request = CreateFarmRequest(
            name: "Test Farm",
            agentCount: 3,
            duration: 60,
            provider: "openai",
            goal: "Test goal"
        )

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)

        #expect(data.count > 0)

        // Verify it can be decoded back
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let decoded = try decoder.decode(CreateFarmRequest.self, from: data)

        #expect(decoded.name == request.name)
        #expect(decoded.agentCount == request.agentCount)
        #expect(decoded.duration == request.duration)
        #expect(decoded.provider == request.provider)
        #expect(decoded.goal == request.goal)
    }
}

// MARK: - Dashboard Stats Tests
struct DashboardStatsTests {

    @Test func testEmptyDashboardStats() async throws {
        let empty = DashboardStats.empty

        #expect(empty.tasksCompleted == 0)
        #expect(empty.farmsCreated == 0)
        #expect(empty.successRate == 0)
        #expect(empty.timeSaved == 0)
        #expect(empty.totalCost == 0)
        #expect(empty.harvestsCollected == 0)
    }
}

// MARK: - Farmer Group Model Tests
struct FarmerGroupTests {

    @Test func testFarmerGroupDecoding() async throws {
        let json = """
        {
            "id": "test-id",
            "name": "Test Group",
            "slug": "test-group",
            "description": "A test group",
            "icon": "🌾",
            "farmer_count": 5,
            "is_active": true
        }
        """

        let decoder = JSONDecoder()
        let data = json.data(using: .utf8)!
        let group = try decoder.decode(FarmerGroup.self, from: data)

        #expect(group.id == "test-id")
        #expect(group.name == "Test Group")
        #expect(group.slug == "test-group")
        #expect(group.description == "A test group")
        #expect(group.icon == "🌾")
        #expect(group.farmerCount == 5)
        #expect(group.isActive == true)
    }

    @Test func testFarmerGroupDefaultValues() async throws {
        let json = """
        {
            "id": "test-id",
            "name": "Test Group",
            "slug": "test-group"
        }
        """

        let decoder = JSONDecoder()
        let data = json.data(using: .utf8)!
        let group = try decoder.decode(FarmerGroup.self, from: data)

        #expect(group.icon == "🌾") // Default icon
        #expect(group.farmerCount == 0) // Default count
        #expect(group.isActive == true) // Default active state
    }
}

// MARK: - Farmer Template Tests
struct FarmerTemplateTests {

    @Test func testFarmerTemplateDefaultValues() async throws {
        let json = """
        {
            "id": "farmer-1",
            "name": "Test Farmer"
        }
        """

        let decoder = JSONDecoder()
        let data = json.data(using: .utf8)!
        let farmer = try decoder.decode(FarmerTemplate.self, from: data)

        #expect(farmer.id == "farmer-1")
        #expect(farmer.name == "Test Farmer")
        #expect(farmer.icon == "🌾") // Default icon
        #expect(farmer.specialties.isEmpty)
        #expect(farmer.defaultAgentCount == 3) // Default
        #expect(farmer.defaultDuration == 60) // Default
        #expect(farmer.capabilities.isEmpty)
        #expect(farmer.isFavorite == false)
        #expect(farmer.usageCount == 0)
        #expect(farmer.totalRatings == 0)
    }
}
