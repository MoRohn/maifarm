//
//  AdaptiveThresholds.swift
//  MaiFarm
//
//  Adaptive stall detection thresholds based on farm mode,
//  device class, and historical patterns
//

import Foundation
import os.log

// MARK: - Adaptive Threshold Configuration

/// Dynamically adjusts stall detection thresholds based on context
actor AdaptiveThresholdManager {
    static let shared = AdaptiveThresholdManager()

    private let logger = Logger(subsystem: "app.maifarm", category: "AdaptiveThresholds")

    // Base thresholds
    private let baseInactivityThreshold: TimeInterval = 30.0
    private let baseHysteresisWindow: TimeInterval = 10.0
    private let baseStreamingGracePeriod: TimeInterval = 5.0
    private let baseMinSessionDuration: TimeInterval = 30.0

    // Learning state
    private var historicalStalls: [StallRecord] = []
    private var sessionPatterns: [String: SessionPattern] = [:]

    // MARK: - Get Adaptive Configuration

    /// Generate stall detector config adapted to current context
    func getAdaptiveConfig(
        mode: SessionContextSnapshot.FarmMode,
        engine: String,
        deviceClass: DeviceClass,
        historicalContext: Bool = true
    ) -> StallDetectorConfig {
        // Start with mode-based multipliers
        let modeMultipliers = getModeMultipliers(mode)

        // Apply device class adjustments
        let deviceMultipliers = getDeviceMultipliers(deviceClass)

        // Apply engine-specific adjustments
        let engineMultipliers = getEngineMultipliers(engine)

        // Calculate final thresholds
        var inactivity = baseInactivityThreshold
        inactivity *= modeMultipliers.inactivity
        inactivity *= deviceMultipliers.inactivity
        inactivity *= engineMultipliers.inactivity

        var hysteresis = baseHysteresisWindow
        hysteresis *= modeMultipliers.hysteresis
        hysteresis *= deviceMultipliers.hysteresis
        hysteresis *= engineMultipliers.hysteresis

        var streamingGrace = baseStreamingGracePeriod
        streamingGrace *= modeMultipliers.streaming
        streamingGrace *= deviceMultipliers.streaming
        streamingGrace *= engineMultipliers.streaming

        var minDuration = baseMinSessionDuration
        minDuration *= modeMultipliers.minDuration
        minDuration *= deviceMultipliers.minDuration
        minDuration *= engineMultipliers.minDuration

        // Apply historical learning if enabled
        if historicalContext {
            let historicalAdjustment = getHistoricalAdjustment(mode: mode, engine: engine)
            inactivity *= historicalAdjustment
        }

        // Clamp to reasonable bounds
        inactivity = min(max(inactivity, 15.0), 120.0)
        hysteresis = min(max(hysteresis, 3.0), 30.0)
        streamingGrace = min(max(streamingGrace, 2.0), 20.0)
        minDuration = min(max(minDuration, 10.0), 120.0)

        logger.debug("""
            Adaptive config for \(mode.rawValue)/\(engine)/\(deviceClass.rawValue):
            inactivity=\(inactivity)s, hysteresis=\(hysteresis)s,
            streaming=\(streamingGrace)s, minDuration=\(minDuration)s
            """)

        return StallDetectorConfig(
            inactivityThreshold: inactivity,
            hysteresisWindow: hysteresis,
            streamingGracePeriod: streamingGrace,
            minimumSessionDuration: minDuration,
            countHeartbeatsAsActivity: false
        )
    }

    // MARK: - Mode Multipliers

    private struct ThresholdMultipliers {
        let inactivity: Double
        let hysteresis: Double
        let streaming: Double
        let minDuration: Double
    }

    private func getModeMultipliers(_ mode: SessionContextSnapshot.FarmMode) -> ThresholdMultipliers {
        switch mode {
        case .quickTask:
            // Quick tasks are time-sensitive - detect stalls faster
            return ThresholdMultipliers(
                inactivity: 0.7,   // 21s instead of 30s
                hysteresis: 0.5,   // 5s instead of 10s
                streaming: 0.6,    // 3s instead of 5s
                minDuration: 0.5   // 15s instead of 30s
            )

        case .createFarm:
            // Standard farm - balanced thresholds
            return ThresholdMultipliers(
                inactivity: 1.0,
                hysteresis: 1.0,
                streaming: 1.0,
                minDuration: 1.0
            )

        case .goWild:
            // GoWild is exploratory - more lenient
            return ThresholdMultipliers(
                inactivity: 1.5,   // 45s - allow more thinking time
                hysteresis: 1.5,   // 15s confirmation
                streaming: 2.0,    // 10s streaming grace
                minDuration: 2.0   // 60s before detection starts
            )
        }
    }

    // MARK: - Device Class Multipliers

    enum DeviceClass: String {
        case limited = "limited"      // iPhone SE, older devices
        case standard = "standard"    // Regular iPhone/iPad
        case performance = "performance"  // iPhone Pro, iPad Pro
        case workstation = "workstation"  // Mac

        static func current() -> DeviceClass {
            #if targetEnvironment(macCatalyst) || os(macOS)
            return .workstation
            #else
            let cores = ProcessInfo.processInfo.processorCount
            let ram = ProcessInfo.processInfo.physicalMemory
            let ramGB = Double(ram) / 1_073_741_824

            if cores >= 8 && ramGB >= 8 {
                return .performance
            } else if cores >= 6 && ramGB >= 4 {
                return .standard
            } else {
                return .limited
            }
            #endif
        }
    }

    private func getDeviceMultipliers(_ deviceClass: DeviceClass) -> ThresholdMultipliers {
        switch deviceClass {
        case .limited:
            // Limited devices may be slower - be more lenient
            return ThresholdMultipliers(
                inactivity: 1.3,
                hysteresis: 1.2,
                streaming: 1.5,
                minDuration: 1.5
            )

        case .standard:
            return ThresholdMultipliers(
                inactivity: 1.0,
                hysteresis: 1.0,
                streaming: 1.0,
                minDuration: 1.0
            )

        case .performance:
            // Faster devices - can be slightly more aggressive
            return ThresholdMultipliers(
                inactivity: 0.9,
                hysteresis: 0.9,
                streaming: 0.9,
                minDuration: 0.9
            )

        case .workstation:
            // Workstations are fast - most aggressive
            return ThresholdMultipliers(
                inactivity: 0.8,
                hysteresis: 0.8,
                streaming: 0.8,
                minDuration: 0.8
            )
        }
    }

    // MARK: - Engine Multipliers

    private func getEngineMultipliers(_ engine: String) -> ThresholdMultipliers {
        let engineLower = engine.lowercased()

        if engineLower.contains("ollama") || engineLower.contains("local") {
            // Local models may be slower
            return ThresholdMultipliers(
                inactivity: 1.5,
                hysteresis: 1.3,
                streaming: 2.0,  // Local models stream differently
                minDuration: 1.5
            )
        }

        if engineLower.contains("gpt") || engineLower.contains("openai") {
            // OpenAI is generally fast
            return ThresholdMultipliers(
                inactivity: 0.9,
                hysteresis: 1.0,
                streaming: 1.0,
                minDuration: 1.0
            )
        }

        if engineLower.contains("claude") {
            // Claude is reliable - standard thresholds
            return ThresholdMultipliers(
                inactivity: 1.0,
                hysteresis: 1.0,
                streaming: 1.0,
                minDuration: 1.0
            )
        }

        // Unknown engine - use conservative defaults
        return ThresholdMultipliers(
            inactivity: 1.2,
            hysteresis: 1.2,
            streaming: 1.2,
            minDuration: 1.2
        )
    }

    // MARK: - Historical Learning

    /// Record a stall event for learning
    func recordStall(
        mode: SessionContextSnapshot.FarmMode,
        engine: String,
        wasRealStall: Bool,
        inactivityDuration: TimeInterval
    ) {
        let record = StallRecord(
            mode: mode,
            engine: engine,
            wasRealStall: wasRealStall,
            inactivityDuration: inactivityDuration,
            timestamp: Date()
        )

        historicalStalls.append(record)

        // Keep only last 100 records
        if historicalStalls.count > 100 {
            historicalStalls.removeFirst(historicalStalls.count - 100)
        }

        // Update pattern
        let patternKey = "\(mode.rawValue)-\(engine)"
        updatePattern(key: patternKey, record: record)

        logger.debug("Recorded stall: \(wasRealStall ? "real" : "false positive") for \(patternKey)")
    }

    private func updatePattern(key: String, record: StallRecord) {
        var pattern = sessionPatterns[key] ?? SessionPattern(
            mode: record.mode,
            engine: record.engine,
            totalStalls: 0,
            falsePositives: 0,
            averageInactivityDuration: record.inactivityDuration
        )

        pattern.totalStalls += 1
        if !record.wasRealStall {
            pattern.falsePositives += 1
        }

        // Running average
        let weight = 0.1
        pattern.averageInactivityDuration = pattern.averageInactivityDuration * (1 - weight) + record.inactivityDuration * weight

        sessionPatterns[key] = pattern
    }

    private func getHistoricalAdjustment(mode: SessionContextSnapshot.FarmMode, engine: String) -> Double {
        let patternKey = "\(mode.rawValue)-\(engine)"

        guard let pattern = sessionPatterns[patternKey], pattern.totalStalls >= 5 else {
            return 1.0 // Not enough data
        }

        // If we have many false positives, increase thresholds
        let falsePositiveRate = Double(pattern.falsePositives) / Double(pattern.totalStalls)

        if falsePositiveRate > 0.3 {
            // High false positive rate - increase thresholds by up to 30%
            return 1.0 + (falsePositiveRate - 0.1) * 0.5
        } else if falsePositiveRate < 0.1 && pattern.totalStalls >= 10 {
            // Very accurate - can be slightly more aggressive
            return 0.95
        }

        return 1.0
    }

    // MARK: - Statistics

    func getStatistics() -> ThresholdStatistics {
        var modeStats: [String: ModeStatistics] = [:]

        for (key, pattern) in sessionPatterns {
            modeStats[key] = ModeStatistics(
                totalStalls: pattern.totalStalls,
                falsePositives: pattern.falsePositives,
                averageInactivity: pattern.averageInactivityDuration,
                accuracy: pattern.totalStalls > 0 ? Double(pattern.totalStalls - pattern.falsePositives) / Double(pattern.totalStalls) : 1.0
            )
        }

        return ThresholdStatistics(
            totalRecords: historicalStalls.count,
            modeStatistics: modeStats,
            oldestRecord: historicalStalls.first?.timestamp,
            newestRecord: historicalStalls.last?.timestamp
        )
    }

    /// Clear all learned patterns
    func resetLearning() {
        historicalStalls.removeAll()
        sessionPatterns.removeAll()
        logger.info("Reset all learned threshold patterns")
    }
}

// MARK: - Supporting Types

private struct StallRecord {
    let mode: SessionContextSnapshot.FarmMode
    let engine: String
    let wasRealStall: Bool
    let inactivityDuration: TimeInterval
    let timestamp: Date
}

private struct SessionPattern {
    let mode: SessionContextSnapshot.FarmMode
    let engine: String
    var totalStalls: Int
    var falsePositives: Int
    var averageInactivityDuration: TimeInterval
}

struct ThresholdStatistics {
    let totalRecords: Int
    let modeStatistics: [String: ModeStatistics]
    let oldestRecord: Date?
    let newestRecord: Date?
}

struct ModeStatistics {
    let totalStalls: Int
    let falsePositives: Int
    let averageInactivity: TimeInterval
    let accuracy: Double

    var formattedAccuracy: String {
        String(format: "%.1f%%", accuracy * 100)
    }
}

// MARK: - Thermal-Aware Thresholds

extension AdaptiveThresholdManager {
    /// Get thresholds adjusted for current thermal state
    func getThermalAwareConfig(
        mode: SessionContextSnapshot.FarmMode,
        engine: String,
        deviceClass: DeviceClass,
        thermalState: ProcessInfo.ThermalState
    ) -> StallDetectorConfig {
        var config = getAdaptiveConfig(mode: mode, engine: engine, deviceClass: deviceClass)

        // Apply thermal multiplier
        let thermalMultiplier: Double
        switch thermalState {
        case .nominal:
            thermalMultiplier = 1.0
        case .fair:
            thermalMultiplier = 1.1
        case .serious:
            thermalMultiplier = 1.3
        case .critical:
            thermalMultiplier = 1.5
        @unknown default:
            thermalMultiplier = 1.0
        }

        if thermalMultiplier != 1.0 {
            config = StallDetectorConfig(
                inactivityThreshold: config.inactivityThreshold * thermalMultiplier,
                hysteresisWindow: config.hysteresisWindow * thermalMultiplier,
                streamingGracePeriod: config.streamingGracePeriod * thermalMultiplier,
                minimumSessionDuration: config.minimumSessionDuration,
                countHeartbeatsAsActivity: config.countHeartbeatsAsActivity
            )
        }

        return config
    }
}

// MARK: - Duration-Based Thresholds

extension AdaptiveThresholdManager {
    /// Get thresholds adjusted for farm duration
    func getDurationAwareConfig(
        mode: SessionContextSnapshot.FarmMode,
        engine: String,
        deviceClass: DeviceClass,
        farmDurationMinutes: Int
    ) -> StallDetectorConfig {
        var config = getAdaptiveConfig(mode: mode, engine: engine, deviceClass: deviceClass)

        // Longer farms should have more lenient stall detection
        let durationMultiplier: Double
        switch farmDurationMinutes {
        case 0..<15:
            durationMultiplier = 0.8  // Short - aggressive
        case 15..<60:
            durationMultiplier = 1.0  // Medium - standard
        case 60..<180:
            durationMultiplier = 1.2  // Long - lenient
        default:
            durationMultiplier = 1.4  // Very long - very lenient
        }

        if durationMultiplier != 1.0 {
            config = StallDetectorConfig(
                inactivityThreshold: config.inactivityThreshold * durationMultiplier,
                hysteresisWindow: config.hysteresisWindow * durationMultiplier,
                streamingGracePeriod: config.streamingGracePeriod * durationMultiplier,
                minimumSessionDuration: config.minimumSessionDuration * durationMultiplier,
                countHeartbeatsAsActivity: config.countHeartbeatsAsActivity
            )
        }

        return config
    }
}

// MARK: - Progress-Based Thresholds

extension AdaptiveThresholdManager {
    /// Get thresholds adjusted for current progress
    func getProgressAwareConfig(
        baseConfig: StallDetectorConfig,
        progress: Double
    ) -> StallDetectorConfig {
        // Early in session - be more lenient
        // Late in session - be more aggressive (things should be finishing)
        let progressMultiplier: Double
        switch progress {
        case 0..<0.2:
            progressMultiplier = 1.3  // Just started - very lenient
        case 0.2..<0.5:
            progressMultiplier = 1.1  // Building up - somewhat lenient
        case 0.5..<0.8:
            progressMultiplier = 1.0  // Middle - standard
        case 0.8..<0.95:
            progressMultiplier = 0.9  // Almost done - slightly aggressive
        default:
            progressMultiplier = 0.8  // Should be finishing - aggressive
        }

        return StallDetectorConfig(
            inactivityThreshold: baseConfig.inactivityThreshold * progressMultiplier,
            hysteresisWindow: baseConfig.hysteresisWindow * progressMultiplier,
            streamingGracePeriod: baseConfig.streamingGracePeriod * progressMultiplier,
            minimumSessionDuration: baseConfig.minimumSessionDuration,
            countHeartbeatsAsActivity: baseConfig.countHeartbeatsAsActivity
        )
    }
}
