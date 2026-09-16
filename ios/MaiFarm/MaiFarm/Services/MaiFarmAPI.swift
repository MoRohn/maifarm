//
//  MaiFarmAPI.swift
//  MaiFarm
//
//  Production-grade API service with Swift concurrency, caching, and retry policies
//

import Foundation
import os.log
import Security
import SwiftUI
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif

// MARK: - API Configuration
struct APIConfiguration: @unchecked Sendable {
    nonisolated(unsafe) static var shared = APIConfiguration()

    #if DEBUG
    // Safe initialization - these URLs are guaranteed to be valid
    var baseURL: URL = {
        guard let url = URL(string: "http://localhost:4567/api") else {
            fatalError("Invalid development API URL - this should never happen")
        }
        return url
    }()
    #else
    var baseURL: URL = {
        guard let url = URL(string: "https://api.maifarm.app/api") else {
            fatalError("Invalid production API URL - this should never happen")
        }
        return url
    }()
    #endif

    var timeout: TimeInterval = 30
    var retryCount: Int = 3
    var retryDelay: TimeInterval = 1.0

    // Device-based throttling (default: standard tier)
    var maxConcurrentRequests: Int = 3

    @MainActor
    mutating func configureForDevice() {
        switch DeviceCapabilityManager.shared.computeTier {
        case .limited: maxConcurrentRequests = 2
        case .standard: maxConcurrentRequests = 3
        case .performance: maxConcurrentRequests = 5
        case .workstation: maxConcurrentRequests = 10
        }
    }
}

// MARK: - API Error Types
enum APIError: Error, LocalizedError {
    case networkUnavailable
    case timeout
    case serverError(statusCode: Int, message: String?)
    case decodingFailed(Error)
    case encodingFailed(Error)
    case invalidResponse
    case unauthorized
    case rateLimited(retryAfter: TimeInterval?)
    case cancelled
    case unknown(Error)

    var isTransient: Bool {
        switch self {
        case .networkUnavailable, .timeout:
            return true
        case .serverError(let code, _):
            return code >= 500 || code == 429
        case .rateLimited:
            return true
        default:
            return false
        }
    }

    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "No internet connection. Your changes will sync when back online."
        case .timeout:
            return "Request timed out. Please try again."
        case .serverError(_, let message):
            return message ?? "Server error. Please try again later."
        case .decodingFailed:
            return "Failed to process server response."
        case .encodingFailed:
            return "Failed to prepare request."
        case .invalidResponse:
            return "Invalid response from server."
        case .unauthorized:
            return "Session expired. Please sign in again."
        case .rateLimited(let retryAfter):
            if let delay = retryAfter {
                return "Too many requests. Please wait \(Int(delay)) seconds."
            }
            return "Too many requests. Please wait a moment."
        case .cancelled:
            return "Request was cancelled."
        case .unknown:
            return "An unexpected error occurred."
        }
    }
}

// MARK: - Request Cache
actor RequestCache {
    static let shared = RequestCache()

    private var cache: [String: CachedResponse] = [:]
    private let maxCacheSize = 100
    private let defaultTTL: TimeInterval = 300 // 5 minutes

    struct CachedResponse {
        let data: Data
        let timestamp: Date
        let ttl: TimeInterval

        var isValid: Bool {
            Date().timeIntervalSince(timestamp) < ttl
        }
    }

    func get(for key: String) -> Data? {
        guard let cached = cache[key], cached.isValid else {
            cache.removeValue(forKey: key)
            return nil
        }
        return cached.data
    }

    func set(_ data: Data, for key: String, ttl: TimeInterval? = nil) {
        // Evict old entries if cache is full
        if cache.count >= maxCacheSize {
            let sortedKeys = cache.sorted { $0.value.timestamp < $1.value.timestamp }
            for (key, _) in sortedKeys.prefix(maxCacheSize / 4) {
                cache.removeValue(forKey: key)
            }
        }

        cache[key] = CachedResponse(
            data: data,
            timestamp: Date(),
            ttl: ttl ?? defaultTTL
        )
    }

    func invalidate(matching pattern: String) {
        for key in cache.keys where key.contains(pattern) {
            cache.removeValue(forKey: key)
        }
    }

    func clear() {
        cache.removeAll()
    }
}

// MARK: - Request Throttler
actor RequestThrottler {
    static let shared = RequestThrottler()

    private var activeRequests = 0
    private var waitingContinuations: [CheckedContinuation<Void, Never>] = []

    private var maxConcurrent: Int {
        APIConfiguration.shared.maxConcurrentRequests
    }

    func acquire() async {
        if activeRequests < maxConcurrent {
            activeRequests += 1
            return
        }

        await withCheckedContinuation { continuation in
            waitingContinuations.append(continuation)
        }
        activeRequests += 1
    }

    func release() {
        activeRequests -= 1
        if !waitingContinuations.isEmpty {
            let continuation = waitingContinuations.removeFirst()
            continuation.resume()
        }
    }
}

// MARK: - Network Monitor
// NetworkMonitor is now defined in Core/EnhancedNetworkMonitor.swift
// with enhanced connectivity tracking, offline queue, and quality assessment

// MARK: - Main API Service
actor MaiFarmAPI {
    static let shared = MaiFarmAPI()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let logger = Logger(subsystem: "app.maifarm", category: "API")

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = APIConfiguration.shared.timeout
        config.waitsForConnectivity = true
        config.httpAdditionalHeaders = [
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Client-Platform": "iOS",
            "X-Client-Version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        ]

        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    // MARK: - API Response Wrappers

    /// Standard API response wrapper for endpoints that return { success: true, data: T }
    private struct APIResponse<T: Decodable>: Decodable {
        let success: Bool
        let data: T
    }

    /// Alternative response wrapper for error responses
    private struct APIErrorResponse: Decodable {
        let success: Bool
        let error: APIErrorDetail?

        struct APIErrorDetail: Decodable {
            let code: String?
            let message: String?
        }
    }

    // MARK: - Request Methods

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil, cacheTTL: TimeInterval? = 300) async throws -> T {
        let cacheKey = "GET:\(path):\(queryItems?.description ?? "")"

        // Check cache first
        if let cachedData = await RequestCache.shared.get(for: cacheKey) {
            logger.debug("Cache hit for \(path)")
            // Try unwrapped response first, then direct decode
            if let wrapped = try? decoder.decode(APIResponse<T>.self, from: cachedData) {
                return wrapped.data
            }
            return try decoder.decode(T.self, from: cachedData)
        }

        let request = try await buildRequest(method: "GET", path: path, queryItems: queryItems)
        let data = try await performRequest(request)

        // Cache successful response
        if let ttl = cacheTTL {
            await RequestCache.shared.set(data, for: cacheKey, ttl: ttl)
        }

        // Try to decode as wrapped response first ({"success": true, "data": T})
        // This handles endpoints that return wrapped responses
        if let wrapped = try? decoder.decode(APIResponse<T>.self, from: data) {
            return wrapped.data
        }

        // Fall back to direct decode for endpoints that return T directly
        return try decoder.decode(T.self, from: data)
    }

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let request = try await buildRequest(method: "POST", path: path, body: body)
        let data = try await performRequest(request)

        // Invalidate related cache
        await RequestCache.shared.invalidate(matching: path.components(separatedBy: "/").first ?? path)

        // Try to decode as wrapped response first ({"success": true, "data": T})
        if let wrapped = try? decoder.decode(APIResponse<T>.self, from: data) {
            return wrapped.data
        }

        // Fall back to direct decode
        return try decoder.decode(T.self, from: data)
    }

    func post<B: Encodable>(_ path: String, body: B) async throws {
        let request = try await buildRequest(method: "POST", path: path, body: body)
        _ = try await performRequest(request)

        // Invalidate related cache
        await RequestCache.shared.invalidate(matching: path.components(separatedBy: "/").first ?? path)
    }

    func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let request = try await buildRequest(method: "PUT", path: path, body: body)
        let data = try await performRequest(request)
        await RequestCache.shared.invalidate(matching: path)
        return try decoder.decode(T.self, from: data)
    }

    func delete(_ path: String) async throws {
        let request = try await buildRequest(method: "DELETE", path: path)
        _ = try await performRequest(request)
        await RequestCache.shared.invalidate(matching: path)
    }

    // MARK: - Request Building

    private func buildRequest<B: Encodable>(method: String, path: String, queryItems: [URLQueryItem]? = nil, body: B? = nil) async throws -> URLRequest {
        guard var components = URLComponents(url: APIConfiguration.shared.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true) else {
            throw APIError.unknown(URLError(.badURL))
        }
        components.queryItems = queryItems

        guard let url = components.url else {
            throw APIError.unknown(URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.httpMethod = method

        if let body = body {
            do {
                request.httpBody = try encoder.encode(body)
            } catch {
                throw APIError.encodingFailed(error)
            }
        }

        // Add auth token if available
        if let token = await AuthTokenManager.shared.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    private func buildRequest(method: String, path: String, queryItems: [URLQueryItem]? = nil) async throws -> URLRequest {
        try await buildRequest(method: method, path: path, queryItems: queryItems, body: Optional<EmptyBody>.none)
    }

    // MARK: - Request Execution with Retry

    private func performRequest(_ request: URLRequest, retryCount: Int = 0) async throws -> Data {
        // Throttle concurrent requests
        await RequestThrottler.shared.acquire()
        defer { Task { await RequestThrottler.shared.release() } }

        // Check network availability
        let isConnected = await MainActor.run { NetworkMonitor.shared.isConnected }
        guard isConnected else {
            throw APIError.networkUnavailable
        }

        logger.info("Requesting: \(request.httpMethod ?? "GET") \(request.url?.path ?? "")")

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            logger.info("Response: \(httpResponse.statusCode) for \(request.url?.path ?? "")")

            switch httpResponse.statusCode {
            case 200...299:
                return data
            case 401:
                throw APIError.unauthorized
            case 429:
                let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After").flatMap { TimeInterval($0) }
                throw APIError.rateLimited(retryAfter: retryAfter)
            case 400...499:
                let message = try? decoder.decode(ErrorResponse.self, from: data).message
                throw APIError.serverError(statusCode: httpResponse.statusCode, message: message)
            case 500...599:
                let message = try? decoder.decode(ErrorResponse.self, from: data).message
                throw APIError.serverError(statusCode: httpResponse.statusCode, message: message)
            default:
                throw APIError.invalidResponse
            }
        } catch let error as APIError {
            // Retry transient errors
            if error.isTransient && retryCount < APIConfiguration.shared.retryCount {
                let delay = APIConfiguration.shared.retryDelay * pow(2, Double(retryCount))
                logger.warning("Retrying request after \(delay)s (attempt \(retryCount + 1))")
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                return try await performRequest(request, retryCount: retryCount + 1)
            }
            throw error
        } catch is CancellationError {
            throw APIError.cancelled
        } catch let error as URLError where error.code == .timedOut {
            if retryCount < APIConfiguration.shared.retryCount {
                logger.warning("Request timed out, retrying...")
                return try await performRequest(request, retryCount: retryCount + 1)
            }
            throw APIError.timeout
        } catch let error as URLError where error.code == .notConnectedToInternet {
            throw APIError.networkUnavailable
        } catch {
            throw APIError.unknown(error)
        }
    }
}

// MARK: - Supporting Types

struct EmptyBody: Encodable {}

private struct ErrorResponse: Decodable {
    let message: String?
    let error: String?
}

// MARK: - Auth Token Manager
actor AuthTokenManager {
    static let shared = AuthTokenManager()

    private var token: String?
    private var refreshTask: Task<String, Error>?

    func getToken() async -> String? {
        if let token = token {
            return token
        }

        // Try to load from keychain
        token = loadTokenFromKeychain()
        return token
    }

    func setToken(_ newToken: String) {
        token = newToken
        saveTokenToKeychain(newToken)
    }

    func clearToken() {
        token = nil
        removeTokenFromKeychain()
    }

    private func loadTokenFromKeychain() -> String? {
        // Keychain implementation
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.maifarm.auth",
            kSecAttrAccount as String: "authToken",
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }

        return token
    }

    private func saveTokenToKeychain(_ token: String) {
        guard let data = token.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.maifarm.auth",
            kSecAttrAccount as String: "authToken",
            kSecValueData as String: data
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func removeTokenFromKeychain() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.maifarm.auth",
            kSecAttrAccount as String: "authToken"
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - API Response Models

struct Farm: Codable, Identifiable {
    let id: String
    let name: String
    let status: FarmStatus
    let agents: [Agent]
    let createdAt: Date
    let updatedAt: Date
    let progress: Double?
    let duration: Int // hours
    let provider: String

    enum FarmStatus: String, Codable {
        case idle
        case launching
        case running
        case active
        case completed
        case failed
        case recovering

        var displayName: String {
            switch self {
            case .idle: return "Idle"
            case .launching: return "Launching"
            case .running: return "Running"
            case .active: return "Active"
            case .completed: return "Completed"
            case .failed: return "Failed"
            case .recovering: return "Recovering"
            }
        }

        var color: Color {
            switch self {
            case .idle: return .gray
            case .launching: return .orange
            case .running: return Color(red: 0.02, green: 0.59, blue: 0.41) // primaryGreen
            case .active: return .blue
            case .completed: return .green
            case .failed: return .red
            case .recovering: return .yellow
            }
        }
    }
}

struct Agent: Codable, Identifiable {
    let id: String
    let name: String
    let role: String
    let status: AgentStatus
    let currentTask: String?

    enum AgentStatus: String, Codable {
        case idle
        case running
        case waiting
        case completed
        case failed
    }
}

struct Harvest: Codable, Identifiable {
    let id: String
    let farmId: String
    let farmName: String
    let status: HarvestStatus
    let files: [HarvestFile]
    let createdAt: Date
    let completedAt: Date?

    enum HarvestStatus: String, Codable {
        case pending
        case inProgress = "in_progress"
        case completed
        case failed
    }
}

struct HarvestFile: Codable, Identifiable {
    let id: String
    let name: String
    let path: String
    let size: Int
    let type: String
}

struct QuickTaskRequest: Codable {
    let description: String
    let provider: String
}

struct QuickTaskResponse: Codable {
    let id: String
    let status: String
    let result: String?
}

struct CreateFarmRequest: Codable {
    let name: String
    let agentCount: Int
    let duration: Int
    let provider: String
    let description: String?  // Required by backend - maps from goal
    let prompt: String?       // Alternative to description
    let goal: String?         // Legacy field, maps to description
    let farmerTemplateId: String?
    let executionDeviceId: String?

    init(
        name: String,
        agentCount: Int,
        duration: Int,
        provider: String = "claude",
        goal: String? = nil,
        taskDescription: String? = nil,
        farmerTemplateId: String? = nil,
        executionDeviceId: String? = nil
    ) {
        self.name = name
        self.agentCount = agentCount
        self.duration = duration
        self.provider = provider
        // Backend requires 'description' or 'prompt' - use goal/taskDescription as description
        self.description = goal ?? taskDescription
        self.prompt = goal ?? taskDescription
        self.goal = goal
        self.farmerTemplateId = farmerTemplateId
        self.executionDeviceId = executionDeviceId
    }

    enum CodingKeys: String, CodingKey {
        case name, agentCount, duration, provider, description, prompt, goal
        case farmerTemplateId = "farmer_template_id"
        case executionDeviceId = "execution_device_id"
    }
}

struct FarmMetrics: Codable {
    let farmId: String
    let tokensUsed: Int
    let estimatedCost: Double
    let tasksCompleted: Int
    let filesGenerated: Int
    let progress: Double
    let status: String
    let activeAgents: Int
    let estimatedTimeRemaining: TimeInterval?
}

// MARK: - Analytics Response Types

struct AnalyticsResponse: Codable {
    let success: Bool
    let data: AnalyticsData
}

struct AnalyticsData: Codable {
    let taskCompletion: TaskCompletionMetrics
    let harvestAnalytics: HarvestAnalytics
    let claudeCosts: ClaudeCosts
    let agentEfficiency: [AgentEfficiencyMetrics]?
    let timestamp: String?

    enum CodingKeys: String, CodingKey {
        case taskCompletion
        case harvestAnalytics
        case claudeCosts
        case agentEfficiency
        case timestamp
    }
}

struct TaskCompletionMetrics: Codable {
    let totalTasks: Int
    let completedTasks: Int
    let failedTasks: Int
    let pendingTasks: Int
    let averageCompletionTime: Double
    let completionRate: Double
}

struct HarvestAnalytics: Codable {
    let totalHarvests: Int
    let averageYield: Double
    let totalYield: Double
    let successRate: Double
}

struct ClaudeCosts: Codable {
    let totalCost: Double
    let costBreakdown: CostBreakdown?

    struct CostBreakdown: Codable {
        let api: Double?
        let compute: Double?
        let storage: Double?
        let network: Double?
    }
}

struct AgentEfficiencyMetrics: Codable {
    let agentId: String
    let agentName: String
    let tasksCompleted: Int
    let tasksTotal: Int
    let successRate: Double
    let averageResponseTime: Double
    let errorRate: Double
    let costPerTask: Double
    let efficiency: Double
}

// Combined dashboard statistics
struct DashboardStats {
    var tasksCompleted: Int = 0
    var farmsCreated: Int = 0
    var successRate: Double = 0
    var timeSaved: TimeInterval = 0
    var totalCost: Double = 0
    var harvestsCollected: Int = 0

    static var empty: DashboardStats { DashboardStats() }
}

// MARK: - Auth Manager (Simple Token Storage)

actor AuthManager {
    static let shared = AuthManager()

    private let keychain = KeychainHelper.shared

    var currentToken: String? {
        get async {
            keychain.read(key: "auth_token")
        }
    }

    func setToken(_ token: String) async {
        keychain.save(token, key: "auth_token")
    }

    func clearToken() async {
        keychain.delete(key: "auth_token")
    }
}

// Simple Keychain Helper
final class KeychainHelper: @unchecked Sendable {
    static let shared = KeychainHelper()

    func save(_ value: String, key: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - API Extensions for Specific Endpoints

extension MaiFarmAPI {

    // Farms
    func getFarms() async throws -> [Farm] {
        try await get("/farms", cacheTTL: 60)
    }

    func getFarm(_ id: String) async throws -> Farm {
        try await get("/farms/\(id)", cacheTTL: 30)
    }

    func createFarm(_ request: CreateFarmRequest) async throws -> Farm {
        try await post("/farms", body: request)
    }

    func stopFarm(_ id: String) async throws {
        try await post("/farms/\(id)/stop", body: EmptyBody())
    }

    func recoverFarm(_ id: String) async throws -> Farm {
        try await post("/farms/\(id)/recover", body: EmptyBody())
    }

    func deleteFarm(_ id: String) async throws {
        try await delete("/farms/\(id)")
    }

    func deleteAllFarms() async throws {
        let farms = try await getFarms()
        for farm in farms {
            try await delete("/farms/\(farm.id)")
        }
        await RequestCache.shared.invalidate(matching: "farms")
    }

    func getFarmAgents(_ farmId: String) async throws -> [Agent] {
        try await get("/farms/\(farmId)/agents", cacheTTL: 10)
    }

    func getFarmMetrics(_ farmId: String) async throws -> FarmMetrics {
        try await get("/farms/\(farmId)/metrics", cacheTTL: 5)
    }

    // WebSocket / Streaming
    func getWebSocketURL(for farmId: String) async throws -> URL {
        #if DEBUG
        let wsBase = "ws://localhost:4567"
        #else
        let wsBase = "wss://api.maifarm.app"
        #endif

        guard let token = await AuthManager.shared.currentToken else {
            throw APIError.unauthorized
        }

        guard let url = URL(string: "\(wsBase)/ws/farms/\(farmId)?token=\(token)") else {
            throw APIError.invalidResponse
        }

        return url
    }

    func getTerminalStream(_ farmId: String, agentId: String) async throws -> URL {
        #if DEBUG
        let wsBase = "ws://localhost:4567"
        #else
        let wsBase = "wss://api.maifarm.app"
        #endif

        guard let token = await AuthManager.shared.currentToken else {
            throw APIError.unauthorized
        }

        guard let url = URL(string: "\(wsBase)/ws/terminal/\(farmId)/\(agentId)?token=\(token)") else {
            throw APIError.invalidResponse
        }

        return url
    }

    // Harvests
    func getHarvests() async throws -> [Harvest] {
        try await get("/barn/items", cacheTTL: 120)
    }

    func getHarvest(_ id: String) async throws -> Harvest {
        try await get("/barn/items/\(id)", cacheTTL: 60)
    }

    func deleteHarvest(_ id: String) async throws {
        try await delete("/barn/items/\(id)")
    }

    func deleteAllHarvests() async throws {
        let harvests = try await getHarvests()
        for harvest in harvests {
            try await delete("/barn/items/\(harvest.id)")
        }
        await RequestCache.shared.invalidate(matching: "barn")
    }

    // Quick Tasks
    func startQuickTask(_ request: QuickTaskRequest) async throws -> QuickTaskResponse {
        try await post("/quick-actions/execute", body: request)
    }

    func getQuickTaskStatus(_ id: String) async throws -> QuickTaskResponse {
        try await get("/quick-actions/\(id)", cacheTTL: 10)
    }

    // Health
    func checkHealth() async throws -> Bool {
        struct HealthResponse: Decodable {
            let status: String
        }
        let response: HealthResponse = try await get("/health", cacheTTL: 30)
        return response.status == "ok" || response.status == "healthy"
    }

    // Analytics
    func getAnalytics(timeRange: String = "24h") async throws -> AnalyticsResponse {
        try await get("/analytics/metrics", queryItems: [URLQueryItem(name: "timeRange", value: timeRange)], cacheTTL: 60)
    }

    func getDashboardStats() async throws -> DashboardStats {
        // Fetch analytics and farms count in parallel
        async let analyticsTask = getAnalytics()
        async let farmsTask = getFarms()

        do {
            let analytics = try await analyticsTask
            let farms = try await farmsTask

            let data = analytics.data
            let avgCompletionTime = data.taskCompletion.averageCompletionTime

            // Calculate time saved (assume 5x faster than manual work)
            let timeSavedSeconds = avgCompletionTime * Double(data.taskCompletion.completedTasks) * 4

            return DashboardStats(
                tasksCompleted: data.taskCompletion.completedTasks,
                farmsCreated: farms.count,
                successRate: data.taskCompletion.completionRate,
                timeSaved: timeSavedSeconds / 3600, // Convert to hours
                totalCost: data.claudeCosts.totalCost,
                harvestsCollected: data.harvestAnalytics.totalHarvests
            )
        } catch {
            // Return empty stats if API fails
            return DashboardStats.empty
        }
    }

    // MARK: - Farmer Groups API

    func getFarmerGroups() async throws -> [FarmerGroup] {
        try await get("/farmer-groups", cacheTTL: 300)
    }

    func getFarmerGroup(_ groupId: String) async throws -> FarmerGroupDetail {
        try await get("/farmer-groups/\(groupId)", cacheTTL: 300)
    }

    func getFarmersInGroup(_ groupId: String) async throws -> [FarmerTemplate] {
        try await get("/farmer-groups/\(groupId)/farmers", cacheTTL: 300)
    }

    func getAllFarmers() async throws -> [FarmerTemplate] {
        try await get("/farmers", cacheTTL: 300)
    }

    func getFarmer(_ farmerId: String) async throws -> FarmerTemplate {
        try await get("/farmers/\(farmerId)", cacheTTL: 300)
    }

    func getFarmerStats(_ farmerId: String) async throws -> FarmerStats {
        try await get("/farmers/\(farmerId)/stats", cacheTTL: 60)
    }

    func addFarmerRating(_ farmerId: String, rating: Int, farmId: String? = nil, review: String? = nil) async throws {
        let ratingRequest = FarmerRatingRequest(rating: rating, farmId: farmId, review: review)
        let _: EmptyResponse = try await post("/farmers/\(farmerId)/ratings", body: ratingRequest)
    }

    func toggleFarmerFavorite(_ farmerId: String) async throws -> FavoriteResponse {
        let emptyRequest = EmptyRequest()
        return try await post("/farmers/\(farmerId)/favorite", body: emptyRequest)
    }

    func getFavoriteFarmers() async throws -> [FarmerTemplate] {
        try await get("/farmers/favorites", cacheTTL: 60)
    }

    func getRecentFarmers() async throws -> [FarmerTemplate] {
        try await get("/farmers/recent", cacheTTL: 60)
    }
}

// MARK: - Farmer Models

struct FarmerGroup: Codable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let description: String?
    let icon: String
    let color: String?
    let farmerCount: Int
    let isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, slug, description, icon, color
        case farmerCount = "farmer_count"
        case isActive = "is_active"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        slug = try container.decode(String.self, forKey: .slug)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? "🌾"
        color = try container.decodeIfPresent(String.self, forKey: .color)
        farmerCount = try container.decodeIfPresent(Int.self, forKey: .farmerCount) ?? 0
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
    }
}

struct FarmerGroupDetail: Codable {
    let group: FarmerGroup
    let farmers: [FarmerTemplate]
}

struct FarmerTemplate: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let icon: String
    let groupId: String?
    let specialties: [String]
    let defaultAgentCount: Int
    let defaultDuration: Int
    let capabilities: [String]
    let isFavorite: Bool
    let usageCount: Int
    let averageRating: Double?
    let totalRatings: Int

    enum CodingKeys: String, CodingKey {
        case id, name, description, icon, specialties, capabilities
        case groupId = "group_id"
        case defaultAgentCount = "default_agent_count"
        case defaultDuration = "default_duration"
        case isFavorite = "is_favorite"
        case usageCount = "usage_count"
        case averageRating = "average_rating"
        case totalRatings = "total_ratings"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? "🌾"
        groupId = try container.decodeIfPresent(String.self, forKey: .groupId)
        specialties = try container.decodeIfPresent([String].self, forKey: .specialties) ?? []
        defaultAgentCount = try container.decodeIfPresent(Int.self, forKey: .defaultAgentCount) ?? 3
        defaultDuration = try container.decodeIfPresent(Int.self, forKey: .defaultDuration) ?? 60
        capabilities = try container.decodeIfPresent([String].self, forKey: .capabilities) ?? []
        isFavorite = try container.decodeIfPresent(Bool.self, forKey: .isFavorite) ?? false
        usageCount = try container.decodeIfPresent(Int.self, forKey: .usageCount) ?? 0
        averageRating = try container.decodeIfPresent(Double.self, forKey: .averageRating)
        totalRatings = try container.decodeIfPresent(Int.self, forKey: .totalRatings) ?? 0
    }
}

struct FarmerStats: Codable {
    let farmerId: String
    let totalFarms: Int
    let successfulFarms: Int
    let averageRating: Double?
    let totalRatings: Int
    let averageDuration: Int
    let popularTasks: [String]

    enum CodingKeys: String, CodingKey {
        case farmerId = "farmer_id"
        case totalFarms = "total_farms"
        case successfulFarms = "successful_farms"
        case averageRating = "average_rating"
        case totalRatings = "total_ratings"
        case averageDuration = "average_duration"
        case popularTasks = "popular_tasks"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        farmerId = try container.decode(String.self, forKey: .farmerId)
        totalFarms = try container.decodeIfPresent(Int.self, forKey: .totalFarms) ?? 0
        successfulFarms = try container.decodeIfPresent(Int.self, forKey: .successfulFarms) ?? 0
        averageRating = try container.decodeIfPresent(Double.self, forKey: .averageRating)
        totalRatings = try container.decodeIfPresent(Int.self, forKey: .totalRatings) ?? 0
        averageDuration = try container.decodeIfPresent(Int.self, forKey: .averageDuration) ?? 60
        popularTasks = try container.decodeIfPresent([String].self, forKey: .popularTasks) ?? []
    }
}

struct FavoriteResponse: Codable {
    let isFavorite: Bool

    enum CodingKeys: String, CodingKey {
        case isFavorite = "is_favorite"
    }
}

struct EmptyResponse: Codable {}

struct EmptyRequest: Codable {}

struct FarmerRatingRequest: Codable {
    let rating: Int
    let farmId: String?
    let review: String?

    enum CodingKeys: String, CodingKey {
        case rating
        case farmId = "farm_id"
        case review
    }
}

// MARK: - Cross-Device Sync API

extension MaiFarmAPI {

    // MARK: - Device Management

    /// Register this device with the server
    func registerDevice(_ request: DeviceRegistrationRequest) async throws -> UserDevice {
        struct Response: Codable {
            let success: Bool
            let device: UserDevice
        }
        let response: Response = try await post("/cross-device/register", body: request)
        return response.device
    }

    /// Send device heartbeat to maintain online status
    func sendDeviceHeartbeat(deviceId: String) async throws {
        struct HeartbeatRequest: Codable {
            let deviceId: String
        }
        let _: EmptyResponse = try await post("/cross-device/heartbeat", body: HeartbeatRequest(deviceId: deviceId))
    }

    /// Get all devices for the current user
    func getUserDevices() async throws -> [UserDevice] {
        struct Response: Codable {
            let success: Bool
            let devices: [UserDevice]
        }
        let response: Response = try await get("/cross-device/devices", cacheTTL: 30)
        return response.devices
    }

    /// Get devices eligible to execute a new farm
    func getExecutionDevices(minAgents: Int? = nil, minDuration: Int? = nil) async throws -> [UserDevice] {
        var queryItems: [URLQueryItem] = []
        if let agents = minAgents {
            queryItems.append(URLQueryItem(name: "minAgents", value: String(agents)))
        }
        if let duration = minDuration {
            queryItems.append(URLQueryItem(name: "minDuration", value: String(duration)))
        }

        struct Response: Codable {
            let success: Bool
            let devices: [UserDevice]
        }
        let response: Response = try await get("/cross-device/execution-devices", queryItems: queryItems, cacheTTL: 30)
        return response.devices
    }

    /// Update device settings
    func updateDeviceSettings(deviceId: String, settings: [String: Any]) async throws -> UserDevice {
        // Convert settings to JSON data
        let data = try JSONSerialization.data(withJSONObject: settings)

        struct Response: Codable {
            let success: Bool
            let device: UserDevice
        }

        let url = APIConfiguration.shared.baseURL.appendingPathComponent("/cross-device/devices/\(deviceId)")
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        if let token = await AuthManager.shared.currentToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (responseData, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder.maiFarmDecoder.decode(Response.self, from: responseData)
        return response.device
    }

    /// Remove a device
    func removeDevice(deviceId: String) async throws {
        try await delete("/cross-device/devices/\(deviceId)")
    }

    // MARK: - Farm Handoff

    /// Get devices eligible to receive a farm handoff
    func getHandoffEligibleDevices(sourceDeviceId: String, farmId: String? = nil) async throws -> [HandoffEligibleDevice] {
        var queryItems = [URLQueryItem(name: "sourceDeviceId", value: sourceDeviceId)]
        if let farmId = farmId {
            queryItems.append(URLQueryItem(name: "farmId", value: farmId))
        }

        struct Response: Codable {
            let success: Bool
            let devices: [HandoffEligibleDevice]
        }
        let response: Response = try await get("/cross-device/handoff/eligible-devices", queryItems: queryItems, cacheTTL: 10)
        return response.devices
    }

    /// Request a farm handoff to another device
    func requestFarmHandoff(
        farmId: String,
        sourceDeviceId: String,
        targetDeviceId: String?,
        handoffType: String,
        reason: String?
    ) async throws -> HandoffRequest {
        struct HandoffRequestBody: Codable {
            let farmId: String
            let sourceDeviceId: String
            let targetDeviceId: String?
            let handoffType: String
            let reason: String?
        }

        struct Response: Codable {
            let success: Bool
            let request: HandoffRequest
        }

        let body = HandoffRequestBody(
            farmId: farmId,
            sourceDeviceId: sourceDeviceId,
            targetDeviceId: targetDeviceId,
            handoffType: handoffType,
            reason: reason
        )
        let response: Response = try await post("/cross-device/handoff/request", body: body)
        return response.request
    }

    /// Get pending handoff requests for a device
    func getPendingHandoffRequests(deviceId: String) async throws -> [HandoffRequest] {
        struct Response: Codable {
            let success: Bool
            let requests: [HandoffRequest]
        }
        let response: Response = try await get(
            "/cross-device/handoff/pending",
            queryItems: [URLQueryItem(name: "deviceId", value: deviceId)],
            cacheTTL: 10
        )
        return response.requests
    }

    /// Accept a handoff request
    func acceptHandoffRequest(requestId: String, deviceId: String) async throws -> AcceptHandoffResult {
        struct AcceptBody: Codable {
            let deviceId: String
        }
        return try await post("/cross-device/handoff/\(requestId)/accept", body: AcceptBody(deviceId: deviceId))
    }

    /// Cancel a pending handoff request
    func cancelHandoffRequest(requestId: String) async throws {
        let _: EmptyResponse = try await post("/cross-device/handoff/\(requestId)/cancel", body: EmptyBody())
    }

    // MARK: - Notifications

    /// Get device notifications
    func getDeviceNotifications(deviceId: String, markDelivered: Bool = false) async throws -> [DeviceNotification] {
        struct Response: Codable {
            let success: Bool
            let notifications: [DeviceNotification]
        }
        let response: Response = try await get(
            "/cross-device/notifications",
            queryItems: [
                URLQueryItem(name: "deviceId", value: deviceId),
                URLQueryItem(name: "markDelivered", value: markDelivered ? "true" : "false")
            ],
            cacheTTL: 5
        )
        return response.notifications
    }

    /// Mark notifications as read
    func markNotificationsRead(notificationIds: [String]) async throws {
        struct Body: Codable {
            let notificationIds: [String]
        }
        let _: EmptyResponse = try await post("/cross-device/notifications/read", body: Body(notificationIds: notificationIds))
    }

    // MARK: - Farm Subscriptions

    /// Subscribe a device to farm updates
    func subscribeFarmUpdates(farmId: String, deviceId: String, subscriptionType: String = "monitor") async throws {
        struct Body: Codable {
            let deviceId: String
            let subscriptionType: String
        }
        let _: EmptyResponse = try await post("/cross-device/farms/\(farmId)/subscribe", body: Body(deviceId: deviceId, subscriptionType: subscriptionType))
    }

    /// Unsubscribe from farm updates
    func unsubscribeFarmUpdates(farmId: String, deviceId: String) async throws {
        try await delete("/cross-device/farms/\(farmId)/subscribe?deviceId=\(deviceId)")
    }

    // MARK: - Push Notifications

    /// Register APNs push token with backend
    func registerPushToken(_ request: PushTokenRegistrationRequest) async throws {
        struct Body: Codable {
            let deviceId: String
            let pushToken: String
            let tokenType: String
        }
        let _: EmptyResponse = try await post(
            "/cross-device/push-token",
            body: Body(
                deviceId: request.deviceId,
                pushToken: request.pushToken,
                tokenType: request.tokenType
            )
        )
    }

    /// Remove push token from backend
    func removePushToken(deviceId: String) async throws {
        try await delete("/cross-device/push-token?deviceId=\(deviceId)")
    }

    /// Cancel a handoff (alias for cancelHandoffRequest for convenience)
    func cancelHandoff(_ handoffId: String) async throws {
        try await cancelHandoffRequest(requestId: handoffId)
    }
}

// MARK: - JSONDecoder Extension
extension JSONDecoder {
    static let maiFarmDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO8601 with fractional seconds
            let iso8601Formatter = ISO8601DateFormatter()
            iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso8601Formatter.date(from: dateString) {
                return date
            }

            // Try without fractional seconds
            iso8601Formatter.formatOptions = [.withInternetDateTime]
            if let date = iso8601Formatter.date(from: dateString) {
                return date
            }

            // Try RFC 3339
            let rfc3339Formatter = DateFormatter()
            rfc3339Formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
            rfc3339Formatter.locale = Locale(identifier: "en_US_POSIX")
            if let date = rfc3339Formatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date string \(dateString)"
            )
        }
        return decoder
    }()
}

// MARK: - Cross-Device Types (for API responses)

/// Represents a user's registered device
struct UserDevice: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let deviceId: String
    let deviceName: String
    let deviceType: String  // "iphone", "ipad", "mac", "web"
    let platform: String
    let osVersion: String?
    let appVersion: String?
    let computeTier: String  // "limited", "standard", "performance", "workstation"
    let supportsLocalModels: Bool
    let supportsBackgroundExecution: Bool
    let maxAgents: Int
    let maxFarmDurationMinutes: Int
    let isOnline: Bool
    let lastSeenAt: Date
    let isPrimaryDevice: Bool
    let acceptHandoffs: Bool
    let autoSyncEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case platform
        case osVersion = "os_version"
        case appVersion = "app_version"
        case computeTier = "compute_tier"
        case supportsLocalModels = "supports_local_models"
        case supportsBackgroundExecution = "supports_background_execution"
        case maxAgents = "max_agents"
        case maxFarmDurationMinutes = "max_farm_duration_minutes"
        case isOnline = "is_online"
        case lastSeenAt = "last_seen_at"
        case isPrimaryDevice = "is_primary_device"
        case acceptHandoffs = "accept_handoffs"
        case autoSyncEnabled = "auto_sync_enabled"
    }

    var icon: String {
        switch deviceType {
        case "iphone": return "iphone"
        case "ipad": return "ipad"
        case "mac": return "desktopcomputer"
        case "web": return "globe"
        default: return "desktopcomputer"
        }
    }

    var tierColor: Color {
        switch computeTier {
        case "workstation": return .purple
        case "performance": return .blue
        case "standard": return .green
        case "limited": return .orange
        default: return .gray
        }
    }
}

/// Represents a handoff request between devices
struct HandoffRequest: Codable, Identifiable {
    let id: String
    let userId: String
    let farmId: String
    let sourceDeviceId: String
    let targetDeviceId: String?
    let handoffType: HandoffType
    let status: HandoffStatus
    let farmStateSnapshot: FarmStateSnapshot
    let progressAtHandoff: Double?
    let reason: String?
    let errorMessage: String?
    let requestedAt: Date
    let acceptedAt: Date?
    let completedAt: Date?
    let expiresAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case farmId = "farm_id"
        case sourceDeviceId = "source_device_id"
        case targetDeviceId = "target_device_id"
        case handoffType = "handoff_type"
        case status
        case farmStateSnapshot = "farm_state_snapshot"
        case progressAtHandoff = "progress_at_handoff"
        case reason
        case errorMessage = "error_message"
        case requestedAt = "requested_at"
        case acceptedAt = "accepted_at"
        case completedAt = "completed_at"
        case expiresAt = "expires_at"
    }

    enum HandoffType: String, Codable {
        case transfer
        case clone
        case monitorOnly = "monitor_only"
    }

    enum HandoffStatus: String, Codable {
        case pending
        case accepted
        case inProgress = "in_progress"
        case completed
        case failed
        case cancelled
        case expired
    }

    struct FarmStateSnapshot: Codable {
        let id: String
        let name: String
        let status: String
        let provider: String
        let duration: Int?
        let progress: Double?
        let createdAt: Date?

        enum CodingKeys: String, CodingKey {
            case id, name, status, provider, duration, progress
            case createdAt = "created_at"
        }
    }

    var isExpired: Bool {
        expiresAt < Date()
    }
}

/// Device eligible to receive a farm handoff
struct HandoffEligibleDevice: Codable, Identifiable {
    let deviceId: String
    let deviceName: String
    let deviceType: String
    let computeTier: String
    let isOnline: Bool
    let lastSeenAt: Date
    let supportsLocalModels: Bool
    let maxAgents: Int

    var id: String { deviceId }

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case computeTier = "compute_tier"
        case isOnline = "is_online"
        case lastSeenAt = "last_seen_at"
        case supportsLocalModels = "supports_local_models"
        case maxAgents = "max_agents"
    }

    var icon: String {
        switch deviceType {
        case "mac": return "desktopcomputer"
        case "ipad": return "ipad"
        case "iphone": return "iphone"
        default: return "desktopcomputer"
        }
    }
}

/// Cross-device notification
struct DeviceNotification: Codable, Identifiable {
    let id: String
    let userId: String
    let targetDeviceId: String?
    let notificationType: String
    let payload: [String: AnyCodable]
    let priority: Priority
    let delivered: Bool
    let deliveredAt: Date?
    let read: Bool
    let readAt: Date?
    let expiresAt: Date
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case targetDeviceId = "target_device_id"
        case notificationType = "notification_type"
        case payload
        case priority
        case delivered
        case deliveredAt = "delivered_at"
        case read
        case readAt = "read_at"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
    }

    enum Priority: String, Codable {
        case low, normal, high, critical
    }
}

/// Result of accepting a handoff
struct AcceptHandoffResult: Codable {
    let success: Bool
    let error: String?
    let farmState: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case success, error
        case farmState = "farm_state"
    }
}

/// Helper for encoding/decoding dynamic JSON values
struct AnyCodable: Codable, Hashable {
    let value: AnyHashable

    init(_ value: Any) {
        if let hashable = value as? AnyHashable {
            self.value = hashable
        } else {
            self.value = "\(value)"
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array
        } else {
            value = ""
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let str = value as? String {
            try container.encode(str)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else {
            try container.encodeNil()
        }
    }
}

/// Request to register a device
struct DeviceRegistrationRequest: Codable {
    let deviceId: String
    let deviceName: String
    let deviceType: String
    let platform: String
    let osVersion: String?
    let appVersion: String?
    let computeTier: String
    let supportsLocalModels: Bool
    let supportsBackgroundExecution: Bool
    let maxAgents: Int
    let maxFarmDurationMinutes: Int

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case platform
        case osVersion = "os_version"
        case appVersion = "app_version"
        case computeTier = "compute_tier"
        case supportsLocalModels = "supports_local_models"
        case supportsBackgroundExecution = "supports_background_execution"
        case maxAgents = "max_agents"
        case maxFarmDurationMinutes = "max_farm_duration_minutes"
    }
}

/// Request to register a push notification token
struct PushTokenRegistrationRequest: Codable {
    let deviceId: String
    let pushToken: String
    let tokenType: String

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case pushToken = "push_token"
        case tokenType = "token_type"
    }
}

/// Alias for device selection in farm creation
typealias ExecutionDevice = UserDevice

// MARK: - Cross Device Service (Stub for compilation)
/// Manages device registration, farm handoffs, and cross-device state sync
@MainActor
class CrossDeviceService: ObservableObject {
    static let shared = CrossDeviceService()

    @Published var devices: [UserDevice] = []
    @Published var currentDevice: UserDevice?
    @Published var pendingHandoffRequests: [HandoffRequest] = []
    @Published var notifications: [DeviceNotification] = []
    @Published var isRegistered = false
    @Published var isSyncing = false
    @Published var lastSyncError: String?

    var deviceId: String {
        UserDefaults.standard.string(forKey: "crossDevice_deviceId") ?? UUID().uuidString
    }

    private init() {}

    func registerCurrentDevice() async throws {
        // Stub - actual implementation in CrossDevice folder
    }

    func getExecutionDevices(farmId: String? = nil) async throws -> [ExecutionDevice] {
        return []
    }

    func refreshDevices() async {
        // Stub
    }

    func sendHeartbeat() async {
        // Stub
    }
}

// MARK: - Push Notification Manager (Stub for compilation)

/// Manages push notifications
@MainActor
class PushNotificationManager: NSObject, ObservableObject {
    static let shared = PushNotificationManager()

    @Published var isRegistered = false
    @Published var pushToken: String?
    @Published var lastError: Error?

    private override init() {
        super.init()
    }

    func requestAuthorization() async throws -> Bool {
        return false
    }

    func requestPermissionsAndRegister() async -> Bool {
        do {
            let center = UNUserNotificationCenter.current()
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            return granted
        } catch {
            return false
        }
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        pushToken = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        isRegistered = true
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        lastError = error
        isRegistered = false
    }

    func handleRemoteNotification(userInfo: [AnyHashable: Any]) async {
        // Handle incoming push notification
        print("[PushNotificationManager] Received remote notification: \(userInfo)")
    }

    func handleNotification(_ notification: UNNotification) async -> UNNotificationPresentationOptions {
        return [.banner, .sound]
    }
}

/// Push notification delegate for UNUserNotificationCenter
class PushNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    nonisolated(unsafe) static let shared = PushNotificationDelegate()

    private override init() {
        super.init()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}

// MARK: - Cross Device Settings View (Stub)
/// Settings view for cross-device features
struct CrossDeviceSettingsView: View {
    @StateObject private var crossDeviceService = CrossDeviceService.shared

    var body: some View {
        List {
            Section("Cross-Device Sync") {
                Toggle("Enable Cross-Device Sync", isOn: .constant(true))
                Toggle("Accept Farm Handoffs", isOn: .constant(true))
            }

            Section("Registered Devices") {
                if crossDeviceService.devices.isEmpty {
                    Text("No devices registered")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(crossDeviceService.devices) { device in
                        HStack {
                            Image(systemName: device.icon)
                            VStack(alignment: .leading) {
                                Text(device.deviceName)
                                Text(device.platform)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            if device.isOnline {
                                Circle()
                                    .fill(.green)
                                    .frame(width: 8, height: 8)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Cross-Device")
    }
}

// MARK: - Farm Handoff Sheet (Stub)
/// Sheet for handing off a farm to another device
struct FarmHandoffSheet: View {
    let farm: Farm
    @Binding var isPresented: Bool
    let onHandoffComplete: (Bool) -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)

                Text("Handoff Farm")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Transfer \"\(farm.name)\" to another device")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)

                Spacer()

                Text("No other devices available")
                    .foregroundColor(.secondary)

                Spacer()
            }
            .padding()
            .navigationTitle("Farm Handoff")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
        }
    }
}
