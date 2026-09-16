//
//  SystemSettingsObserver.swift
//  MaiFarm
//
//  Observes and respects iOS system settings for accessibility and user preferences
//  Includes Reduce Motion, Reduce Transparency, Dynamic Type, and more
//

import Foundation
import SwiftUI
import Combine
import os.log

#if canImport(UIKit)
import UIKit
#endif

// MARK: - System Settings Observer

@MainActor
final class SystemSettingsObserver: ObservableObject, @unchecked Sendable {
    static let shared = SystemSettingsObserver()

    private let logger = Logger(subsystem: "app.maifarm", category: "SystemSettings")
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Published State

    @Published private(set) var reduceMotion: Bool = false
    @Published private(set) var reduceTransparency: Bool = false
    @Published private(set) var boldText: Bool = false
    @Published private(set) var differentiateWithoutColor: Bool = false
    @Published private(set) var prefersCrossFadeTransitions: Bool = false
    @Published private(set) var isVoiceOverRunning: Bool = false
    @Published private(set) var isSwitchControlRunning: Bool = false
    @Published private(set) var contentSizeCategory: ContentSizeCategory = .medium
    @Published private(set) var colorScheme: ColorScheme = .light

    // Computed convenience properties
    var shouldReduceAnimations: Bool {
        reduceMotion || prefersCrossFadeTransitions
    }

    var shouldSimplifyUI: Bool {
        isVoiceOverRunning || isSwitchControlRunning
    }

    var isLargeDynamicType: Bool {
        switch contentSizeCategory {
        case .accessibilityMedium, .accessibilityLarge, .accessibilityExtraLarge,
             .accessibilityExtraExtraLarge, .accessibilityExtraExtraExtraLarge:
            return true
        default:
            return false
        }
    }

    // MARK: - Initialization

    private init() {
        setupObservers()
        updateAllSettings()
    }

    private func setupObservers() {
        #if canImport(UIKit)
        // Reduce Motion
        NotificationCenter.default.publisher(for: UIAccessibility.reduceMotionStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)

        // Reduce Transparency
        NotificationCenter.default.publisher(for: UIAccessibility.reduceTransparencyStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)

        // Bold Text
        NotificationCenter.default.publisher(for: UIAccessibility.boldTextStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)

        // VoiceOver
        NotificationCenter.default.publisher(for: UIAccessibility.voiceOverStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)

        // Switch Control
        NotificationCenter.default.publisher(for: UIAccessibility.switchControlStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)

        // Content Size Category
        NotificationCenter.default.publisher(for: UIContentSizeCategory.didChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateContentSizeCategory()
            }
            .store(in: &cancellables)

        // Grayscale/Differentiate Without Color
        NotificationCenter.default.publisher(for: UIAccessibility.grayscaleStatusDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateAccessibilitySettings()
            }
            .store(in: &cancellables)
        #endif
    }

    private func updateAllSettings() {
        updateAccessibilitySettings()
        updateContentSizeCategory()
    }

    private func updateAccessibilitySettings() {
        #if canImport(UIKit)
        reduceMotion = UIAccessibility.isReduceMotionEnabled
        reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
        boldText = UIAccessibility.isBoldTextEnabled
        differentiateWithoutColor = UIAccessibility.shouldDifferentiateWithoutColor
        prefersCrossFadeTransitions = UIAccessibility.prefersCrossFadeTransitions
        isVoiceOverRunning = UIAccessibility.isVoiceOverRunning
        isSwitchControlRunning = UIAccessibility.isSwitchControlRunning

        logger.debug("Accessibility settings updated - ReduceMotion: \(self.reduceMotion), VoiceOver: \(self.isVoiceOverRunning)")
        #endif
    }

    private func updateContentSizeCategory() {
        #if canImport(UIKit)
        let category = UIApplication.shared.preferredContentSizeCategory

        switch category {
        case .extraSmall:
            contentSizeCategory = .extraSmall
        case .small:
            contentSizeCategory = .small
        case .medium:
            contentSizeCategory = .medium
        case .large:
            contentSizeCategory = .large
        case .extraLarge:
            contentSizeCategory = .extraLarge
        case .extraExtraLarge:
            contentSizeCategory = .extraExtraLarge
        case .extraExtraExtraLarge:
            contentSizeCategory = .extraExtraExtraLarge
        case .accessibilityMedium:
            contentSizeCategory = .accessibilityMedium
        case .accessibilityLarge:
            contentSizeCategory = .accessibilityLarge
        case .accessibilityExtraLarge:
            contentSizeCategory = .accessibilityExtraLarge
        case .accessibilityExtraExtraLarge:
            contentSizeCategory = .accessibilityExtraExtraLarge
        case .accessibilityExtraExtraExtraLarge:
            contentSizeCategory = .accessibilityExtraExtraExtraLarge
        default:
            contentSizeCategory = .medium
        }

        logger.debug("Content size category: \(String(describing: category))")
        #endif
    }
}

// MARK: - Animation Modifiers

extension View {
    /// Apply animation only if Reduce Motion is not enabled
    func accessibleAnimation<V: Equatable>(_ animation: Animation?, value: V) -> some View {
        self.modifier(AccessibleAnimationModifier(animation: animation, value: value))
    }

    /// Apply spring animation only if Reduce Motion is not enabled
    func accessibleSpring<V: Equatable>(response: Double = 0.5, dampingFraction: Double = 0.8, value: V) -> some View {
        self.modifier(AccessibleSpringModifier(response: response, dampingFraction: dampingFraction, value: value))
    }

    /// Simplify for VoiceOver/Switch Control users
    func simplifiedForAccessibility() -> some View {
        self.modifier(SimplifiedAccessibilityModifier())
    }

    /// Apply transition respecting Reduce Motion
    func accessibleTransition(_ transition: AnyTransition) -> some View {
        self.modifier(AccessibleTransitionModifier(transition: transition))
    }
}

struct AccessibleAnimationModifier<V: Equatable>: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let animation: Animation?
    let value: V

    func body(content: Content) -> some View {
        if settings.shouldReduceAnimations {
            content.animation(nil, value: value)
        } else {
            content.animation(animation, value: value)
        }
    }
}

struct AccessibleSpringModifier<V: Equatable>: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let response: Double
    let dampingFraction: Double
    let value: V

    func body(content: Content) -> some View {
        if settings.shouldReduceAnimations {
            content.animation(nil, value: value)
        } else {
            content.animation(.spring(response: response, dampingFraction: dampingFraction), value: value)
        }
    }
}

struct SimplifiedAccessibilityModifier: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: settings.shouldSimplifyUI ? .combine : .contain)
    }
}

struct AccessibleTransitionModifier: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let transition: AnyTransition

    func body(content: Content) -> some View {
        if settings.shouldReduceAnimations {
            content.transition(.opacity)
        } else {
            content.transition(transition)
        }
    }
}

// MARK: - Background Opacity Modifier

extension View {
    /// Apply background with appropriate opacity based on Reduce Transparency setting
    func adaptiveBackground<S: ShapeStyle>(_ style: S, reduceOpacity: Double = 1.0) -> some View {
        self.modifier(AdaptiveBackgroundModifier(style: style, reduceOpacity: reduceOpacity))
    }
}

struct AdaptiveBackgroundModifier<S: ShapeStyle>: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let style: S
    let reduceOpacity: Double

    func body(content: Content) -> some View {
        if settings.reduceTransparency {
            #if canImport(UIKit)
            content.background(Color(UIColor.systemBackground))
            #else
            content.background(Color(NSColor.windowBackgroundColor))
            #endif
        } else {
            content.background(style)
        }
    }
}

// MARK: - Dynamic Type Scaling

extension View {
    /// Scale a fixed-size element appropriately for Dynamic Type
    func dynamicTypeScaled(baseSize: CGFloat, maxSize: CGFloat? = nil) -> some View {
        self.modifier(DynamicTypeScaledModifier(baseSize: baseSize, maxSize: maxSize))
    }
}

struct DynamicTypeScaledModifier: ViewModifier {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let baseSize: CGFloat
    let maxSize: CGFloat?

    func body(content: Content) -> some View {
        let scaleFactor = dynamicTypeScaleFactor
        let scaledSize = baseSize * scaleFactor
        let finalSize = maxSize.map { min(scaledSize, $0) } ?? scaledSize

        content
            .frame(width: finalSize, height: finalSize)
    }

    private var dynamicTypeScaleFactor: CGFloat {
        switch settings.contentSizeCategory {
        case .extraSmall: return 0.8
        case .small: return 0.9
        case .medium: return 1.0
        case .large: return 1.1
        case .extraLarge: return 1.2
        case .extraExtraLarge: return 1.3
        case .extraExtraExtraLarge: return 1.4
        case .accessibilityMedium: return 1.5
        case .accessibilityLarge: return 1.7
        case .accessibilityExtraLarge: return 1.9
        case .accessibilityExtraExtraLarge: return 2.1
        case .accessibilityExtraExtraExtraLarge: return 2.3
        @unknown default: return 1.0
        }
    }
}

// MARK: - Color Contrast Helpers

extension Color {
    /// Returns a high-contrast version of the color for accessibility
    @MainActor
    func highContrast(in colorScheme: ColorScheme) -> Color {
        if SystemSettingsObserver.shared.differentiateWithoutColor {
            // Return solid colors when user prefers to differentiate without color
            return colorScheme == .dark ? .white : .black
        }
        return self
    }

    /// Non-MainActor version that checks UIAccessibility directly
    func highContrastDirect(in colorScheme: ColorScheme) -> Color {
        #if canImport(UIKit)
        if UIAccessibility.shouldDifferentiateWithoutColor {
            return colorScheme == .dark ? .white : .black
        }
        #endif
        return self
    }
}

// MARK: - Accessibility-Aware Button Style

struct AccessibleButtonStyle: ButtonStyle {
    @ObservedObject var settings = SystemSettingsObserver.shared
    let tintColor: Color

    init(tintColor: Color = .accentColor) {
        self.tintColor = tintColor
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !settings.shouldReduceAnimations ? 0.96 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .animation(settings.shouldReduceAnimations ? nil : .easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - SwiftUI Environment Key

private struct SystemSettingsKey: @preconcurrency EnvironmentKey {
    @MainActor static let defaultValue = SystemSettingsObserver.shared
}

extension EnvironmentValues {
    var systemSettings: SystemSettingsObserver {
        get { self[SystemSettingsKey.self] }
        set { self[SystemSettingsKey.self] = newValue }
    }
}

// MARK: - Accessibility Status View (Debug)

struct AccessibilityStatusView: View {
    @ObservedObject var settings = SystemSettingsObserver.shared

    var body: some View {
        List {
            Section("Motion & Animation") {
                row("Reduce Motion", settings.reduceMotion)
                row("Prefers Cross-Fade", settings.prefersCrossFadeTransitions)
            }

            Section("Visual") {
                row("Reduce Transparency", settings.reduceTransparency)
                row("Bold Text", settings.boldText)
                row("Differentiate Without Color", settings.differentiateWithoutColor)
            }

            Section("Assistive Technology") {
                row("VoiceOver", settings.isVoiceOverRunning)
                row("Switch Control", settings.isSwitchControlRunning)
            }

            Section("Content Size") {
                HStack {
                    Text("Dynamic Type")
                    Spacer()
                    Text(String(describing: settings.contentSizeCategory))
                        .foregroundColor(.secondary)
                }

                row("Large Text Active", settings.isLargeDynamicType)
            }
        }
        .navigationTitle("Accessibility Status")
    }

    private func row(_ label: String, _ value: Bool) -> some View {
        HStack {
            Text(label)
            Spacer()
            Image(systemName: value ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundColor(value ? .green : .secondary)
        }
    }
}

// MARK: - VoiceOver Announcements

#if canImport(UIKit)
extension View {
    /// Announce a message to VoiceOver users
    func announceToVoiceOver(_ message: String, priority: UIAccessibility.Notification = .announcement) {
        // Check VoiceOver status directly from UIAccessibility for thread-safety
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: priority, argument: message)
        }
    }
}
#endif

// MARK: - Focus Management for VoiceOver

struct VoiceOverFocusModifier: ViewModifier {
    @AccessibilityFocusState private var isFocused: Bool
    let shouldFocus: Bool

    func body(content: Content) -> some View {
        content
            .accessibilityFocused($isFocused)
            .onChange(of: shouldFocus) { _, newValue in
                if newValue {
                    isFocused = true
                }
            }
    }
}

extension View {
    func voiceOverFocus(when condition: Bool) -> some View {
        self.modifier(VoiceOverFocusModifier(shouldFocus: condition))
    }
}
