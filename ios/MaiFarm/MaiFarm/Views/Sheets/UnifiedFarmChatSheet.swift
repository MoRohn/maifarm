//
//  UnifiedFarmChatSheet.swift
//  MaiFarm
//
//  Unified Conversational Farm Creation Experience
//  A fluid, chatbot-like interface optimized for iOS with haptic feedback,
//  smooth animations, and native-feeling interactions.
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// MARK: - Farm Mode Enum
enum FarmMode: String, CaseIterable, Identifiable {
    case quickTask = "quick-task"
    case newFarm = "new-farm"
    case goWild = "go-wild"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .quickTask: return "Quick Task"
        case .newFarm: return "New Farm"
        case .goWild: return "Go Wild"
        }
    }

    var subtitle: String {
        switch self {
        case .quickTask: return "Get things done in 5 minutes"
        case .newFarm: return "Build something amazing"
        case .goWild: return "Explore uncharted territory"
        }
    }

    var icon: String {
        switch self {
        case .quickTask: return "bolt.fill"
        case .newFarm: return "leaf.fill"
        case .goWild: return "sparkles"
        }
    }

    var gradient: LinearGradient {
        switch self {
        case .quickTask:
            return LinearGradient(
                colors: [MaiFarmColorSchemes.oceanBreeze.primary, MaiFarmColorSchemes.oceanBreeze.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .newFarm:
            return LinearGradient(
                colors: [MaiFarmColorSchemes.forestWalk.primary, MaiFarmColorSchemes.forestWalk.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .goWild:
            return LinearGradient(
                colors: [MaiFarmColorSchemes.purpleDreams.primary, MaiFarmColorSchemes.purpleDreams.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    var primaryColor: Color {
        switch self {
        case .quickTask: return MaiFarmColorSchemes.oceanBreeze.primary
        case .newFarm: return MaiFarmColorSchemes.forestWalk.primary
        case .goWild: return MaiFarmColorSchemes.purpleDreams.primary
        }
    }

    var defaultAgents: Int {
        switch self {
        case .quickTask: return 1
        case .newFarm: return 3
        case .goWild: return 5
        }
    }

    var defaultDuration: Int {
        switch self {
        case .quickTask: return 5
        case .newFarm: return 60
        case .goWild: return 30
        }
    }

    var maxAgents: Int {
        switch self {
        case .quickTask: return 2
        case .newFarm: return 10
        case .goWild: return 20
        }
    }

    var greetings: [String] {
        switch self {
        case .quickTask:
            return [
                "Let's get something done quickly! What task do you need help with?",
                "Ready to tackle a quick task! What's on your mind?",
                "Quick task mode activated! What would you like to accomplish?"
            ]
        case .newFarm:
            return [
                "Let's plant something great together! What would you like to build?",
                "Ready to grow your next project! Tell me about your vision.",
                "Farm architect mode! What amazing thing shall we create?"
            ]
        case .goWild:
            return [
                "Ready to push boundaries! What should we explore today?",
                "Creativity mode unlocked! Share your wildest ideas.",
                "Let's venture into the unknown! What inspires you?"
            ]
        }
    }

    var suggestions: [[String]] {
        switch self {
        case .quickTask:
            return [
                ["Fix this bug", "Write unit tests", "Clean up code"],
                ["Update docs", "Review PR", "Optimize performance"],
                ["Generate code", "Refactor function", "Add error handling"]
            ]
        case .newFarm:
            return [
                ["Build a feature", "Create microservice", "Design API"],
                ["Implement auth", "Build dashboard", "Create CLI tool"],
                ["Develop mobile app", "Build web scraper", "Create automation"]
            ]
        case .goWild:
            return [
                ["Reimagine the UX", "Explore new architecture", "Innovate workflow"],
                ["Research alternatives", "Prototype wild ideas", "Break conventions"],
                ["Merge unexpected concepts", "Challenge assumptions", "Create art"]
            ]
        }
    }
}

// MARK: - Chat Message Model
struct ChatMessage: Identifiable {
    let id = UUID()
    let role: MessageRole
    let content: String
    let timestamp: Date
    var suggestions: [String]?
    var actions: [MessageAction]?
    var configCard: FarmConfig?
    var isTyping: Bool = false

    enum MessageRole {
        case user
        case assistant
        case system
    }
}

struct MessageAction: Identifiable {
    let id = UUID()
    let label: String
    let icon: String
    let variant: ActionVariant
    let action: String

    enum ActionVariant {
        case primary
        case secondary
        case ghost
    }
}

struct FarmConfig {
    var mode: FarmMode
    var taskDescription: String
    var agentCount: Int
    var duration: Int
    var creativityLevel: Int = 3
    var enhanced: Bool = false
}

// MARK: - Unified Farm Chat Sheet
struct UnifiedFarmChatSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var colorScheme
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    @State private var selectedMode: FarmMode = .newFarm
    @State private var messages: [ChatMessage] = []
    @State private var inputText: String = ""
    @State private var isProcessing: Bool = false
    @State private var isLaunching: Bool = false
    @State private var config: FarmConfig
    @State private var showingFilePicker: Bool = false
    @State private var attachedFiles: [AttachedFile] = []

    @FocusState private var isInputFocused: Bool

    init(initialMode: FarmMode = .newFarm) {
        _selectedMode = State(initialValue: initialMode)
        _config = State(initialValue: FarmConfig(
            mode: initialMode,
            taskDescription: "",
            agentCount: initialMode.defaultAgents,
            duration: initialMode.defaultDuration
        ))
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    // Background
                    backgroundGradient

                    VStack(spacing: 0) {
                        // Mode Switcher
                        modeSwitcher
                            .padding(.horizontal)
                            .padding(.top, 8)

                        // Messages
                        ScrollViewReader { proxy in
                            ScrollView {
                                LazyVStack(spacing: 16) {
                                    ForEach(messages) { message in
                                        MessageBubbleView(
                                            message: message,
                                            mode: selectedMode,
                                            onAction: handleAction,
                                            onSuggestionTap: handleSuggestion,
                                            onConfigUpdate: updateConfig
                                        )
                                        .id(message.id)
                                    }
                                }
                                .padding()
                            }
                            .onChange(of: messages.count) { _, _ in
                                withAnimation(.spring(response: 0.3)) {
                                    proxy.scrollTo(messages.last?.id, anchor: .bottom)
                                }
                            }
                        }

                        // Input Area
                        inputArea
                    }
                }
            }
            .navigationTitle(selectedMode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        HapticManager.shared.impact(.light)
                        dismiss()
                    }
                    .disabled(isLaunching)
                }
            }
            .onAppear {
                initializeConversation()
            }
            .fileImporter(
                isPresented: $showingFilePicker,
                allowedContentTypes: [.text, .sourceCode, .pdf, .image, .json],
                allowsMultipleSelection: true
            ) { result in
                handleFileImport(result)
            }
        }
    }

    // MARK: - Background Gradient
    @ViewBuilder
    private var backgroundGradient: some View {
        selectedMode.gradient
            .opacity(0.05)
            .ignoresSafeArea()
    }

    // MARK: - Mode Switcher
    @ViewBuilder
    private var modeSwitcher: some View {
        HStack(spacing: 4) {
            ForEach(FarmMode.allCases) { mode in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        changeMode(to: mode)
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: mode.icon)
                            .font(.system(size: 14, weight: .semibold))

                        if selectedMode == mode {
                            Text(mode.title)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }
                    }
                    .padding(.horizontal, selectedMode == mode ? 16 : 12)
                    .padding(.vertical, 10)
                    .background(
                        selectedMode == mode
                            ? mode.gradient
                            : LinearGradient(colors: [Color(.secondarySystemBackground)], startPoint: .top, endPoint: .bottom)
                    )
                    .foregroundColor(selectedMode == mode ? .white : .primary)
                    .cornerRadius(20)
                    .shadow(color: selectedMode == mode ? mode.primaryColor.opacity(0.3) : .clear, radius: 8, y: 4)
                }
                .buttonStyle(.plain)
                .disabled(isProcessing || isLaunching)
            }
        }
        .padding(4)
        .background(Color(.secondarySystemBackground).opacity(0.5))
        .cornerRadius(24)
    }

    // MARK: - Input Area
    @ViewBuilder
    private var inputArea: some View {
        VStack(spacing: 12) {
            // Attached files indicator
            if !attachedFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachedFiles) { file in
                            AttachedFileChip(file: file) {
                                removeFile(file)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                .frame(height: 32)
            }

            // Input field
            HStack(spacing: 12) {
                // Attach button
                Button {
                    HapticManager.shared.impact(.light)
                    showingFilePicker = true
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color(.secondarySystemBackground))
                            .frame(width: 40, height: 40)
                        Image(systemName: "paperclip")
                            .font(.system(size: 16))
                            .foregroundColor(.secondary)
                    }
                }
                .disabled(isProcessing || isLaunching)

                // Text field
                HStack {
                    TextField("Describe your \(selectedMode == .quickTask ? "task" : selectedMode == .goWild ? "exploration" : "project")...", text: $inputText, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($isInputFocused)
                        .disabled(isProcessing || isLaunching)

                    if !inputText.isEmpty {
                        Button {
                            inputText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(24)

                // Send button
                Button {
                    sendMessage()
                } label: {
                    ZStack {
                        Circle()
                            .fill(inputText.isEmpty ? Color.gray.opacity(0.5) : selectedMode.gradient)
                            .frame(width: 44, height: 44)
                        Image(systemName: "arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isProcessing || isLaunching)
                .animation(.spring(response: 0.2), value: inputText.isEmpty)
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .padding(.top, 8)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
        )
    }

    // MARK: - Helpers
    private func changeMode(to mode: FarmMode) {
        guard mode != selectedMode else { return }
        HapticManager.shared.selectionChanged()
        selectedMode = mode
        config = FarmConfig(
            mode: mode,
            taskDescription: "",
            agentCount: mode.defaultAgents,
            duration: mode.defaultDuration
        )
        initializeConversation()
    }

    private func initializeConversation() {
        let greeting = selectedMode.greetings.randomElement() ?? selectedMode.greetings[0]
        let suggestions = selectedMode.suggestions.randomElement() ?? selectedMode.suggestions[0]

        messages = [
            ChatMessage(
                role: .assistant,
                content: greeting,
                timestamp: Date(),
                suggestions: suggestions
            )
        ]
    }

    private func sendMessage() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let userMessage = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        inputText = ""
        isInputFocused = false

        HapticManager.shared.impact(.medium)

        // Add user message
        messages.append(ChatMessage(
            role: .user,
            content: userMessage,
            timestamp: Date()
        ))

        // Update config
        config.taskDescription = userMessage

        // Add typing indicator
        isProcessing = true
        messages.append(ChatMessage(
            role: .assistant,
            content: "",
            timestamp: Date(),
            isTyping: true
        ))

        // Simulate AI response
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 + Double.random(in: 0...0.5)) {
            generateResponse(for: userMessage)
        }
    }

    private func generateResponse(for userInput: String) {
        // Remove typing indicator
        messages.removeAll { $0.isTyping }

        let isFirstMessage = messages.filter { $0.role == .user }.count == 1

        if isFirstMessage {
            // Offer enhancement
            messages.append(ChatMessage(
                role: .assistant,
                content: getEnhancementOfferMessage(),
                timestamp: Date(),
                actions: [
                    MessageAction(label: "Enhance Prompt", icon: "sparkles", variant: .primary, action: "enhance"),
                    MessageAction(label: "Launch Now", icon: "rocket.fill", variant: .secondary, action: "launch")
                ],
                configCard: config
            ))
        } else {
            // Ready to launch
            messages.append(ChatMessage(
                role: .assistant,
                content: getReadyMessage(),
                timestamp: Date(),
                actions: [
                    MessageAction(label: "Launch \(selectedMode.title)", icon: "rocket.fill", variant: .primary, action: "launch"),
                    MessageAction(label: "Adjust Settings", icon: "slider.horizontal.3", variant: .ghost, action: "adjust")
                ],
                configCard: config
            ))
        }

        isProcessing = false
        HapticManager.shared.notify(.success)
    }

    private func handleAction(_ action: String) {
        HapticManager.shared.impact(.medium)

        switch action {
        case "enhance":
            enhancePrompt()
        case "launch":
            launchFarm()
        case "adjust":
            showSettings()
        case "reset":
            initializeConversation()
        default:
            break
        }
    }

    private func handleSuggestion(_ suggestion: String) {
        HapticManager.shared.selectionChanged()
        inputText = suggestion
        isInputFocused = true
    }

    private func updateConfig(_ updates: FarmConfig) {
        config = updates
    }

    private func enhancePrompt() {
        isProcessing = true
        messages.append(ChatMessage(
            role: .assistant,
            content: "",
            timestamp: Date(),
            isTyping: true
        ))

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            messages.removeAll { $0.isTyping }

            config.enhanced = true

            messages.append(ChatMessage(
                role: .assistant,
                content: getEnhancedMessage(),
                timestamp: Date(),
                actions: [
                    MessageAction(label: "Launch Enhanced", icon: "rocket.fill", variant: .primary, action: "launch"),
                    MessageAction(label: "Start Over", icon: "arrow.counterclockwise", variant: .ghost, action: "reset")
                ],
                configCard: config
            ))

            isProcessing = false
            HapticManager.shared.notify(.success)
        }
    }

    private func launchFarm() {
        guard !config.taskDescription.isEmpty else { return }

        isLaunching = true
        HapticManager.shared.impact(.heavy)

        messages.append(ChatMessage(
            role: .system,
            content: "Launching \(selectedMode.title)...",
            timestamp: Date()
        ))

        Task {
            let farm = await AppState.shared.createFarm(
                name: "\(selectedMode.title): \(config.taskDescription.prefix(30))",
                agents: config.agentCount,
                duration: config.duration * 60,
                provider: "claude",
                goal: config.taskDescription
            )

            await MainActor.run {
                if farm != nil {
                    HapticManager.shared.notify(.success)
                    AppState.shared.showToast("\(selectedMode.title) launched!", type: .success)

                    messages.append(ChatMessage(
                        role: .assistant,
                        content: "Your \(selectedMode.title.lowercased()) has been launched successfully! Redirecting to the harvest view...",
                        timestamp: Date()
                    ))

                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        dismiss()
                    }
                } else {
                    HapticManager.shared.notify(.error)
                    isLaunching = false

                    messages.append(ChatMessage(
                        role: .assistant,
                        content: "Something went wrong. Please try again.",
                        timestamp: Date(),
                        actions: [
                            MessageAction(label: "Try Again", icon: "arrow.counterclockwise", variant: .primary, action: "launch")
                        ]
                    ))
                }
            }
        }
    }

    private func showSettings() {
        messages.append(ChatMessage(
            role: .assistant,
            content: "You can adjust the configuration above. When you're ready, just say \"launch\" or tap the launch button!",
            timestamp: Date(),
            configCard: config
        ))
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                if let data = try? Data(contentsOf: url) {
                    let file = AttachedFile(
                        name: url.lastPathComponent,
                        size: Int64(data.count),
                        type: UTType(filenameExtension: url.pathExtension) ?? .data,
                        data: data
                    )
                    attachedFiles.append(file)
                }
            }
            HapticManager.shared.notify(.success)

            if !attachedFiles.isEmpty {
                messages.append(ChatMessage(
                    role: .system,
                    content: "\(attachedFiles.count) file\(attachedFiles.count > 1 ? "s" : "") attached: \(attachedFiles.map { $0.name }.joined(separator: ", "))",
                    timestamp: Date()
                ))
            }
        case .failure:
            HapticManager.shared.notify(.error)
        }
    }

    private func removeFile(_ file: AttachedFile) {
        attachedFiles.removeAll { $0.id == file.id }
        HapticManager.shared.impact(.light)
    }

    // MARK: - Message Content Helpers
    private func getEnhancementOfferMessage() -> String {
        let task = config.taskDescription.prefix(50)
        switch selectedMode {
        case .quickTask:
            return "Got it! I can help you \"\(task)...\" quickly.\n\nWould you like me to enhance your prompt with structured steps, or launch right away?"
        case .newFarm:
            return "Great project idea! I'll help you build \"\(task)...\"\n\nI can enhance your prompt with a detailed roadmap and success criteria, or we can launch now."
        case .goWild:
            return "Love the creative vision! \"\(task)...\" sounds exciting.\n\nWant me to expand this with creative exploration paths, or dive right in?"
        }
    }

    private func getEnhancedMessage() -> String {
        switch selectedMode {
        case .quickTask:
            return "I've enhanced your prompt with clear objectives and expected outcomes. Your quick task is optimized for fast execution."
        case .newFarm:
            return "Your prompt has been enhanced with:\n- Clear project phases\n- Success criteria\n- Risk considerations\n- Deliverable checkpoints\n\nYour farm is ready to grow something amazing!"
        case .goWild:
            return "I've expanded your creative brief with:\n- Multiple exploration angles\n- Innovation triggers\n- Cross-domain inspirations\n- Unexpected connections\n\nThe agents will push boundaries even further!"
        }
    }

    private func getReadyMessage() -> String {
        switch selectedMode {
        case .quickTask:
            return "Perfect! Your quick task is configured and ready. Hit launch when you're ready to go!"
        case .newFarm:
            return "Excellent! Your farm is all set up. The configuration looks great. Ready to plant some seeds?"
        case .goWild:
            return "The creative exploration is configured. Agents are standing by to venture into the unknown. Ready to go wild?"
        }
    }
}

// MARK: - Message Bubble View
struct MessageBubbleView: View {
    let message: ChatMessage
    let mode: FarmMode
    let onAction: (String) -> Void
    let onSuggestionTap: (String) -> Void
    let onConfigUpdate: (FarmConfig) -> Void

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 8) {
                // Avatar and name
                HStack(spacing: 8) {
                    if message.role != .user {
                        avatarView
                        Text("MaiFarm Assistant")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    if message.role == .user {
                        Text("You")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        avatarView
                    }
                }

                // Message bubble
                messageBubble

                // Config card
                if let config = message.configCard {
                    ConfigCardView(config: config, mode: mode, onUpdate: onConfigUpdate)
                }

                // Suggestions
                if let suggestions = message.suggestions, !suggestions.isEmpty {
                    suggestionsView(suggestions)
                }

                // Actions
                if let actions = message.actions, !actions.isEmpty {
                    actionsView(actions)
                }

                // Timestamp
                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            if message.role != .user {
                Spacer(minLength: 60)
            }
        }
    }

    @ViewBuilder
    private var avatarView: some View {
        ZStack {
            Circle()
                .fill(message.role == .user
                    ? Color(.secondarySystemBackground)
                    : mode.gradient
                )
                .frame(width: 32, height: 32)

            Image(systemName: message.role == .user ? "person.fill" : "cpu.fill")
                .font(.system(size: 14))
                .foregroundColor(message.role == .user ? .secondary : .white)
        }
    }

    @ViewBuilder
    private var messageBubble: some View {
        Group {
            if message.isTyping {
                TypingIndicatorView(color: mode.primaryColor)
            } else {
                Text(message.content)
                    .font(.body)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            message.role == .user
                ? mode.gradient
                : LinearGradient(colors: [Color(.secondarySystemBackground)], startPoint: .top, endPoint: .bottom)
        )
        .foregroundColor(message.role == .user ? .white : .primary)
        .cornerRadius(20)
        .shadow(color: message.role == .user ? mode.primaryColor.opacity(0.2) : .clear, radius: 8, y: 4)
    }

    @ViewBuilder
    private func suggestionsView(_ suggestions: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        onSuggestionTap(suggestion)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.caption2)
                            Text(suggestion)
                                .font(.subheadline)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(mode.gradient)
                        .foregroundColor(.white)
                        .cornerRadius(16)
                        .shadow(color: mode.primaryColor.opacity(0.3), radius: 4, y: 2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func actionsView(_ actions: [MessageAction]) -> some View {
        HStack(spacing: 10) {
            ForEach(actions) { action in
                Button {
                    onAction(action.action)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: action.icon)
                            .font(.subheadline)
                        Text(action.label)
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        action.variant == .primary
                            ? AnyShapeStyle(mode.gradient)
                            : action.variant == .secondary
                                ? AnyShapeStyle(Color(.secondarySystemBackground))
                                : AnyShapeStyle(Color.clear)
                    )
                    .foregroundColor(
                        action.variant == .primary ? .white : .primary
                    )
                    .cornerRadius(12)
                    .shadow(color: action.variant == .primary ? mode.primaryColor.opacity(0.3) : .clear, radius: 6, y: 3)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Config Card View
struct ConfigCardView: View {
    let config: FarmConfig
    let mode: FarmMode
    let onUpdate: (FarmConfig) -> Void

    @State private var localConfig: FarmConfig

    init(config: FarmConfig, mode: FarmMode, onUpdate: @escaping (FarmConfig) -> Void) {
        self.config = config
        self.mode = mode
        self.onUpdate = onUpdate
        _localConfig = State(initialValue: config)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(mode.gradient)
                        .frame(width: 40, height: 40)
                    Image(systemName: mode.icon)
                        .foregroundColor(.white)
                        .font(.system(size: 18, weight: .medium))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(mode.title)
                        .font(.headline)
                    Text("Configuration")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                if config.enhanced {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                            .font(.caption)
                        Text("Enhanced")
                            .font(.caption)
                            .fontWeight(.medium)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(mode.gradient)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
            }

            // Task description
            if !config.taskDescription.isEmpty {
                Text(config.taskDescription)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
                    .padding(12)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(12)
            }

            // Config grid
            HStack(spacing: 12) {
                // Agents
                configItem(
                    icon: "person.3.fill",
                    label: "Agents",
                    value: "\(localConfig.agentCount)"
                ) {
                    Stepper(
                        value: $localConfig.agentCount,
                        in: 1...mode.maxAgents
                    ) {
                        Text("\(localConfig.agentCount)")
                            .fontWeight(.semibold)
                            .foregroundColor(mode.primaryColor)
                    }
                    .labelsHidden()
                    .onChange(of: localConfig.agentCount) { _, _ in
                        onUpdate(localConfig)
                    }
                }

                // Duration
                configItem(
                    icon: "clock.fill",
                    label: "Duration",
                    value: "\(localConfig.duration) min"
                ) {
                    Text("\(localConfig.duration) min")
                        .fontWeight(.semibold)
                        .foregroundColor(mode.primaryColor)
                }
            }

            // Creativity level (Go Wild only)
            if mode == .goWild {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "sparkles")
                            .foregroundColor(.purple)
                        Text("Creativity Level")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { level in
                            Button {
                                localConfig.creativityLevel = level
                                onUpdate(localConfig)
                                HapticManager.shared.selectionChanged()
                            } label: {
                                ZStack {
                                    Circle()
                                        .fill(localConfig.creativityLevel >= level ? Color.purple : Color(.tertiarySystemBackground))
                                        .frame(width: 32, height: 32)
                                    Image(systemName: "star.fill")
                                        .font(.caption)
                                        .foregroundColor(localConfig.creativityLevel >= level ? .white : .secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(12)
                .background(Color.purple.opacity(0.1))
                .cornerRadius(12)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 10, y: 5)
    }

    @ViewBuilder
    private func configItem<Content: View>(icon: String, label: String, value: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundColor(.secondary)
                    .font(.caption)
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Typing Indicator View
struct TypingIndicatorView: View {
    let color: Color
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                    .offset(y: isAnimating ? -6 : 0)
                    .animation(
                        Animation
                            .easeInOut(duration: 0.4)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.15),
                        value: isAnimating
                    )
            }
        }
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - Attached File Chip
struct AttachedFileChip: View {
    let file: AttachedFile
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: file.icon)
                .font(.caption)
                .foregroundColor(.blue)

            Text(file.name)
                .font(.caption)
                .lineLimit(1)

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
}

// MARK: - Previews
#Preview("Unified Farm Chat - New Farm") {
    UnifiedFarmChatSheet(initialMode: .newFarm)
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Unified Farm Chat - Quick Task") {
    UnifiedFarmChatSheet(initialMode: .quickTask)
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Unified Farm Chat - Go Wild") {
    UnifiedFarmChatSheet(initialMode: .goWild)
        .environmentObject(DeviceCapabilityManager.shared)
}
