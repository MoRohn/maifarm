//
//  MaiFarmIntents.swift
//  MaiFarm
//
//  App Intents for Siri Shortcuts integration
//  Enables voice commands and automation for key farming operations
//

import AppIntents
import SwiftUI
import Combine

// MARK: - Quick Task Intent

struct RunQuickTaskIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Run Quick Task"
    nonisolated(unsafe) static var description = IntentDescription("Start a 5-minute Quick Task with AI assistance")
    nonisolated(unsafe) static var openAppWhenRun: Bool = true

    @Parameter(title: "Task Description", description: "What would you like the AI to help with?")
    var taskDescription: String?

    @Parameter(title: "Use Clipboard", description: "Use clipboard content as task input")
    var useClipboard: Bool

    init() {
        self.useClipboard = false
    }

    init(taskDescription: String) {
        self.taskDescription = taskDescription
        self.useClipboard = false
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        var description = taskDescription ?? ""

        // Get clipboard content if requested
        if useClipboard || description.isEmpty {
            #if canImport(UIKit)
            if let clipboardText = UIPasteboard.general.string, !clipboardText.isEmpty {
                description = clipboardText
            }
            #endif
        }

        guard !description.isEmpty else {
            return .result(
                dialog: "Please provide a task description or copy text to your clipboard.",
                view: QuickTaskResultView(success: false, message: "No task provided")
            )
        }

        // Signal the app to start a quick task
        NotificationCenter.default.post(
            name: .startQuickTaskFromIntent,
            object: nil,
            userInfo: ["description": description]
        )

        return .result(
            dialog: "Starting your Quick Task. AI will help you with: \(description.prefix(50))...",
            view: QuickTaskResultView(success: true, message: "Quick Task started")
        )
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Run Quick Task: \(\.$taskDescription)") {
            \.$useClipboard
        }
    }
}

// MARK: - Create Farm Intent

struct CreateFarmIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Create AI Farm"
    nonisolated(unsafe) static var description = IntentDescription("Create a new AI agent farm for complex tasks")
    nonisolated(unsafe) static var openAppWhenRun: Bool = true

    @Parameter(title: "Farm Name", description: "Name for your new farm")
    var farmName: String

    @Parameter(title: "Number of Agents", description: "How many AI agents to deploy", default: 3)
    var agentCount: Int

    @Parameter(title: "Duration (minutes)", description: "How long the farm should run", default: 60)
    var duration: Int

    @Parameter(title: "AI Provider", description: "Which AI provider to use")
    var provider: AIProviderEntity?

    @Parameter(title: "Goal", description: "What should the farm accomplish?")
    var goal: String?

    init() {}

    init(farmName: String, agentCount: Int = 3, duration: Int = 60) {
        self.farmName = farmName
        self.agentCount = agentCount
        self.duration = duration
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Validate with thermal monitor
        let thermalCheck = ThermalStateMonitor.shared.canStartNewFarm(
            requestedAgents: agentCount,
            requestedDuration: duration
        )

        guard thermalCheck.allowed else {
            return .result(dialog: IntentDialog(stringLiteral: thermalCheck.reason ?? "Cannot create farm under current device conditions."))
        }

        // Signal the app to create a farm
        NotificationCenter.default.post(
            name: .createFarmFromIntent,
            object: nil,
            userInfo: [
                "name": farmName,
                "agents": agentCount,
                "duration": duration,
                "provider": provider?.id ?? "claude",
                "goal": goal ?? ""
            ]
        )

        return .result(dialog: "Creating farm '\(farmName)' with \(agentCount) agents for \(duration) minutes.")
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Create farm \(\.$farmName) with \(\.$agentCount) agents") {
            \.$duration
            \.$provider
            \.$goal
        }
    }
}

// MARK: - Go Wild Intent

struct GoWildIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Go Wild"
    nonisolated(unsafe) static var description = IntentDescription("Start an autonomous AI exploration session")
    nonisolated(unsafe) static var openAppWhenRun: Bool = true

    @Parameter(title: "Exploration Goal", description: "What should the AI explore?")
    var explorationGoal: String

    init() {}

    init(goal: String) {
        self.explorationGoal = goal
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .goWildFromIntent,
            object: nil,
            userInfo: ["goal": explorationGoal]
        )

        return .result(dialog: "Starting Go Wild exploration: \(explorationGoal.prefix(50))...")
    }
}

// MARK: - View Latest Harvest Intent

struct ViewLatestHarvestIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "View Latest Harvest"
    nonisolated(unsafe) static var description = IntentDescription("Open the most recent harvest results")
    nonisolated(unsafe) static var openAppWhenRun: Bool = true

    init() {}

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotificationCenter.default.post(
            name: .viewLatestHarvestFromIntent,
            object: nil
        )

        return .result(dialog: "Opening your latest harvest results.")
    }
}

// MARK: - Check Farm Status Intent

struct CheckFarmStatusIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Check Farm Status"
    nonisolated(unsafe) static var description = IntentDescription("Check the status of running farms")

    @Parameter(title: "Farm Name", description: "Which farm to check (leave empty for all)")
    var farmName: String?

    init() {}

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let farms = AppState.shared.farms

        if let name = farmName, !name.isEmpty {
            if let farm = farms.first(where: { $0.name.lowercased().contains(name.lowercased()) }) {
                return .result(
                    dialog: "Farm '\(farm.name)' is \(farm.status.displayName) with \(Int((farm.progress ?? 0) * 100))% progress.",
                    view: FarmStatusSnippetView(farm: farm)
                )
            } else {
                return .result(
                    dialog: "No farm found matching '\(name)'.",
                    view: EmptyFarmStatusView()
                )
            }
        } else {
            let runningFarms = farms.filter { $0.status == .running || $0.status == .active }
            if runningFarms.isEmpty {
                return .result(
                    dialog: "No farms are currently running.",
                    view: EmptyFarmStatusView()
                )
            } else {
                let summary = runningFarms.map { "\($0.name): \($0.status.displayName)" }.joined(separator: ", ")
                return .result(
                    dialog: "\(runningFarms.count) farms running: \(summary)",
                    view: MultiFarmStatusView(farms: runningFarms)
                )
            }
        }
    }
}

// MARK: - Stop Farm Intent

struct StopFarmIntent: AppIntent {
    nonisolated(unsafe) static var title: LocalizedStringResource = "Stop Farm"
    nonisolated(unsafe) static var description = IntentDescription("Stop a running farm")
    nonisolated(unsafe) static var openAppWhenRun: Bool = false

    @Parameter(title: "Farm Name", description: "Name of the farm to stop")
    var farmName: String

    init() {}

    init(farmName: String) {
        self.farmName = farmName
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        if let farm = AppState.shared.farms.first(where: { $0.name.lowercased().contains(farmName.lowercased()) }) {
            await AppState.shared.stopFarm(farm.id)
            return .result(dialog: "Stopping farm '\(farm.name)'.")
        } else {
            return .result(dialog: "No farm found matching '\(farmName)'.")
        }
    }
}

// MARK: - AI Provider Entity

struct AIProviderEntity: AppEntity {
    var id: String
    var displayName: String

    nonisolated(unsafe) static var typeDisplayRepresentation: TypeDisplayRepresentation = "AI Provider"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(displayName)")
    }

    nonisolated(unsafe) static var defaultQuery = AIProviderQuery()

    static let allProviders: [AIProviderEntity] = [
        AIProviderEntity(id: "claude", displayName: "Claude"),
        AIProviderEntity(id: "openai", displayName: "OpenAI"),
        AIProviderEntity(id: "ollama", displayName: "Ollama (Local)"),
        AIProviderEntity(id: "gpt_oss", displayName: "GPT-OSS (Local)")
    ]
}

struct AIProviderQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [AIProviderEntity] {
        AIProviderEntity.allProviders.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [AIProviderEntity] {
        AIProviderEntity.allProviders
    }
}

// MARK: - App Shortcuts Provider

struct MaiFarmShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RunQuickTaskIntent(),
            phrases: [
                "Run a quick task in \(.applicationName)",
                "Start quick task with \(.applicationName)",
                "Quick AI help from \(.applicationName)",
                "Ask \(.applicationName) for help"
            ],
            shortTitle: "Quick Task",
            systemImageName: "bolt.fill"
        )

        AppShortcut(
            intent: CreateFarmIntent(farmName: "New Farm"),
            phrases: [
                "Create a farm in \(.applicationName)",
                "Start new AI farm with \(.applicationName)",
                "Deploy AI agents in \(.applicationName)"
            ],
            shortTitle: "Create Farm",
            systemImageName: "leaf.fill"
        )

        AppShortcut(
            intent: GoWildIntent(goal: ""),
            phrases: [
                "Go wild in \(.applicationName)",
                "Start exploration with \(.applicationName)",
                "Let \(.applicationName) explore"
            ],
            shortTitle: "Go Wild",
            systemImageName: "sparkles"
        )

        AppShortcut(
            intent: ViewLatestHarvestIntent(),
            phrases: [
                "Show my harvest from \(.applicationName)",
                "View \(.applicationName) results",
                "Open harvest in \(.applicationName)"
            ],
            shortTitle: "View Harvest",
            systemImageName: "shippingbox.fill"
        )

        AppShortcut(
            intent: CheckFarmStatusIntent(),
            phrases: [
                "Check farms in \(.applicationName)",
                "Farm status from \(.applicationName)",
                "How are my farms doing in \(.applicationName)"
            ],
            shortTitle: "Farm Status",
            systemImageName: "chart.bar.fill"
        )
    }
}

// MARK: - Notification Names for Intent Handling

extension Notification.Name {
    static let startQuickTaskFromIntent = Notification.Name("app.maifarm.intent.quickTask")
    static let createFarmFromIntent = Notification.Name("app.maifarm.intent.createFarm")
    static let goWildFromIntent = Notification.Name("app.maifarm.intent.goWild")
    static let viewLatestHarvestFromIntent = Notification.Name("app.maifarm.intent.viewHarvest")
}

// MARK: - Snippet Views for Intent Results

struct QuickTaskResultView: View {
    let success: Bool
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .font(.title)
                .foregroundColor(success ? .green : .red)

            VStack(alignment: .leading) {
                Text(success ? "Task Started" : "Error")
                    .font(.headline)
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
    }
}

struct FarmStatusSnippetView: View {
    let farm: Farm

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.2), lineWidth: 4)
                    .frame(width: 50, height: 50)

                Circle()
                    .trim(from: 0, to: farm.progress ?? 0)
                    .stroke(farm.status.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 50, height: 50)
                    .rotationEffect(.degrees(-90))

                Text("\(Int((farm.progress ?? 0) * 100))%")
                    .font(.caption)
                    .fontWeight(.bold)
            }

            VStack(alignment: .leading) {
                Text(farm.name)
                    .font(.headline)
                Text("\(farm.agents.count) agents - \(farm.status.displayName)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
    }
}

struct MultiFarmStatusView: View {
    let farms: [Farm]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(farms.prefix(3)) { farm in
                HStack {
                    Circle()
                        .fill(farm.status.color)
                        .frame(width: 8, height: 8)
                    Text(farm.name)
                        .font(.subheadline)
                    Spacer()
                    Text("\(Int((farm.progress ?? 0) * 100))%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            if farms.count > 3 {
                Text("+\(farms.count - 3) more farms")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }
}

struct EmptyFarmStatusView: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "leaf.circle")
                .font(.title)
                .foregroundColor(.secondary)

            VStack(alignment: .leading) {
                Text("No Active Farms")
                    .font(.headline)
                Text("Create a farm to get started")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
    }
}

// MARK: - Intent Handler for App Delegate

@MainActor
final class IntentHandler: ObservableObject, @unchecked Sendable {
    static let shared = IntentHandler()

    private var cancellables = Set<AnyCancellable>()

    private init() {
        setupNotificationHandlers()
    }

    private func setupNotificationHandlers() {
        NotificationCenter.default.publisher(for: .startQuickTaskFromIntent)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handleQuickTaskIntent(notification)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .createFarmFromIntent)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handleCreateFarmIntent(notification)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .goWildFromIntent)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handleGoWildIntent(notification)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .viewLatestHarvestFromIntent)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.handleViewHarvestIntent()
            }
            .store(in: &cancellables)
    }

    private func handleQuickTaskIntent(_ notification: Notification) {
        guard let description = notification.userInfo?["description"] as? String else { return }

        // Set app state to show quick task sheet with pre-filled description
        AppState.shared.selectedTab = 0
        // Additional logic to open quick task sheet would go here
    }

    private func handleCreateFarmIntent(_ notification: Notification) {
        guard let name = notification.userInfo?["name"] as? String,
              let agents = notification.userInfo?["agents"] as? Int,
              let duration = notification.userInfo?["duration"] as? Int else { return }

        let provider = notification.userInfo?["provider"] as? String ?? "claude"
        let goal = notification.userInfo?["goal"] as? String

        Task {
            _ = await AppState.shared.createFarm(
                name: name,
                agents: agents,
                duration: duration,
                provider: provider,
                goal: goal
            )
        }
    }

    private func handleGoWildIntent(_ notification: Notification) {
        guard let goal = notification.userInfo?["goal"] as? String else { return }

        // Navigate to Go Wild and start
        AppState.shared.selectedTab = 0
        // Additional logic to start Go Wild session
    }

    private func handleViewHarvestIntent() {
        // Navigate to Barn tab
        AppState.shared.selectedTab = 3
    }
}
