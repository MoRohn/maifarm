//
//  QuickTaskSheet.swift
//  MaiFarm
//
//  Enhanced Conversational Quick Task Experience
//  A fluid, chatbot-like interface for quick 5-minute tasks
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// MARK: - Quick Task Sheet (Conversational UI)
struct QuickTaskSheet: View {
    @Environment(\.dismiss) var dismiss
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @StateObject private var farmingService = DeviceOptimizedFarmingService.shared

    // Conversation state
    @State private var messages: [QuickTaskMessage] = []
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var isRunning = false
    @State private var progress: Double = 0
    @FocusState private var isInputFocused: Bool

    // Task configuration
    @State private var taskDescription = ""
    @State private var selectedTaskType: TaskType?
    @State private var detectedComplexity: TaskComplexity = .low
    @State private var configReady = false

    // Attachment states
    @State private var showingAttachmentOptions = false
    @State private var showingFileImporter = false
    @State private var showingPhotoPicker = false
    @State private var attachedFiles: [AttachedFile] = []
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var progressTask: Task<Void, Never>?

    private let maxFileSizeBytes: Int64 = 50 * 1024 * 1024 // 50MB limit

    private let primaryColor = MaiFarmColors.primaryGreen
    private let accentColor = MaiFarmColors.accentGreen

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var allowedFileTypes: [UTType] {
        farmingService.recommendedFileTypes(for: .quickTask)
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

                    if isRunning {
                        runningStateContent
                    } else {
                        VStack(spacing: 0) {
                            // Messages area
                            messagesScrollView

                            // Input area
                            inputArea
                        }
                    }
                }
            }
            .navigationTitle("Quick Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        HapticManager.shared.impact(.light)
                        cancelTask()
                        dismiss()
                    }
                    .disabled(isRunning && progress > 0.9)
                }
            }
            .onAppear {
                initializeConversation()
            }
            .confirmationDialog("Add Attachment", isPresented: $showingAttachmentOptions) {
                Button("Choose from Files") { showingFileImporter = true }
                Button("Choose from Photos") { showingPhotoPicker = true }
                Button("Cancel", role: .cancel) {}
            }
            .fileImporter(
                isPresented: $showingFileImporter,
                allowedContentTypes: allowedFileTypes,
                allowsMultipleSelection: true
            ) { result in
                handleFileImport(result)
            }
            .photosPicker(
                isPresented: $showingPhotoPicker,
                selection: $selectedPhotoItems,
                maxSelectionCount: deviceManager.deviceType == .iPhone ? 3 : 10,
                matching: .images
            )
            .onChange(of: selectedPhotoItems) { _, newItems in
                Task { await handlePhotoSelection(newItems) }
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
                        QuickTaskMessageBubble(message: message, primaryColor: primaryColor)
                            .id(message.id)
                    }

                    // Typing indicator
                    if isProcessing {
                        QuickTypingIndicator(color: primaryColor)
                            .padding(.leading, 16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Configuration card when ready
                    if configReady {
                        QuickTaskConfigCard(
                            taskType: selectedTaskType,
                            complexity: detectedComplexity,
                            primaryColor: primaryColor,
                            onStart: startTask
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
            if !attachedFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachedFiles) { file in
                            QuickTaskFileChip(file: file) {
                                removeAttachment(file)
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
                    showingAttachmentOptions = true
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
                .disabled(isProcessing)

                // Text field
                HStack {
                    TextField("What do you need help with?", text: $inputText, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($isInputFocused)
                        .disabled(isProcessing)
                        .submitLabel(.send)
                        .onSubmit { sendMessage() }
                        .onChange(of: inputText) { _, newValue in
                            detectedComplexity = farmingService.analyzeTaskComplexity(newValue)
                            if selectedTaskType == nil && !newValue.isEmpty {
                                selectedTaskType = farmingService.suggestTaskType(from: newValue)
                            }
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
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isProcessing)
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
        let suggestions = farmingService.suggestedTasks.prefix(3).map { $0.description }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        handleSuggestionTap(suggestion)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "bolt")
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

    // MARK: - Running State Content
    @ViewBuilder
    private var runningStateContent: some View {
        VStack(spacing: isCompact ? 16 : 20) {
            Spacer()

            // Animated icon
            ZStack {
                Circle()
                    .stroke(primaryColor.opacity(0.2), lineWidth: 4)
                    .frame(width: 100, height: 100)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        LinearGradient(colors: [primaryColor, accentColor], startPoint: .topLeading, endPoint: .bottomTrailing),
                        style: StrokeStyle(lineWidth: 4, lineCap: .round)
                    )
                    .frame(width: 100, height: 100)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.3), value: progress)

                Image(systemName: "bolt.fill")
                    .font(.system(size: 36, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(colors: [primaryColor, accentColor], startPoint: .top, endPoint: .bottom)
                    )
            }

            Text("Processing your task...")
                .font(.headline)
                .foregroundColor(.primary)

            Text("\(Int(progress * 100))% complete")
                .font(.caption)
                .foregroundColor(.secondary)

            // Progress steps
            VStack(alignment: .leading, spacing: 10) {
                ProgressStepRow(
                    icon: "checkmark.circle.fill",
                    text: "Analyzing request",
                    isComplete: true,
                    isActive: progress < 0.3
                )
                ProgressStepRow(
                    icon: progress > 0.3 ? "checkmark.circle.fill" : "circle.dotted",
                    text: "Generating response",
                    isComplete: progress > 0.3,
                    isActive: progress >= 0.3 && progress < 0.7
                )
                ProgressStepRow(
                    icon: progress > 0.7 ? "checkmark.circle.fill" : "circle.dotted",
                    text: "Finalizing output",
                    isComplete: progress > 0.7,
                    isActive: progress >= 0.7
                )
            }
            .font(.subheadline)
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(primaryColor.opacity(0.2), lineWidth: 1)
            )
            .padding(.horizontal, 24)

            Spacer()
        }
    }

    // MARK: - Helpers
    private func initializeConversation() {
        let greetings = [
            "Need something done quickly? I'm ready to help! What's on your mind?",
            "Quick task mode activated! What can I tackle for you in 5 minutes?",
            "Let's get this done fast! What would you like help with?"
        ]

        messages = [
            QuickTaskMessage(
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
        messages.append(QuickTaskMessage(role: .user, content: text))

        // Save task description
        taskDescription = text

        // Show processing
        isProcessing = true

        // Simulate AI response
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8 + Double.random(in: 0...0.3)) {
            generateResponse(for: text)
        }
    }

    private func generateResponse(for input: String) {
        isProcessing = false
        HapticManager.shared.notify(.success)

        let taskTypeStr = selectedTaskType?.rawValue ?? "task"
        let complexityStr = detectedComplexity == .high ? "complex" : (detectedComplexity == .medium ? "moderate" : "straightforward")

        let response = """
        Got it! This looks like a \(complexityStr) \(taskTypeStr).

        I'll handle this quickly. Ready to start when you are!
        """

        messages.append(QuickTaskMessage(role: .assistant, content: response))
        configReady = true
    }

    private func startTask() {
        isRunning = true
        HapticManager.shared.impact(.medium)

        progressTask?.cancel()
        progressTask = Task { @MainActor in
            while progress < 1.0 && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if !Task.isCancelled {
                    progress += 0.02
                }
            }

            if !Task.isCancelled {
                let taskName = generateTaskName()
                let taskTypeStr = selectedTaskType?.rawValue ?? "code"
                _ = HarvestResultStore.shared.addQuickTaskResult(
                    name: taskName,
                    taskDescription: taskDescription,
                    taskType: taskTypeStr
                )

                HapticManager.shared.notify(.success)
                try? await Task.sleep(nanoseconds: 500_000_000)
                if !Task.isCancelled {
                    dismiss()
                }
            }
        }
    }

    private func generateTaskName() -> String {
        let words = taskDescription
            .components(separatedBy: .whitespaces)
            .filter { $0.count > 3 }
            .prefix(3)
            .map { $0.capitalized }

        if words.isEmpty {
            return "Quick Task \(Date().formatted(date: .abbreviated, time: .shortened))"
        }
        return words.joined(separator: " ")
    }

    private func cancelTask() {
        progressTask?.cancel()
        progressTask = nil
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                do {
                    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
                    let fileSize = attributes[.size] as? Int64 ?? 0

                    if fileSize > maxFileSizeBytes {
                        HapticManager.shared.notify(.warning)
                        continue
                    }

                    if let data = try? Data(contentsOf: url) {
                        let file = AttachedFile(
                            name: url.lastPathComponent,
                            size: Int64(data.count),
                            type: UTType(filenameExtension: url.pathExtension) ?? .data,
                            data: data
                        )
                        attachedFiles.append(file)
                    }
                } catch {
                    continue
                }
            }
            HapticManager.shared.notify(.success)

            if !attachedFiles.isEmpty {
                messages.append(QuickTaskMessage(
                    role: .system,
                    content: "\(attachedFiles.count) file\(attachedFiles.count > 1 ? "s" : "") attached"
                ))
            }
        case .failure:
            HapticManager.shared.notify(.error)
        }
    }

    private func handlePhotoSelection(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self) {
                if Int64(data.count) > maxFileSizeBytes {
                    await MainActor.run {
                        HapticManager.shared.notify(.warning)
                    }
                    continue
                }

                let file = AttachedFile(
                    name: "Photo_\(UUID().uuidString.prefix(8)).jpg",
                    size: Int64(data.count),
                    type: .jpeg,
                    data: data
                )
                await MainActor.run {
                    attachedFiles.append(file)
                }
            }
        }
        await MainActor.run {
            selectedPhotoItems.removeAll()
            HapticManager.shared.notify(.success)
        }
    }

    private func removeAttachment(_ file: AttachedFile) {
        attachedFiles.removeAll { $0.id == file.id }
        HapticManager.shared.impact(.light)
    }
}

// MARK: - Quick Task Message
struct QuickTaskMessage: Identifiable {
    let id = UUID()
    let role: MessageRole
    let content: String

    enum MessageRole {
        case user
        case assistant
        case system
    }
}

// MARK: - Quick Task Message Bubble
struct QuickTaskMessageBubble: View {
    let message: QuickTaskMessage
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
                    Image(systemName: "bolt.fill")
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

// MARK: - Quick Typing Indicator
struct QuickTypingIndicator: View {
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

// MARK: - Quick Task Config Card
struct QuickTaskConfigCard: View {
    let taskType: TaskType?
    let complexity: TaskComplexity
    let primaryColor: Color
    let onStart: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            // Header
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [primaryColor, primaryColor.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 40, height: 40)
                    Image(systemName: taskType?.icon ?? "bolt.fill")
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Quick Task")
                        .font(.headline)
                    Text("~5 minutes • \(complexity.rawValue)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            // Task type indicator
            if let taskType = taskType {
                HStack(spacing: 8) {
                    Image(systemName: taskType.icon)
                        .foregroundColor(primaryColor)
                    Text(taskType.rawValue)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    TaskComplexityIndicator(complexity: complexity)
                }
                .padding(12)
                .background(Color(.tertiarySystemBackground))
                .cornerRadius(12)
            }

            // Start button
            Button(action: onStart) {
                HStack(spacing: 8) {
                    Image(systemName: "bolt.fill")
                    Text("Start Quick Task")
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

// MARK: - Quick Task File Chip
struct QuickTaskFileChip: View {
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

// MARK: - Attached File Model
struct AttachedFile: Identifiable {
    let id = UUID()
    let name: String
    let size: Int64
    let type: UTType
    let data: Data

    var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: size, countStyle: .file)
    }

    var icon: String {
        if type.conforms(to: .image) { return "photo" }
        if type.conforms(to: .pdf) { return "doc.text" }
        if type.conforms(to: .sourceCode) { return "doc.text.fill" }
        if type.conforms(to: .json) { return "curlybraces" }
        return "doc"
    }
}

// MARK: - Attached File Row
struct AttachedFileRow: View {
    let file: AttachedFile
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: file.icon)
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 40, height: 40)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 2) {
                Text(file.name)
                    .font(.subheadline)
                    .lineLimit(1)
                Text(file.formattedSize)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Progress Step Row (for Quick Task progress)
struct ProgressStepRow: View {
    let icon: String
    let text: String
    let isComplete: Bool
    let isActive: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(isComplete ? MaiFarmColors.primaryGreen : (isActive ? MaiFarmColors.accentGreen : .gray))
                .frame(width: 24)

            Text(text)
                .font(.subheadline)
                .fontWeight(isActive ? .medium : .regular)
                .foregroundColor(isComplete || isActive ? .primary : .secondary)

            Spacer()

            if isActive && !isComplete {
                ProgressView()
                    .scaleEffect(0.8)
                    .tint(MaiFarmColors.primaryGreen)
            }
        }
    }
}

// MARK: - Optimized File Types Sheet
struct OptimizedFileTypesSheet: View {
    let fileTypes: [OptimizedFileType]
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: deviceIcon)
                            .font(.title)
                            .foregroundColor(.accentColor)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Optimized for \(deviceManager.deviceType.displayName)")
                                .font(.headline)
                            Text("File types ranked by compatibility")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section("Recommended File Types") {
                    ForEach(fileTypes.filter { $0.priority == .high }) { fileType in
                        OptimizedFileTypeRow(fileType: fileType)
                    }
                }

                Section("Supported File Types") {
                    ForEach(fileTypes.filter { $0.priority == .medium }) { fileType in
                        OptimizedFileTypeRow(fileType: fileType)
                    }
                }

                if fileTypes.contains(where: { $0.priority == .low }) {
                    Section("Also Available") {
                        ForEach(fileTypes.filter { $0.priority == .low }) { fileType in
                            OptimizedFileTypeRow(fileType: fileType)
                        }
                    }
                }
            }
            .navigationTitle("File Types")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    var deviceIcon: String {
        switch deviceManager.deviceType {
        case .iPhone: return "iphone"
        case .iPad: return "ipad"
        case .mac: return "desktopcomputer"
        }
    }
}

// MARK: - Previews
#Preview("Quick Task Sheet - Conversational") {
    QuickTaskSheet()
        .environmentObject(DeviceCapabilityManager.shared)
}
