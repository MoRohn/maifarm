//
//  MaiFarmFarmMonitorWidget.swift
//  MaiFarmWidget
//
//  Configurable widget to monitor a single selected farm
//  Supports Medium and Large widget families
//

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Farm Monitor Entry

struct FarmMonitorEntry: TimelineEntry {
    let date: Date
    let farm: WidgetFarmStatusData?
    let configuration: FarmMonitorConfigIntent

    var hasFarm: Bool { farm != nil }

    static func placeholder(configuration: FarmMonitorConfigIntent = FarmMonitorConfigIntent()) -> FarmMonitorEntry {
        FarmMonitorEntry(
            date: Date(),
            farm: .placeholder,
            configuration: configuration
        )
    }

    static func empty(configuration: FarmMonitorConfigIntent = FarmMonitorConfigIntent()) -> FarmMonitorEntry {
        FarmMonitorEntry(
            date: Date(),
            farm: nil,
            configuration: configuration
        )
    }
}

// MARK: - Timeline Provider

struct FarmMonitorTimelineProvider: AppIntentTimelineProvider {
    typealias Entry = FarmMonitorEntry
    typealias Intent = FarmMonitorConfigIntent

    func placeholder(in context: Context) -> FarmMonitorEntry {
        .placeholder()
    }

    func snapshot(for configuration: FarmMonitorConfigIntent, in context: Context) async -> FarmMonitorEntry {
        if let farmEntity = configuration.farm,
           let farm = AppGroupFarmStatusStore.shared.fetchFarm(id: farmEntity.id) {
            return FarmMonitorEntry(date: Date(), farm: farm, configuration: configuration)
        }

        // Use placeholder if no farm selected
        return context.isPreview ? .placeholder(configuration: configuration) : .empty(configuration: configuration)
    }

    func timeline(for configuration: FarmMonitorConfigIntent, in context: Context) async -> Timeline<FarmMonitorEntry> {
        var entry: FarmMonitorEntry

        if let farmEntity = configuration.farm,
           let farm = AppGroupFarmStatusStore.shared.fetchFarm(id: farmEntity.id) {
            entry = FarmMonitorEntry(date: Date(), farm: farm, configuration: configuration)
        } else {
            entry = .empty(configuration: configuration)
        }

        // Refresh more frequently for active farms
        let refreshInterval: TimeInterval = entry.farm?.isActive == true ? 30 : 300
        let nextUpdate = Date().addingTimeInterval(refreshInterval)

        return Timeline(entries: [entry], policy: .after(nextUpdate))
    }
}

// MARK: - Medium Widget View

struct FarmMonitorMediumView: View {
    let entry: FarmMonitorEntry

    var body: some View {
        if let farm = entry.farm {
            HStack(spacing: 16) {
                // Left side - Main info
                VStack(alignment: .leading, spacing: 8) {
                    // Header
                    HStack(spacing: 6) {
                        Image(systemName: farm.status.icon)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(farm.status.color)

                        VStack(alignment: .leading, spacing: 0) {
                            Text(farm.name)
                                .font(.system(size: 14, weight: .bold))
                                .lineLimit(1)
                            Text(farm.status.displayName)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(farm.status.color)
                        }
                    }

                    // Progress section
                    VStack(alignment: .leading, spacing: 4) {
                        ProgressView(value: farm.progress)
                            .tint(farm.status.color)

                        HStack {
                            Text("\(farm.progressPercentage)% complete")
                                .font(.system(size: 11, weight: .medium))
                            Spacer()
                            Text(farm.phase)
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer(minLength: 0)

                    // CTA
                    Link(destination: URL(string: "maifarm://harvest?farmId=\(farm.farmId)")!) {
                        HStack(spacing: 4) {
                            Text("Open Harvest")
                                .font(.system(size: 11, weight: .semibold))
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(farm.status.color)
                        .clipShape(Capsule())
                    }
                }

                Divider()

                // Right side - Stats
                VStack(alignment: .leading, spacing: 10) {
                    StatRow(icon: "person.2.fill", label: "Agents", value: "\(farm.activeAgents)/\(farm.totalAgents)")

                    if let eta = farm.formattedETA {
                        StatRow(icon: "clock.fill", label: "ETA", value: eta)
                    }

                    StatRow(icon: "cpu", label: "Provider", value: farm.provider.capitalized)

                    if let result = farm.lastResult {
                        StatRow(
                            icon: result.success ? "checkmark.circle.fill" : "xmark.circle.fill",
                            label: "Last Run",
                            value: result.success ? "Success" : "Failed",
                            color: result.success ? .green : .red
                        )
                    }

                    Text(farm.timeSinceUpdate)
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: 100)
            }
            .padding(14)
        } else {
            EmptyFarmView()
        }
    }
}

private struct StatRow: View {
    let icon: String
    let label: String
    let value: String
    var color: Color = .secondary

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(color)
                .frame(width: 14)

            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Large Widget View

struct FarmMonitorLargeView: View {
    let entry: FarmMonitorEntry

    var body: some View {
        if let farm = entry.farm {
            VStack(alignment: .leading, spacing: 14) {
                // Header
                HStack {
                    HStack(spacing: 10) {
                        ZStack {
                            Circle()
                                .fill(farm.status.color.opacity(0.2))
                                .frame(width: 40, height: 40)

                            Image(systemName: farm.status.icon)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(farm.status.color)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(farm.name)
                                .font(.system(size: 17, weight: .bold))
                                .lineLimit(1)

                            HStack(spacing: 6) {
                                StatusChipLarge(status: farm.status)
                                Text(farm.phase)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer()

                    Text(entry.date.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                }

                // Progress section
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Progress")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(farm.progressPercentage)%")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(farm.status.color)
                    }

                    ProgressView(value: farm.progress)
                        .tint(farm.status.color)
                        .scaleEffect(y: 1.5)
                }
                .padding()
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                // Stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    StatCard(icon: "person.2.fill", title: "Agents", value: "\(farm.activeAgents)/\(farm.totalAgents)", subtitle: "active")

                    if let eta = farm.formattedETA {
                        StatCard(icon: "clock.fill", title: "ETA", value: eta, subtitle: "remaining")
                    } else {
                        StatCard(icon: "hourglass", title: "Duration", value: "\(farm.totalAgents)h", subtitle: "allocated")
                    }

                    StatCard(icon: "cpu", title: "Provider", value: farm.provider.capitalized, subtitle: "AI engine")

                    if let result = farm.lastResult {
                        StatCard(
                            icon: result.success ? "checkmark.circle.fill" : "xmark.circle.fill",
                            title: "Last Result",
                            value: result.success ? "Success" : "Failed",
                            subtitle: result.summary,
                            valueColor: result.success ? .green : .red
                        )
                    } else {
                        StatCard(icon: "sparkles", title: "Status", value: farm.status.displayName, subtitle: "current")
                    }
                }

                Spacer(minLength: 0)

                // Footer with CTA
                HStack {
                    Text("Updated \(farm.timeSinceUpdate)")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)

                    Spacer()

                    Link(destination: URL(string: "maifarm://harvest?farmId=\(farm.farmId)")!) {
                        HStack(spacing: 4) {
                            Text("Open Harvest")
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 10, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(farm.status.color)
                        .clipShape(Capsule())
                    }
                }
            }
            .padding(16)
        } else {
            EmptyFarmView()
        }
    }
}

private struct StatusChipLarge: View {
    let status: WidgetFarmStatus

    var body: some View {
        Text(status.displayName)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(status.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.color.opacity(0.15))
            .clipShape(Capsule())
    }
}

private struct StatCard: View {
    let icon: String
    let title: String
    let value: String
    let subtitle: String
    var valueColor: Color = .primary

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(valueColor)
                Text(title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(10)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Empty State View

private struct EmptyFarmView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "leaf.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(.secondary.opacity(0.5))

            Text("No Farm Selected")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)

            Text("Long press to configure and select a farm to monitor")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            Link(destination: URL(string: "maifarm://farms")!) {
                Text("Open MaiFarm")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.blue)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Entry View

struct FarmMonitorEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: FarmMonitorEntry

    var body: some View {
        switch family {
        case .systemMedium:
            FarmMonitorMediumView(entry: entry)
        case .systemLarge:
            FarmMonitorLargeView(entry: entry)
        default:
            FarmMonitorMediumView(entry: entry)
        }
    }
}

// MARK: - Widget Definition

struct MaiFarmFarmMonitorWidget: Widget {
    let kind: String = "MaiFarmFarmMonitorWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: FarmMonitorConfigIntent.self,
            provider: FarmMonitorTimelineProvider()
        ) { entry in
            FarmMonitorEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Farm Monitor")
        .description("Monitor a specific farm with detailed status and progress.")
        .supportedFamilies([.systemMedium, .systemLarge])
        #if os(iOS)
        .contentMarginsDisabled()
        #endif
    }
}

// MARK: - Previews

#Preview("Medium - Active", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry.placeholder()
}

#Preview("Medium - Empty", as: .systemMedium) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry.empty()
}

#Preview("Large - Active", as: .systemLarge) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry.placeholder()
}

#Preview("Large - With Result", as: .systemLarge) {
    MaiFarmFarmMonitorWidget()
} timeline: {
    FarmMonitorEntry(
        date: Date(),
        farm: WidgetFarmStatusData(
            farmId: "test",
            name: "Feature Implementation",
            status: .running,
            progress: 0.75,
            phase: "Synthesizing",
            updatedAt: Date(),
            etaSeconds: 1200,
            lastResult: WidgetLastResult(
                success: true,
                summary: "Generated 15 files",
                timestamp: Date().addingTimeInterval(-3600),
                filesGenerated: 15
            ),
            activeAgents: 3,
            totalAgents: 4,
            provider: "claude"
        ),
        configuration: FarmMonitorConfigIntent()
    )
}
