//
//  DeviceCapabilityManager.swift
//  MaiFarm
//
//  Device Capability Detection and Platform-Specific Limits
//

import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Device Capability Manager
/// Detects device capabilities and provides platform-specific limits
@MainActor
final class DeviceCapabilityManager: ObservableObject, @unchecked Sendable {
    static let shared = DeviceCapabilityManager()

    @Published var deviceType: DeviceType = .iPhone
    @Published var computeTier: ComputeTier = .standard

    enum DeviceType: String {
        case iPhone = "iPhone"
        case iPad = "iPad"
        case mac = "Mac"

        var displayName: String { rawValue }

        var supportsLocalModels: Bool {
            switch self {
            case .mac: return true
            case .iPad: return true  // iPad Pro only realistically
            case .iPhone: return false
            }
        }

        var supportsSidebar: Bool {
            self != .iPhone
        }
    }

    // Duration option for farm creation (in minutes)
    struct DurationOption: Identifiable, Hashable {
        let id: Int  // minutes
        let label: String
        var minutes: Int { id }

        static func options(for tier: ComputeTier) -> [DurationOption] {
            var options: [DurationOption] = [
                DurationOption(id: 5, label: "5 min"),
                DurationOption(id: 15, label: "15 min"),
                DurationOption(id: 30, label: "30 min"),
                DurationOption(id: 45, label: "45 min"),
            ]

            // Add hour options based on tier
            switch tier {
            case .limited:
                options.append(DurationOption(id: 60, label: "1 hour"))
            case .standard:
                options += [
                    DurationOption(id: 60, label: "1 hour"),
                    DurationOption(id: 90, label: "1.5 hours"),
                    DurationOption(id: 120, label: "2 hours"),
                ]
            case .performance:
                options += [
                    DurationOption(id: 60, label: "1 hour"),
                    DurationOption(id: 90, label: "1.5 hours"),
                    DurationOption(id: 120, label: "2 hours"),
                    DurationOption(id: 180, label: "3 hours"),
                    DurationOption(id: 240, label: "4 hours"),
                ]
            case .workstation:
                options += [
                    DurationOption(id: 60, label: "1 hour"),
                    DurationOption(id: 90, label: "1.5 hours"),
                    DurationOption(id: 120, label: "2 hours"),
                    DurationOption(id: 180, label: "3 hours"),
                    DurationOption(id: 240, label: "4 hours"),
                    DurationOption(id: 360, label: "6 hours"),
                    DurationOption(id: 480, label: "8 hours"),
                ]
            }
            return options
        }
    }

    enum ComputeTier: String, CaseIterable {
        case limited = "Limited"      // iPhone SE, older devices
        case standard = "Standard"    // Regular iPhone/iPad
        case performance = "Performance"  // iPhone Pro, iPad Pro
        case workstation = "Workstation"  // Mac

        var maxAgents: Int {
            switch self {
            case .limited: return 2
            case .standard: return 3
            case .performance: return 5
            case .workstation: return 10
            }
        }

        var maxFarmDurationMinutes: Int {
            switch self {
            case .limited: return 60
            case .standard: return 120
            case .performance: return 240
            case .workstation: return 480
            }
        }

        var maxFarmDuration: Int {  // hours (for display)
            maxFarmDurationMinutes / 60
        }

        var durationOptions: [DurationOption] {
            DurationOption.options(for: self)
        }

        var supportsLocalModels: Bool {
            switch self {
            case .limited, .standard: return false
            case .performance, .workstation: return true
            }
        }

        var recommendedProvider: String {
            switch self {
            case .limited, .standard: return "claude"  // Cloud recommended
            case .performance: return "claude"
            case .workstation: return "ollama"  // Local capable
            }
        }
    }

    init() {
        detectDevice()
    }

    func detectDevice() {
        #if targetEnvironment(macCatalyst) || os(macOS)
        deviceType = .mac
        computeTier = .workstation
        #else
        let idiom = UIDevice.current.userInterfaceIdiom
        switch idiom {
        case .pad:
            deviceType = .iPad
            // Check if iPad Pro by screen size
            let screenSize = UIScreen.main.bounds.size
            let maxDimension = max(screenSize.width, screenSize.height)
            computeTier = maxDimension >= 1366 ? .performance : .standard
        case .phone:
            deviceType = .iPhone
            // Check processor performance
            computeTier = ProcessInfo.processInfo.processorCount >= 6 ? .standard : .limited
        default:
            deviceType = .iPhone
            computeTier = .standard
        }
        #endif
    }

    var totalRAM: String {
        let ram = ProcessInfo.processInfo.physicalMemory
        let ramGB = Double(ram) / 1_073_741_824
        return String(format: "%.1f GB", ramGB)
    }

    var processorCores: Int {
        ProcessInfo.processInfo.processorCount
    }
}

// MARK: - Platform Environment
@MainActor
struct PlatformEnvironment {
    #if targetEnvironment(macCatalyst) || os(macOS)
    static let isMac = true
    static let isIPad = false
    static let isIPhone = false
    #else
    static let isMac = false
    static var isIPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }
    static var isIPhone: Bool { UIDevice.current.userInterfaceIdiom == .phone }
    #endif

    static var supportsMultipleWindows: Bool {
        #if targetEnvironment(macCatalyst) || os(macOS)
        return true
        #else
        return UIDevice.current.userInterfaceIdiom == .pad
        #endif
    }
}

// MARK: - App Launch State
enum AppLaunchState {
    case loading
    case ready
}
