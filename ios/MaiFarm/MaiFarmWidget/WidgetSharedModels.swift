//
//  WidgetSharedModels.swift
//  MaiFarmWidget
//
//  Shared data models for widget communication via App Group
//  These models are used by both the main app (writer) and widget (reader)
//

import Foundation
import SwiftUI

// MARK: - App Group Configuration

enum WidgetAppGroup {
    static let identifier = "group.app.maifarm"

    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: identifier)
    }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}

// MARK: - Widget Data Keys

enum WidgetDataKey {
    static let farmsStatus = "widget_farms_status"
    static let farmLogs = "widget_farm_logs"
    static let lastUpdate = "widget_last_update"
    static let activeSession = "activeSession" // Legacy key for AssistantWidget
}

// MARK: - Farm Status Data (shared between app and widget)

struct WidgetFarmStatusData: Codable, Identifiable, Equatable {
    let farmId: String
    let name: String
    let status: WidgetFarmStatus
    let progress: Double // 0.0 to 1.0
    let phase: String // "Planning", "Farming", "Synthesizing", "Harvesting"
    let updatedAt: Date
    let etaSeconds: TimeInterval?
    let lastResult: WidgetLastResult?
    let activeAgents: Int
    let totalAgents: Int
    let provider: String

    var id: String { farmId }

    // Convenience computed properties
    var progressPercentage: Int {
        Int(progress * 100)
    }

    var formattedETA: String? {
        guard let eta = etaSeconds, eta > 0 else { return nil }
        let hours = Int(eta) / 3600
        let minutes = (Int(eta) % 3600) / 60
        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else {
            return "\(minutes)m"
        }
    }

    var isActive: Bool {
        status == .running || status == .launching || status == .active
    }

    var timeSinceUpdate: String {
        let interval = Date().timeIntervalSince(updatedAt)
        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            return "\(Int(interval / 60))m ago"
        } else {
            return "\(Int(interval / 3600))h ago"
        }
    }
}

// MARK: - Farm Status Enum

enum WidgetFarmStatus: String, Codable, Equatable {
    case idle
    case launching
    case running
    case active
    case completed
    case failed
    case queued
    case recovering

    var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .launching: return "Launching"
        case .running: return "Running"
        case .active: return "Active"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .queued: return "Queued"
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
        case .queued: return .purple
        case .recovering: return .yellow
        }
    }

    var icon: String {
        switch self {
        case .idle: return "moon.zzz.fill"
        case .launching: return "arrow.up.circle.fill"
        case .running: return "bolt.fill"
        case .active: return "waveform"
        case .completed: return "checkmark.circle.fill"
        case .failed: return "xmark.circle.fill"
        case .queued: return "clock.fill"
        case .recovering: return "arrow.clockwise"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .idle: return "Farm is idle"
        case .launching: return "Farm is launching"
        case .running: return "Farm is running"
        case .active: return "Farm is active"
        case .completed: return "Farm completed successfully"
        case .failed: return "Farm failed"
        case .queued: return "Farm is queued"
        case .recovering: return "Farm is recovering"
        }
    }
}

// MARK: - Last Result

struct WidgetLastResult: Codable, Equatable {
    let success: Bool
    let summary: String
    let timestamp: Date
    let filesGenerated: Int?
}

// MARK: - Farm Logs Data

struct WidgetFarmLogsData: Codable, Identifiable {
    let farmId: String
    let lines: [String] // Ring buffer of recent log lines
    let updatedAt: Date
    let maxLines: Int

    var id: String { farmId }

    init(farmId: String, lines: [String], updatedAt: Date = Date(), maxLines: Int = 50) {
        self.farmId = farmId
        // Keep only the most recent lines
        self.lines = Array(lines.suffix(maxLines))
        self.updatedAt = updatedAt
        self.maxLines = maxLines
    }

    // Append new lines while maintaining ring buffer
    func appending(_ newLines: [String]) -> WidgetFarmLogsData {
        var combined = lines + newLines
        if combined.count > maxLines {
            combined = Array(combined.suffix(maxLines))
        }
        return WidgetFarmLogsData(farmId: farmId, lines: combined, updatedAt: Date(), maxLines: maxLines)
    }
}

// MARK: - Widget Data Store (Aggregated)

struct WidgetDataStore: Codable {
    var farms: [WidgetFarmStatusData]
    var logs: [String: WidgetFarmLogsData] // farmId -> logs
    var lastUpdate: Date
    var rollup: WidgetRollup

    init(farms: [WidgetFarmStatusData] = [], logs: [String: WidgetFarmLogsData] = [:], lastUpdate: Date = Date()) {
        self.farms = farms
        self.logs = logs
        self.lastUpdate = lastUpdate
        self.rollup = WidgetRollup(from: farms)
    }

    // Get farms sorted by priority (running first, then most recently updated)
    var sortedFarms: [WidgetFarmStatusData] {
        farms.sorted { farm1, farm2 in
            // Running/active farms first
            if farm1.isActive && !farm2.isActive { return true }
            if !farm1.isActive && farm2.isActive { return false }
            // Then by update time
            return farm1.updatedAt > farm2.updatedAt
        }
    }

    func farm(withId id: String) -> WidgetFarmStatusData? {
        farms.first { $0.farmId == id }
    }

    func logs(forFarmId id: String) -> WidgetFarmLogsData? {
        logs[id]
    }
}

// MARK: - Widget Rollup (Summary Statistics)

struct WidgetRollup: Codable {
    let running: Int
    let queued: Int
    let completedToday: Int
    let failedToday: Int
    let totalActive: Int

    init(from farms: [WidgetFarmStatusData]) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())

        self.running = farms.filter { $0.status == .running || $0.status == .active }.count
        self.queued = farms.filter { $0.status == .queued || $0.status == .launching }.count
        self.completedToday = farms.filter {
            $0.status == .completed && calendar.isDate($0.updatedAt, inSameDayAs: today)
        }.count
        self.failedToday = farms.filter {
            $0.status == .failed && calendar.isDate($0.updatedAt, inSameDayAs: today)
        }.count
        self.totalActive = running + queued
    }

    init(running: Int = 0, queued: Int = 0, completedToday: Int = 0, failedToday: Int = 0) {
        self.running = running
        self.queued = queued
        self.completedToday = completedToday
        self.failedToday = failedToday
        self.totalActive = running + queued
    }

    var accessibilityLabel: String {
        var parts: [String] = []
        if running > 0 { parts.append("\(running) running") }
        if queued > 0 { parts.append("\(queued) queued") }
        if completedToday > 0 { parts.append("\(completedToday) completed today") }
        if failedToday > 0 { parts.append("\(failedToday) failed today") }
        return parts.isEmpty ? "No farm activity" : parts.joined(separator: ", ")
    }
}

// MARK: - Placeholder / Sample Data

extension WidgetDataStore {
    static let empty = WidgetDataStore()

    static let placeholder: WidgetDataStore = {
        let sampleFarms = [
            WidgetFarmStatusData(
                farmId: "sample-1",
                name: "Feature Development",
                status: .running,
                progress: 0.65,
                phase: "Farming",
                updatedAt: Date(),
                etaSeconds: 1800,
                lastResult: nil,
                activeAgents: 2,
                totalAgents: 3,
                provider: "claude"
            ),
            WidgetFarmStatusData(
                farmId: "sample-2",
                name: "Bug Fix Sprint",
                status: .queued,
                progress: 0.0,
                phase: "Waiting",
                updatedAt: Date().addingTimeInterval(-300),
                etaSeconds: nil,
                lastResult: nil,
                activeAgents: 0,
                totalAgents: 2,
                provider: "claude"
            ),
            WidgetFarmStatusData(
                farmId: "sample-3",
                name: "Documentation",
                status: .completed,
                progress: 1.0,
                phase: "Done",
                updatedAt: Date().addingTimeInterval(-3600),
                etaSeconds: nil,
                lastResult: WidgetLastResult(success: true, summary: "Generated 12 files", timestamp: Date().addingTimeInterval(-3600), filesGenerated: 12),
                activeAgents: 0,
                totalAgents: 2,
                provider: "claude"
            )
        ]

        let sampleLogs: [String: WidgetFarmLogsData] = [
            "sample-1": WidgetFarmLogsData(farmId: "sample-1", lines: [
                "[Agent-1] Starting task analysis...",
                "[Agent-1] Reading project structure",
                "[Agent-2] Analyzing dependencies",
                "[Agent-1] Found 15 relevant files",
                "[Agent-2] Planning implementation strategy",
                "[Agent-1] Writing feature module",
                "[Agent-2] Creating unit tests",
                "[Agent-1] Updating documentation",
                "[System] Progress: 65%",
                "[Agent-1] Compiling changes..."
            ])
        ]

        return WidgetDataStore(farms: sampleFarms, logs: sampleLogs)
    }()

    static let singleFarmPlaceholder: WidgetDataStore = {
        let farm = WidgetFarmStatusData(
            farmId: "sample-single",
            name: "My Active Farm",
            status: .running,
            progress: 0.45,
            phase: "Processing",
            updatedAt: Date(),
            etaSeconds: 2700,
            lastResult: WidgetLastResult(success: true, summary: "Previous run: 8 files", timestamp: Date().addingTimeInterval(-7200), filesGenerated: 8),
            activeAgents: 3,
            totalAgents: 5,
            provider: "claude"
        )

        let logs = WidgetFarmLogsData(farmId: "sample-single", lines: [
            "$ claude --model opus-4 --prompt 'Analyze codebase'",
            "[System] Initializing agent cluster...",
            "[Agent-1] Connected to workspace",
            "[Agent-2] Loading context files...",
            "[Agent-3] Starting analysis phase",
            "[Agent-1] Processing src/components/",
            "[Agent-2] Found 23 TypeScript files",
            "[Agent-3] Building dependency graph",
            "[Agent-1] Implementing feature logic",
            "[System] Checkpoint saved",
            "[Agent-2] Running type checks...",
            "[Agent-3] All tests passing",
            "[Agent-1] Optimizing bundle size",
            "[System] Progress: 45% complete"
        ])

        return WidgetDataStore(farms: [farm], logs: ["sample-single": logs])
    }()

    static let errorPlaceholder: WidgetDataStore = {
        let farm = WidgetFarmStatusData(
            farmId: "sample-error",
            name: "Failed Build",
            status: .failed,
            progress: 0.3,
            phase: "Error",
            updatedAt: Date().addingTimeInterval(-600),
            etaSeconds: nil,
            lastResult: WidgetLastResult(success: false, summary: "Build failed: TypeScript errors", timestamp: Date().addingTimeInterval(-600), filesGenerated: 0),
            activeAgents: 0,
            totalAgents: 3,
            provider: "claude"
        )
        return WidgetDataStore(farms: [farm], logs: [:])
    }()
}

extension WidgetFarmStatusData {
    static let placeholder = WidgetFarmStatusData(
        farmId: "placeholder",
        name: "Sample Farm",
        status: .running,
        progress: 0.5,
        phase: "Farming",
        updatedAt: Date(),
        etaSeconds: 1800,
        lastResult: nil,
        activeAgents: 2,
        totalAgents: 3,
        provider: "claude"
    )
}

extension WidgetFarmLogsData {
    static let placeholder = WidgetFarmLogsData(
        farmId: "placeholder",
        lines: [
            "$ claude --model opus-4",
            "[Agent-1] Starting analysis...",
            "[Agent-1] Processing files...",
            "[Agent-2] Building dependency graph",
            "[Agent-1] Implementing changes",
            "[System] Progress: 50%"
        ]
    )
}
