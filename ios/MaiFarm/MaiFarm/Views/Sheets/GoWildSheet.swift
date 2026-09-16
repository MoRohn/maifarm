//
//  GoWildSheet.swift
//  MaiFarm
//
//  Enhanced Conversational Go Wild Experience
//  A fluid, chatbot-like interface for autonomous AI exploration
//

import SwiftUI

// MARK: - Go Wild Sheet (Conversational UI)
struct GoWildSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @StateObject private var farmingService = DeviceOptimizedFarmingService.shared

    // Conversation state
    @State private var messages: [GoWildMessage] = []
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var isLaunching = false
    @FocusState private var isInputFocused: Bool

    // Configuration
    @State private var goal = ""
    @State private var duration = 30
    @State private var agentCount = 2
    @State private var configReady = false

    // Enhanced purple color palette
    private let primaryColor = Color(red: 0.58, green: 0.29, blue: 0.90)  // #9447E5
    private let accentColor = Color(red: 0.69, green: 0.45, blue: 0.95)   // #B073F2

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    // Background gradient
                    LinearGradient(
                        colors: [primaryColor.opacity(0.05), Color.clear],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .ignoresSafeArea()

                    VStack(spacing: 0) {
                        // Messages area
                        messagesScrollView

                        // Input area
                        inputArea
                    }
                }
            }
            .navigationTitle("Go Wild")
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
        }
    }

    // MARK: - Messages Scroll View
    @ViewBuilder
    private var messagesScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(messages) { message in
                        GoWildMessageBubble(message: message, primaryColor: primaryColor)
                            .id(message.id)
                    }

                    // Typing indicator
                    if isProcessing {
                        GoWildTypingIndicator(color: primaryColor)
                            .padding(.leading, 16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Configuration card when ready
                    if configReady {
                        GoWildConfigCard(
                            agentCount: $agentCount,
                            duration: $duration,
                            maxAgents: deviceManager.computeTier.maxAgents,
                            primaryColor: primaryColor,
                            onLaunch: launchGoWild
                        )
                        .padding(.horizontal, 16)
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
    }

    // MARK: - Input Area
    @ViewBuilder
    private var inputArea: some View {
        VStack(spacing: 12) {
            // Suggestion pills for initial state
            if messages.count == 1 && inputText.isEmpty {
                suggestionPills
            }

            // Input row
            HStack(spacing: 12) {
                // Text field
                HStack {
                    TextField("What should the agents explore?", text: $inputText, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($isInputFocused)
                        .disabled(isProcessing || isLaunching)
                        .submitLabel(.send)
                        .onSubmit { sendMessage() }

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
                            .fill(
                                inputText.isEmpty
                                    ? AnyShapeStyle(Color.gray.opacity(0.5))
                                    : AnyShapeStyle(LinearGradient(colors: [primaryColor, accentColor], startPoint: .topLeading, endPoint: .bottomTrailing))
                            )
                            .frame(width: 44, height: 44)
                        Image(systemName: "sparkles")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isProcessing || isLaunching)
                .animation(.spring(response: 0.2), value: inputText.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .padding(.top, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Suggestion Pills
    @ViewBuilder
    private var suggestionPills: some View {
        let suggestions = [
            "Explore new design patterns",
            "Research emerging technologies",
            "Find optimization opportunities"
        ]
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        handleSuggestionTap(suggestion)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                                .font(.caption2)
                            Text(suggestion)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            LinearGradient(colors: [primaryColor, accentColor], startPoint: .leading, endPoint: .trailing)
                        )
                        .foregroundColor(.white)
                        .cornerRadius(16)
                        .shadow(color: primaryColor.opacity(0.3), radius: 4, y: 2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Helpers
    private func initializeConversation() {
        let greetings = [
            "Ready to go wild! What do you want the agents to explore and discover?",
            "Autonomous exploration mode! Tell me your goal and I'll set the agents free to discover.",
            "Let's unleash the AI! What territory should we explore?"
        ]

        messages = [
            GoWildMessage(
                role: .assistant,
                content: greetings.randomElement() ?? greetings[0]
            )
        ]
    }

    private func handleSuggestionTap(_ suggestion: String) {
        HapticManager.shared.selectionChanged()
        inputText = suggestion
        isInputFocused = true
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        inputText = ""
        isInputFocused = false
        HapticManager.shared.impact(.medium)

        // Add user message
        messages.append(GoWildMessage(role: .user, content: text))

        // Save goal
        goal = text

        // Show processing
        isProcessing = true

        // Simulate AI response
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 + Double.random(in: 0...0.5)) {
            generateResponse(for: text)
        }
    }

    private func generateResponse(for input: String) {
        isProcessing = false
        HapticManager.shared.notify(.success)

        let response = """
        Exciting exploration goal! I'll set up the agents to discover insights about "\(input.prefix(40))..."

        Configure the exploration parameters below, then let's go wild!
        """

        messages.append(GoWildMessage(role: .assistant, content: response))
        configReady = true
    }

    private func launchGoWild() {
        guard !goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            HapticManager.shared.notify(.error)
            AppState.shared.showToast("Please enter an exploration goal", type: .error)
            return
        }

        isLaunching = true
        HapticManager.shared.impact(.heavy)

        messages.append(GoWildMessage(role: .system, content: "Launching exploration..."))

        Task {
            let farm = await AppState.shared.createFarm(
                name: "Go Wild: \(goal.prefix(30))",
                agents: agentCount,
                duration: duration * 60,
                provider: "claude",
                goal: goal
            )

            await MainActor.run {
                if farm != nil {
                    HapticManager.shared.notify(.success)
                    AppState.shared.showToast("Go Wild exploration started!", type: .success)
                    dismiss()
                } else {
                    HapticManager.shared.notify(.error)
                    isLaunching = false
                    messages.append(GoWildMessage(
                        role: .assistant,
                        content: "Something went wrong. Please try again."
                    ))
                }
            }
        }
    }

    private func formatDuration(_ mins: Int) -> String {
        if mins < 60 {
            return "\(mins) min"
        } else if mins == 60 {
            return "1 hour"
        } else {
            let hours = mins / 60
            let remainingMins = mins % 60
            return remainingMins == 30 ? "\(hours).5 hours" : "\(hours) hours"
        }
    }
}

// MARK: - Go Wild Message
struct GoWildMessage: Identifiable {
    let id = UUID()
    let role: MessageRole
    let content: String

    enum MessageRole {
        case user
        case assistant
        case system
    }
}

// MARK: - Go Wild Message Bubble
struct GoWildMessageBubble: View {
    let message: GoWildMessage
    let primaryColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if message.role == .user {
                Spacer(minLength: 60)
            } else if message.role != .system {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [primaryColor, primaryColor.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 32, height: 32)
                    Image(systemName: "sparkles")
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                }
            }

            if message.role == .system {
                Text(message.content)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 4)
            } else {
                Text(message.content)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        message.role == .user
                            ? LinearGradient(colors: [primaryColor, primaryColor.opacity(0.9)], startPoint: .topLeading, endPoint: .bottomTrailing)
                            : LinearGradient(colors: [Color(.secondarySystemBackground)], startPoint: .top, endPoint: .bottom)
                    )
                    .foregroundColor(message.role == .user ? .white : .primary)
                    .cornerRadius(20)
                    .shadow(color: message.role == .user ? primaryColor.opacity(0.2) : .clear, radius: 4, y: 2)
            }

            if message.role != .user && message.role != .system {
                Spacer(minLength: 60)
            } else if message.role == .user {
                ZStack {
                    Circle()
                        .fill(Color(.secondarySystemBackground))
                        .frame(width: 32, height: 32)
                    Image(systemName: "person.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - Go Wild Typing Indicator
struct GoWildTypingIndicator: View {
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
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(20)
        .onAppear { isAnimating = true }
    }
}

// MARK: - Go Wild Config Card
struct GoWildConfigCard: View {
    @Binding var agentCount: Int
    @Binding var duration: Int
    let maxAgents: Int
    let primaryColor: Color
    let onLaunch: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [primaryColor, primaryColor.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 40, height: 40)
                    Image(systemName: "sparkles")
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Go Wild")
                        .font(.headline)
                    Text("Autonomous Exploration")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            // Config options
            VStack(spacing: 0) {
                // Duration Row
                HStack {
                    Label("Duration", systemImage: "clock.fill")
                        .foregroundColor(.primary)
                    Spacer()
                    Menu {
                        ForEach([15, 30, 45, 60, 90, 120], id: \.self) { mins in
                            Button(action: { duration = mins }) {
                                HStack {
                                    Text(formatDuration(mins))
                                    if duration == mins {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(formatDuration(duration))
                                .foregroundColor(primaryColor)
                            Image(systemName: "chevron.down")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding()

                Divider()
                    .padding(.leading)

                // Agents Row
                HStack {
                    Label("Agents", systemImage: "person.3.fill")
                        .foregroundColor(.primary)
                    Spacer()
                    Stepper(value: $agentCount, in: 2...min(3, maxAgents)) {
                        Text("\(agentCount)")
                            .fontWeight(.medium)
                            .foregroundColor(primaryColor)
                            .frame(minWidth: 20)
                    }
                    .labelsHidden()
                }
                .padding()
            }
            .background(Color(.tertiarySystemBackground))
            .cornerRadius(14)

            // Info card
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.yellow.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Image(systemName: "lightbulb.fill")
                        .foregroundColor(.yellow)
                        .font(.caption)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Exploration Mode")
                        .font(.caption)
                        .fontWeight(.semibold)
                    Text("Agents explore freely, generating ideas and discoveries. Results are stored in the Barn.")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(12)
            .background(Color(.tertiarySystemBackground))
            .cornerRadius(12)

            // Launch button
            Button(action: onLaunch) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                    Text("Go Wild")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    LinearGradient(colors: [primaryColor, primaryColor.opacity(0.9)], startPoint: .leading, endPoint: .trailing)
                )
                .foregroundColor(.white)
                .cornerRadius(14)
                .shadow(color: primaryColor.opacity(0.3), radius: 6, y: 3)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.05), radius: 10, y: 5)
    }

    private func formatDuration(_ mins: Int) -> String {
        if mins < 60 {
            return "\(mins) min"
        } else if mins == 60 {
            return "1 hour"
        } else {
            let hours = mins / 60
            let remainingMins = mins % 60
            return remainingMins == 30 ? "\(hours).5 hours" : "\(hours) hours"
        }
    }
}

// MARK: - Previews
#Preview("Go Wild Sheet - Conversational") {
    GoWildSheet()
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Go Wild Sheet - iPad") {
    GoWildSheet()
        .environmentObject(DeviceCapabilityManager.shared)
        .previewDevice("iPad Pro (12.9-inch)")
}
