//
//  ContentView.swift
//  MaiFarm
//
//  Multi-Agent AI Orchestration Platform
//  Universal App for iPhone, iPad, and Mac
//

import SwiftUI
import AuthenticationServices
import UniformTypeIdentifiers
import PhotosUI

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AppKit)
import AppKit
#endif

// MARK: - Extracted Modules
// The following have been extracted to separate files for better organization:
// - MaiFarmColors → Design/Colors.swift
// - MaiFarmBackground, HardenedSheetModifier → Design/Backgrounds.swift
// - MaiFarmLogoView, CircuitPlantShape, etc. → Components/Logo/MaiFarmLogo.swift
// - DeviceCapabilityManager, PlatformEnvironment, AppLaunchState → Models/DeviceCapabilityManager.swift
// - AIEngine, AIEngineModel → Models/AIEngine.swift
// - StatCard, FarmCard, QuickActionCard → Components/Cards/Cards.swift
// - MainTabView, SidebarView, AdaptiveMainView → Navigation/MainNavigation.swift

// MARK: - Main Content View
struct ContentView: View {
    @StateObject private var deviceManager = DeviceCapabilityManager.shared
    @State private var isAuthenticated = false
    @State private var selectedTab = 0
    @State private var launchState: AppLaunchState = .loading
    @AppStorage("hasCompletedEngineOnboarding") private var hasCompletedEngineOnboarding = false
    @AppStorage("selectedAIEngine") private var selectedAIEngineRaw = "claude"
    @Environment(\.horizontalSizeClass) var horizontalSizeClass

    var body: some View {
        ZStack {
            // Main app content (loaded in background)
            Group {
                if isAuthenticated {
                    if hasCompletedEngineOnboarding {
                        AdaptiveMainView(selectedTab: $selectedTab)
                            .environmentObject(deviceManager)
                    } else {
                        AIEngineOnboardingView(
                            hasCompletedOnboarding: $hasCompletedEngineOnboarding,
                            selectedEngine: $selectedAIEngineRaw
                        )
                        .environmentObject(deviceManager)
                    }
                } else {
                    AdaptiveAuthenticationView(isAuthenticated: $isAuthenticated)
                        .environmentObject(deviceManager)
                }
            }
            .opacity(launchState == .ready ? 1 : 0)

            // Splash screen overlay
            if launchState == .loading {
                SplashScreenView(launchState: $launchState)
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: launchState)
        .hardenedAppearance()
    }
}

// MARK: - Splash Screen View
struct SplashScreenView: View {
    @Binding var launchState: AppLaunchState
    @State private var logoScale: CGFloat = 0.8
    @State private var logoOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var loadingOpacity: Double = 0
    @State private var glowAmount: Double = 0
    @State private var loadingProgress: Double = 0
    @State private var statusText: String = "Initializing..."

    var body: some View {
        ZStack {
            // Background
            MaiFarmColors.darkBackground
                .ignoresSafeArea()

            // Subtle gradient overlay
            RadialGradient(
                colors: [
                    MaiFarmColors.primaryGreen.opacity(0.15),
                    Color.clear
                ],
                center: .center,
                startRadius: 50,
                endRadius: 400
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo - App Icon with MaiFarm text
                VStack(spacing: 24) {
                    AppLogoImageView(size: 120, showShadow: true)
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)

                    // App name with two-tone styling
                    HStack(spacing: 0) {
                        Text("Mai")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("Farm")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundColor(MaiFarmColors.primaryGreen)
                    }
                    .opacity(textOpacity)

                    Text("Multi-Agent AI Orchestration")
                        .font(.system(size: 14, weight: .medium))
                        .tracking(1.2)
                        .foregroundColor(.gray)
                        .opacity(textOpacity)
                }

                Spacer()

                // Loading section
                VStack(spacing: 20) {
                    // Progress bar
                    VStack(spacing: 12) {
                        // Loading bar
                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                // Background
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.white.opacity(0.1))
                                    .frame(height: 6)

                                // Progress
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(
                                        LinearGradient(
                                            colors: [MaiFarmColors.primaryGreen, MaiFarmColors.accentGreen],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .frame(width: geometry.size.width * loadingProgress, height: 6)
                            }
                        }
                        .frame(height: 6)
                        .frame(maxWidth: 200)

                        // Status text
                        Text(statusText)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.gray)
                    }
                    .opacity(loadingOpacity)

                    // Version info
                    Text("Version 1.0.0")
                        .font(.system(size: 11))
                        .foregroundColor(Color.gray.opacity(0.5))
                        .opacity(loadingOpacity)
                }
                .padding(.bottom, 60)
            }
            .padding(.horizontal, 40)
        }
        .onAppear {
            startLaunchSequence()
        }
    }

    private func startLaunchSequence() {
        // Logo animation
        withAnimation(.spring(response: 0.8, dampingFraction: 0.6).delay(0.1)) {
            logoScale = 1.0
            logoOpacity = 1.0
        }

        // Text animation
        withAnimation(.easeOut(duration: 0.5).delay(0.4)) {
            textOpacity = 1.0
        }

        // Loading section animation
        withAnimation(.easeOut(duration: 0.4).delay(0.6)) {
            loadingOpacity = 1.0
        }

        // Glow animation
        withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
            glowAmount = 1.0
        }

        // Simulated loading progress
        simulateLoading()
    }

    private func simulateLoading() {
        let loadingSteps: [(Double, String, Double)] = [
            (0.15, "Initializing...", 0.3),
            (0.35, "Loading AI Engines...", 0.5),
            (0.55, "Preparing Workspace...", 0.4),
            (0.75, "Connecting Services...", 0.4),
            (0.90, "Almost Ready...", 0.3),
            (1.0, "Ready", 0.2)
        ]

        var totalDelay: Double = 0.8

        for (progress, status, duration) in loadingSteps {
            DispatchQueue.main.asyncAfter(deadline: .now() + totalDelay) {
                withAnimation(.easeInOut(duration: duration)) {
                    loadingProgress = progress
                }
                statusText = status
            }
            totalDelay += duration
        }

        // Transition to main app
        DispatchQueue.main.asyncAfter(deadline: .now() + totalDelay + 0.3) {
            withAnimation(.easeInOut(duration: 0.5)) {
                launchState = .ready
            }
        }
    }
}

// MARK: - AI Engine Onboarding View
struct AIEngineOnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @Binding var selectedEngine: String
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @Environment(\.colorScheme) var colorScheme

    @State private var currentPage = 0
    @State private var showModelSelection = false
    @State private var selectedModel: String = ""
    @State private var headerOpacity: Double = 0
    @State private var cardsOpacity: Double = 0
    @State private var buttonOpacity: Double = 0

    private var availableEngines: [AIEngine] {
        AIEngine.availableEngines(for: deviceManager.computeTier)
    }

    private var selectedAIEngine: AIEngine {
        AIEngine(rawValue: selectedEngine) ?? .claude
    }

    var body: some View {
        GeometryReader { geometry in
            if horizontalSizeClass == .regular {
                // iPad/Mac: Side-by-side layout
                HStack(spacing: 0) {
                    // Left: Engine branding
                    engineBrandingPanel
                        .frame(width: geometry.size.width * 0.4)

                    // Right: Selection
                    engineSelectionPanel
                        .frame(width: geometry.size.width * 0.6)
                }
            } else {
                // iPhone: Full-screen onboarding
                compactOnboardingView
            }
        }
        .onAppear {
            startAnimations()
            // Set default model for selected engine
            if let defaultModel = selectedAIEngine.availableModels.first(where: { $0.isDefault }) {
                selectedModel = defaultModel.id
            }
        }
    }

    // MARK: - Compact Onboarding (iPhone)
    private var compactOnboardingView: some View {
        ZStack {
            // Background
            AnimatedBackground()

            VStack(spacing: 0) {
                // Header
                VStack(spacing: 16) {
                    // Logo
                    AppLogoImageView(size: 70, showShadow: true)

                    VStack(spacing: 6) {
                        HStack(spacing: 0) {
                            Text("Mai")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Text("Farm")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .foregroundColor(MaiFarmColors.primaryGreen)
                        }

                        Text("Choose Your AI Engine")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.gray)
                    }
                }
                .padding(.top, 40)
                .opacity(headerOpacity)

                // Engine selection carousel/list
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(availableEngines) { engine in
                            EngineSelectionCard(
                                engine: engine,
                                isSelected: selectedEngine == engine.rawValue,
                                isCompact: true
                            ) {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    selectedEngine = engine.rawValue
                                    if let defaultModel = engine.availableModels.first(where: { $0.isDefault }) {
                                        selectedModel = defaultModel.id
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                }
                .opacity(cardsOpacity)

                // Bottom action area
                VStack(spacing: 16) {
                    // Model selection hint
                    if !selectedAIEngine.availableModels.isEmpty {
                        Button(action: { showModelSelection = true }) {
                            HStack {
                                Image(systemName: "slider.horizontal.3")
                                    .font(.subheadline)
                                Text("Select Model: \(currentModelName)")
                                    .font(.subheadline)
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                            }
                            .foregroundColor(.white.opacity(0.7))
                            .padding(.vertical, 10)
                            .padding(.horizontal, 16)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(20)
                        }
                        .accessibilityIdentifier("Select Model Button")
                    }

                    // Continue button
                    Button(action: completeOnboarding) {
                        HStack(spacing: 8) {
                            Text("Start Farming")
                                .font(.system(size: 18, weight: .semibold))
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.title3)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(
                            LinearGradient(
                                colors: [MaiFarmColors.primaryGreen, MaiFarmColors.accentGreen],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(16)
                        .shadow(color: MaiFarmColors.primaryGreen.opacity(0.4), radius: 10, x: 0, y: 5)
                    }
                    .accessibilityIdentifier("Start Farming Button")
                    .padding(.horizontal, 20)

                    Text("You can change this anytime in Settings")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .padding(.bottom, 8)
                }
                .padding(.bottom, 30)
                .opacity(buttonOpacity)
            }
        }
        .sheet(isPresented: $showModelSelection) {
            ModelSelectionSheet(
                engine: selectedAIEngine,
                selectedModel: $selectedModel
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Engine Branding Panel (iPad/Mac)
    private var engineBrandingPanel: some View {
        ZStack {
            // Use the same animated background as iPhone
            AnimatedBackground()

            // Subtle engine color overlay
            selectedAIEngine.color.opacity(0.15)
                .ignoresSafeArea()
                .blendMode(.overlay)

            VStack(spacing: 40) {
                Spacer()

                // Logo
                AppLogoImageView(size: 100, showShadow: true)

                VStack(spacing: 12) {
                    HStack(spacing: 0) {
                        Text("Mai")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("Farm")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(MaiFarmColors.primaryGreen)
                    }

                    Text("AI Engine Selection")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.gray)
                }

                // Selected engine preview
                VStack(spacing: 20) {
                    Image(systemName: selectedAIEngine.icon)
                        .font(.system(size: 60))
                        .foregroundColor(selectedAIEngine.color)
                        .padding(24)
                        .background(
                            Circle()
                                .fill(selectedAIEngine.color.opacity(0.2))
                        )
                        .overlay(
                            Circle()
                                .stroke(selectedAIEngine.color.opacity(0.4), lineWidth: 2)
                        )

                    Text(selectedAIEngine.fullName)
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)

                    Text(selectedAIEngine.description)
                        .font(.subheadline)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .padding(.top, 40)

                Spacer()
                Spacer()
            }
        }
    }

    // MARK: - Engine Selection Panel (iPad/Mac)
    private var engineSelectionPanel: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 8) {
                    Text("Choose Your AI Engine")
                        .font(.system(size: 32, weight: .bold))

                    Text("Select the AI provider that powers your farming operations")
                        .font(.body)
                        .foregroundColor(.secondary)
                }

                // Engine grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(availableEngines) { engine in
                        EngineSelectionCard(
                            engine: engine,
                            isSelected: selectedEngine == engine.rawValue,
                            isCompact: false
                        ) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                selectedEngine = engine.rawValue
                                if let defaultModel = engine.availableModels.first(where: { $0.isDefault }) {
                                    selectedModel = defaultModel.id
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 40)

                // Model selection
                if !selectedAIEngine.availableModels.isEmpty {
                    VStack(spacing: 12) {
                        Text("Select Model")
                            .font(.headline)
                            .foregroundColor(.secondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(selectedAIEngine.availableModels) { model in
                                    ModelChip(
                                        model: model,
                                        isSelected: selectedModel == model.id
                                    ) {
                                        selectedModel = model.id
                                    }
                                }
                            }
                            .padding(.horizontal, 40)
                        }
                    }
                }

                Spacer()

                // Continue button
                Button(action: completeOnboarding) {
                    HStack(spacing: 8) {
                        Text("Start Farming with \(selectedAIEngine.displayName)")
                            .font(.system(size: 18, weight: .semibold))
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.title3)
                    }
                    .foregroundColor(.white)
                    .frame(width: 360)
                    .padding(.vertical, 18)
                    .background(
                        LinearGradient(
                            colors: [MaiFarmColors.primaryGreen, MaiFarmColors.accentGreen],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(16)
                    .shadow(color: MaiFarmColors.primaryGreen.opacity(0.3), radius: 10, x: 0, y: 5)
                }
                .accessibilityIdentifier("Start Farming Button")

                Text("You can change your AI engine anytime in Settings")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()
            }
        }
    }

    private var currentModelName: String {
        selectedAIEngine.availableModels.first(where: { $0.id == selectedModel })?.name ?? "Default"
    }

    private func startAnimations() {
        withAnimation(.easeOut(duration: 0.5).delay(0.2)) {
            headerOpacity = 1.0
        }
        withAnimation(.easeOut(duration: 0.5).delay(0.4)) {
            cardsOpacity = 1.0
        }
        withAnimation(.easeOut(duration: 0.5).delay(0.6)) {
            buttonOpacity = 1.0
        }
    }

    private func completeOnboarding() {
        // Save the selected model
        UserDefaults.standard.set(selectedModel, forKey: "selectedAIModel_\(selectedEngine)")

        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            hasCompletedOnboarding = true
        }
    }
}

// MARK: - Engine Selection Card
struct EngineSelectionCard: View {
    let engine: AIEngine
    let isSelected: Bool
    let isCompact: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: isCompact ? 14 : 16) {
                // Engine icon
                Image(systemName: engine.icon)
                    .font(.system(size: isCompact ? 24 : 28))
                    .foregroundColor(isSelected ? engine.color : .gray)
                    .frame(width: isCompact ? 44 : 52, height: isCompact ? 44 : 52)
                    .background(
                        Circle()
                            .fill(isSelected ? engine.color.opacity(0.15) : Color.gray.opacity(0.1))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(engine.displayName)
                            .font(isCompact ? .headline : .title3)
                            .fontWeight(.semibold)
                            .foregroundColor(isCompact ? .white : .primary)

                        if engine.isLocal {
                            Image(systemName: "lock.fill")
                                .font(.caption2)
                                .foregroundColor(.green)
                        }
                    }

                    Text(engine.description)
                        .font(.caption)
                        .foregroundColor(isCompact ? .white.opacity(0.7) : .secondary)
                        .lineLimit(2)
                }

                Spacer()

                // Selection indicator
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(engine.color)
                } else {
                    Circle()
                        .stroke(Color.gray.opacity(0.4), lineWidth: 2)
                        .frame(width: 24, height: 24)
                }
            }
            .padding(isCompact ? 14 : 18)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isCompact
                          ? (isSelected ? engine.color.opacity(0.2) : Color.white.opacity(0.08))
                          : (isSelected ? engine.color.opacity(0.1) : Color(.secondarySystemBackground)))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? engine.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("Engine \(engine.displayName)")
        .accessibilityLabel("Select \(engine.fullName)")
    }
}

// MARK: - Model Chip
struct ModelChip: View {
    let model: AIEngineModel
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Text(model.name)
                        .font(.subheadline)
                        .fontWeight(.medium)

                    if model.isDefault {
                        Text("Default")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.2))
                            .cornerRadius(4)
                    }
                }

                Text(model.description)
                    .font(.caption)
                    .foregroundColor(.secondary)

                // Tier badge
                Text(model.tier.rawValue)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(model.tier.color.opacity(0.2))
                    .foregroundColor(model.tier.color)
                    .cornerRadius(6)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.blue.opacity(0.1) : Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("Model \(model.name)")
    }
}

// MARK: - Model Selection Sheet
struct ModelSelectionSheet: View {
    let engine: AIEngine
    @Binding var selectedModel: String
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(engine.availableModels) { model in
                        Button(action: {
                            selectedModel = model.id
                            dismiss()
                        }) {
                            HStack(spacing: 14) {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 8) {
                                        Text(model.name)
                                            .font(.headline)
                                            .foregroundColor(.primary)

                                        if model.isDefault {
                                            Text("Recommended")
                                                .font(.caption2)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(Color.green.opacity(0.2))
                                                .foregroundColor(.green)
                                                .cornerRadius(4)
                                        }

                                        Text(model.tier.rawValue)
                                            .font(.caption2)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(model.tier.color.opacity(0.2))
                                            .foregroundColor(model.tier.color)
                                            .cornerRadius(4)
                                    }

                                    Text(model.description)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                if selectedModel == model.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.blue)
                                        .font(.title2)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                } header: {
                    Text("\(engine.displayName) Models")
                } footer: {
                    Text("Select a model based on your needs. Premium models offer better performance but may cost more.")
                }
            }
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Adaptive Authentication View
struct AdaptiveAuthenticationView: View {
    @Binding var isAuthenticated: Bool
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass

    var body: some View {
        GeometryReader { geometry in
            if horizontalSizeClass == .regular {
                // iPad/Mac: Side-by-side layout
                HStack(spacing: 0) {
                    // Left side: Branding
                    AuthBrandingView()
                        .frame(width: geometry.size.width * 0.45)

                    // Right side: Sign in form
                    AuthFormView(isAuthenticated: $isAuthenticated)
                        .frame(width: geometry.size.width * 0.55)
                }
            } else {
                // iPhone: Stacked layout
                AuthenticationView(isAuthenticated: $isAuthenticated)
            }
        }
    }
}

// MARK: - Auth Branding View (for larger screens)
struct AuthBrandingView: View {
    var body: some View {
        ZStack {
            // Use the same animated background as iPhone
            AnimatedBackground()

            VStack(spacing: 40) {
                Spacer()

                // Large Logo - App Icon
                AppLogoImageView(size: 120, showShadow: true)

                VStack(spacing: 12) {
                    // Two-tone MaiFarm text
                    HStack(spacing: 0) {
                        Text("Mai")
                            .font(.system(size: 56, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("Farm")
                            .font(.system(size: 56, weight: .bold, design: .rounded))
                            .foregroundColor(MaiFarmColors.primaryGreen)
                    }

                    Text("Multi-Agent AI Orchestration")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(.gray)
                }

                // Feature highlights
                VStack(alignment: .leading, spacing: 20) {
                    FeatureHighlight(icon: "bolt.fill", color: .yellow, text: "Quick 5-minute AI tasks")
                    FeatureHighlight(icon: "cpu.fill", color: .cyan, text: "Deploy multiple AI agents")
                    FeatureHighlight(icon: "shippingbox.fill", color: .orange, text: "Harvest and store outputs")
                }
                .padding(.top, 40)

                Spacer()
                Spacer()
            }
        }
    }
}

struct FeatureHighlight: View {
    let icon: String
    let color: Color
    let text: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
                .frame(width: 44, height: 44)
                .background(color.opacity(0.2))
                .cornerRadius(12)

            Text(text)
                .font(.system(size: 18))
                .foregroundColor(.white.opacity(0.9))
        }
    }
}

// MARK: - Auth Form View (for larger screens)
struct AuthFormView: View {
    @Binding var isAuthenticated: Bool
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 8) {
                    Text("Welcome")
                        .font(.system(size: 36, weight: .bold))

                    Text("Sign in to start orchestrating AI agents")
                        .font(.body)
                        .foregroundColor(.secondary)
                }

                // Device info card
                DeviceInfoCard()
                    .padding(.horizontal, 40)

                VStack(spacing: 16) {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleSignIn(result)
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 56)
                    .frame(maxWidth: 320)
                    .cornerRadius(12)

                    Button(action: {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                            isAuthenticated = true
                        }
                    }) {
                        Text("Continue as Guest")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.blue)
                            .padding(.vertical, 12)
                    }
                    .accessibilityIdentifier("Continue as Guest")
                    .accessibilityLabel("Continue as Guest")
                }

                Spacer()
                Spacer()
            }
        }
    }

    private func handleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            if let _ = authorization.credential as? ASAuthorizationAppleIDCredential {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    isAuthenticated = true
                }
            }
        case .failure(let error):
            print("Sign in failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Device Info Card
struct DeviceInfoCard: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Image(systemName: deviceIcon)
                    .font(.title)
                    .foregroundColor(.blue)

                VStack(alignment: .leading) {
                    Text("Running on \(deviceManager.deviceType.displayName)")
                        .font(.headline)
                    Text("\(deviceManager.computeTier.rawValue) Tier")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }

            Divider()

            HStack(spacing: 20) {
                VStack(spacing: 4) {
                    Text("\(deviceManager.computeTier.maxAgents)")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                    Text("Max Agents")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("AI workers in parallel")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary.opacity(0.7))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                Divider()
                    .frame(height: 50)

                VStack(spacing: 4) {
                    Text("\(deviceManager.computeTier.maxFarmDuration)h")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.blue)
                    Text("Max Duration")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("Farm runtime limit")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary.opacity(0.7))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                Divider()
                    .frame(height: 50)

                VStack(spacing: 4) {
                    Image(systemName: deviceManager.computeTier.supportsLocalModels ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(deviceManager.computeTier.supportsLocalModels ? .green : .gray)
                    Text("Local AI")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("On-device models")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary.opacity(0.7))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }

    var deviceIcon: String {
        switch deviceManager.deviceType {
        case .mac: return "desktopcomputer"
        case .iPad: return "ipad"
        case .iPhone: return "iphone"
        }
    }
}

// MARK: - Adaptive Main View
struct AuthenticationView: View {
    @Binding var isAuthenticated: Bool
    @State private var logoScale: CGFloat = 0.5
    @State private var logoOpacity: Double = 0
    @State private var titleOpacity: Double = 0
    @State private var featuresOffset: CGFloat = 50
    @State private var featuresOpacity: Double = 0
    @State private var buttonsOpacity: Double = 0
    @State private var glowAmount: Double = 0

    var body: some View {
        ZStack {
            AnimatedBackground()
            FloatingParticles()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: 60)

                VStack(spacing: 20) {
                    // Logo - App Icon
                    AppLogoImageView(size: 100, showShadow: true)
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)

                    VStack(spacing: 8) {
                        // Two-tone MaiFarm text
                        HStack(spacing: 0) {
                            Text("Mai")
                                .font(.system(size: 46, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Text("Farm")
                                .font(.system(size: 46, weight: .bold, design: .rounded))
                                .foregroundColor(MaiFarmColors.primaryGreen)
                        }

                        Text("Multi-Agent AI Orchestration")
                            .font(.system(size: 16, weight: .medium))
                            .tracking(1.5)
                            .foregroundColor(.gray)
                    }
                    .opacity(titleOpacity)
                }

                Spacer()
                    .frame(height: 50)

                VStack(spacing: 16) {
                    EnhancedFeatureCard(
                        icon: "bolt.fill",
                        iconColor: .yellow,
                        gradientColors: [Color.yellow.opacity(0.2), Color.orange.opacity(0.1)],
                        title: "Automate Work",
                        subtitle: "Get instant AI help in just 5 minutes",
                        delay: 0,
                        details: [
                            "Quick 5-minute tasks for fast results",
                            "Code reviews, bug fixes, and documentation",
                            "Smart prompt enhancement for better outputs",
                            "Real-time progress tracking and status updates"
                        ]
                    )

                    EnhancedFeatureCard(
                        icon: "cpu.fill",
                        iconColor: .cyan,
                        gradientColors: [Color.cyan.opacity(0.2), Color.blue.opacity(0.1)],
                        title: "Agent Farms",
                        subtitle: "Deploy multiple agents working together",
                        delay: 0.1,
                        details: [
                            "Multi-agent orchestration with 2-10 AI agents",
                            "Parallel task execution for complex projects",
                            "Intelligent workload distribution and coordination",
                            "Real-time terminal monitoring for each agent",
                            "Customizable duration from 1 to 6 hours"
                        ]
                    )

                    EnhancedFeatureCard(
                        icon: "shippingbox.fill",
                        iconColor: .orange,
                        gradientColors: [Color.orange.opacity(0.2), Color.red.opacity(0.1)],
                        title: "Harvest Results",
                        subtitle: "Collect and organize all your AI outputs",
                        delay: 0.2,
                        details: [
                            "Automatic collection of all generated files",
                            "Organized storage with smart categorization",
                            "Version history and change tracking",
                            "Export to your preferred formats and destinations",
                            "Search and filter through past harvests"
                        ]
                    )
                }
                .padding(.horizontal, 24)
                .offset(y: featuresOffset)
                .opacity(featuresOpacity)

                Spacer()

                VStack(spacing: 16) {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        handleSignIn(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 56)
                    .cornerRadius(28)
                    .shadow(color: .white.opacity(0.1), radius: 10, x: 0, y: 5)

                    Button(action: {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                            isAuthenticated = true
                        }
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.title3)
                            Text("Continue as Guest")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.vertical, 12)
                    }
                    .accessibilityIdentifier("Continue as Guest")
                    .accessibilityLabel("Continue as Guest")
                }
                .padding(.horizontal, 32)
                .opacity(buttonsOpacity)

                Spacer()
                    .frame(height: 50)
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        withAnimation(.spring(response: 0.8, dampingFraction: 0.6).delay(0.2)) {
            logoScale = 1.0
            logoOpacity = 1.0
        }
        withAnimation(.easeOut(duration: 0.6).delay(0.5)) {
            titleOpacity = 1.0
        }
        withAnimation(.spring(response: 0.7, dampingFraction: 0.8).delay(0.7)) {
            featuresOffset = 0
            featuresOpacity = 1.0
        }
        withAnimation(.easeOut(duration: 0.5).delay(1.0)) {
            buttonsOpacity = 1.0
        }
        withAnimation(.easeInOut(duration: 3).repeatForever(autoreverses: true)) {
            glowAmount = 1.0
        }
    }

    private func handleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            if let _ = authorization.credential as? ASAuthorizationAppleIDCredential {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    isAuthenticated = true
                }
            }
        case .failure(let error):
            print("Sign in failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Animated Background
/// Unified animated green gradient background for all devices (iPhone, iPad, Mac)
struct AnimatedBackground: View {
    @State private var animateGradient = false
    @State private var pulseAmount: CGFloat = 0

    // MaiFarm green palette
    private let deepGreen = Color(red: 0.01, green: 0.08, blue: 0.06)      // Very dark green base
    private let darkGreen = Color(red: 0.02, green: 0.14, blue: 0.10)      // Dark forest green
    private let midGreen = Color(red: 0.02, green: 0.22, blue: 0.16)       // Mid dark green
    private let accentGreen = Color(red: 0.02, green: 0.35, blue: 0.25)    // Accent green glow

    var body: some View {
        ZStack {
            // Base gradient layer - animates position
            LinearGradient(
                colors: [
                    deepGreen,
                    darkGreen,
                    midGreen,
                    darkGreen,
                    deepGreen
                ],
                startPoint: animateGradient ? .topLeading : .bottomLeading,
                endPoint: animateGradient ? .bottomTrailing : .topTrailing
            )
            .ignoresSafeArea()

            // Radial glow from top-left
            RadialGradient(
                colors: [
                    accentGreen.opacity(0.4),
                    midGreen.opacity(0.2),
                    Color.clear
                ],
                center: .topLeading,
                startRadius: 50,
                endRadius: 500
            )
            .ignoresSafeArea()
            .scaleEffect(1 + pulseAmount * 0.1)

            // Radial glow from bottom-right
            RadialGradient(
                colors: [
                    MaiFarmColors.primaryGreen.opacity(0.25),
                    darkGreen.opacity(0.15),
                    Color.clear
                ],
                center: .bottomTrailing,
                startRadius: 30,
                endRadius: 400
            )
            .ignoresSafeArea()
            .scaleEffect(1 + (1 - pulseAmount) * 0.1)

            // Subtle center glow
            RadialGradient(
                colors: [
                    MaiFarmColors.accentGreen.opacity(0.15),
                    Color.clear
                ],
                center: .center,
                startRadius: 100,
                endRadius: 350
            )
            .ignoresSafeArea()
            .opacity(0.5 + pulseAmount * 0.3)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 8).repeatForever(autoreverses: true)) {
                animateGradient.toggle()
            }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                pulseAmount = 1
            }
        }
    }
}

// MARK: - Floating Particles
struct FloatingParticles: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(0..<15, id: \.self) { index in
                    FloatingParticle(
                        size: CGFloat.random(in: 4...12),
                        x: CGFloat.random(in: 0...geometry.size.width),
                        delay: Double(index) * 0.3
                    )
                }
            }
        }
        .ignoresSafeArea()
    }
}

struct FloatingParticle: View {
    let size: CGFloat
    let x: CGFloat
    let delay: Double

    @State private var yOffset: CGFloat = 0
    @State private var opacity: Double = 0

    var body: some View {
        GeometryReader { geometry in
            Circle()
                .fill(Color(red: 0.02, green: 0.59, blue: 0.41).opacity(0.3))
                .frame(width: size, height: size)
                .blur(radius: size / 4)
                .position(x: x, y: geometry.size.height + 50)
                .offset(y: yOffset)
                .opacity(opacity)
                .onAppear {
                    withAnimation(
                        .easeInOut(duration: Double.random(in: 8...15))
                        .repeatForever(autoreverses: false)
                        .delay(delay)
                    ) {
                        yOffset = -geometry.size.height - 100
                    }
                    withAnimation(.easeIn(duration: 2).delay(delay)) {
                        opacity = 1
                    }
                }
        }
    }
}

// MARK: - Enhanced Feature Card
struct EnhancedFeatureCard: View {
    let icon: String
    let iconColor: Color
    let gradientColors: [Color]
    let title: String
    let subtitle: String
    let delay: Double
    let details: [String]

    @State private var isExpanded = false

    init(icon: String, iconColor: Color, gradientColors: [Color], title: String, subtitle: String, delay: Double, details: [String] = []) {
        self.icon = icon
        self.iconColor = iconColor
        self.gradientColors = gradientColors
        self.title = title
        self.subtitle = subtitle
        self.delay = delay
        self.details = details
    }

    var body: some View {
        VStack(spacing: 0) {
            // Main card header
            Button(action: {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            }) {
                HStack(spacing: 16) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(
                                LinearGradient(
                                    colors: gradientColors,
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 52, height: 52)

                        Image(systemName: icon)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(iconColor)
                            .shadow(color: iconColor.opacity(0.5), radius: 5, x: 0, y: 2)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(.white)

                        Text(subtitle)
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                            .lineLimit(isExpanded ? nil : 1)
                    }

                    Spacer()

                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.gray.opacity(0.6))
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
                .padding(16)
            }
            .buttonStyle(.plain)

            // Expandable details section
            if isExpanded && !details.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Divider()
                        .background(Color.white.opacity(0.1))
                        .padding(.horizontal, 16)

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(details, id: \.self) { detail in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(iconColor)
                                    .offset(y: 2)

                                Text(detail)
                                    .font(.system(size: 14))
                                    .foregroundColor(.gray.opacity(0.9))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.white.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(isExpanded ? iconColor.opacity(0.3) : Color.white.opacity(0.1), lineWidth: 1)
                )
        )
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isExpanded)
    }
}

// MARK: - Farm Detail Sheet
struct FarmDetailSheet: View {
    let farmName: String
    let farmId: String

    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @StateObject private var monitoringService = DeviceOptimizedMonitoringService.shared

    @State private var showingStopAlert = false
    @State private var showingTerminalView = false
    @State private var selectedLayout: TerminalLayout
    @State private var isConnecting = false

    let primaryGreen = Color(red: 0.02, green: 0.59, blue: 0.41)

    init(farmName: String, farmId: String = UUID().uuidString) {
        self.farmName = farmName
        self.farmId = farmId
        _selectedLayout = State(initialValue: DeviceOptimizedMonitoringService.shared.currentProfile.defaultLayout)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Connection Status & Device Badge
                    HStack {
                        DeviceCapabilityBadge(profile: DeviceOptimizedFarmingService.shared.currentProfile)
                        Spacer()
                        ConnectionStatusBadge(state: monitoringService.connectionState)
                    }
                    .padding(.horizontal)

                    // Farm header
                    FarmHeaderView(
                        farmName: farmName,
                        status: monitoringService.liveMetrics.farmStatus,
                        agentCount: monitoringService.activeConnections.count
                    )

                    // Live Metrics Bar
                    LiveMetricsBar(
                        metrics: monitoringService.liveMetrics,
                        profile: monitoringService.currentProfile
                    )
                    .padding(.horizontal)

                    // Progress Section
                    FarmProgressSection(
                        progress: monitoringService.liveMetrics.progress,
                        timeRemaining: monitoringService.liveMetrics.formattedTimeRemaining,
                        status: monitoringService.liveMetrics.farmStatus
                    )
                    .padding(.horizontal)

                    // Active Agents Section
                    AgentsSection(connections: Array(monitoringService.activeConnections.values))
                        .padding(.horizontal)

                    // Terminal Preview / Full View
                    if monitoringService.currentProfile.supportsSplitView {
                        TerminalPreviewSection(
                            connections: Array(monitoringService.activeConnections.values),
                            profile: monitoringService.currentProfile,
                            selectedLayout: $selectedLayout,
                            showFullView: $showingTerminalView
                        )
                        .padding(.horizontal)
                    }

                    // Streaming Quality (for capable devices)
                    if monitoringService.currentProfile.showDetailedMetrics {
                        StreamingControlsSection(
                            quality: $monitoringService.streamingQuality,
                            profile: monitoringService.currentProfile
                        )
                        .padding(.horizontal)
                    }

                    // Actions
                    FarmActionsSection(
                        showingTerminal: $showingTerminalView,
                        showingStopAlert: $showingStopAlert,
                        canShowTerminal: !monitoringService.activeConnections.isEmpty
                    )
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Farm Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if monitoringService.connectionState == .connected {
                        ConnectionQualityIndicator(quality: monitoringService.liveMetrics.connectionQuality)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingTerminalView) {
                FullTerminalView(
                    connections: Array(monitoringService.activeConnections.values),
                    profile: monitoringService.currentProfile,
                    selectedLayout: $selectedLayout
                )
            }
            .alert("Stop Farm", isPresented: $showingStopAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Stop", role: .destructive) {
                    Task {
                        monitoringService.disconnect()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to stop this farm? Progress will be saved to the Barn.")
            }
            .task {
                await connectToFarm()
            }
            .onDisappear {
                // Don't disconnect on disappear - farm continues running
            }
        }
    }

    private func connectToFarm() async {
        isConnecting = true
        do {
            try await monitoringService.connect(to: farmId)
        } catch {
            // Connection error handled by service
        }
        isConnecting = false
    }
}

// MARK: - Farm Header View

struct FarmHeaderView: View {
    let farmName: String
    let status: String
    let agentCount: Int

    let primaryGreen = Color(red: 0.02, green: 0.59, blue: 0.41)

    var body: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.2))
                    .frame(width: 70, height: 70)

                Image(systemName: "leaf.fill")
                    .font(.system(size: 32))
                    .foregroundColor(statusColor)

                // Activity indicator
                if status == "running" || status == "active" {
                    Circle()
                        .stroke(statusColor, lineWidth: 2)
                        .frame(width: 80, height: 80)
                        .modifier(PulseAnimation())
                }
            }

            Text(farmName)
                .font(.title2)
                .fontWeight(.bold)

            HStack(spacing: 8) {
                Label(status.capitalized, systemImage: statusIcon)
                    .font(.caption)
                    .foregroundColor(statusColor)

                Text("•")
                    .foregroundColor(.secondary)

                Label("\(agentCount) agents", systemImage: "person.2")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }

    private var statusColor: Color {
        switch status {
        case "running", "active": return .green
        case "completed": return .blue
        case "failed": return .red
        case "launching": return .orange
        default: return .gray
        }
    }

    private var statusIcon: String {
        switch status {
        case "running", "active": return "circle.fill"
        case "completed": return "checkmark.circle.fill"
        case "failed": return "xmark.circle.fill"
        case "launching": return "arrow.up.circle.fill"
        default: return "circle"
        }
    }
}

struct PulseAnimation: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1.1 : 1.0)
            .opacity(isPulsing ? 0.5 : 1.0)
            .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: isPulsing)
            .onAppear { isPulsing = true }
    }
}

// MARK: - Farm Progress Section

struct FarmProgressSection: View {
    let progress: Double
    let timeRemaining: String
    let status: String

    let primaryGreen = Color(red: 0.02, green: 0.59, blue: 0.41)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Progress")
                    .font(.headline)
                Spacer()
                Text("\(Int(progress * 100))%")
                    .font(.headline)
                    .foregroundColor(primaryGreen)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                        .frame(height: 8)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(primaryGreen)
                        .frame(width: geometry.size.width * progress, height: 8)
                        .animation(.easeInOut(duration: 0.3), value: progress)
                }
            }
            .frame(height: 8)

            HStack {
                Image(systemName: "clock")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("Time remaining: \(timeRemaining)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}

// MARK: - Agents Section

struct AgentsSection: View {
    let connections: [TerminalConnection]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Active Agents")
                .font(.headline)

            if connections.isEmpty {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Waiting for agents...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(12)
            } else {
                VStack(spacing: 8) {
                    ForEach(connections) { connection in
                        EnhancedAgentStatusRow(connection: connection)
                    }
                }
            }
        }
    }
}

struct EnhancedAgentStatusRow: View {
    let connection: TerminalConnection

    var body: some View {
        HStack {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            // Agent info
            VStack(alignment: .leading, spacing: 2) {
                Text(connection.agentName)
                    .font(.subheadline)
                    .fontWeight(.medium)

                if let task = connection.currentTask {
                    Text(task)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                } else {
                    Text(connection.status.capitalized)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Activity indicator
            if connection.status == "active" {
                ActivityPulse()
            }

            // Recent output preview
            if !connection.outputLines.isEmpty {
                Text("\(connection.outputLines.count) lines")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(4)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }

    private var statusColor: Color {
        switch connection.status {
        case "active", "running": return .green
        case "waiting": return .orange
        case "completed": return .blue
        case "failed": return .red
        default: return .gray
        }
    }
}

struct ActivityPulse: View {
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Color.green)
                    .frame(width: 4, height: 4)
                    .scaleEffect(isAnimating ? 1 : 0.5)
                    .animation(
                        .easeInOut(duration: 0.6)
                        .repeatForever()
                        .delay(Double(i) * 0.2),
                        value: isAnimating
                    )
            }
        }
        .onAppear { isAnimating = true }
    }
}

// MARK: - Terminal Preview Section

struct TerminalPreviewSection: View {
    let connections: [TerminalConnection]
    let profile: MonitoringProfile
    @Binding var selectedLayout: TerminalLayout
    @Binding var showFullView: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Terminal Preview")
                    .font(.headline)

                Spacer()

                Button(action: { showFullView = true }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                        Text("Expand")
                    }
                    .font(.caption)
                    .foregroundColor(.accentColor)
                }
            }

            if connections.isEmpty {
                Text("No terminal output yet")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 100)
                    .background(Color.black.opacity(0.8))
                    .cornerRadius(8)
            } else {
                // Mini terminal grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(connections.prefix(profile.maxVisibleTerminals)) { connection in
                        MiniTerminalView(connection: connection)
                            .frame(height: 80)
                    }
                }
            }
        }
    }
}

// MARK: - Streaming Controls Section

struct StreamingControlsSection: View {
    @Binding var quality: StreamingQuality
    let profile: MonitoringProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Streaming Quality")
                .font(.headline)

            HStack {
                ForEach(StreamingQuality.allCases, id: \.self) { option in
                    Button(action: {
                        quality = option
                        HapticManager.shared.selectionChanged()
                    }) {
                        VStack(spacing: 4) {
                            Image(systemName: iconForQuality(option))
                                .font(.title3)
                            Text(option.displayName)
                                .font(.caption2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(quality == option ? Color.accentColor : Color(.secondarySystemBackground))
                        .foregroundColor(quality == option ? .white : .primary)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("Higher quality uses more battery. Recommended: \(recommendedQuality.displayName)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }

    private func iconForQuality(_ quality: StreamingQuality) -> String {
        switch quality {
        case .low: return "battery.100"
        case .balanced: return "gauge.medium"
        case .high: return "sparkles"
        case .realtime: return "bolt.fill"
        }
    }

    private var recommendedQuality: StreamingQuality {
        switch profile.deviceType {
        case .iPhone: return .balanced
        case .iPad: return .high
        case .mac: return .realtime
        }
    }
}

// MARK: - Farm Actions Section

struct FarmActionsSection: View {
    @Binding var showingTerminal: Bool
    @Binding var showingStopAlert: Bool
    let canShowTerminal: Bool

    var body: some View {
        VStack(spacing: 12) {
            Button(action: { showingTerminal = true }) {
                HStack {
                    Image(systemName: "terminal.fill")
                    Text("View Full Terminal")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(12)
            }
            .foregroundColor(.primary)
            .disabled(!canShowTerminal)
            .opacity(canShowTerminal ? 1 : 0.5)

            Button(action: { showingStopAlert = true }) {
                HStack {
                    Image(systemName: "stop.fill")
                    Text("Stop Farm & Harvest")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.red.opacity(0.1))
                .foregroundColor(.red)
                .cornerRadius(12)
            }
        }
    }
}

// MARK: - Full Terminal View

struct FullTerminalView: View {
    let connections: [TerminalConnection]
    let profile: MonitoringProfile
    @Binding var selectedLayout: TerminalLayout
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Layout selector (only for devices that support multiple layouts)
                if profile.supportedLayouts.count > 1 {
                    TerminalLayoutPicker(layout: $selectedLayout, profile: profile)
                        .padding(.vertical, 8)
                }

                // Terminal grid
                TerminalGrid(
                    connections: connections,
                    layout: selectedLayout,
                    profile: profile
                )
                .padding(4)
            }
            .background(Color.black)
            .navigationTitle("Live Terminal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}

// MARK: - Agent Status Row
struct AgentStatusRow: View {
    let name: String
    let status: String
    let icon: String
    let color: Color

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(color)
                .cornerRadius(8)

            VStack(alignment: .leading) {
                Text(name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(status)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Circle()
                .fill(status == "Waiting" ? Color.orange : Color.green)
                .frame(width: 8, height: 8)
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}

// MARK: - Preview
#Preview {
    ContentView()
}
