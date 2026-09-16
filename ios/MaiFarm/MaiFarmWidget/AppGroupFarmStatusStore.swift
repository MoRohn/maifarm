//
//  AppGroupFarmStatusStore.swift
//  MaiFarmWidget
//
//  Manages widget data persistence via App Group shared container
//  Used by widget extension to read data written by the main app
//

import Foundation
import os.log

// MARK: - App Group Farm Status Store

final class AppGroupFarmStatusStore: @unchecked Sendable {
    static let shared = AppGroupFarmStatusStore()

    private let logger = Logger(subsystem: "app.maifarm.widget", category: "DataStore")
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    // MARK: - Read Methods (for Widget)

    /// Fetch the current widget data store from App Group
    func fetchDataStore() -> WidgetDataStore {
        guard let defaults = WidgetAppGroup.sharedDefaults else {
            logger.warning("Failed to access App Group defaults")
            return .empty
        }

        guard let data = defaults.data(forKey: WidgetDataKey.farmsStatus) else {
            logger.debug("No widget data found in App Group")
            return .empty
        }

        do {
            let store = try decoder.decode(WidgetDataStore.self, from: data)
            logger.debug("Loaded \(store.farms.count) farms from App Group")
            return store
        } catch {
            logger.error("Failed to decode widget data: \(error.localizedDescription)")
            return .empty
        }
    }

    /// Fetch farms status array
    func fetchFarms() -> [WidgetFarmStatusData] {
        fetchDataStore().farms
    }

    /// Fetch a specific farm by ID
    func fetchFarm(id: String) -> WidgetFarmStatusData? {
        fetchDataStore().farm(withId: id)
    }

    /// Fetch logs for a specific farm
    func fetchLogs(farmId: String) -> WidgetFarmLogsData? {
        fetchDataStore().logs(forFarmId: farmId)
    }

    /// Fetch the rollup summary
    func fetchRollup() -> WidgetRollup {
        fetchDataStore().rollup
    }

    /// Get the last update timestamp
    func fetchLastUpdate() -> Date? {
        WidgetAppGroup.sharedDefaults?.object(forKey: WidgetDataKey.lastUpdate) as? Date
    }

    // MARK: - Write Methods (for Main App)

    /// Save the full widget data store
    func saveDataStore(_ store: WidgetDataStore) {
        guard let defaults = WidgetAppGroup.sharedDefaults else {
            logger.warning("Failed to access App Group defaults for writing")
            return
        }

        do {
            let data = try encoder.encode(store)
            defaults.set(data, forKey: WidgetDataKey.farmsStatus)
            defaults.set(Date(), forKey: WidgetDataKey.lastUpdate)
            logger.debug("Saved \(store.farms.count) farms to App Group")
        } catch {
            logger.error("Failed to encode widget data: \(error.localizedDescription)")
        }
    }

    /// Update farms status (full replacement)
    func updateFarms(_ farms: [WidgetFarmStatusData]) {
        var store = fetchDataStore()
        store = WidgetDataStore(farms: farms, logs: store.logs)
        saveDataStore(store)
    }

    /// Update a single farm's status
    func updateFarm(_ farm: WidgetFarmStatusData) {
        var store = fetchDataStore()
        var farms = store.farms
        if let index = farms.firstIndex(where: { $0.farmId == farm.farmId }) {
            farms[index] = farm
        } else {
            farms.append(farm)
        }
        store = WidgetDataStore(farms: farms, logs: store.logs)
        saveDataStore(store)
    }

    /// Remove a farm from the store
    func removeFarm(id: String) {
        var store = fetchDataStore()
        var farms = store.farms
        farms.removeAll { $0.farmId == id }
        var logs = store.logs
        logs.removeValue(forKey: id)
        store = WidgetDataStore(farms: farms, logs: logs)
        saveDataStore(store)
    }

    /// Update logs for a farm
    func updateLogs(farmId: String, lines: [String]) {
        var store = fetchDataStore()
        var logs = store.logs
        if var existing = logs[farmId] {
            existing = existing.appending(lines)
            logs[farmId] = existing
        } else {
            logs[farmId] = WidgetFarmLogsData(farmId: farmId, lines: lines)
        }
        store = WidgetDataStore(farms: store.farms, logs: logs)
        saveDataStore(store)
    }

    /// Append log lines for a farm
    func appendLogs(farmId: String, newLines: [String]) {
        guard !newLines.isEmpty else { return }
        var store = fetchDataStore()
        var logs = store.logs
        if let existing = logs[farmId] {
            logs[farmId] = existing.appending(newLines)
        } else {
            logs[farmId] = WidgetFarmLogsData(farmId: farmId, lines: newLines)
        }
        store = WidgetDataStore(farms: store.farms, logs: logs)
        saveDataStore(store)
    }

    /// Clear all widget data
    func clearAll() {
        guard let defaults = WidgetAppGroup.sharedDefaults else { return }
        defaults.removeObject(forKey: WidgetDataKey.farmsStatus)
        defaults.removeObject(forKey: WidgetDataKey.farmLogs)
        defaults.removeObject(forKey: WidgetDataKey.lastUpdate)
        logger.debug("Cleared all widget data from App Group")
    }

    // MARK: - Validation

    /// Check if data is stale (older than specified interval)
    func isDataStale(maxAge: TimeInterval = 3600) -> Bool {
        guard let lastUpdate = fetchLastUpdate() else { return true }
        return Date().timeIntervalSince(lastUpdate) > maxAge
    }

    /// Get list of available farm IDs (for configuration)
    func availableFarmIds() -> [String] {
        fetchFarms().map { $0.farmId }
    }

    /// Get list of available farms for selection (id, name pairs)
    func availableFarmsForSelection() -> [(id: String, name: String)] {
        fetchFarms().map { ($0.farmId, $0.name) }
    }
}

// MARK: - File-Based Log Storage (Alternative for Large Logs)

extension AppGroupFarmStatusStore {
    private var logsDirectory: URL? {
        WidgetAppGroup.containerURL?.appendingPathComponent("farm_logs", isDirectory: true)
    }

    /// Ensure logs directory exists
    func ensureLogsDirectory() {
        guard let dir = logsDirectory else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Write logs to file (for large log data)
    func writeLogsToFile(farmId: String, lines: [String]) {
        ensureLogsDirectory()
        guard let dir = logsDirectory else { return }

        let fileURL = dir.appendingPathComponent("\(farmId).log")
        let content = lines.joined(separator: "\n")

        do {
            try content.write(to: fileURL, atomically: true, encoding: .utf8)
            logger.debug("Wrote \(lines.count) log lines to file for farm \(farmId)")
        } catch {
            logger.error("Failed to write log file: \(error.localizedDescription)")
        }
    }

    /// Read logs from file
    func readLogsFromFile(farmId: String) -> [String]? {
        guard let dir = logsDirectory else { return nil }

        let fileURL = dir.appendingPathComponent("\(farmId).log")
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }

        do {
            let content = try String(contentsOf: fileURL, encoding: .utf8)
            return content.components(separatedBy: "\n").filter { !$0.isEmpty }
        } catch {
            logger.error("Failed to read log file: \(error.localizedDescription)")
            return nil
        }
    }

    /// Delete log file
    func deleteLogFile(farmId: String) {
        guard let dir = logsDirectory else { return }
        let fileURL = dir.appendingPathComponent("\(farmId).log")
        try? FileManager.default.removeItem(at: fileURL)
    }

    /// Clean up old log files
    func cleanupOldLogFiles(maxAge: TimeInterval = 86400 * 7) { // 7 days
        guard let dir = logsDirectory else { return }

        do {
            let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])
            let cutoff = Date().addingTimeInterval(-maxAge)

            for file in files {
                if let modDate = try file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                   modDate < cutoff {
                    try FileManager.default.removeItem(at: file)
                    logger.debug("Cleaned up old log file: \(file.lastPathComponent)")
                }
            }
        } catch {
            logger.warning("Failed to cleanup old log files: \(error.localizedDescription)")
        }
    }
}
