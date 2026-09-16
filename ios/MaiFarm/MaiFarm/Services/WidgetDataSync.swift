//
//  WidgetDataSync.swift
//  MaiFarm
//
//  Syncs farm data to the App Group container for widget access
//  This service runs in the main app and writes data for widgets to read
//

import Foundation
import WidgetKit
import os.log

// MARK: - Widget Data Sync Service

final class WidgetDataSyncService: @unchecked Sendable {
    static let shared = WidgetDataSyncService()

    private let logger = Logger(subsystem: "app.maifarm", category: "WidgetSync")
    private let appGroupIdentifier = "group.app.maifarm"
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    // Debouncing
    private var lastSyncTime: Date = .distantPast
    private let minimumSyncInterval: TimeInterval = 2.0

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    private init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Sync Methods

    /// Sync all farms to the widget data store
    func syncFarms(_ farms: [Farm]) async {
        guard canSync() else { return }

        let widgetFarms = farms.map { convertToWidgetFormat($0) }
        var store = readDataStore()
        store = WidgetDataStoreInternal(farms: widgetFarms, logs: store.logs)
        saveDataStore(store)
        reloadWidgets()

        logger.debug("Synced \(farms.count) farms to widget")
    }

    /// Sync a single farm update
    func syncFarm(_ farm: Farm) async {
        guard canSync() else { return }

        let widgetFarm = convertToWidgetFormat(farm)
        var store = readDataStore()
        var farms = store.farms

        if let index = farms.firstIndex(where: { $0.farmId == farm.id }) {
            farms[index] = widgetFarm
        } else {
            farms.append(widgetFarm)
        }

        store = WidgetDataStoreInternal(farms: farms, logs: store.logs)
        saveDataStore(store)
        reloadWidgets()

        logger.debug("Synced farm \(farm.id) to widget")
    }

    /// Remove a farm from widget data
    func removeFarm(id: String) async {
        var store = readDataStore()
        store.farms.removeAll { $0.farmId == id }
        store.logs.removeValue(forKey: id)
        saveDataStore(store)
        reloadWidgets()

        logger.debug("Removed farm \(id) from widget")
    }

    /// Sync terminal logs for a farm
    func syncLogs(farmId: String, lines: [String]) async {
        // Skip if too frequent
        guard canSync() else { return }

        var store = readDataStore()
        var logs = store.logs

        // Append to existing or create new
        if var existing = logs[farmId] {
            var combined = existing.lines + lines
            if combined.count > 50 {
                combined = Array(combined.suffix(50))
            }
            existing = WidgetFarmLogsInternal(farmId: farmId, lines: combined, updatedAt: Date())
            logs[farmId] = existing
        } else {
            logs[farmId] = WidgetFarmLogsInternal(
                farmId: farmId,
                lines: Array(lines.suffix(50)),
                updatedAt: Date()
            )
        }

        store = WidgetDataStoreInternal(farms: store.farms, logs: logs)
        saveDataStore(store)

        // Only reload terminal widget for log updates
        WidgetCenter.shared.reloadTimelines(ofKind: "MaiFarmHarvestTerminalWidget")

        logger.debug("Synced \(lines.count) log lines for farm \(farmId)")
    }

    /// Append a single log line (used for streaming)
    func appendLogLine(farmId: String, line: String) async {
        var store = readDataStore()
        var logs = store.logs

        if var existing = logs[farmId] {
            var lines = existing.lines
            lines.append(line)
            if lines.count > 50 {
                lines = Array(lines.suffix(50))
            }
            existing = WidgetFarmLogsInternal(farmId: farmId, lines: lines, updatedAt: Date())
            logs[farmId] = existing
        } else {
            logs[farmId] = WidgetFarmLogsInternal(farmId: farmId, lines: [line], updatedAt: Date())
        }

        store = WidgetDataStoreInternal(farms: store.farms, logs: logs)
        saveDataStore(store)
    }

    /// Clear all widget data
    func clearAll() async {
        sharedDefaults?.removeObject(forKey: "widget_farms_status")
        sharedDefaults?.removeObject(forKey: "widget_last_update")
        reloadWidgets()
        logger.debug("Cleared all widget data")
    }

    // MARK: - Private Methods

    private func canSync() -> Bool {
        let now = Date()
        guard now.timeIntervalSince(lastSyncTime) >= minimumSyncInterval else {
            return false
        }
        lastSyncTime = now
        return true
    }

    private func convertToWidgetFormat(_ farm: Farm) -> WidgetFarmStatusInternal {
        let lastResult: WidgetLastResultInternal? = nil // TODO: Get from harvest history

        return WidgetFarmStatusInternal(
            farmId: farm.id,
            name: farm.name,
            status: convertStatus(farm.status),
            progress: farm.progress ?? 0,
            phase: determinePhase(farm),
            updatedAt: farm.updatedAt,
            etaSeconds: calculateETA(farm),
            lastResult: lastResult,
            activeAgents: farm.agents.filter { $0.status == .running }.count,
            totalAgents: farm.agents.count,
            provider: farm.provider
        )
    }

    private func convertStatus(_ status: Farm.FarmStatus) -> String {
        switch status {
        case .idle: return "idle"
        case .launching: return "launching"
        case .running: return "running"
        case .active: return "active"
        case .completed: return "completed"
        case .failed: return "failed"
        case .recovering: return "recovering"
        }
    }

    private func determinePhase(_ farm: Farm) -> String {
        guard let progress = farm.progress else { return "Waiting" }

        switch progress {
        case 0..<0.1: return "Planning"
        case 0.1..<0.3: return "Analyzing"
        case 0.3..<0.7: return "Farming"
        case 0.7..<0.9: return "Synthesizing"
        case 0.9..<1.0: return "Harvesting"
        default: return progress >= 1.0 ? "Done" : "Active"
        }
    }

    private func calculateETA(_ farm: Farm) -> TimeInterval? {
        guard let progress = farm.progress, progress > 0, progress < 1.0 else { return nil }

        let elapsed = Date().timeIntervalSince(farm.createdAt)
        let totalEstimated = elapsed / progress
        let remaining = totalEstimated - elapsed

        return max(0, remaining)
    }

    private func readDataStore() -> WidgetDataStoreInternal {
        guard let data = sharedDefaults?.data(forKey: "widget_farms_status") else {
            return WidgetDataStoreInternal(farms: [], logs: [:])
        }

        do {
            return try decoder.decode(WidgetDataStoreInternal.self, from: data)
        } catch {
            logger.warning("Failed to decode widget data: \(error.localizedDescription)")
            return WidgetDataStoreInternal(farms: [], logs: [:])
        }
    }

    private func saveDataStore(_ store: WidgetDataStoreInternal) {
        do {
            let data = try encoder.encode(store)
            sharedDefaults?.set(data, forKey: "widget_farms_status")
            sharedDefaults?.set(Date(), forKey: "widget_last_update")
        } catch {
            logger.error("Failed to encode widget data: \(error.localizedDescription)")
        }
    }

    private func reloadWidgets() {
        // Debounced widget reload
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - Internal Data Types (mirror of widget types)

private struct WidgetDataStoreInternal: Codable {
    var farms: [WidgetFarmStatusInternal]
    var logs: [String: WidgetFarmLogsInternal]
    var lastUpdate: Date = Date()
    var rollup: WidgetRollupInternal {
        WidgetRollupInternal(from: farms)
    }
}

private struct WidgetFarmStatusInternal: Codable {
    let farmId: String
    let name: String
    let status: String
    let progress: Double
    let phase: String
    let updatedAt: Date
    let etaSeconds: TimeInterval?
    let lastResult: WidgetLastResultInternal?
    let activeAgents: Int
    let totalAgents: Int
    let provider: String
}

private struct WidgetLastResultInternal: Codable {
    let success: Bool
    let summary: String
    let timestamp: Date
    let filesGenerated: Int?
}

private struct WidgetFarmLogsInternal: Codable {
    let farmId: String
    var lines: [String]
    var updatedAt: Date
}

private struct WidgetRollupInternal: Codable {
    let running: Int
    let queued: Int
    let completedToday: Int
    let failedToday: Int
    let totalActive: Int

    init(from farms: [WidgetFarmStatusInternal]) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        self.running = farms.filter { $0.status == "running" || $0.status == "active" }.count
        self.queued = farms.filter { $0.status == "queued" || $0.status == "launching" }.count
        self.completedToday = farms.filter {
            $0.status == "completed" && calendar.isDate($0.updatedAt, inSameDayAs: today)
        }.count
        self.failedToday = farms.filter {
            $0.status == "failed" && calendar.isDate($0.updatedAt, inSameDayAs: today)
        }.count
        self.totalActive = running + queued
    }
}

// MARK: - App State Extension

extension AppState {
    /// Sync current farms to widget
    func syncFarmsToWidget() {
        Task {
            await WidgetDataSyncService.shared.syncFarms(farms)
        }
    }

    /// Sync a single farm update to widget
    func syncFarmToWidget(_ farm: Farm) {
        Task {
            await WidgetDataSyncService.shared.syncFarm(farm)
        }
    }
}

// MARK: - WebSocket Terminal Handler Extension

extension TerminalOutputHandler {
    /// Forward terminal output to widget
    func syncToWidget(farmId: String, output: String) {
        let lines = output.components(separatedBy: "\n").filter { !$0.isEmpty }
        guard !lines.isEmpty else { return }

        Task {
            await WidgetDataSyncService.shared.appendLogLine(farmId: farmId, line: lines.last!)
        }
    }
}

// Placeholder for terminal output handler protocol
protocol TerminalOutputHandler: AnyObject {
    func handleOutput(_ output: String, farmId: String)
}
