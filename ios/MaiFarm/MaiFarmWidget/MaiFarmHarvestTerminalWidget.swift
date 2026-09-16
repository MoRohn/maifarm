//
//  MaiFarmHarvestTerminalWidget.swift
//  MaiFarmWidget
//
//  Advanced widget showing a CLI terminal snapshot of harvest logs
//  Large widget only - displays monospaced terminal output
//

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Terminal Entry

struct HarvestTerminalEntry: TimelineEntry {
    let date: Date
    let farm: WidgetFarmStatusData?
    let logs: WidgetFarmLogsData?
    let configuration: HarvestTerminalConfigIntent

    var hasFarm: Bool { farm != nil }
    var hasLogs: Bool { logs != nil && !(logs?.lines.isEmpty ?? true) }

    var displayLines: [String] {
        let maxLines = configuration.lineCount > 0 ? configuration.lineCount : 12
        return Array((logs?.lines ?? []).suffix(maxLines))
    }

    static func placeholder(configuration: HarvestTerminalConfigIntent = HarvestTerminalConfigIntent()) -> HarvestTerminalEntry {
        let store = WidgetDataStore.singleFarmPlaceholder
        return HarvestTerminalEntry(
            date: Date(),
            farm: store.farms.first,
            logs: store.logs.values.first,
            configuration: configuration
        )
    }

    static func empty(configuration: HarvestTerminalConfigIntent = HarvestTerminalConfigIntent()) -> HarvestTerminalEntry {
        HarvestTerminalEntry(
            date: Date(),
            farm: nil,
            logs: nil,
            configuration: configuration
        )
    }
}

// MARK: - Timeline Provider

struct HarvestTerminalTimelineProvider: AppIntentTimelineProvider {
    typealias Entry = HarvestTerminalEntry
    typealias Intent = HarvestTerminalConfigIntent

    func placeholder(in context: Context) -> HarvestTerminalEntry {
        .placeholder()
    }

    func snapshot(for configuration: HarvestTerminalConfigIntent, in context: Context) async -> HarvestTerminalEntry {
        if let farmEntity = configuration.farm {
            let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()
            let farm = dataStore.farm(withId: farmEntity.id)
            let logs = dataStore.logs(forFarmId: farmEntity.id)
            return HarvestTerminalEntry(date: Date(), farm: farm, logs: logs, configuration: configuration)
        }

        return context.isPreview ? .placeholder(configuration: configuration) : .empty(configuration: configuration)
    }

    func timeline(for configuration: HarvestTerminalConfigIntent, in context: Context) async -> Timeline<HarvestTerminalEntry> {
        var entry: HarvestTerminalEntry

        if let farmEntity = configuration.farm {
            let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()
            let farm = dataStore.farm(withId: farmEntity.id)
            let logs = dataStore.logs(forFarmId: farmEntity.id)
            entry = HarvestTerminalEntry(date: Date(), farm: farm, logs: logs, configuration: configuration)
        } else {
            entry = .empty(configuration: configuration)
        }

        // Refresh frequently for active farms with logs
        let isActive = entry.farm?.isActive == true
        let refreshInterval: TimeInterval = isActive ? 15 : 300
        let nextUpdate = Date().addingTimeInterval(refreshInterval)

        return Timeline(entries: [entry], policy: .after(nextUpdate))
    }
}

// MARK: - Terminal View

struct HarvestTerminalLargeView: View {
    let entry: HarvestTerminalEntry

    var body: some View {
        if let farm = entry.farm {
            VStack(spacing: 0) {
                // Terminal header bar
                TerminalHeader(farm: farm, date: entry.date)

                // Terminal content
                TerminalContent(entry: entry)

                // Terminal footer
                TerminalFooter(farm: farm)
            }
            .background(TerminalColors.background)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        } else {
            EmptyTerminalView()
        }
    }
}

// MARK: - Terminal Header

private struct TerminalHeader: View {
    let farm: WidgetFarmStatusData
    let date: Date

    var body: some View {
        HStack(spacing: 8) {
            // Traffic light buttons
            HStack(spacing: 5) {
                Circle().fill(Color.red.opacity(0.8)).frame(width: 10, height: 10)
                Circle().fill(Color.yellow.opacity(0.8)).frame(width: 10, height: 10)
                Circle().fill(Color.green.opacity(0.8)).frame(width: 10, height: 10)
            }

            Spacer()

            // Farm name and status
            HStack(spacing: 6) {
                Text(farm.name)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(TerminalColors.title)
                    .lineLimit(1)

                Text("|")
                    .foregroundStyle(TerminalColors.dim)

                StatusIndicator(status: farm.status)

                Text("|")
                    .foregroundStyle(TerminalColors.dim)

                Text("LIVE SNAPSHOT")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(farm.isActive ? TerminalColors.success : TerminalColors.dim)
            }

            Spacer()

            // Timestamp
            Text(date.formatted(date: .omitted, time: .shortened))
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .foregroundStyle(TerminalColors.dim)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(TerminalColors.headerBackground)
    }
}

private struct StatusIndicator: View {
    let status: WidgetFarmStatus

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(status.color)
                .frame(width: 6, height: 6)
                .overlay {
                    if status == .running || status == .active {
                        Circle()
                            .stroke(status.color.opacity(0.5), lineWidth: 1)
                            .frame(width: 10, height: 10)
                    }
                }

            Text(status.displayName.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(status.color)
        }
    }
}

// MARK: - Terminal Content

private struct TerminalContent: View {
    let entry: HarvestTerminalEntry

    var body: some View {
        GeometryReader { geometry in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    if entry.hasLogs {
                        ForEach(Array(entry.displayLines.enumerated()), id: \.offset) { index, line in
                            TerminalLine(
                                line: line,
                                showTimestamp: entry.configuration.showTimestamps
                            )
                        }
                    } else {
                        // No logs yet
                        VStack(spacing: 8) {
                            Text("$ awaiting terminal output...")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(TerminalColors.prompt)

                            if entry.farm?.isActive == true {
                                HStack(spacing: 4) {
                                    ProgressView()
                                        .scaleEffect(0.6)
                                        .tint(TerminalColors.success)
                                    Text("Farm is active, logs will appear here")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(TerminalColors.dim)
                                }
                            } else {
                                Text("No harvest output yet. Tap to open Harvest.")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(TerminalColors.dim)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.top, 40)
                    }
                }
                .padding(10)
                .frame(minHeight: geometry.size.height)
            }
        }
        .background(TerminalColors.background)
    }
}

private struct TerminalLine: View {
    let line: String
    let showTimestamp: Bool

    // Parse and colorize terminal output
    private var styledLine: (prefix: String?, content: String, color: Color) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)

        // Detect prefixes like [Agent-1], [System], $, etc.
        if trimmed.hasPrefix("$") {
            return (nil, line, TerminalColors.prompt)
        } else if trimmed.hasPrefix("[System]") {
            return ("[System]", String(trimmed.dropFirst(8)).trimmingCharacters(in: .whitespaces), TerminalColors.system)
        } else if let match = trimmed.range(of: #"^\[Agent-\d+\]"#, options: .regularExpression) {
            let prefix = String(trimmed[match])
            let content = String(trimmed[match.upperBound...]).trimmingCharacters(in: .whitespaces)
            return (prefix, content, TerminalColors.agent)
        } else if trimmed.contains("Error") || trimmed.contains("error") || trimmed.contains("FAILED") {
            return (nil, line, TerminalColors.error)
        } else if trimmed.contains("Success") || trimmed.contains("success") || trimmed.contains("PASS") || trimmed.contains("complete") {
            return (nil, line, TerminalColors.success)
        } else if trimmed.contains("Warning") || trimmed.contains("warning") {
            return (nil, line, TerminalColors.warning)
        } else if trimmed.hasPrefix("#") || trimmed.hasPrefix("//") {
            return (nil, line, TerminalColors.comment)
        }

        return (nil, line, TerminalColors.text)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if let prefix = styledLine.prefix {
                Text(prefix)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(TerminalColors.accent)
            }

            Text(styledLine.content)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(styledLine.color)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Terminal Footer

private struct TerminalFooter: View {
    let farm: WidgetFarmStatusData

    var body: some View {
        HStack(spacing: 12) {
            // Progress indicator
            HStack(spacing: 6) {
                Text("Progress:")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(TerminalColors.dim)

                // ASCII-style progress bar
                let filled = Int(farm.progress * 20)
                let empty = 20 - filled
                Text("[\(String(repeating: "=", count: filled))\(String(repeating: "-", count: empty))]")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(farm.status.color)

                Text("\(farm.progressPercentage)%")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(TerminalColors.text)
            }

            Spacer()

            // Tap to open
            Link(destination: URL(string: "maifarm://harvest?farmId=\(farm.farmId)")!) {
                HStack(spacing: 4) {
                    Text("Open Full Terminal")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    Image(systemName: "arrow.up.forward.square")
                        .font(.system(size: 9))
                }
                .foregroundStyle(TerminalColors.accent)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(TerminalColors.footerBackground)
    }
}

// MARK: - Empty Terminal View

private struct EmptyTerminalView: View {
    var body: some View {
        VStack(spacing: 0) {
            // Empty header
            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    Circle().fill(Color.red.opacity(0.5)).frame(width: 10, height: 10)
                    Circle().fill(Color.yellow.opacity(0.5)).frame(width: 10, height: 10)
                    Circle().fill(Color.green.opacity(0.5)).frame(width: 10, height: 10)
                }
                Spacer()
                Text("MaiFarm Terminal")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(TerminalColors.dim)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(TerminalColors.headerBackground)

            // Empty content
            VStack(spacing: 16) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(TerminalColors.dim.opacity(0.5))

                VStack(spacing: 6) {
                    Text("No Farm Selected")
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundStyle(TerminalColors.text)

                    Text("Long press to configure and\nselect a farm to monitor")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(TerminalColors.dim)
                        .multilineTextAlignment(.center)
                }

                Link(destination: URL(string: "maifarm://harvest")!) {
                    Text("$ open maifarm")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(TerminalColors.prompt)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(TerminalColors.headerBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(TerminalColors.background)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Terminal Colors

private enum TerminalColors {
    static let background = Color(red: 0.1, green: 0.1, blue: 0.12)
    static let headerBackground = Color(red: 0.15, green: 0.15, blue: 0.18)
    static let footerBackground = Color(red: 0.12, green: 0.12, blue: 0.15)

    static let text = Color.white.opacity(0.9)
    static let title = Color.white
    static let dim = Color.white.opacity(0.4)

    static let prompt = Color(red: 0.4, green: 0.9, blue: 0.4) // Green prompt
    static let agent = Color(red: 0.5, green: 0.8, blue: 1.0) // Cyan for agents
    static let system = Color(red: 1.0, green: 0.8, blue: 0.3) // Yellow for system
    static let accent = Color(red: 0.6, green: 0.6, blue: 1.0) // Purple accent
    static let success = Color(red: 0.4, green: 0.9, blue: 0.4)
    static let error = Color(red: 1.0, green: 0.4, blue: 0.4)
    static let warning = Color(red: 1.0, green: 0.8, blue: 0.3)
    static let comment = Color(red: 0.5, green: 0.5, blue: 0.5)
}

// MARK: - Entry View

struct HarvestTerminalEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: HarvestTerminalEntry

    var body: some View {
        HarvestTerminalLargeView(entry: entry)
    }
}

// MARK: - Widget Definition

struct MaiFarmHarvestTerminalWidget: Widget {
    let kind: String = "MaiFarmHarvestTerminalWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: HarvestTerminalConfigIntent.self,
            provider: HarvestTerminalTimelineProvider()
        ) { entry in
            HarvestTerminalEntryView(entry: entry)
                .containerBackground(TerminalColors.background, for: .widget)
        }
        .configurationDisplayName("Harvest Terminal")
        .description("View a live CLI terminal snapshot of your farm's harvest process.")
        .supportedFamilies([.systemLarge])
        #if os(iOS)
        .contentMarginsDisabled()
        #endif
    }
}

// MARK: - Previews

#Preview("Terminal - Active", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry.placeholder()
}

#Preview("Terminal - Empty", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry.empty()
}

#Preview("Terminal - No Logs Yet", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetFarmStatusData.placeholder,
        logs: nil,
        configuration: HarvestTerminalConfigIntent()
    )
}

#Preview("Terminal - Error State", as: .systemLarge) {
    MaiFarmHarvestTerminalWidget()
} timeline: {
    HarvestTerminalEntry(
        date: Date(),
        farm: WidgetDataStore.errorPlaceholder.farms.first,
        logs: WidgetFarmLogsData(farmId: "error", lines: [
            "$ claude --task 'Fix bug'",
            "[Agent-1] Analyzing issue...",
            "[Agent-1] Error: Failed to compile",
            "[System] Build failed with 3 errors",
            "[Agent-1] Attempting recovery...",
            "[System] Error: Maximum retries exceeded"
        ]),
        configuration: HarvestTerminalConfigIntent()
    )
}
