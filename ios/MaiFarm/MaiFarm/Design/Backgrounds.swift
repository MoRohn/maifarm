//
//  Backgrounds.swift
//  MaiFarm
//
//  Background Views and Modifiers - Design System Foundation
//  Dynamically themed to match selected color scheme
//

import SwiftUI

// MARK: - MaiFarm Background View
/// Unified background styling used across all MaiFarm pages
/// Uses consistent green animated gradient matching the home/login screens
/// Applies to iPhone, iPad, and Mac for visual consistency
/// Both light and dark modes use green color schemes (different shades)
struct MaiFarmBackground: View {
    @Environment(\.colorScheme) var colorScheme
    @State private var animateGradient = false
    @State private var pulseAmount: CGFloat = 0

    // Dark mode green palette - deep, rich greens
    private let deepGreen = Color(red: 0.01, green: 0.08, blue: 0.06)
    private let darkGreen = Color(red: 0.02, green: 0.14, blue: 0.10)
    private let midGreen = Color(red: 0.02, green: 0.22, blue: 0.16)
    private let accentGreen = Color(red: 0.02, green: 0.35, blue: 0.25)

    // Light mode green palette - softer, lighter greens
    private let lightBase = Color(red: 0.90, green: 0.96, blue: 0.93)        // Very light mint
    private let lightMidGreen = Color(red: 0.82, green: 0.93, blue: 0.87)    // Light sage
    private let lightAccentGreen = Color(red: 0.70, green: 0.88, blue: 0.78) // Soft green
    private let lightDeepGreen = Color(red: 0.60, green: 0.82, blue: 0.70)   // Medium light green

    var body: some View {
        ZStack {
            if colorScheme == .dark {
                // Dark mode: Deep animated green background
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
                .scaleEffect(1 + pulseAmount * 0.08)

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
                .scaleEffect(1 + (1 - pulseAmount) * 0.08)

            } else {
                // Light mode: Soft animated green background (NOT white)
                LinearGradient(
                    colors: [
                        lightBase,
                        lightMidGreen,
                        lightAccentGreen,
                        lightMidGreen,
                        lightBase
                    ],
                    startPoint: animateGradient ? .topLeading : .bottomLeading,
                    endPoint: animateGradient ? .bottomTrailing : .topTrailing
                )
                .ignoresSafeArea()

                // Radial glow from top-left
                RadialGradient(
                    colors: [
                        lightDeepGreen.opacity(0.4),
                        lightAccentGreen.opacity(0.2),
                        Color.clear
                    ],
                    center: .topLeading,
                    startRadius: 50,
                    endRadius: 500
                )
                .ignoresSafeArea()
                .scaleEffect(1 + pulseAmount * 0.08)

                // Radial glow from bottom-right
                RadialGradient(
                    colors: [
                        MaiFarmColors.primaryGreen.opacity(0.2),
                        lightMidGreen.opacity(0.15),
                        Color.clear
                    ],
                    center: .bottomTrailing,
                    startRadius: 30,
                    endRadius: 400
                )
                .ignoresSafeArea()
                .scaleEffect(1 + (1 - pulseAmount) * 0.08)
            }
        }
        .onAppear {
            // Animate in BOTH light and dark modes
            withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                animateGradient.toggle()
            }
            withAnimation(.easeInOut(duration: 5).repeatForever(autoreverses: true)) {
                pulseAmount = 1
            }
        }
    }
}

// MARK: - MaiFarm Background Modifier
extension View {
    func maiFarmBackground() -> some View {
        self.background(MaiFarmBackground())
    }
}

// MARK: - Appearance Mode Environment Key
private struct AppearanceModeKey: EnvironmentKey {
    static let defaultValue: Int = 0
}

extension EnvironmentValues {
    var appearanceMode: Int {
        get { self[AppearanceModeKey.self] }
        set { self[AppearanceModeKey.self] = newValue }
    }
}

// MARK: - Hardened Sheet Appearance Modifier
struct HardenedSheetModifier: ViewModifier {
    @AppStorage("appearanceMode") private var appearanceMode = 0

    func body(content: Content) -> some View {
        content
            .preferredColorScheme(colorScheme)
            .environment(\.appearanceMode, appearanceMode)
    }

    private var colorScheme: ColorScheme? {
        switch appearanceMode {
        case 1: return .light
        case 2: return .dark
        default: return nil
        }
    }
}

extension View {
    /// Apply hardened appearance mode to ensure consistent light/dark mode
    func hardenedAppearance() -> some View {
        modifier(HardenedSheetModifier())
    }
}

// MARK: - Preview
#Preview("MaiFarm Background - Light") {
    VStack {
        Text("MaiFarm Background")
            .font(.title)
            .foregroundColor(.primary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .maiFarmBackground()
    .preferredColorScheme(.light)
}

#Preview("MaiFarm Background - Dark") {
    VStack {
        Text("MaiFarm Background")
            .font(.title)
            .foregroundColor(.primary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .maiFarmBackground()
    .preferredColorScheme(.dark)
}
