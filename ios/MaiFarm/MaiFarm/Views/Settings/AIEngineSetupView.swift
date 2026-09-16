//
//  AIEngineSetupView.swift
//  MaiFarm
//
//  Complete AI Engine setup with device-aware optimizations
//  Supports API key input, model selection, and configuration
//

import SwiftUI
import os.log

// MARK: - Main Setup View

struct AIEngineSetupView: View {
    @StateObject private var viewModel = AIEngineSetupViewModel()
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.colorScheme) private var colorScheme

    @State private var showModelSelector = false
    @State private var showAPIKeyHelp = false

    var body: some View {
        NavigationStack {
            Group {
                if sizeClass == .compact {
                    iPhoneLayout
                } else {
                    iPadLayout
                }
            }
            .navigationTitle("AI Engine Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        HapticManager.shared.modalDismissed()
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            let result = await viewModel.saveConfiguration()
                            if result.success {
                                dismiss()
                            }
                        }
                    }
                    .disabled(!viewModel.canSave || viewModel.isSaving)
                    .opacity(viewModel.canSave ? 1 : 0.5)
                }
            }
            .sheet(isPresented: $showModelSelector) {
                ModelSelectorSheet(
                    engine: viewModel.selectedEngine,
                    selectedModel: $viewModel.selectedModel,
                    onSelect: { model in
                        viewModel.selectModel(model)
                        showModelSelector = false
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showAPIKeyHelp) {
                APIKeyHelpSheet(engine: viewModel.selectedEngine)
                    .presentationDetents([.medium])
            }
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage)
            }
            .onAppear {
                HapticManager.shared.modalPresented()
                Task {
                    await viewModel.loadAllEngineStatuses()
                }
            }
        }
    }

    // MARK: - iPhone Layout (Stacked)

    private var iPhoneLayout: some View {
        ScrollView {
            VStack(spacing: 24) {
                engineSelectionSection
                configurationSection
                modelSelectionSection
                statusSection
            }
            .padding()
            .padding(.bottom, 40) // Safe area for home indicator
        }
        .background(Color(uiColor: .systemGroupedBackground))
    }

    // MARK: - iPad Layout (Two Column)

    private var iPadLayout: some View {
        HStack(alignment: .top, spacing: 20) {
            // Left column: Engine selection
            VStack(spacing: 20) {
                engineSelectionSection
                statusSection
            }
            .frame(maxWidth: 350)

            // Right column: Configuration
            VStack(spacing: 20) {
                configurationSection
                modelSelectionSection
            }
            .frame(maxWidth: .infinity)
        }
        .padding()
        .background(Color(uiColor: .systemGroupedBackground))
    }

    // MARK: - Engine Selection Section

    private var engineSelectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Choose Your AI Engine", icon: "cpu")

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ],
                spacing: 12
            ) {
                ForEach(viewModel.availableEngines, id: \.self) { engine in
                    EngineCard(
                        engine: engine,
                        isSelected: viewModel.selectedEngine == engine,
                        isConfigured: viewModel.engineStatuses[engine] ?? false
                    ) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.selectedEngine = engine
                        }
                        HapticManager.shared.selectionChanged()
                    }
                }
            }
        }
        .padding()
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Configuration Section

    @ViewBuilder
    private var configurationSection: some View {
        if viewModel.requiresAPIKey {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    SectionHeader(title: "API Key", icon: "key.fill")

                    Spacer()

                    Button {
                        showAPIKeyHelp = true
                    } label: {
                        Image(systemName: "questionmark.circle")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Get help with API key")
                }

                SecureAPIKeyInput(
                    apiKey: $viewModel.apiKey,
                    engine: viewModel.selectedEngine,
                    validationStatus: viewModel.validationStatus,
                    isValidating: viewModel.isValidating
                )

                // Security note
                HStack(spacing: 8) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundStyle(.green)
                    Text("Encrypted and stored securely on device")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .background(cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else {
            // Local model notice
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: "Local Model", icon: "desktopcomputer")

                HStack(spacing: 12) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title2)
                        .foregroundStyle(.green)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("No API Key Required")
                            .font(.headline)
                        Text("\(viewModel.selectedEngine.displayName) runs locally on your device")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Device capability notice
                if deviceManager.computeTier == .limited || deviceManager.computeTier == .standard {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                        Text("Local models may run slowly on this device")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
            .background(cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // MARK: - Model Selection Section

    private var modelSelectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "Model", icon: "sparkles")

            Button {
                showModelSelector = true
                HapticManager.shared.impact(.light)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(viewModel.selectedModel?.name ?? "Select a model")
                            .font(.headline)
                            .foregroundStyle(viewModel.selectedModel != nil ? .primary : .secondary)

                        if let model = viewModel.selectedModel {
                            Text(model.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(uiColor: .tertiarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("Select Model Button")
        }
        .padding()
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Status Section

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Status", icon: "info.circle")

            VStack(spacing: 8) {
                StatusRow(
                    label: "Engine",
                    value: viewModel.selectedEngine.displayName,
                    icon: viewModel.selectedEngine.icon
                )

                StatusRow(
                    label: "Model",
                    value: viewModel.selectedModel?.name ?? "Not selected",
                    icon: "cpu"
                )

                StatusRow(
                    label: "Device",
                    value: deviceManager.computeTier.rawValue,
                    icon: "iphone"
                )

                if viewModel.requiresAPIKey {
                    StatusRow(
                        label: "API Key",
                        value: viewModel.validationStatus.isValid ? "Valid" : "Required",
                        icon: viewModel.validationStatus.icon,
                        iconColor: viewModel.validationStatus.color
                    )
                }
            }
        }
        .padding()
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Helpers

    private var cardBackground: Color {
        colorScheme == .dark
            ? Color(uiColor: .secondarySystemGroupedBackground)
            : Color.white
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    let icon: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.blue)
            Text(title)
                .font(.headline)
        }
    }
}

// MARK: - Engine Card

struct EngineCard: View {
    let engine: AIEngine
    let isSelected: Bool
    let isConfigured: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 12) {
                // Icon
                Text(engine.icon)
                    .font(.system(size: 36))

                // Name
                Text(engine.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                // Badge
                HStack(spacing: 4) {
                    if isConfigured {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }

                    Text(engine.isLocal ? "Local" : "Cloud")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 110)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? engine.themeColor.opacity(0.15) : Color(uiColor: .tertiarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isSelected ? engine.themeColor : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("Engine \(engine.displayName)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Secure API Key Input

struct SecureAPIKeyInput: View {
    @Binding var apiKey: String
    let engine: AIEngine
    let validationStatus: ValidationStatus
    let isValidating: Bool

    @State private var isSecure = true
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                // Input field
                Group {
                    if isSecure {
                        SecureField("Enter your \(engine.displayName) API key", text: $apiKey)
                    } else {
                        TextField("Enter your \(engine.displayName) API key", text: $apiKey)
                    }
                }
                .textContentType(.password)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .focused($isFocused)
                // 16px font prevents iOS auto-zoom on focus
                .font(.system(size: 16, design: .monospaced))

                // Visibility toggle
                Button {
                    isSecure.toggle()
                    HapticManager.shared.toggle()
                } label: {
                    Image(systemName: isSecure ? "eye.slash" : "eye")
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel(isSecure ? "Show API key" : "Hide API key")

                // Validation indicator
                validationIndicator
            }
            .padding()
            .background(Color(uiColor: .tertiarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(borderColor, lineWidth: isFocused ? 2 : 1)
            )

            // Validation message
            if case .invalid(let message) = validationStatus {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else if case .deferred(let reason) = validationStatus {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            // Format hint
            Text(engine.apiKeyHint)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityIdentifier("API Key Input")
    }

    @ViewBuilder
    private var validationIndicator: some View {
        if isValidating {
            ProgressView()
                .scaleEffect(0.8)
                .accessibilityIdentifier("Validating")
        } else {
            Image(systemName: validationStatus.icon)
                .foregroundStyle(validationStatus.color)
                .animation(.easeInOut, value: validationStatus)
        }
    }

    private var borderColor: Color {
        if isFocused {
            return validationStatus.isValid ? .green : .blue
        }
        return Color(uiColor: .separator)
    }
}

// MARK: - Status Row

struct StatusRow: View {
    let label: String
    let value: String
    let icon: String
    var iconColor: Color = .secondary

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
                .foregroundStyle(iconColor)
                .font(.subheadline)

            Spacer()

            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Model Selector Sheet

struct ModelSelectorSheet: View {
    let engine: AIEngine
    @Binding var selectedModel: AIEngineModel?
    let onSelect: (AIEngineModel) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(engine.availableModels) { model in
                ModelRow(
                    model: model,
                    isSelected: selectedModel?.id == model.id,
                    onSelect: {
                        onSelect(model)
                    }
                )
            }
            .navigationTitle("\(engine.displayName) Models")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct ModelRow: View {
    let model: AIEngineModel
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(model.name)
                            .font(.headline)

                        if model.isDefault {
                            Text("Recommended")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.blue.opacity(0.2))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())
                        }
                    }

                    Text(model.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    // Features
                    HStack(spacing: 8) {
                        ForEach(model.features.prefix(3), id: \.self) { feature in
                            Text(feature)
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color(uiColor: .tertiarySystemFill))
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.title2)
                        .accessibilityIdentifier("Selected Model Checkmark")
                }
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - API Key Help Sheet

struct APIKeyHelpSheet: View {
    let engine: AIEngine

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Getting API key
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Getting Your API Key", systemImage: "key.fill")
                            .font(.headline)

                        Text(engine.apiKeyInstructions)
                            .foregroundStyle(.secondary)

                        if let url = engine.apiKeyURL {
                            Link(destination: url) {
                                HStack {
                                    Text("Open \(engine.displayName) Console")
                                    Image(systemName: "arrow.up.right.square")
                                }
                            }
                        }
                    }

                    Divider()

                    // Security info
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Security", systemImage: "lock.shield.fill")
                            .font(.headline)

                        VStack(alignment: .leading, spacing: 8) {
                            SecurityPoint(icon: "checkmark.circle.fill", text: "Encrypted with AES-256")
                            SecurityPoint(icon: "checkmark.circle.fill", text: "Stored in iOS Keychain")
                            SecurityPoint(icon: "checkmark.circle.fill", text: "Never sent to third parties")
                            SecurityPoint(icon: "checkmark.circle.fill", text: "Only used for API calls")
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("API Key Help")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct SecurityPoint: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.green)
            Text(text)
                .foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }
}

// MARK: - AIEngine Extensions

extension AIEngine {
    var themeColor: Color {
        switch self {
        case .claude: return .purple
        case .openai: return .blue
        case .grok: return .orange
        case .ollama: return .green
        case .localCore: return .indigo
        }
    }

    var apiKeyHint: String {
        switch self {
        case .claude: return "Keys start with 'sk-' or 'anthropic-'"
        case .openai: return "Keys start with 'sk-'"
        case .grok: return "Keys start with 'xai-' or 'grok-'"
        case .ollama, .localCore: return "No API key required"
        }
    }

    var apiKeyInstructions: String {
        switch self {
        case .claude:
            return "1. Go to console.anthropic.com\n2. Sign in or create an account\n3. Navigate to Settings → API Keys\n4. Create a new key and copy it"
        case .openai:
            return "1. Go to platform.openai.com\n2. Sign in or create an account\n3. Navigate to API Keys\n4. Create a new secret key and copy it"
        case .grok:
            return "1. Go to x.ai\n2. Sign in with your X account\n3. Navigate to API section\n4. Generate a new API key"
        case .ollama, .localCore:
            return "No API key required for local models"
        }
    }

    var apiKeyURL: URL? {
        switch self {
        case .claude: return URL(string: "https://console.anthropic.com/settings/keys")
        case .openai: return URL(string: "https://platform.openai.com/api-keys")
        case .grok: return URL(string: "https://x.ai")
        case .ollama, .localCore: return nil
        }
    }
}

// MARK: - Preview

#Preview {
    AIEngineSetupView()
        .environmentObject(DeviceCapabilityManager.shared)
}
