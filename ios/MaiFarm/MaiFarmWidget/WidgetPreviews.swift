//
//  WidgetPreviews.swift
//  MaiFarmWidget
//
//  Comprehensive widget previews for testing all states
//  Use Xcode Widget Preview canvas to view and test
//

import WidgetKit
import SwiftUI

// MARK: - Preview Data

enum WidgetPreviewData {

    // Active farm with multiple agents
    static let activeFarm = WidgetFarmStatusData(
        farmId: "preview-active",
        name: "Feature Development",
        status: .running,
        progress: 0.67,
        phase: "Farming",
        updatedAt: Date(),
        etaSeconds: 1800,
        lastResult: nil,
        activeAgents: 3,
        totalAgents: 5,
        provider: "claude"
    )

    // Completed farm with result
    static let completedFarm = WidgetFarmStatusData(
        farmId: "preview-completed",
        name: "Bug Fix Sprint",
        status: .completed,
        progress: 1.0,
        phase: "Done",
        updatedAt: Date().addingTimeInterval(-3600),
        etaSeconds: nil,
        lastResult: WidgetLastResult(
            success: true,
            summary: "Fixed 12 bugs, generated 8 files",
            timestamp: Date().addingTimeInterval(-3600),
            filesGenerated: 8
        ),
        activeAgents: 0,
        totalAgents: 3,
        provider: "claude"
    )

    // Failed farm
    static let failedFarm = WidgetFarmStatusData(
        farmId: "preview-failed",
        name: "API Integration",
        status: .failed,
        progress: 0.35,
        phase: "Error",
        updatedAt: Date().addingTimeInterval(-600),
        etaSeconds: nil,
        lastResult: WidgetLastResult(
            success: false,
            summary: "Build failed: 3 type errors",
            timestamp: Date().addingTimeInterval(-600),
            filesGenerated: 0
        ),
        activeAgents: 0,
        totalAgents: 4,
        provider: "claude"
    )

    // Queued farm
    static let queuedFarm = WidgetFarmStatusData(
        farmId: "preview-queued",
        name: "Documentation Update",
        status: .queued,
        progress: 0.0,
        phase: "Waiting",
        updatedAt: Date().addingTimeInterval(-60),
        etaSeconds: nil,
        lastResult: nil,
        activeAgents: 0,
        totalAgents: 2,
        provider: "openai"
    )

    // Farm with very long name
    static let longNameFarm = WidgetFarmStatusData(
        farmId: "preview-long",
        name: "Comprehensive End-to-End Testing Framework Implementation",
        status: .running,
        progress: 0.45,
        phase: "Analyzing",
        updatedAt: Date(),
        etaSeconds: 5400,
        lastResult: nil,
        activeAgents: 2,
        totalAgents: 3,
        provider: "claude"
    )

    // Sample logs
    static let sampleLogs = WidgetFarmLogsData(
        farmId: "preview-active",
        lines: [
            "$ claude --model opus-4 --task 'Implement feature'",
            "[System] Initializing agent cluster...",
            "[Agent-1] Connected to workspace",
            "[Agent-2] Loading context files...",
            "[Agent-3] Starting code analysis",
            "[Agent-1] Found 23 relevant files",
            "[Agent-2] Building dependency graph",
            "[Agent-3] Analyzing architecture patterns",
            "[Agent-1] Writing implementation code",
            "[System] Checkpoint saved",
            "[Agent-2] Running type checks...",
            "[Agent-3] All tests passing (42/42)",
            "[Agent-1] Optimizing performance",
            "[System] Progress: 67% complete"
        ]
    )

    // Error logs
    static let errorLogs = WidgetFarmLogsData(
        farmId: "preview-failed",
        lines: [
            "$ claude --task 'Fix API integration'",
            "[Agent-1] Analyzing codebase...",
            "[Agent-1] Error: Cannot find module '@api/client'",
            "[System] Warning: Build failed",
            "[Agent-1] Attempting automatic fix...",
            "[Agent-1] Error: Type mismatch in response handler",
            "[System] Error: Maximum retries exceeded"
        ]
    )

    // Sample data stores
    static let busyDataStore: WidgetDataStore = {
        WidgetDataStore(
            farms: [activeFarm, queuedFarm, completedFarm, failedFarm],
            logs: [
                activeFarm.farmId: sampleLogs,
                failedFarm.farmId: errorLogs
            ]
        )
    }()

    static let singleFarmDataStore: WidgetDataStore = {
        WidgetDataStore(
            farms: [activeFarm],
            logs: [activeFarm.farmId: sampleLogs]
        )
    }()

    static let completedDataStore: WidgetDataStore = {
        WidgetDataStore(
            farms: [completedFarm],
            logs: [:]
        )
    }()
}

// MARK: - Overview Widget Previews

#Preview("Overview Small - Active", as: .systemSmall) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.busyDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("Overview Small - Empty", as: .systemSmall) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.empty
}

#Preview("Overview Medium - Multiple Farms", as: .systemMedium) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.busyDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("Overview Medium - Single Farm", as: .systemMedium) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.singleFarmDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("Overview Large - Full", as: .systemLarge) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.busyDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("Overview Large - Empty", as: .systemLarge) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.empty
}

// MARK: - Farm Monitor Widget Previews

#Preview("Monitor Medium - Active", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetPreviewData.activeFarm,
        configuration: FarmMonitorConfigIntent()
    )
}

#Preview("Monitor Medium - Completed", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetPreviewData.completedFarm,
        configuration: FarmMonitorConfigIntent()
    )
}

#Preview("Monitor Medium - Failed", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetPreviewData.failedFarm,
        configuration: FarmMonitorConfigIntent()
    )
}

#Preview("Monitor Medium - Empty", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry.empty()
}

#Preview("Monitor Large - Active", as: .systemLarge) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetPreviewData.activeFarm,
        configuration: FarmMonitorConfigIntent()
    )
}

#Preview("Monitor Large - Long Name", as: .systemLarge) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetPreviewData.longNameFarm,
        configuration: FarmMonitorConfigIntent()
    )
}

// MARK: - Harvest Terminal Widget Previews

#Preview("Terminal - Active with Logs", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetPreviewData.activeFarm,
        logs: WidgetPreviewData.sampleLogs,
        configuration: HarvestTerminalConfigIntent()
    )
}

#Preview("Terminal - Error State", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetPreviewData.failedFarm,
        logs: WidgetPreviewData.errorLogs,
        configuration: HarvestTerminalConfigIntent()
    )
}

#Preview("Terminal - No Logs Yet", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetPreviewData.activeFarm,
        logs: nil,
        configuration: HarvestTerminalConfigIntent()
    )
}

#Preview("Terminal - Empty", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry.empty()
}

// MARK: - Lock Screen Widget Previews

#if os(iOS)
#Preview("Lock Screen Rectangular - Active", as: .accessoryRectangular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry(
        date: Date(),
        rollup: WidgetPreviewData.busyDataStore.rollup,
        topFarm: WidgetPreviewData.activeFarm
    )
}

#Preview("Lock Screen Rectangular - Idle", as: .accessoryRectangular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry(
        date: Date(),
        rollup: WidgetRollup(running: 0, queued: 0, completedToday: 5, failedToday: 1),
        topFarm: nil
    )
}

#Preview("Lock Screen Circular - Active", as: .accessoryCircular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry(
        date: Date(),
        rollup: WidgetPreviewData.busyDataStore.rollup,
        topFarm: WidgetPreviewData.activeFarm
    )
}

#Preview("Lock Screen Circular - Idle", as: .accessoryCircular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.empty
}

#Preview("Lock Screen Inline", as: .accessoryInline) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry(
        date: Date(),
        rollup: WidgetPreviewData.busyDataStore.rollup,
        topFarm: WidgetPreviewData.activeFarm
    )
}
#endif

// MARK: - macOS Widget Previews

#if os(macOS)
#Preview("macOS Small", as: .systemSmall) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.singleFarmDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("macOS Medium", as: .systemMedium) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.busyDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("macOS Large", as: .systemLarge) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry(
        date: Date(),
        dataStore: WidgetPreviewData.busyDataStore,
        configuration: OverviewWidgetConfiguration()
    )
}

#Preview("macOS Terminal", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetPreviewData.activeFarm,
        logs: WidgetPreviewData.sampleLogs,
        configuration: HarvestTerminalConfigIntent()
    )
}
#endif
