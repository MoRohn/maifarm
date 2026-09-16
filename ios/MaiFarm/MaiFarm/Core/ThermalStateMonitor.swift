//
//  ThermalStateMonitor.swift
//  MaiFarm
//
//  Thermal and battery state monitoring for resource-aware operation
//  Scales down operations when device is under thermal pressure or low battery
//

import Foundation
import SwiftUI
import Combine
import os.log

#if canImport(UIKit)
import UIKit
#endif

// MARK: - Thermal State Monitor

@MainActor
final class ThermalStateMonitor: ObservableObject, @unchecked Sendable {
    static let shared = ThermalStateMonitor()

    private let logger = Logger(subsystem: "app.maifarm", category: "Thermal")
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Published State

    @Published private(set) var thermalState: ThermalLevel = .nominal
    @Published private(set) var batteryLevel: Float = 1.0
    @Published private(set) var isLowPowerMode: Bool = false
    @Published private(set) var isCharging: Bool = false
    @Published private(set) var operationalMode: OperationalMode = .full

    // User preference
    @AppStorage("respectLowPowerMode") var respectLowPowerMode: Bool = true
    @AppStorage("thermalThrottling") var thermalThrottlingEnabled: Bool = true

    // MARK: - Types

    enum ThermalLevel: String, CaseIterable {
        case nominal = "Nominal"
        case fair = "Fair"
        case serious = "Serious"
        case critical = "Critical"

        var color: Color {
            switch self {
            case .nominal: return .green
            case .fair: return .yellow
            case .serious: return .orange
            case .critical: return .red
            }
        }

        var systemImage: String {
            switch self {
            case .nominal: return "thermometer.medium"
            case .fair: return "thermometer.medium"
            case .serious: return "thermometer.high"
            case .critical: return "thermometer.sun.fill"
            }
        }

        var shouldThrottle: Bool {
            self == .serious || self == .critical
        }
    }

    enum OperationalMode: String {
        case full = "Full Performance"
        case balanced = "Balanced"
        case efficient = "Power Efficient"
        case minimal = "Minimal"

        var maxConcurrentAgents: Int {
            switch self {
            case .full: return 10
            case .balanced: return 5
            case .efficient: return 3
            case .minimal: return 1
            }
        }

        var maxFarmDurationMinutes: Int {
            switch self {
            case .full: return 480 // 8 hours
            case .balanced: return 180 // 3 hours
            case .efficient: return 60 // 1 hour
            case .minimal: return 30
            }
        }

        var streamingQuality: StreamingQuality {
            switch self {
            case .full: return .realtime
            case .balanced: return .high
            case .efficient: return .balanced
            case .minimal: return .low
            }
        }

        var shouldPauseBackgroundWork: Bool {
            self == .minimal
        }

        var refreshInterval: TimeInterval {
            switch self {
            case .full: return 1.0
            case .balanced: return 2.0
            case .efficient: return 5.0
            case .minimal: return 10.0
            }
        }
    }

    enum StreamingQuality {
        case realtime // 16ms (~60fps)
        case high     // 50ms
        case balanced // 100ms
        case low      // 500ms

        var flushInterval: TimeInterval {
            switch self {
            case .realtime: return 0.016
            case .high: return 0.050
            case .balanced: return 0.100
            case .low: return 0.500
            }
        }
    }

    // MARK: - Initialization

    private init() {
        setupMonitoring()
    }

    private func setupMonitoring() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        // Enable battery monitoring
        UIDevice.current.isBatteryMonitoringEnabled = true

        // Initial state
        updateBatteryState()
        updateThermalState()
        updateLowPowerMode()

        // Battery level changes
        NotificationCenter.default.publisher(for: UIDevice.batteryLevelDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateBatteryState()
            }
            .store(in: &cancellables)

        // Battery state changes (charging/unplugged)
        NotificationCenter.default.publisher(for: UIDevice.batteryStateDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateBatteryState()
            }
            .store(in: &cancellables)

        // Thermal state changes
        NotificationCenter.default.publisher(for: ProcessInfo.thermalStateDidChangeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateThermalState()
            }
            .store(in: &cancellables)

        // Low Power Mode changes
        NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.updateLowPowerMode()
            }
            .store(in: &cancellables)
        #else
        // macOS - always full performance
        operationalMode = .full
        thermalState = .nominal
        batteryLevel = 1.0
        isCharging = true
        #endif
    }

    // MARK: - State Updates

    private func updateBatteryState() {
        #if canImport(UIKit) && !targetEnvironment(macCatalyst)
        batteryLevel = UIDevice.current.batteryLevel

        switch UIDevice.current.batteryState {
        case .charging, .full:
            isCharging = true
        case .unplugged, .unknown:
            isCharging = false
        @unknown default:
            isCharging = false
        }

        recalculateOperationalMode()
        #endif
    }

    private func updateThermalState() {
        let state = ProcessInfo.processInfo.thermalState

        switch state {
        case .nominal:
            thermalState = .nominal
        case .fair:
            thermalState = .fair
        case .serious:
            thermalState = .serious
            logger.warning("Device thermal state: SERIOUS - throttling operations")
        case .critical:
            thermalState = .critical
            logger.error("Device thermal state: CRITICAL - minimal operations only")
        @unknown default:
            thermalState = .nominal
        }

        recalculateOperationalMode()
    }

    private func updateLowPowerMode() {
        isLowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled

        if isLowPowerMode {
            logger.info("Low Power Mode enabled")
        }

        recalculateOperationalMode()
    }

    private func recalculateOperationalMode() {
        var mode: OperationalMode = .full

        // Check thermal state (highest priority)
        if thermalThrottlingEnabled {
            switch thermalState {
            case .critical:
                mode = .minimal
            case .serious:
                mode = .efficient
            case .fair:
                mode = .balanced
            case .nominal:
                break
            }
        }

        // Check Low Power Mode
        if respectLowPowerMode && isLowPowerMode && mode != .minimal {
            mode = min(mode, .efficient)
        }

        // Check battery level (only if not charging)
        if !isCharging && batteryLevel >= 0 {
            if batteryLevel < 0.10 && mode != .minimal {
                mode = .minimal
            } else if batteryLevel < 0.20 && mode != .minimal {
                mode = min(mode, .efficient)
            } else if batteryLevel < 0.30 {
                mode = min(mode, .balanced)
            }
        }

        if mode != operationalMode {
            logger.info("Operational mode changed: \(self.operationalMode.rawValue) -> \(mode.rawValue)")
            operationalMode = mode

            // Notify app of mode change
            NotificationCenter.default.post(
                name: .operationalModeChanged,
                object: nil,
                userInfo: ["mode": mode]
            )
        }
    }

    // MARK: - Helper Comparisons

    private func min(_ lhs: OperationalMode, _ rhs: OperationalMode) -> OperationalMode {
        let order: [OperationalMode] = [.full, .balanced, .efficient, .minimal]
        let lhsIndex = order.firstIndex(of: lhs) ?? 0
        let rhsIndex = order.firstIndex(of: rhs) ?? 0
        return order[max(lhsIndex, rhsIndex)]
    }

    // MARK: - Public Interface

    /// Check if a new farm can be started given current conditions
    func canStartNewFarm(requestedAgents: Int, requestedDuration: Int) -> (allowed: Bool, reason: String?) {
        if operationalMode == .minimal {
            return (false, "Device is under thermal/battery constraints. Please wait or charge your device.")
        }

        if requestedAgents > operationalMode.maxConcurrentAgents {
            return (false, "Reduce agents to \(operationalMode.maxConcurrentAgents) or fewer for current device conditions.")
        }

        if requestedDuration > operationalMode.maxFarmDurationMinutes {
            return (false, "Reduce duration to \(operationalMode.maxFarmDurationMinutes) minutes or less for current device conditions.")
        }

        return (true, nil)
    }

    /// Get recommended farm configuration for current conditions
    func recommendedConfiguration() -> (maxAgents: Int, maxDuration: Int) {
        return (operationalMode.maxConcurrentAgents, operationalMode.maxFarmDurationMinutes)
    }

    /// Whether background monitoring should be paused
    var shouldPauseBackgroundMonitoring: Bool {
        operationalMode.shouldPauseBackgroundWork
    }

    /// Current streaming refresh interval
    var currentRefreshInterval: TimeInterval {
        operationalMode.refreshInterval
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let operationalModeChanged = Notification.Name("app.maifarm.operationalModeChanged")
}

// MARK: - SwiftUI Environment Key

private struct ThermalMonitorKey: @preconcurrency EnvironmentKey {
    @MainActor static let defaultValue = ThermalStateMonitor.shared
}

extension EnvironmentValues {
    var thermalMonitor: ThermalStateMonitor {
        get { self[ThermalMonitorKey.self] }
        set { self[ThermalMonitorKey.self] = newValue }
    }
}

// MARK: - Thermal Status View

struct ThermalStatusIndicator: View {
    @ObservedObject var monitor = ThermalStateMonitor.shared
    @State private var showingDetails = false

    var body: some View {
        Button(action: { showingDetails = true }) {
            HStack(spacing: 6) {
                Image(systemName: monitor.thermalState.systemImage)
                    .font(.system(size: 14))
                    .foregroundColor(monitor.thermalState.color)

                if monitor.operationalMode != .full {
                    Text(monitor.operationalMode.rawValue)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            #if canImport(UIKit)
            .background(Color(UIColor.tertiarySystemBackground))
            #else
            .background(Color(NSColor.controlBackgroundColor))
            #endif
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showingDetails) {
            ThermalStatusDetailView()
                .presentationDetents([.medium])
        }
    }
}

struct ThermalStatusDetailView: View {
    @ObservedObject var monitor = ThermalStateMonitor.shared
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Current Status") {
                    HStack {
                        Label("Thermal State", systemImage: monitor.thermalState.systemImage)
                        Spacer()
                        Text(monitor.thermalState.rawValue)
                            .foregroundColor(monitor.thermalState.color)
                    }

                    HStack {
                        Label("Battery Level", systemImage: batteryIcon)
                        Spacer()
                        Text("\(Int(monitor.batteryLevel * 100))%")
                            .foregroundColor(batteryColor)
                    }

                    HStack {
                        Label("Charging", systemImage: "bolt.fill")
                        Spacer()
                        Text(monitor.isCharging ? "Yes" : "No")
                    }

                    HStack {
                        Label("Low Power Mode", systemImage: "battery.25")
                        Spacer()
                        Text(monitor.isLowPowerMode ? "On" : "Off")
                    }
                }

                Section("Operational Mode") {
                    HStack {
                        Label("Current Mode", systemImage: "gauge.medium")
                        Spacer()
                        Text(monitor.operationalMode.rawValue)
                            .fontWeight(.semibold)
                    }

                    HStack {
                        Label("Max Agents", systemImage: "person.3.fill")
                        Spacer()
                        Text("\(monitor.operationalMode.maxConcurrentAgents)")
                    }

                    HStack {
                        Label("Max Duration", systemImage: "clock.fill")
                        Spacer()
                        Text("\(monitor.operationalMode.maxFarmDurationMinutes) min")
                    }
                }

                Section("Settings") {
                    Toggle("Respect Low Power Mode", isOn: $monitor.respectLowPowerMode)
                    Toggle("Thermal Throttling", isOn: $monitor.thermalThrottlingEnabled)
                }

                Section {
                    Text("MaiFarm automatically adjusts performance based on device conditions to preserve battery life and prevent overheating.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Device Status")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    var batteryIcon: String {
        if monitor.isCharging {
            return "battery.100.bolt"
        }
        switch monitor.batteryLevel {
        case 0..<0.20: return "battery.0"
        case 0.20..<0.50: return "battery.25"
        case 0.50..<0.75: return "battery.50"
        case 0.75..<1.0: return "battery.75"
        default: return "battery.100"
        }
    }

    var batteryColor: Color {
        if monitor.isCharging { return .green }
        switch monitor.batteryLevel {
        case 0..<0.20: return .red
        case 0.20..<0.30: return .orange
        default: return .primary
        }
    }
}
