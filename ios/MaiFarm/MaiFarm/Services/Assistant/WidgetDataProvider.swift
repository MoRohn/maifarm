//
//  WidgetDataProvider.swift
//  MaiFarm
//
//  Provides session data to the widget via App Group shared container
//

import Foundation
import WidgetKit

// MARK: - Widget Data Provider

/// Provides session data to the widget
final class WidgetDataProvider: @unchecked Sendable {
    static let shared = WidgetDataProvider()

    private let appGroupIdentifier = "group.app.maifarm"
    private let sessionDataKey = "activeSession"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    private init() {}

    // MARK: - Update Widget Data

    /// Update widget with current session data
    func updateWidgetData(from assistant: AssistantService) async {
        guard let snapshot = await assistant.getContextSnapshot(),
              let sessionId = await assistant.getSessionId() else {
            clearWidgetData()
            return
        }

        let stallStatus = await assistant.getStallStatus()
        let nudgeStatus = await assistant.getNudgeStatus()

        let widgetData = WidgetSessionData(
            sessionId: sessionId,
            farmName: snapshot.farmName,
            progress: snapshot.progress,
            isActive: snapshot.status == "running" || snapshot.status == "active",
            isStalled: stallStatus?.isStalled ?? false,
            stallReason: stallStatus?.reason,
            inactivityDuration: stallStatus?.inactivityDuration ?? 0,
            activeAgents: snapshot.activeAgentCount,
            totalAgents: snapshot.totalAgents,
            nudgesSent: nudgeStatus?.nudgesSent ?? 0,
            lastNudgeTime: nudgeStatus?.lastNudgeTime
        )

        saveWidgetData(widgetData)
        reloadWidget()
    }

    /// Clear widget data when session ends
    func clearWidgetData() {
        sharedDefaults?.removeObject(forKey: sessionDataKey)
        reloadWidget()
    }

    // MARK: - Private Helpers

    private func saveWidgetData(_ data: WidgetSessionData) {
        guard let encoded = try? JSONEncoder().encode(data) else { return }
        sharedDefaults?.set(encoded, forKey: sessionDataKey)
    }

    private func reloadWidget() {
        WidgetCenter.shared.reloadTimelines(ofKind: "AssistantWidget")
    }

    // MARK: - Read Data (for widget)

    /// Read current session data (called from widget)
    func readWidgetData() -> WidgetSessionData? {
        guard let data = sharedDefaults?.data(forKey: sessionDataKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSessionData.self, from: data)
    }
}

// MARK: - Widget Session Data

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

// MARK: - Assistant Extension

extension AssistantService {
    /// Update widget with current state
    func updateWidget() async {
        await WidgetDataProvider.shared.updateWidgetData(from: self)
    }
}
