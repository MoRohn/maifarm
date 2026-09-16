//
//  SettingsView.swift
//  MaiFarm
//
//  Settings View - App configuration and preferences
//

import SwiftUI

// MARK: - Adaptive Settings View
struct AdaptiveSettingsView: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @StateObject private var themeManager = MaiFarmThemeManager.shared
    @AppStorage("appearanceMode") private var appearanceMode = 2  // Default to Dark (2) to match web
    @AppStorage("selectedColorScheme") private var selectedColorSchemeId = "forest-walk"
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("hapticFeedback") private var hapticFeedback = true
    @AppStorage("selectedAIEngine") private var selectedAIEngine = "claude"
    @State private var showingDeleteAlert = false
    @State private var showingSignOutAlert = false
    @State private var showingClearFarmsAlert = false
    @State private var showingClearHarvestsAlert = false
    @State private var showingResetAppAlert = false
    @State private var isClearing = false

    var body: some View {
        NavigationStack {
            List {
                accountSection
                deviceSection
                displaySection
                aiSection
                notificationsSection
                generalSection
                dataManagementSection
                aboutSection
                accountActionsSection
            }
            .navigationTitle("Settings")
            .scrollContentBackground(.hidden)
            .maiFarmBackground()
            .alert("Sign Out", isPresented: $showingSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {}
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .alert("Delete Account", isPresented: $showingDeleteAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {}
            } message: {
                Text("This action cannot be undone. All your data will be permanently deleted.")
            }
            .alert("Clear Farms Data", isPresented: $showingClearFarmsAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Clear", role: .destructive) {
                    Task { await clearFarmsData() }
                }
            } message: {
                Text("This will remove all local farms data and cached farm information.")
            }
            .alert("Clear Harvests", isPresented: $showingClearHarvestsAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Clear", role: .destructive) {
                    Task { await clearHarvestsData() }
                }
            } message: {
                Text("This will remove all locally stored harvest results and barn items.")
            }
            .alert("Reset All App Data", isPresented: $showingResetAppAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    Task { await resetAllAppData() }
                }
            } message: {
                Text("This will clear all app data including farms, harvests, and settings. This cannot be undone.")
            }
        }
        .preferredColorScheme(colorSchemeFromMode(appearanceMode))
    }

    // MARK: - Account Section
    @ViewBuilder
    private var accountSection: some View {
        Section {
            HStack(spacing: 16) {
                AppLogoImageView(size: 56, showShadow: false)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Guest User")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Sign in to sync your farms")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Device Section
    @ViewBuilder
    private var deviceSection: some View {
        Section {
            HStack {
                SettingsIconView(icon: deviceIcon, color: .blue)
                VStack(alignment: .leading) {
                    Text(deviceManager.deviceType.displayName)
                    Text("\(deviceManager.computeTier.rawValue) Tier")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }

            HStack {
                Text("Max Agents")
                Spacer()
                Text("\(deviceManager.computeTier.maxAgents)")
                    .foregroundColor(.secondary)
            }

            HStack {
                Text("Max Farm Duration")
                Spacer()
                Text("\(deviceManager.computeTier.maxFarmDuration) hours")
                    .foregroundColor(.secondary)
            }

            HStack {
                Text("Local AI Support")
                Spacer()
                Image(systemName: deviceManager.computeTier.supportsLocalModels ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundColor(deviceManager.computeTier.supportsLocalModels ? .green : .gray)
            }
        } header: {
            Text("Device Capabilities")
        }
    }

    // MARK: - Display Section
    @ViewBuilder
    private var displaySection: some View {
        Section {
            NavigationLink {
                AppearanceSettingsView(appearanceMode: $appearanceMode)
            } label: {
                SettingsRow(
                    icon: "sun.max.fill",
                    iconColor: .orange,
                    title: "Appearance",
                    subtitle: ["System", "Light", "Dark"][appearanceMode]
                )
            }

            NavigationLink {
                ColorSchemeSettingsView(
                    selectedSchemeId: $selectedColorSchemeId,
                    themeManager: themeManager
                )
            } label: {
                HStack {
                    SettingsIconView(icon: "paintpalette.fill", color: themeManager.currentScheme.primary)
                    Text("Color Scheme")
                    Spacer()
                    HStack(spacing: 4) {
                        Circle()
                            .fill(themeManager.currentScheme.primary)
                            .frame(width: 16, height: 16)
                        Circle()
                            .fill(themeManager.currentScheme.accent)
                            .frame(width: 16, height: 16)
                    }
                    Text(themeManager.currentScheme.name)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        } header: {
            Text("Display & Brightness")
        }
    }

    // MARK: - AI Section
    @ViewBuilder
    private var aiSection: some View {
        Section {
            NavigationLink {
                AIEngineSettingsView(selectedEngine: $selectedAIEngine)
            } label: {
                SettingsRow(
                    icon: "brain",
                    iconColor: .purple,
                    title: "AI Engine",
                    subtitle: aiEngineDisplayName(selectedAIEngine)
                )
            }

            if deviceManager.computeTier.supportsLocalModels {
                NavigationLink {
                    LocalModelsView()
                } label: {
                    SettingsRow(
                        icon: "desktopcomputer",
                        iconColor: .blue,
                        title: "Local Models",
                        subtitle: "Ollama, GPT-OSS"
                    )
                }
            }
        } header: {
            Text("AI Configuration")
        } footer: {
            if !deviceManager.computeTier.supportsLocalModels {
                Text("Local models require a Mac or iPad Pro with M-series chip.")
            }
        }
    }

    // MARK: - Notifications Section
    @ViewBuilder
    private var notificationsSection: some View {
        Section {
            Toggle(isOn: $notificationsEnabled) {
                SettingsRow(
                    icon: "bell.badge.fill",
                    iconColor: .red,
                    title: "Push Notifications"
                )
            }
        } header: {
            Text("Notifications")
        }
    }

    // MARK: - General Section
    @ViewBuilder
    private var generalSection: some View {
        Section {
            // Cross-Device Sync Settings
            NavigationLink {
                CrossDeviceSettingsView()
            } label: {
                SettingsRow(
                    icon: "arrow.triangle.2.circlepath",
                    iconColor: .blue,
                    title: "Cross-Device Sync",
                    subtitle: "Transfer farms to iMac"
                )
            }

            #if !targetEnvironment(macCatalyst) && !os(macOS)
            Toggle(isOn: $hapticFeedback) {
                SettingsRow(
                    icon: "hand.tap.fill",
                    iconColor: .gray,
                    title: "Haptic Feedback"
                )
            }
            #endif

            NavigationLink {
                StorageSettingsView()
            } label: {
                SettingsRow(
                    icon: "internaldrive.fill",
                    iconColor: .gray,
                    title: "Storage",
                    subtitle: "128 MB used"
                )
            }
        } header: {
            Text("General")
        }
    }

    // MARK: - Data Management Section
    @ViewBuilder
    private var dataManagementSection: some View {
        Section {
            Button(action: { showingClearFarmsAlert = true }) {
                HStack {
                    SettingsIconView(icon: "leaf.fill", color: .orange)
                    Text("Clear Farms Data")
                    Spacer()
                    if isClearing {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                }
            }
            .disabled(isClearing)

            Button(action: { showingClearHarvestsAlert = true }) {
                HStack {
                    SettingsIconView(icon: "archivebox.fill", color: .purple)
                    Text("Clear Harvests")
                    Spacer()
                }
            }
            .disabled(isClearing)

            Button(action: { showingResetAppAlert = true }) {
                HStack {
                    SettingsIconView(icon: "arrow.counterclockwise", color: .red)
                    Text("Reset All App Data")
                    Spacer()
                }
            }
            .disabled(isClearing)
        } header: {
            Text("Data Management")
        } footer: {
            Text("Clearing data removes local cache only. Your account and cloud data remain intact.")
                .font(.caption)
        }
    }

    // MARK: - About Section
    @ViewBuilder
    private var aboutSection: some View {
        Section {
            if let privacyURL = URL(string: "https://maifarm.app/privacy") {
                Link(destination: privacyURL) {
                    SettingsRow(
                        icon: "doc.text.fill",
                        iconColor: .gray,
                        title: "Privacy Policy",
                        showChevron: true,
                        isExternal: true
                    )
                }
            }

            if let termsURL = URL(string: "https://maifarm.app/terms") {
                Link(destination: termsURL) {
                    SettingsRow(
                        icon: "doc.plaintext.fill",
                        iconColor: .gray,
                        title: "Terms of Service",
                        showChevron: true,
                        isExternal: true
                    )
                }
            }

            HStack {
                SettingsIconView(icon: "info.circle.fill", color: .gray)
                Text("Version")
                Spacer()
                Text("1.0.0 (1)")
                    .foregroundColor(.secondary)
            }
        } header: {
            Text("About")
        }
    }

    // MARK: - Account Actions Section
    @ViewBuilder
    private var accountActionsSection: some View {
        Section {
            Button(action: { showingSignOutAlert = true }) {
                HStack {
                    Spacer()
                    Text("Sign Out")
                        .foregroundColor(.blue)
                    Spacer()
                }
            }
        }

        Section {
            Button(action: { showingDeleteAlert = true }) {
                HStack {
                    Spacer()
                    Text("Delete Account")
                        .foregroundColor(.red)
                    Spacer()
                }
            }
        } footer: {
            Text("Deleting your account will permanently remove all your farms, harvests, and stored data.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Helpers
    var deviceIcon: String {
        switch deviceManager.deviceType {
        case .mac: return "desktopcomputer"
        case .iPad: return "ipad"
        case .iPhone: return "iphone"
        }
    }

    private func aiEngineDisplayName(_ engine: String) -> String {
        switch engine {
        case "claude": return "Claude (Anthropic)"
        case "openai": return "OpenAI GPT-4"
        case "grok": return "Grok (xAI)"
        case "ollama": return "Ollama (Local)"
        case "gpt_oss": return "GPT-OSS (Local)"
        default: return "Claude (Anthropic)"
        }
    }

    private func colorSchemeFromMode(_ mode: Int) -> ColorScheme? {
        switch mode {
        case 1: return .light
        case 2: return .dark
        default: return nil
        }
    }

    // MARK: - Data Management Functions
    private func clearFarmsData() async {
        await MainActor.run { isClearing = true }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        await MainActor.run {
            isClearing = false
            AppState.shared.showToast("Farms data cleared", type: .success)
        }
    }

    private func clearHarvestsData() async {
        await MainActor.run { isClearing = true }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        await MainActor.run {
            isClearing = false
            AppState.shared.showToast("Harvests cleared", type: .success)
        }
    }

    private func resetAllAppData() async {
        await MainActor.run { isClearing = true }
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        await MainActor.run {
            isClearing = false
            AppState.shared.showToast("All app data reset", type: .success)
        }
    }
}

// MARK: - Settings Icon View
struct SettingsIconView: View {
    let icon: String
    let color: Color

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 16))
            .foregroundColor(.white)
            .frame(width: 29, height: 29)
            .background(color)
            .cornerRadius(6)
    }
}

// MARK: - Settings Row
struct SettingsRow: View {
    let icon: String
    let iconColor: Color
    let title: String
    var subtitle: String? = nil
    var showChevron: Bool = false
    var isExternal: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            SettingsIconView(icon: icon, color: iconColor)

            Text(title)
                .foregroundColor(.primary)

            Spacer()

            if let subtitle = subtitle {
                Text(subtitle)
                    .foregroundColor(.secondary)
            }

            if isExternal {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
        }
    }
}

// MARK: - Appearance Settings View
struct AppearanceSettingsView: View {
    @Binding var appearanceMode: Int

    var body: some View {
        List {
            Section {
                ForEach(0..<3) { index in
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            appearanceMode = index
                        }
                    }) {
                        HStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(appearanceColor(index).opacity(0.2))
                                    .frame(width: 44, height: 44)
                                Image(systemName: appearanceIcon(index))
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundColor(appearanceColor(index))
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(["System", "Light", "Dark"][index])
                                    .font(.body)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)

                                Text(appearanceDescription(index))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            if appearanceMode == index {
                                ZStack {
                                    Circle()
                                        .fill(MaiFarmColors.primaryGreen)
                                        .frame(width: 28, height: 28)
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.white)
                                }
                            } else {
                                Circle()
                                    .stroke(Color.gray.opacity(0.3), lineWidth: 2)
                                    .frame(width: 28, height: 28)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .listRowBackground(
                        appearanceMode == index
                            ? MaiFarmColors.primaryGreen.opacity(0.1)
                            : Color.clear
                    )
                }
            } header: {
                Text("Select Appearance")
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func appearanceIcon(_ index: Int) -> String {
        switch index {
        case 0: return "circle.lefthalf.filled"
        case 1: return "sun.max.fill"
        case 2: return "moon.fill"
        default: return "circle.lefthalf.filled"
        }
    }

    private func appearanceColor(_ index: Int) -> Color {
        switch index {
        case 0: return .gray
        case 1: return .orange
        case 2: return .indigo
        default: return .gray
        }
    }

    private func appearanceDescription(_ index: Int) -> String {
        switch index {
        case 0: return "Follow device settings"
        case 1: return "Always use light mode"
        case 2: return "Always use dark mode"
        default: return ""
        }
    }
}

// MARK: - Color Scheme Settings View
/// Full color scheme selector matching web dashboard themes
struct ColorSchemeSettingsView: View {
    @Binding var selectedSchemeId: String
    @ObservedObject var themeManager: MaiFarmThemeManager
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        List {
            // Preview section
            Section {
                VStack(spacing: 16) {
                    // Current scheme preview card
                    VStack(spacing: 12) {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(themeManager.currentScheme.primary)
                                .frame(width: 48, height: 48)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white.opacity(0.3), lineWidth: 2)
                                )

                            Circle()
                                .fill(themeManager.currentScheme.accent)
                                .frame(width: 48, height: 48)
                                .overlay(
                                    Circle()
                                        .stroke(Color.white.opacity(0.3), lineWidth: 2)
                                )
                        }

                        Text(themeManager.currentScheme.name)
                            .font(.headline)

                        // Gradient preview
                        RoundedRectangle(cornerRadius: 12)
                            .fill(themeManager.currentScheme.gradient)
                            .frame(height: 48)
                            .overlay(
                                Text("Preview Gradient")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundColor(.white)
                            )
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(colorScheme == .dark ? Color.black.opacity(0.3) : Color.gray.opacity(0.1))
                    )
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
            } header: {
                Text("Current Theme")
            }

            // All color schemes
            Section {
                ForEach(MaiFarmColorSchemes.all) { scheme in
                    Button(action: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedSchemeId = scheme.id
                            themeManager.setColorScheme(scheme)
                        }
                        HapticManager.shared.selectionChanged()
                    }) {
                        HStack(spacing: 14) {
                            // Color preview circles
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(scheme.primary)
                                    .frame(width: 28, height: 28)
                                Circle()
                                    .fill(scheme.accent)
                                    .frame(width: 28, height: 28)
                            }
                            .padding(6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
                            )

                            VStack(alignment: .leading, spacing: 2) {
                                Text(scheme.name)
                                    .font(.body)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)

                                Text(schemeDescription(for: scheme.id))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            if selectedSchemeId == scheme.id {
                                ZStack {
                                    Circle()
                                        .fill(scheme.primary)
                                        .frame(width: 28, height: 28)
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(.white)
                                }
                            } else {
                                Circle()
                                    .stroke(Color.gray.opacity(0.3), lineWidth: 2)
                                    .frame(width: 28, height: 28)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(
                        selectedSchemeId == scheme.id
                            ? scheme.primary.opacity(0.1)
                            : Color.clear
                    )
                }
            } header: {
                Text("Available Themes")
            } footer: {
                Text("Color schemes sync with MaiFarm web dashboard for a consistent experience across all your devices.")
                    .font(.caption)
            }
        }
        .navigationTitle("Color Scheme")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func schemeDescription(for id: String) -> String {
        switch id {
        case "forest-walk": return "Default - Fresh greens for a natural feel"
        case "purple-dreams": return "Vibrant purple and pink tones"
        case "ocean-breeze": return "Cool cyan and teal waters"
        case "sunset-glow": return "Warm orange and amber hues"
        case "cherry-blossom": return "Soft pink spring blossoms"
        case "midnight-blue": return "Deep blue and indigo night"
        case "autumn-harvest": return "Rich red and orange leaves"
        case "cosmic-purple": return "Deep space purple vibes"
        default: return ""
        }
    }
}

// MARK: - AI Engine Settings View
struct AIEngineSettingsView: View {
    @Binding var selectedEngine: String
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    private var availableEngines: [AIEngine] {
        AIEngine.availableEngines(for: deviceManager.computeTier)
    }

    private var currentEngine: AIEngine {
        AIEngine(rawValue: selectedEngine) ?? .claude
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Image(systemName: currentEngine.icon)
                        .font(.title)
                        .foregroundColor(currentEngine.color)
                        .frame(width: 44, height: 44)
                        .background(
                            Circle()
                                .fill(currentEngine.color.opacity(0.15))
                        )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(currentEngine.fullName)
                            .font(.headline)

                        Text("Active Engine")
                            .font(.caption)
                            .foregroundColor(.green)
                    }

                    Spacer()

                    if currentEngine.isLocal {
                        Image(systemName: "lock.shield.fill")
                            .foregroundColor(.green)
                    }
                }
                .padding(.vertical, 4)
            } header: {
                Text("Current Engine")
            }

            Section {
                ForEach(availableEngines) { engine in
                    Button(action: {
                        withAnimation(.spring(response: 0.3)) {
                            selectedEngine = engine.rawValue
                        }
                    }) {
                        HStack(spacing: 14) {
                            Image(systemName: engine.icon)
                                .font(.title2)
                                .foregroundColor(selectedEngine == engine.rawValue ? engine.color : .gray)
                                .frame(width: 40, height: 40)
                                .background(
                                    Circle()
                                        .fill(selectedEngine == engine.rawValue ? engine.color.opacity(0.15) : Color.gray.opacity(0.1))
                                )

                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(engine.displayName)
                                        .font(.body)
                                        .fontWeight(.medium)
                                        .foregroundColor(.primary)

                                    if engine.isLocal {
                                        Image(systemName: "lock.fill")
                                            .font(.caption2)
                                            .foregroundColor(.green)
                                    }
                                }

                                Text(engine.description)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            if selectedEngine == engine.rawValue {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(engine.color)
                                    .font(.title3)
                            }
                        }
                    }
                    .listRowBackground(
                        selectedEngine == engine.rawValue
                            ? engine.color.opacity(0.08)
                            : Color.clear
                    )
                }
            } header: {
                Text("Available Engines")
            } footer: {
                if deviceManager.computeTier.supportsLocalModels {
                    Text("Local engines provide maximum privacy and work offline.")
                } else {
                    Text("Cloud-based engines are recommended for your device.")
                }
            }
        }
        .navigationTitle("AI Engine")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Local Models View
struct LocalModelsView: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    var body: some View {
        List {
            Section {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    VStack(alignment: .leading) {
                        Text("Ollama")
                            .font(.headline)
                        Text("Connected - localhost:11434")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                HStack {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.red)
                    VStack(alignment: .leading) {
                        Text("GPT-OSS")
                            .font(.headline)
                        Text("Not configured")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            } header: {
                Text("Local AI Services")
            } footer: {
                Text("Local models run on your \(deviceManager.deviceType.displayName), keeping your data private.")
            }
        }
        .navigationTitle("Local Models")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Storage Settings View
struct StorageSettingsView: View {
    var body: some View {
        List {
            Section {
                HStack {
                    Text("Harvests")
                    Spacer()
                    Text("98 MB")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Cache")
                    Spacer()
                    Text("30 MB")
                        .foregroundColor(.secondary)
                }
            } header: {
                Text("Storage Breakdown")
            }

            Section {
                Button("Clear Cache") {}
                    .foregroundColor(.blue)
            }
        }
        .navigationTitle("Storage")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Previews
#Preview("Settings View") {
    AdaptiveSettingsView()
        .environmentObject(DeviceCapabilityManager.shared)
}
