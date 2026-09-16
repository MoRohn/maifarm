//
//  AssistantWidget.swift
//  MaiFarmWidget
//
//  Dashboard widget showing Assistant status
//  Displays session progress, stall status, and nudge state
//

import WidgetKit
import SwiftUI

// MARK: - Widget Entry

struct AssistantWidgetEntry: TimelineEntry {
    let date: Date
    let configuration: AssistantWidgetConfigIntent

    // Session data
    let hasActiveSession: Bool
    let sessionId: String?
    let farmName: String?
    let progress: Double
    let status: SessionStatus
    let activeAgents: Int
    let totalAgents: Int

    // Stall data
    let isStalled: Bool
    let stallReason: String?
    let inactivityDuration: TimeInterval

    // Nudge data
    let nudgesSent: Int
    let lastNudgeTime: Date?

    enum SessionStatus: String {
        case idle = "Idle"
        case running = "Running"
        case stalled = "Stalled"
        case completed = "Completed"
        case failed = "Failed"

        var color: Color {
            switch self {
            case .idle: return .gray
            case .running: return .green
            case .stalled: return .orange
            case .completed: return .blue
            case .failed: return .red
            }
        }

        var icon: String {
            switch self {
            case .idle: return "moon.zzz.fill"
            case .running: return "bolt.fill"
            case .stalled: return "pause.circle.fill"
            case .completed: return "checkmark.circle.fill"
            case .failed: return "xmark.circle.fill"
            }
        }
    }

    static let placeholder = AssistantWidgetEntry(
        date: Date(),
        configuration: AssistantWidgetConfigIntent(),
        hasActiveSession: true,
        sessionId: "sample-session",
        farmName: "Sample Farm",
        progress: 0.65,
        status: .running,
        activeAgents: 2,
        totalAgents: 3,
        isStalled: false,
        stallReason: nil,
        inactivityDuration: 0,
        nudgesSent: 0,
        lastNudgeTime: nil
    )

    static let empty = AssistantWidgetEntry(
        date: Date(),
        configuration: AssistantWidgetConfigIntent(),
        hasActiveSession: false,
        sessionId: nil,
        farmName: nil,
        progress: 0,
        status: .idle,
        activeAgents: 0,
        totalAgents: 0,
        isStalled: false,
        stallReason: nil,
        inactivityDuration: 0,
        nudgesSent: 0,
        lastNudgeTime: nil
    )
}

// MARK: - Configuration Intent

struct AssistantWidgetConfigIntent {
    var showStallDetails: Bool = true
    var showNudgeCount: Bool = true
    var refreshInterval: Int = 60 // seconds
}

// MARK: - Timeline Provider

struct AssistantTimelineProvider: TimelineProvider {
    typealias Entry = AssistantWidgetEntry

    func placeholder(in context: Context) -> AssistantWidgetEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (AssistantWidgetEntry) -> Void) {
        let entry = fetchCurrentEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AssistantWidgetEntry>) -> Void) {
        let entry = fetchCurrentEntry()

        // Refresh more frequently when session is active
        let refreshInterval: TimeInterval = entry.hasActiveSession ? 30 : 300

        let nextUpdate = Date().addingTimeInterval(refreshInterval)
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))

        completion(timeline)
    }

    private func fetchCurrentEntry() -> AssistantWidgetEntry {
        // In production, read from shared App Group container
        // For now, return placeholder data
        let sharedDefaults = UserDefaults(suiteName: "group.app.maifarm")

        guard let sessionData = sharedDefaults?.data(forKey: "activeSession"),
              let session = try? JSONDecoder().decode(WidgetSessionData.self, from: sessionData) else {
            return .empty
        }

        return AssistantWidgetEntry(
            date: Date(),
            configuration: AssistantWidgetConfigIntent(),
            hasActiveSession: true,
            sessionId: session.sessionId,
            farmName: session.farmName,
            progress: session.progress,
            status: session.isStalled ? .stalled : (session.isActive ? .running : .completed),
            activeAgents: session.activeAgents,
            totalAgents: session.totalAgents,
            isStalled: session.isStalled,
            stallReason: session.stallReason,
            inactivityDuration: session.inactivityDuration,
            nudgesSent: session.nudgesSent,
            lastNudgeTime: session.lastNudgeTime
        )
    }
}

// MARK: - Shared Session Data

struct WidgetSessionData: Codable {
    let sessionId: String
    let farmName: String
    let progress: Double
    let isActive: Bool
    let isStalled: Bool
    let stallReason: String?
    let inactivityDuration: TimeInterval
    let activeAgents: Int
    let totalAgents: Int
    let nudgesSent: Int
    let lastNudgeTime: Date?
}

// MARK: - Widget Views

struct AssistantWidgetSmallView: View {
    let entry: AssistantWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: entry.status.icon)
                    .foregroundColor(entry.status.color)
                Text(entry.status.rawValue)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
            }

            if entry.hasActiveSession {
                // Farm name
                Text(entry.farmName ?? "Farm")
                    .font(.headline)
                    .lineLimit(1)

                // Progress
                ProgressView(value: entry.progress)
                    .tint(entry.status.color)

                // Agent count
                HStack {
                    Image(systemName: "person.2.fill")
                        .font(.caption2)
                    Text("\(entry.activeAgents)/\(entry.totalAgents)")
                        .font(.caption)
                }
                .foregroundColor(.secondary)
            } else {
                Text("No active session")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()
            }
        }
        .padding()
    }
}

struct AssistantWidgetMediumView: View {
    let entry: AssistantWidgetEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left side - status
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: entry.status.icon)
                        .font(.title2)
                        .foregroundColor(entry.status.color)

                    Text(entry.status.rawValue)
                        .font(.headline)
                }

                if entry.hasActiveSession {
                    Text(entry.farmName ?? "Farm")
                        .font(.subheadline)
                        .lineLimit(1)

                    ProgressView(value: entry.progress)
                        .tint(entry.status.color)

                    Text("\(Int(entry.progress * 100))% complete")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    Text("No active session")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            Divider()

            // Right side - details
            VStack(alignment: .leading, spacing: 8) {
                // Agents
                Label {
                    Text("\(entry.activeAgents)/\(entry.totalAgents) agents")
                        .font(.caption)
                } icon: {
                    Image(systemName: "person.2.fill")
                        .font(.caption)
                }

                // Stall info
                if entry.isStalled {
                    Label {
                        Text("Stalled \(formatDuration(entry.inactivityDuration))")
                            .font(.caption)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }

                // Nudge count
                if entry.nudgesSent > 0 {
                    Label {
                        Text("\(entry.nudgesSent) nudges sent")
                            .font(.caption)
                    } icon: {
                        Image(systemName: "bell.fill")
                            .font(.caption)
                    }
                }
            }
            .foregroundColor(.secondary)
        }
        .padding()
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        if duration < 60 {
            return "\(Int(duration))s ago"
        } else {
            return "\(Int(duration / 60))m ago"
        }
    }
}

struct AssistantWidgetLargeView: View {
    let entry: AssistantWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "sparkles")
                    .foregroundColor(.purple)
                Text("MaiFarm Assistant")
                    .font(.headline)
                Spacer()
                Text(entry.status.rawValue)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(entry.status.color.opacity(0.2))
                    .foregroundColor(entry.status.color)
                    .cornerRadius(8)
            }

            Divider()

            if entry.hasActiveSession {
                // Farm info
                VStack(alignment: .leading, spacing: 8) {
                    Text(entry.farmName ?? "Active Farm")
                        .font(.title3)
                        .fontWeight(.semibold)

                    // Progress bar
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("Progress")
                                .font(.caption)
                            Spacer()
                            Text("\(Int(entry.progress * 100))%")
                                .font(.caption)
                                .fontWeight(.medium)
                        }
                        .foregroundColor(.secondary)

                        ProgressView(value: entry.progress)
                            .tint(entry.status.color)
                    }
                }

                // Stats grid
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 12) {
                    StatCell(
                        icon: "person.2.fill",
                        title: "Agents",
                        value: "\(entry.activeAgents)/\(entry.totalAgents)"
                    )

                    StatCell(
                        icon: "bell.fill",
                        title: "Nudges",
                        value: "\(entry.nudgesSent)"
                    )
                }

                // Stall warning
                if entry.isStalled {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        VStack(alignment: .leading) {
                            Text("Session Stalled")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            if let reason = entry.stallReason {
                                Text(reason)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        Spacer()
                    }
                    .padding()
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)
                }
            } else {
                // Empty state
                VStack(spacing: 16) {
                    Image(systemName: "leaf.fill")
                        .font(.largeTitle)
                        .foregroundColor(.green.opacity(0.5))

                    Text("No Active Session")
                        .font(.headline)

                    Text("Start a farm to see Assistant status here")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Spacer(minLength: 0)

            // Footer
            HStack {
                Text("Last updated: \(formatTime(entry.date))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
            }
        }
        .padding()
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

struct StatCell: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.secondary)

            VStack(alignment: .leading) {
                Text(value)
                    .font(.headline)
                Text(title)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(8)
    }
}

// MARK: - Widget Entry View

struct AssistantWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: AssistantWidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            AssistantWidgetSmallView(entry: entry)
        case .systemMedium:
            AssistantWidgetMediumView(entry: entry)
        case .systemLarge:
            AssistantWidgetLargeView(entry: entry)
        default:
            AssistantWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Widget Definition

struct AssistantWidget: Widget {
    let kind: String = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: AssistantTimelineProvider()
        ) { entry in
            AssistantWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Assistant Status")
        .description("Monitor your farming session and stall detection status.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Widget Bundle

@main
struct MaiFarmWidgets: WidgetBundle {
    var body: some Widget {
        // Primary widgets
        MaiFarmOverviewWidget()
        MaiFarmFarmMonitorWidget()
        MaiFarmHarvestTerminalWidget()

        // Lock Screen widgets (iOS only)
        #if os(iOS)
        MaiFarmLockScreenWidget()
        #endif

        // Legacy Assistant widget
        AssistantWidget()
    }
}

// MARK: - Previews

#Preview("Small Widget", as: .systemSmall) {
    AssistantWidget()
} timeline: {
    AssistantWidgetEntry.placeholder
    AssistantWidgetEntry.empty
}

#Preview("Medium Widget", as: .systemMedium) {
    AssistantWidget()
} timeline: {
    AssistantWidgetEntry.placeholder
}

#Preview("Large Widget", as: .systemLarge) {
    AssistantWidget()
} timeline: {
    AssistantWidgetEntry.placeholder
    AssistantWidgetEntry(
        date: Date(),
        configuration: AssistantWidgetConfigIntent(),
        hasActiveSession: true,
        sessionId: "test",
        farmName: "Bug Fix Farm",
        progress: 0.45,
        status: .stalled,
        activeAgents: 0,
        totalAgents: 3,
        isStalled: true,
        stallReason: "All agents idle for 45 seconds",
        inactivityDuration: 45,
        nudgesSent: 1,
        lastNudgeTime: Date().addingTimeInterval(-30)
    )
}
