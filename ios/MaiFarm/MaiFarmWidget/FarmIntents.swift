//
//  FarmIntents.swift
//  MaiFarmWidget
//
//  AppIntents for widget configuration - allows selecting a farm
//  Used by Farm Monitor and Harvest Terminal widgets
//

import AppIntents
import WidgetKit

// MARK: - Farm Entity

struct FarmEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Farm")
    }

    static var defaultQuery = FarmEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }

    init(id: String, name: String) {
        self.id = id
        self.name = name
    }

    init(from farmData: WidgetFarmStatusData) {
        self.id = farmData.farmId
        self.name = farmData.name
    }
}

// MARK: - Farm Entity Query

struct FarmEntityQuery: EntityQuery {
    func entities(for identifiers: [FarmEntity.ID]) async throws -> [FarmEntity] {
        let farms = AppGroupFarmStatusStore.shared.fetchFarms()
        return farms
            .filter { identifiers.contains($0.farmId) }
            .map { FarmEntity(from: $0) }
    }

    func suggestedEntities() async throws -> [FarmEntity] {
        let farms = AppGroupFarmStatusStore.shared.fetchFarms()
        // Return active farms first, then most recently updated
        return farms.sorted { farm1, farm2 in
            if farm1.isActive && !farm2.isActive { return true }
            if !farm1.isActive && farm2.isActive { return false }
            return farm1.updatedAt > farm2.updatedAt
        }
        .map { FarmEntity(from: $0) }
    }

    func defaultResult() async -> FarmEntity? {
        // Default to the most active farm
        let farms = AppGroupFarmStatusStore.shared.fetchFarms()
        if let activeFarm = farms.first(where: { $0.isActive }) {
            return FarmEntity(from: activeFarm)
        }
        return farms.first.map { FarmEntity(from: $0) }
    }
}

// MARK: - Farm Monitor Widget Intent

struct FarmMonitorConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Farm"
    static var description = IntentDescription("Choose a farm to monitor")

    @Parameter(title: "Farm")
    var farm: FarmEntity?

    init() {}

    init(farm: FarmEntity?) {
        self.farm = farm
    }
}

// MARK: - Harvest Terminal Widget Intent

struct HarvestTerminalConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Farm for Terminal"
    static var description = IntentDescription("Choose a farm to view terminal output")

    @Parameter(title: "Farm")
    var farm: FarmEntity?

    @Parameter(title: "Show Timestamps", default: true)
    var showTimestamps: Bool

    @Parameter(title: "Line Count", default: 12)
    var lineCount: Int

    init() {}

    init(farm: FarmEntity?, showTimestamps: Bool = true, lineCount: Int = 12) {
        self.farm = farm
        self.showTimestamps = showTimestamps
        self.lineCount = lineCount
    }
}

// MARK: - Open Harvest Intent (for widget button actions)

struct OpenHarvestIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Harvest"
    static var description = IntentDescription("Opens the Harvest view in MaiFarm")

    @Parameter(title: "Farm ID")
    var farmId: String?

    static var openAppWhenRun: Bool = true

    init() {}

    init(farmId: String?) {
        self.farmId = farmId
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        // The app will be opened via URL scheme
        return .result()
    }
}

// MARK: - Widget Center Reload Helper

enum WidgetReloadManager {
    private static var lastReloadTime: Date = .distantPast
    private static let minimumReloadInterval: TimeInterval = 5 // Debounce: 5 seconds

    /// Reload all MaiFarm widgets with debouncing
    static func reloadAllWidgets() {
        let now = Date()
        guard now.timeIntervalSince(lastReloadTime) >= minimumReloadInterval else {
            return // Skip if called too frequently
        }
        lastReloadTime = now

        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Reload specific widget kind with debouncing
    static func reloadWidget(kind: String) {
        let now = Date()
        guard now.timeIntervalSince(lastReloadTime) >= minimumReloadInterval else {
            return
        }
        lastReloadTime = now

        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    /// Widget kinds for targeted reloads
    enum WidgetKind {
        static let overview = "MaiFarmOverviewWidget"
        static let farmMonitor = "MaiFarmFarmMonitorWidget"
        static let harvestTerminal = "MaiFarmHarvestTerminalWidget"
        static let assistant = "AssistantWidget"
        static let lockScreen = "MaiFarmLockScreenWidget"
    }
}
