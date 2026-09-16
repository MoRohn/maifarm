//
//  MaiFarmOverviewWidget.swift
//  MaiFarmWidget
//
//  Overview widget showing farm status rollups and top farms
//  Supports Small, Medium, and Large widget families
//

import WidgetKit
import SwiftUI

// MARK: - Overview Widget Entry

struct OverviewWidgetEntry: TimelineEntry {
    let date: Date
    let dataStore: WidgetDataStore
    let configuration: OverviewWidgetConfiguration

    static let placeholder = OverviewWidgetEntry(
        date: Date(),
        dataStore: .placeholder,
        configuration: OverviewWidgetConfiguration()
    )

    static let empty = OverviewWidgetEntry(
        date: Date(),
        dataStore: .empty,
        configuration: OverviewWidgetConfiguration()
    )
}

// MARK: - Configuration

struct OverviewWidgetConfiguration {
    var showRollup: Bool = true
    var maxFarmsToShow: Int = 3
}

// MARK: - Timeline Provider

struct OverviewTimelineProvider: TimelineProvider {
    typealias Entry = OverviewWidgetEntry

    func placeholder(in context: Context) -> OverviewWidgetEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (OverviewWidgetEntry) -> Void) {
        let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()
        let entry = OverviewWidgetEntry(
            date: Date(),
            dataStore: dataStore.farms.isEmpty ? .placeholder : dataStore,
            configuration: OverviewWidgetConfiguration()
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OverviewWidgetEntry>) -> Void) {
        let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()

        let entry = OverviewWidgetEntry(
            date: Date(),
            dataStore: dataStore,
            configuration: OverviewWidgetConfiguration()
        )

        // Refresh more frequently when there are active farms
        let hasActiveFarms = dataStore.farms.contains { $0.isActive }
        let refreshInterval: TimeInterval = hasActiveFarms ? 60 : 900 // 1 min vs 15 min

        let nextUpdate = Date().addingTimeInterval(refreshInterval)
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))

        completion(timeline)
    }
}

// MARK: - Small Widget View

struct OverviewWidgetSmallView: View {
    let entry: OverviewWidgetEntry

    private var rollup: WidgetRollup { entry.dataStore.rollup }
    private var topFarm: WidgetFarmStatusData? { entry.dataStore.sortedFarms.first }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with logo
            HStack(spacing: 6) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.green)
                Text("MaiFarm")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer()
            }

            if let farm = topFarm {
                // Show top farm
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(farm.status.color)
                            .frame(width: 8, height: 8)
                        Text(farm.name)
                            .font(.system(size: 12, weight: .medium))
                            .lineLimit(1)
                    }

                    ProgressView(value: farm.progress)
                        .tint(farm.status.color)
                        .scaleEffect(y: 0.8)

                    Text("\(farm.progressPercentage)% \(farm.phase)")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                // Rollup stats
                HStack(spacing: 8) {
                    StatBadge(value: rollup.running, label: "Run", color: .green)
                    StatBadge(value: rollup.completedToday, label: "Done", color: .blue)
                }
            } else {
                // Empty state
                Spacer()
                VStack(spacing: 4) {
                    Image(systemName: "leaf.circle")
                        .font(.system(size: 24))
                        .foregroundStyle(.secondary)
                    Text("No farms")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            }
        }
        .padding(12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rollup.accessibilityLabel)
    }
}

private struct StatBadge: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Medium Widget View

struct OverviewWidgetMediumView: View {
    let entry: OverviewWidgetEntry

    private var rollup: WidgetRollup { entry.dataStore.rollup }
    private var topFarms: [WidgetFarmStatusData] {
        Array(entry.dataStore.sortedFarms.prefix(2))
    }

    var body: some View {
        HStack(spacing: 16) {
            // Left: Rollup stats
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.green)
                    Text("MaiFarm")
                        .font(.system(size: 15, weight: .bold))
                }

                Spacer()

                // Stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    RollupCell(value: rollup.running, label: "Running", icon: "bolt.fill", color: .green)
                    RollupCell(value: rollup.queued, label: "Queued", icon: "clock.fill", color: .orange)
                    RollupCell(value: rollup.completedToday, label: "Today", icon: "checkmark.circle", color: .blue)
                    RollupCell(value: rollup.failedToday, label: "Failed", icon: "xmark.circle", color: .red)
                }

                Text("Updated \(entry.date.formatted(.relative(presentation: .numeric)))")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
            }

            Divider()

            // Right: Top farms list
            VStack(alignment: .leading, spacing: 6) {
                Text("Active Farms")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)

                if topFarms.isEmpty {
                    Spacer()
                    Text("No active farms")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity)
                    Spacer()
                } else {
                    ForEach(topFarms) { farm in
                        Link(destination: URL(string: "maifarm://harvest?farmId=\(farm.farmId)")!) {
                            FarmRowCompact(farm: farm)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(14)
        .accessibilityElement(children: .contain)
    }
}

private struct RollupCell: View {
    let value: Int
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(color)
            Text("\(value)")
                .font(.system(size: 13, weight: .bold, design: .rounded))
        }
        .accessibilityLabel("\(value) \(label)")
    }
}

private struct FarmRowCompact: View {
    let farm: WidgetFarmStatusData

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Circle()
                    .fill(farm.status.color)
                    .frame(width: 6, height: 6)
                Text(farm.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                Spacer()
                Text(farm.status.displayName)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(farm.status.color)
            }

            HStack(spacing: 4) {
                ProgressView(value: farm.progress)
                    .tint(farm.status.color)
                    .scaleEffect(y: 0.6)
                Text("\(farm.progressPercentage)%")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 26, alignment: .trailing)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(farm.name), \(farm.status.accessibilityLabel), \(farm.progressPercentage) percent complete")
    }
}

// MARK: - Large Widget View

struct OverviewWidgetLargeView: View {
    let entry: OverviewWidgetEntry

    private var rollup: WidgetRollup { entry.dataStore.rollup }
    private var topFarms: [WidgetFarmStatusData] {
        Array(entry.dataStore.sortedFarms.prefix(4))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.green)
                    Text("MaiFarm Overview")
                        .font(.system(size: 17, weight: .bold))
                }

                Spacer()

                Text(entry.date.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }

            // Rollup banner
            HStack(spacing: 0) {
                RollupBannerItem(value: rollup.running, label: "Running", color: .green)
                Divider().frame(height: 30)
                RollupBannerItem(value: rollup.queued, label: "Queued", color: .orange)
                Divider().frame(height: 30)
                RollupBannerItem(value: rollup.completedToday, label: "Completed", color: .blue)
                Divider().frame(height: 30)
                RollupBannerItem(value: rollup.failedToday, label: "Failed", color: rollup.failedToday > 0 ? .red : .secondary)
            }
            .padding(.vertical, 8)
            .background(Color.secondary.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Farms list
            VStack(alignment: .leading, spacing: 4) {
                Text("Top Farms")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)

                if topFarms.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "leaf.circle.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(.secondary.opacity(0.5))
                        Text("No farms yet")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.secondary)
                        Text("Open MaiFarm to create your first farm")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ForEach(topFarms) { farm in
                        Link(destination: URL(string: "maifarm://harvest?farmId=\(farm.farmId)")!) {
                            FarmRowExpanded(farm: farm)
                        }
                    }
                }
            }

            Spacer(minLength: 0)

            // Footer
            HStack {
                Text("Tap farm to open Harvest")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
                Spacer()
                Link(destination: URL(string: "maifarm://harvest")!) {
                    Label("Open Harvest", systemImage: "arrow.up.forward.app")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.blue)
                }
            }
        }
        .padding(16)
    }
}

private struct RollupBannerItem: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(value) \(label)")
    }
}

private struct FarmRowExpanded: View {
    let farm: WidgetFarmStatusData

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(farm.status.color)
                .frame(width: 10, height: 10)
                .overlay {
                    if farm.isActive {
                        Circle()
                            .stroke(farm.status.color.opacity(0.3), lineWidth: 2)
                            .frame(width: 16, height: 16)
                    }
                }

            // Farm info
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(farm.name)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                    Spacer()
                    StatusChip(status: farm.status)
                }

                HStack(spacing: 8) {
                    // Progress
                    HStack(spacing: 4) {
                        ProgressView(value: farm.progress)
                            .tint(farm.status.color)
                            .frame(width: 60)
                            .scaleEffect(y: 0.7)
                        Text("\(farm.progressPercentage)%")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.secondary)
                    }

                    // Phase
                    Text(farm.phase)
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)

                    Spacer()

                    // Agents
                    HStack(spacing: 2) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 8))
                        Text("\(farm.activeAgents)/\(farm.totalAgents)")
                            .font(.system(size: 9))
                    }
                    .foregroundStyle(.secondary)

                    // ETA if available
                    if let eta = farm.formattedETA {
                        HStack(spacing: 2) {
                            Image(systemName: "clock")
                                .font(.system(size: 8))
                            Text(eta)
                                .font(.system(size: 9))
                        }
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct StatusChip: View {
    let status: WidgetFarmStatus

    var body: some View {
        Text(status.displayName)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(status.color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(status.color.opacity(0.15))
            .clipShape(Capsule())
    }
}

// MARK: - Entry View

struct OverviewWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: OverviewWidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            OverviewWidgetSmallView(entry: entry)
        case .systemMedium:
            OverviewWidgetMediumView(entry: entry)
        case .systemLarge:
            OverviewWidgetLargeView(entry: entry)
        default:
            OverviewWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Widget Definition

struct MaiFarmOverviewWidget: Widget {
    let kind: String = "MaiFarmOverviewWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: OverviewTimelineProvider()
        ) { entry in
            OverviewWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "maifarm://harvest"))
        }
        .configurationDisplayName("MaiFarm Overview")
        .description("Monitor all your farms at a glance with status rollups and progress.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        #if os(iOS)
        .contentMarginsDisabled()
        #endif
    }
}

// MARK: - Previews

#Preview("Small - Active", as: .systemSmall) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.placeholder
}

#Preview("Small - Empty", as: .systemSmall) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.empty
}

#Preview("Medium", as: .systemMedium) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.placeholder
}

#Preview("Large", as: .systemLarge) {
    MaiFarmOverviewWidget()
} timeline: {
    OverviewWidgetEntry.placeholder
    OverviewWidgetEntry.empty
}
