//
//  HapticManager.swift
//  MaiFarm
//
//  Centralized haptic feedback management with device-appropriate fallbacks
//

import Foundation
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class HapticManager: @unchecked Sendable {
    static let shared = HapticManager()

    @AppStorage("hapticFeedback") private var hapticEnabled = true

    #if canImport(UIKit) && !targetEnvironment(macCatalyst)
    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let impactSoft = UIImpactFeedbackGenerator(style: .soft)
    private let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()
    #endif

    private init() {
        prepareGenerators()
    }

    /// Pre-warm haptic generators for faster response
    func prepareGenerators() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactLight.prepare()
        impactMedium.prepare()
        selection.prepare()
        notification.prepare()
        #endif
    }

    // MARK: - Impact Feedback

    enum ImpactStyle {
        case light
        case medium
        case heavy
        case soft
        case rigid
    }

    func impact(_ style: ImpactStyle) {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        switch style {
        case .light:
            impactLight.impactOccurred()
        case .medium:
            impactMedium.impactOccurred()
        case .heavy:
            impactHeavy.impactOccurred()
        case .soft:
            impactSoft.impactOccurred()
        case .rigid:
            impactRigid.impactOccurred()
        }
        #endif
    }

    func impact(_ style: ImpactStyle, intensity: CGFloat) {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        let clampedIntensity = max(0, min(1, intensity))

        switch style {
        case .light:
            impactLight.impactOccurred(intensity: clampedIntensity)
        case .medium:
            impactMedium.impactOccurred(intensity: clampedIntensity)
        case .heavy:
            impactHeavy.impactOccurred(intensity: clampedIntensity)
        case .soft:
            impactSoft.impactOccurred(intensity: clampedIntensity)
        case .rigid:
            impactRigid.impactOccurred(intensity: clampedIntensity)
        }
        #endif
    }

    // MARK: - Selection Feedback

    func selectionChanged() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        selection.selectionChanged()
        #endif
    }

    // MARK: - Notification Feedback

    enum NotificationType {
        case success
        case warning
        case error
    }

    func notify(_ type: NotificationType) {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        switch type {
        case .success:
            notification.notificationOccurred(.success)
        case .warning:
            notification.notificationOccurred(.warning)
        case .error:
            notification.notificationOccurred(.error)
        }
        #endif
    }

    // MARK: - Custom Patterns

    /// Double tap feedback for confirmations
    func doubleTap() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        impactLight.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [self] in
            impactMedium.impactOccurred()
        }
        #endif
    }

    /// Progress feedback - intensity increases with progress (0.0 to 1.0)
    func progress(_ value: CGFloat) {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        let intensity = max(0.3, min(1.0, value))
        impactSoft.impactOccurred(intensity: intensity)
        #endif
    }

    /// Success celebration pattern
    func celebrate() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        // Three ascending impacts
        impactLight.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [self] in
            impactMedium.impactOccurred()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [self] in
            notification.notificationOccurred(.success)
        }
        #endif
    }

    /// Error shake pattern
    func errorShake() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }

        // Three quick error impacts
        notification.notificationOccurred(.error)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [self] in
            impactHeavy.impactOccurred()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [self] in
            impactHeavy.impactOccurred()
        }
        #endif
    }

    /// Button press feedback
    func buttonPress() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactMedium.impactOccurred(intensity: 0.7)
        #endif
    }

    /// Toggle switch feedback
    func toggle() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactRigid.impactOccurred(intensity: 0.6)
        #endif
    }

    /// Slider value change
    func sliderTick() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactLight.impactOccurred(intensity: 0.4)
        #endif
    }

    /// Pull-to-refresh threshold reached
    func refreshThreshold() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactMedium.impactOccurred()
        #endif
    }

    /// Long press activated
    func longPressActivated() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactHeavy.impactOccurred(intensity: 0.8)
        #endif
    }

    /// Swipe action triggered
    func swipeAction() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactMedium.impactOccurred(intensity: 0.6)
        #endif
    }

    /// Tab selection
    func tabSelected() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        selectionChanged()
        #endif
    }

    /// Modal presented
    func modalPresented() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactSoft.impactOccurred(intensity: 0.5)
        #endif
    }

    /// Modal dismissed
    func modalDismissed() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        guard hapticEnabled else { return }
        impactLight.impactOccurred(intensity: 0.4)
        #endif
    }
}

// MARK: - SwiftUI View Modifiers

struct HapticButtonStyle: ButtonStyle {
    let feedbackType: HapticManager.ImpactStyle

    init(_ type: HapticManager.ImpactStyle = .medium) {
        self.feedbackType = type
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed {
                    HapticManager.shared.impact(feedbackType)
                }
            }
    }
}

extension View {
    /// Add haptic feedback on tap
    func hapticOnTap(_ style: HapticManager.ImpactStyle = .medium) -> some View {
        self.onTapGesture {
            HapticManager.shared.impact(style)
        }
    }

    /// Add haptic feedback when a value changes
    func hapticOnChange<V: Equatable>(of value: V, perform: @escaping (V) -> Void = { _ in }) -> some View {
        self.onChange(of: value) { oldValue, newValue in
            HapticManager.shared.selectionChanged()
            perform(newValue)
        }
    }

    /// Add success haptic when condition becomes true
    func hapticSuccess(when condition: Bool) -> some View {
        self.onChange(of: condition) { _, newValue in
            if newValue {
                HapticManager.shared.notify(.success)
            }
        }
    }

    /// Add error haptic when condition becomes true
    func hapticError(when condition: Bool) -> some View {
        self.onChange(of: condition) { _, newValue in
            if newValue {
                HapticManager.shared.notify(.error)
            }
        }
    }
}
