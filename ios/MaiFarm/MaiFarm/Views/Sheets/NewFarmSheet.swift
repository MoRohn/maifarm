//
//  NewFarmSheet.swift
//  MaiFarm
//
//  Enhanced Conversational Farm Creation Experience
//  A fluid, chatbot-like interface for creating new farms
//

import SwiftUI
import UniformTypeIdentifiers

// MARK: - New Farm Sheet (Conversational UI)
struct NewFarmSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @StateObject private var farmingService = DeviceOptimizedFarmingService.shared
    @StateObject private var crossDeviceService = CrossDeviceService.shared

    // Conversation state
    @State private var messages: [FarmChatMessage] = []
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var isLaunching = false
    @FocusState private var isInputFocused: Bool

    // Farm configuration
    @State private var farmName = ""
    @State private var farmDescription = ""
    @State private var agentCount = 3
    @State private var durationMinutes = 60
    @State private var configReady = false
    @State private var showingFileImporter = false
    @State private var contextFiles: [AttachedFile] = []

    // Cross-device execution
    @State private var executionDevices: [ExecutionDevice] = []
    @State private var selectedExecutionDevice: ExecutionDevice? = nil
    @State private var isLoadingDevices = false

    private let primaryColor = MaiFarmColorSchemes.forestWalk.primary
    private let accentColor = MaiFarmColorSchemes.forestWalk.accent

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
            .navigationTitle("New Farm")
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
                loadExecutionDevices()
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: [.text, .sourceCode, .pdf, .image, .json],
                allowsMultipleSelection: true
            ) { result in
                handleFileImport(result)
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
                        MessageBubbleView(message: message, primaryColor: primaryColor)
                            .id(message.id)
                            .onTapGesture {
                                if let suggestion = message.tappedSuggestion {
                                    handleSuggestionTap(suggestion)
                                }
                            }
                    }

                    // Typing indicator
                    if isProcessing {
                        TypingIndicatorView(color: primaryColor)
                            .padding(.leading, 16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Configuration card when ready
                    if configReady {
                        ConfigurationCardView(
                            agentCount: $agentCount,
                            durationMinutes: durationMinutes,
                            primaryColor: primaryColor,
                            executionDevices: executionDevices,
                            selectedExecutionDevice: $selectedExecutionDevice,
                            isLoadingDevices: isLoadingDevices,
                            onLaunch: launchFarm
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
            // Attached files indicator
            if !contextFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(contextFiles) { file in
                            AttachedFileChipView(file: file) {
                                removeContextFile(file)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .frame(height: 32)
            }

            // Suggestion pills for initial state
            if messages.count == 1 && inputText.isEmpty {
                suggestionPills
            }

            // Input row
            HStack(spacing: 12) {
                // Attach button
                Button {
                    HapticManager.shared.impact(.light)
                    showingFileImporter = true
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
                    TextField("What would you like to build?", text: $inputText, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($isInputFocused)
                        .disabled(isProcessing || isLaunching)
                        .submitLabel(.send)
                        .onSubmit {
                            sendMessage()
                        }

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
                        Image(systemName: "arrow.up")
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
        let suggestions = ["Build a new feature", "Create API endpoints", "Implement authentication"]
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
                                .font(.subheadline)
                        }
                        .padding(.horizontal, 14)
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
            "Let's plant something great together! What would you like to build?",
            "Ready to grow your next project! Tell me about your vision.",
            "Farm architect mode! What amazing thing shall we create?"
        ]

        messages = [
            FarmChatMessage(
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
        messages.append(FarmChatMessage(role: .user, content: text))

        // Save as farm description
        farmDescription = text
        farmName = "Farm: \(text.prefix(30))"

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
        Great project idea! I'll help you build "\(input.prefix(40))..."

        I've configured the optimal settings for this task. You can adjust the agent count, or launch now to get started!
        """

        messages.append(FarmChatMessage(role: .assistant, content: response))
        configReady = true
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
                    contextFiles.append(file)
                }
            }
            HapticManager.shared.notify(.success)

            if !contextFiles.isEmpty {
                messages.append(FarmChatMessage(
                    role: .system,
                    content: "\(contextFiles.count) file\(contextFiles.count > 1 ? "s" : "") attached"
                ))
            }
        case .failure:
            HapticManager.shared.notify(.error)
        }
    }

    private func removeContextFile(_ file: AttachedFile) {
        contextFiles.removeAll { $0.id == file.id }
        HapticManager.shared.impact(.light)
    }

    private func loadExecutionDevices() {
        isLoadingDevices = true

        Task {
            do {
                let devices = try await crossDeviceService.getExecutionDevices()
                await MainActor.run {
                    executionDevices = devices
                    // Default to current device (nil means local execution)
                    selectedExecutionDevice = nil
                    isLoadingDevices = false
                }
            } catch {
                await MainActor.run {
                    isLoadingDevices = false
                }
            }
        }
    }

    private func launchFarm() {
        guard !farmDescription.isEmpty else { return }

        isLaunching = true
        HapticManager.shared.impact(.heavy)

        // Show appropriate message based on execution device
        if let device = selectedExecutionDevice, device.deviceId != crossDeviceService.currentDevice?.deviceId {
            messages.append(FarmChatMessage(role: .system, content: "Launching farm on \(device.deviceName)..."))
        } else {
            messages.append(FarmChatMessage(role: .system, content: "Launching farm..."))
        }

        Task {
            let farm = await AppState.shared.createFarm(
                name: farmName,
                agents: agentCount,
                duration: durationMinutes * 60,
                provider: "claude",
                goal: farmDescription,
                executionDeviceId: selectedExecutionDevice?.deviceId
            )

            await MainActor.run {
                if farm != nil {
                    HapticManager.shared.notify(.success)
                    if let device = selectedExecutionDevice, device.deviceId != crossDeviceService.currentDevice?.deviceId {
                        AppState.shared.showToast("Farm launched on \(device.deviceName)!", type: .success)
                    } else {
                        AppState.shared.showToast("Farm launched successfully!", type: .success)
                    }
                    dismiss()
                } else {
                    HapticManager.shared.notify(.error)
                    isLaunching = false
                    messages.append(FarmChatMessage(
                        role: .assistant,
                        content: "Something went wrong. Please try again."
                    ))
                }
            }
        }
    }
}

// MARK: - Farm Chat Message
struct FarmChatMessage: Identifiable {
    let id = UUID()
    let role: MessageRole
    let content: String
    var tappedSuggestion: String? = nil

    enum MessageRole {
        case user
        case assistant
        case system
    }
}

// MARK: - Message Bubble View
struct MessageBubbleView: View {
    let message: FarmChatMessage
    let primaryColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if message.role == .user {
                Spacer(minLength: 60)
            } else if message.role != .system {
                // Assistant avatar
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [primaryColor, primaryColor.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 32, height: 32)
                    Image(systemName: "cpu.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                }
            }

            if message.role == .system {
                // System message (centered, subtle)
                Text(message.content)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 4)
            } else {
                // Chat bubble
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
                // User avatar
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
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(20)
        .onAppear {
            isAnimating = true
        }
    }
}

// MARK: - Configuration Card View
struct ConfigurationCardView: View {
    @Binding var agentCount: Int
    let durationMinutes: Int
    let primaryColor: Color
    let executionDevices: [ExecutionDevice]
    @Binding var selectedExecutionDevice: ExecutionDevice?
    let isLoadingDevices: Bool
    let onLaunch: () -> Void

    // Check if a remote device is selected
    private var isRemoteExecution: Bool {
        guard let device = selectedExecutionDevice else { return false }
        return device.deviceId != CrossDeviceService.shared.currentDevice?.deviceId
    }

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [primaryColor, primaryColor.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 40, height: 40)
                    Image(systemName: "leaf.fill")
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("New Farm")
                        .font(.headline)
                    Text("Configuration")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            // Config options
            HStack(spacing: 12) {
                // Agents
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "person.3.fill")
                            .foregroundColor(.secondary)
                            .font(.caption)
                        Text("Agents")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Stepper(value: $agentCount, in: 1...10) {
                        Text("\(agentCount)")
                            .fontWeight(.semibold)
                            .foregroundColor(primaryColor)
                    }
                    .labelsHidden()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(12)

                // Duration
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "clock.fill")
                            .foregroundColor(.secondary)
                            .font(.caption)
                        Text("Duration")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Text("\(durationMinutes) min")
                        .fontWeight(.semibold)
                        .foregroundColor(primaryColor)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(12)
            }

            // Execution Device Selection (Cross-Device Feature)
            if !executionDevices.isEmpty || isLoadingDevices {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "desktopcomputer")
                            .foregroundColor(.secondary)
                            .font(.caption)
                        Text("Run On")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Spacer()

                        if isLoadingDevices {
                            ProgressView()
                                .scaleEffect(0.7)
                        }
                    }

                    if !isLoadingDevices {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                // This Device option
                                ExecutionDeviceChip(
                                    name: "This Device",
                                    icon: UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone",
                                    computeTier: DeviceCapabilityManager.shared.computeTier.rawValue,
                                    isSelected: selectedExecutionDevice == nil,
                                    isMac: false,
                                    primaryColor: primaryColor
                                ) {
                                    HapticManager.shared.selectionChanged()
                                    selectedExecutionDevice = nil
                                }

                                // Other available devices
                                ForEach(executionDevices.filter { $0.isOnline }) { device in
                                    ExecutionDeviceChip(
                                        name: device.deviceName,
                                        icon: device.icon,
                                        computeTier: device.computeTier,
                                        isSelected: selectedExecutionDevice?.deviceId == device.deviceId,
                                        isMac: device.deviceType == "mac",
                                        primaryColor: primaryColor
                                    ) {
                                        HapticManager.shared.selectionChanged()
                                        selectedExecutionDevice = device
                                    }
                                }
                            }
                        }
                    }

                    // Info text for remote execution
                    if isRemoteExecution, let device = selectedExecutionDevice {
                        HStack(spacing: 4) {
                            Image(systemName: "info.circle.fill")
                                .font(.caption2)
                                .foregroundColor(.blue)
                            Text("Farm will launch on \(device.deviceName)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(12)
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(12)
            }

            // Launch button
            Button(action: onLaunch) {
                HStack(spacing: 8) {
                    Image(systemName: isRemoteExecution ? "arrow.right.circle.fill" : "rocket.fill")
                    Text(isRemoteExecution ? "Launch on \(selectedExecutionDevice?.deviceName ?? "Device")" : "Launch Farm")
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
}

// MARK: - Execution Device Chip
struct ExecutionDeviceChip: View {
    let name: String
    let icon: String
    let computeTier: String
    let isSelected: Bool
    let isMac: Bool
    let primaryColor: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(isSelected ? primaryColor : Color(.tertiarySystemBackground))
                        .frame(width: 44, height: 44)

                    Image(systemName: icon)
                        .font(.system(size: 18))
                        .foregroundColor(isSelected ? .white : (isMac ? .purple : .secondary))
                }

                VStack(spacing: 2) {
                    Text(name)
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(isSelected ? primaryColor : .primary)
                        .lineLimit(1)

                    if isMac {
                        Text("Recommended")
                            .font(.system(size: 8))
                            .foregroundColor(.blue)
                    }
                }
            }
            .frame(width: 70)
            .padding(.vertical, 8)
            .background(isSelected ? primaryColor.opacity(0.1) : Color.clear)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? primaryColor : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Attached File Chip View
struct AttachedFileChipView: View {
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
#Preview("New Farm Sheet - Conversational") {
    NewFarmSheet()
        .environmentObject(DeviceCapabilityManager.shared)
}
