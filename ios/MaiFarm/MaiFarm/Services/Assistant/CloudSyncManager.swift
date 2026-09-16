//
//  CloudSyncManager.swift
//  MaiFarm
//
//  iCloud sync for ASSISTANT.md across user's devices
//  Uses CloudKit for document synchronization
//

import Foundation
import CloudKit
import os.log

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Cloud Sync Configuration

struct CloudSyncConfig {
    /// iCloud container identifier
    let containerIdentifier: String

    /// Sync interval (seconds)
    let syncInterval: TimeInterval

    /// Maximum file size for sync (bytes)
    let maxFileSize: Int64

    /// Whether to sync events.jsonl (can be large)
    let syncEvents: Bool

    /// Conflict resolution strategy
    let conflictResolution: ConflictResolution

    enum ConflictResolution {
        case localWins
        case remoteWins
        case merge
        case mostRecent
    }

    static let `default` = CloudSyncConfig(
        containerIdentifier: "iCloud.app.maifarm",
        syncInterval: 30.0,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        syncEvents: false,
        conflictResolution: .mostRecent
    )
}

// MARK: - Sync Status

enum CloudSyncStatus: Equatable {
    case idle
    case syncing
    case synced(Date)
    case error(String)
    case disabled
    case notSignedIn
}

// MARK: - Sync Change

struct SyncChange: Identifiable {
    let id = UUID()
    let sessionId: String
    let fileName: String
    let changeType: ChangeType
    let timestamp: Date

    enum ChangeType {
        case uploaded
        case downloaded
        case deleted
        case conflict
    }
}

// MARK: - Cloud Sync Manager

/// Manages iCloud synchronization for Assistant session data
actor CloudSyncManager {
    static let shared = CloudSyncManager()

    private let logger = Logger(subsystem: "app.maifarm", category: "CloudSync")
    private let config: CloudSyncConfig

    // CloudKit references
    private var container: CKContainer?
    private var database: CKDatabase?

    // State
    private var status: CloudSyncStatus = .idle
    private var recentChanges: [SyncChange] = []
    private var lastSyncTime: Date?
    private var syncTask: Task<Void, Never>?

    // Subscriptions
    private var subscriptionId: CKSubscription.ID?

    // Record type constants
    private let recordType = "AssistantSession"
    private let summaryField = "summaryContent"
    private let sessionIdField = "sessionId"
    private let modifiedField = "modifiedAt"
    private let deviceIdField = "deviceId"

    // MARK: - Initialization

    private init(config: CloudSyncConfig = .default) {
        self.config = config
    }

    // MARK: - Setup

    /// Initialize CloudKit container and check availability
    func setup() async throws {
        logger.info("Setting up CloudSync")

        container = CKContainer(identifier: config.containerIdentifier)
        database = container?.privateCloudDatabase

        // Check account status
        let accountStatus = try await container?.accountStatus()

        switch accountStatus {
        case .available:
            status = .idle
            logger.info("iCloud account available")
            try await setupSubscription()

        case .noAccount:
            status = .notSignedIn
            logger.warning("No iCloud account signed in")
            throw CloudSyncError.notSignedIn

        case .restricted, .couldNotDetermine:
            status = .disabled
            logger.warning("iCloud access restricted or undetermined")
            throw CloudSyncError.restricted

        case .temporarilyUnavailable:
            status = .error("iCloud temporarily unavailable")
            throw CloudSyncError.temporarilyUnavailable

        @unknown default:
            status = .error("Unknown iCloud status")
            throw CloudSyncError.unknown
        }
    }

    /// Set up push notifications for remote changes
    private func setupSubscription() async throws {
        guard let database = database else { return }

        let subscription = CKQuerySubscription(
            recordType: recordType,
            predicate: NSPredicate(value: true),
            options: [.firesOnRecordCreation, .firesOnRecordUpdate, .firesOnRecordDeletion]
        )

        let notificationInfo = CKSubscription.NotificationInfo()
        notificationInfo.shouldSendContentAvailable = true
        subscription.notificationInfo = notificationInfo

        do {
            let savedSubscription = try await database.save(subscription)
            subscriptionId = savedSubscription.subscriptionID
            logger.info("CloudKit subscription created: \(savedSubscription.subscriptionID)")
        } catch {
            logger.warning("Failed to create subscription: \(error.localizedDescription)")
            // Non-fatal - manual sync will still work
        }
    }

    // MARK: - Sync Operations

    /// Start automatic sync loop
    func startAutoSync() {
        guard syncTask == nil else { return }

        syncTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self else { break }

                await self.syncAll()

                try? await Task.sleep(nanoseconds: UInt64(self.config.syncInterval * 1_000_000_000))
            }
        }

        logger.info("Auto-sync started with interval: \(self.config.syncInterval)s")
    }

    /// Stop automatic sync
    func stopAutoSync() {
        syncTask?.cancel()
        syncTask = nil
        logger.info("Auto-sync stopped")
    }

    /// Sync all sessions
    func syncAll() async {
        guard status != .notSignedIn && status != .disabled else { return }

        status = .syncing

        do {
            // Upload local changes
            await uploadLocalChanges()

            // Download remote changes
            await downloadRemoteChanges()

            lastSyncTime = Date()
            status = .synced(Date())
            logger.info("Sync completed successfully")

        } catch {
            status = .error(error.localizedDescription)
            logger.error("Sync failed: \(error.localizedDescription)")
        }
    }

    /// Upload a specific session summary
    func uploadSession(sessionId: String) async throws {
        guard let database = database else {
            throw CloudSyncError.notInitialized
        }

        let summaryPath = AssistantStorageManager.summaryFilePath(for: sessionId)

        guard FileManager.default.fileExists(atPath: summaryPath.path) else {
            throw CloudSyncError.fileNotFound
        }

        let content = try String(contentsOf: summaryPath, encoding: .utf8)
        let modifiedDate = try FileManager.default.attributesOfItem(atPath: summaryPath.path)[.modificationDate] as? Date ?? Date()

        // Check file size
        let fileSize = try FileManager.default.attributesOfItem(atPath: summaryPath.path)[.size] as? Int64 ?? 0
        guard fileSize <= config.maxFileSize else {
            throw CloudSyncError.fileTooLarge
        }

        // Create or update record
        let recordId = CKRecord.ID(recordName: "session-\(sessionId)")

        do {
            // Try to fetch existing record
            let existingRecord = try await database.record(for: recordId)
            existingRecord[summaryField] = content
            existingRecord[modifiedField] = modifiedDate
            existingRecord[deviceIdField] = getDeviceId()

            try await database.save(existingRecord)
            logger.info("Updated existing record for session: \(sessionId)")

        } catch CKError.unknownItem {
            // Create new record
            let record = CKRecord(recordType: recordType, recordID: recordId)
            record[sessionIdField] = sessionId
            record[summaryField] = content
            record[modifiedField] = modifiedDate
            record[deviceIdField] = getDeviceId()

            try await database.save(record)
            logger.info("Created new record for session: \(sessionId)")
        }

        recentChanges.append(SyncChange(
            sessionId: sessionId,
            fileName: "ASSISTANT.md",
            changeType: .uploaded,
            timestamp: Date()
        ))
    }

    /// Download a session from iCloud
    func downloadSession(sessionId: String) async throws {
        guard let database = database else {
            throw CloudSyncError.notInitialized
        }

        let recordId = CKRecord.ID(recordName: "session-\(sessionId)")

        let record = try await database.record(for: recordId)

        guard let content = record[summaryField] as? String else {
            throw CloudSyncError.invalidData
        }

        // Create local session directory if needed
        let sessionDir = try AssistantStorageManager.createSessionDirectory(sessionId: sessionId)
        let summaryPath = sessionDir.appendingPathComponent("ASSISTANT.md")

        // Check for conflicts
        if FileManager.default.fileExists(atPath: summaryPath.path) {
            let localModified = try FileManager.default.attributesOfItem(atPath: summaryPath.path)[.modificationDate] as? Date ?? Date.distantPast
            let remoteModified = record[modifiedField] as? Date ?? Date.distantPast

            if localModified > remoteModified && config.conflictResolution == .localWins {
                logger.info("Local version is newer, skipping download for: \(sessionId)")
                return
            }

            if config.conflictResolution == .merge {
                try await mergeContent(sessionId: sessionId, remoteContent: content)
                return
            }
        }

        try content.write(to: summaryPath, atomically: true, encoding: .utf8)
        logger.info("Downloaded session: \(sessionId)")

        recentChanges.append(SyncChange(
            sessionId: sessionId,
            fileName: "ASSISTANT.md",
            changeType: .downloaded,
            timestamp: Date()
        ))
    }

    // MARK: - Private Helpers

    private func uploadLocalChanges() async {
        let sessionIds = AssistantStorageManager.listSessionIds()

        for sessionId in sessionIds {
            do {
                try await uploadSession(sessionId: sessionId)
            } catch {
                logger.warning("Failed to upload session \(sessionId): \(error.localizedDescription)")
            }
        }
    }

    private func downloadRemoteChanges() async {
        guard let database = database else { return }

        let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
        query.sortDescriptors = [NSSortDescriptor(key: modifiedField, ascending: false)]

        do {
            let results = try await database.records(matching: query)

            for (_, result) in results.matchResults {
                switch result {
                case .success(let record):
                    if let sessionId = record[sessionIdField] as? String {
                        // Only download if from different device
                        let recordDeviceId = record[deviceIdField] as? String ?? ""
                        if recordDeviceId != getDeviceId() {
                            try? await downloadSession(sessionId: sessionId)
                        }
                    }
                case .failure(let error):
                    logger.warning("Failed to fetch record: \(error.localizedDescription)")
                }
            }
        } catch {
            logger.error("Failed to query remote records: \(error.localizedDescription)")
        }
    }

    private func mergeContent(sessionId: String, remoteContent: String) async throws {
        let localPath = AssistantStorageManager.summaryFilePath(for: sessionId)
        let localContent = try String(contentsOf: localPath, encoding: .utf8)

        // Simple merge: append unique sections from remote
        // More sophisticated merge could use diff algorithms
        let mergedContent = mergeMarkdownSummaries(local: localContent, remote: remoteContent)

        try mergedContent.write(to: localPath, atomically: true, encoding: .utf8)

        recentChanges.append(SyncChange(
            sessionId: sessionId,
            fileName: "ASSISTANT.md",
            changeType: .conflict,
            timestamp: Date()
        ))

        logger.info("Merged conflict for session: \(sessionId)")
    }

    private func mergeMarkdownSummaries(local: String, remote: String) -> String {
        // Extract sections from both
        let localSections = extractSections(from: local)
        let remoteSections = extractSections(from: remote)

        var merged: [String: String] = [:]

        // Start with local
        for (key, value) in localSections {
            merged[key] = value
        }

        // Add remote sections that are newer or missing
        for (key, value) in remoteSections {
            if merged[key] == nil || value.count > merged[key]!.count {
                merged[key] = value
            }
        }

        // Reconstruct document
        var result = ""
        let sectionOrder = [
            "Goals", "Current Status", "Key Decisions", "Progress Log",
            "Artifacts", "Issues", "Open Questions", "Next Best Actions", "Recent Context"
        ]

        for section in sectionOrder {
            if let content = merged[section] {
                result += "## \(section)\n\n\(content)\n\n"
            }
        }

        return result
    }

    private func extractSections(from markdown: String) -> [String: String] {
        var sections: [String: String] = [:]

        let pattern = "## ([^\n]+)\n\n([\\s\\S]*?)(?=\n## |$)"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return sections }

        let nsString = markdown as NSString
        let matches = regex.matches(in: markdown, range: NSRange(location: 0, length: nsString.length))

        for match in matches {
            if let titleRange = Range(match.range(at: 1), in: markdown),
               let contentRange = Range(match.range(at: 2), in: markdown) {
                let title = String(markdown[titleRange])
                let content = String(markdown[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                sections[title] = content
            }
        }

        return sections
    }

    private nonisolated func getDeviceId() -> String {
        // Use a persistent device ID stored in UserDefaults to avoid MainActor issues with UIDevice
        let key = "app.maifarm.deviceId"
        if let existingId = UserDefaults.standard.string(forKey: key) {
            return existingId
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: key)
        return newId
    }

    // MARK: - Public Queries

    /// Get current sync status
    func getStatus() -> CloudSyncStatus {
        status
    }

    /// Get last sync time
    func getLastSyncTime() -> Date? {
        lastSyncTime
    }

    /// Get recent changes
    func getRecentChanges(limit: Int = 10) -> [SyncChange] {
        Array(recentChanges.suffix(limit))
    }

    /// Check if iCloud is available
    func isAvailable() -> Bool {
        status != .notSignedIn && status != .disabled
    }

    /// Delete session from iCloud
    func deleteSession(sessionId: String) async throws {
        guard let database = database else {
            throw CloudSyncError.notInitialized
        }

        let recordId = CKRecord.ID(recordName: "session-\(sessionId)")
        try await database.deleteRecord(withID: recordId)

        recentChanges.append(SyncChange(
            sessionId: sessionId,
            fileName: "ASSISTANT.md",
            changeType: .deleted,
            timestamp: Date()
        ))

        logger.info("Deleted session from iCloud: \(sessionId)")
    }
}

// MARK: - Errors

enum CloudSyncError: LocalizedError {
    case notSignedIn
    case restricted
    case temporarilyUnavailable
    case unknown
    case notInitialized
    case fileNotFound
    case fileTooLarge
    case invalidData
    case conflict

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Not signed in to iCloud"
        case .restricted: return "iCloud access restricted"
        case .temporarilyUnavailable: return "iCloud temporarily unavailable"
        case .unknown: return "Unknown iCloud error"
        case .notInitialized: return "CloudSync not initialized"
        case .fileNotFound: return "Session file not found"
        case .fileTooLarge: return "File too large for sync"
        case .invalidData: return "Invalid data in cloud record"
        case .conflict: return "Sync conflict detected"
        }
    }
}

// MARK: - SwiftUI Observable Wrapper

@MainActor
class CloudSyncObservable: ObservableObject {
    @Published var status: CloudSyncStatus = .idle
    @Published var lastSyncTime: Date?
    @Published var recentChanges: [SyncChange] = []

    private var refreshTask: Task<Void, Never>?

    init() {
        startRefreshing()
    }

    func startRefreshing() {
        refreshTask = Task {
            while !Task.isCancelled {
                await refreshStatus()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func refreshStatus() async {
        status = await CloudSyncManager.shared.getStatus()
        lastSyncTime = await CloudSyncManager.shared.getLastSyncTime()
        recentChanges = await CloudSyncManager.shared.getRecentChanges()
    }

    func syncNow() async {
        await CloudSyncManager.shared.syncAll()
        await refreshStatus()
    }

    deinit {
        refreshTask?.cancel()
    }
}
