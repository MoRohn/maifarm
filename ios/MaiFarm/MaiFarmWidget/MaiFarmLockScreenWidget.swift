//
//  MaiFarmLockScreenWidget.swift
//  MaiFarmWidget
//
//  Lock Screen accessory widgets for quick status glance
//  Supports accessoryRectangular and accessoryCircular families
//

import WidgetKit
import SwiftUI

// MARK: - Lock Screen Entry

struct LockScreenEntry: TimelineEntry {
    let date: Date
    let rollup: WidgetRollup
    let topFarm: WidgetFarmStatusData?

    static let placeholder = LockScreenEntry(
        date: Date(),
        rollup: WidgetRollup(running: 1, queued: 2, completedToday: 5, failedToday: 0),
        topFarm: .placeholder
    )

    static let empty = LockScreenEntry(
        date: Date(),
        rollup: WidgetRollup(),
        topFarm: nil
    )
}

// MARK: - Timeline Provider

struct LockScreenTimelineProvider: TimelineProvider {
    typealias Entry = LockScreenEntry

    func placeholder(in context: Context) -> LockScreenEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (LockScreenEntry) -> Void) {
        let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()
        let entry = LockScreenEntry(
            date: Date(),
            rollup: dataStore.rollup,
            topFarm: dataStore.sortedFarms.first
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LockScreenEntry>) -> Void) {
        let dataStore = AppGroupFarmStatusStore.shared.fetchDataStore()
        let entry = LockScreenEntry(
            date: Date(),
            rollup: dataStore.rollup,
            topFarm: dataStore.sortedFarms.first
        )

        // Refresh every 15 minutes, or more frequently if active
        let hasActiveFarms = dataStore.farms.contains { $0.isActive }
        let refreshInterval: TimeInterval = hasActiveFarms ? 60 : 900

        let timeline = Timeline(
            entries: [entry],
            policy: .after(Date().addingTimeInterval(refreshInterval))
        )
        completion(timeline)
    }
}

// MARK: - Rectangular Widget View (Primary Lock Screen)

struct LockScreenRectangularView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let farm = entry.topFarm {
            // Show top farm with progress
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Image(systemName: "leaf.fill")
                            .font(.system(size: 10, weight: .semibold))
                        Text(farm.name)
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                    }

                    HStack(spacing: 4) {
                        Text(farm.status.displayName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.secondary)
                        Text("\(farm.progressPercentage)%")
                            .font(.system(size: 10, weight: .bold))
                    }
                }

                Spacer()

                // Circular progress
                ZStack {
                    Circle()
                        .stroke(Color.primary.opacity(0.2), lineWidth: 3)
                        .frame(width: 28, height: 28)

                    Circle()
                        .trim(from: 0, to: farm.progress)
                        .stroke(farm.status.color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .frame(width: 28, height: 28)
                        .rotationEffect(.degrees(-90))

                    Text("\(farm.activeAgents)")
                        .font(.system(size: 9, weight: .bold))
                }
            }
        } else {
            // Show rollup when no active farm
            HStack(spacing: 6) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 12, weight: .semibold))

                VStack(alignment: .leading, spacing: 2) {
                    Text("MaiFarm")
                        .font(.system(size: 11, weight: .semibold))

                    HStack(spacing: 8) {
                        Label("\(entry.rollup.running)", systemImage: "bolt.fill")
                        Label("\(entry.rollup.completedToday)", systemImage: "checkmark.circle")
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                }

                Spacer()
            }
        }
    }
}

// MARK: - Circular Widget View

struct LockScreenCircularView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let farm = entry.topFarm, farm.isActive {
            // Show progress ring for active farm
            ZStack {
                // Background ring
                Circle()
                    .stroke(Color.primary.opacity(0.2), lineWidth: 4)

                // Progress ring
                Circle()
                    .trim(from: 0, to: farm.progress)
                    .stroke(farm.status.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                // Center content
                VStack(spacing: 0) {
                    Text("\(farm.progressPercentage)")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                    Text("%")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityLabel("\(farm.name), \(farm.progressPercentage) percent complete")
        } else {
            // Show farm count or idle state
            ZStack {
                Circle()
                    .stroke(Color.primary.opacity(0.2), lineWidth: 3)

                VStack(spacing: 0) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 12, weight: .semibold))

                    if entry.rollup.running > 0 {
                        Text("\(entry.rollup.running)")
                            .font(.system(size: 10, weight: .bold))
                    }
                }
            }
            .accessibilityLabel(entry.rollup.accessibilityLabel)
        }
    }
}

// MARK: - Inline Widget View

struct LockScreenInlineView: View {
    let entry: LockScreenEntry

    var body: some View {
        if let farm = entry.topFarm, farm.isActive {
            Label {
                Text("\(farm.name) \(farm.progressPercentage)%")
            } icon: {
                Image(systemName: farm.status.icon)
            }
        } else {
            Label {
                Text("Running \(entry.rollup.running) | Done \(entry.rollup.completedToday)")
            } icon: {
                Image(systemName: "leaf.fill")
            }
        }
    }
}

// MARK: - Entry View

struct LockScreenEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: LockScreenEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            LockScreenRectangularView(entry: entry)
        case .accessoryCircular:
            LockScreenCircularView(entry: entry)
        case .accessoryInline:
            LockScreenInlineView(entry: entry)
        default:
            LockScreenRectangularView(entry: entry)
        }
    }
}

// MARK: - Widget Definition

struct MaiFarmLockScreenWidget: Widget {
    let kind: String = "MaiFarmLockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: LockScreenTimelineProvider()
        ) { entry in
            LockScreenEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "maifarm://harvest"))
        }
        .configurationDisplayName("MaiFarm Status")
        .description("Quick glance at your farm status from the Lock Screen.")
        #if os(iOS)
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
        #else
        .supportedFamilies([.accessoryRectangular, .accessoryCircular])
        #endif
    }
}

// MARK: - Previews

#if os(iOS)
#Preview("Rectangular - Active", as: .accessoryRectangular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.placeholder
}

#Preview("Rectangular - Empty", as: .accessoryRectangular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.empty
}

#Preview("Circular - Active", as: .accessoryCircular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.placeholder
}

#Preview("Circular - Idle", as: .accessoryCircular) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.empty
}

#Preview("Inline", as: .accessoryInline) {
    MaiFarmLockScreenWidget()
} timeline: {
    LockScreenEntry.placeholder
}
#endif
