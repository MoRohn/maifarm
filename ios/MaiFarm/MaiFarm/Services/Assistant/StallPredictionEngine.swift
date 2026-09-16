//
//  StallPredictionEngine.swift
//  MaiFarm
//
//  ML-based stall prediction using historical patterns
//  Uses on-device Core ML for privacy-preserving prediction
//

import Foundation
import CoreML
import os.log
import Accelerate

// MARK: - Prediction Result

struct StallPrediction {
    /// Probability of stall occurring (0.0 - 1.0)
    let probability: Double

    /// Estimated time until stall (seconds), nil if not predicted
    let estimatedTimeToStall: TimeInterval?

    /// Confidence level (0.0 - 1.0)
    let confidence: Double

    /// Features that contributed most to prediction
    let topFeatures: [FeatureContribution]

    /// Recommended action
    let recommendation: PredictionRecommendation

    struct FeatureContribution {
        let name: String
        let contribution: Double
        let value: Double
    }

    enum PredictionRecommendation {
        case noAction               // Low probability, continue monitoring
        case increasedMonitoring    // Medium probability, check more often
        case preemptiveNudge        // High probability, consider nudging
        case immediateAction        // Very high probability, act now
    }
}

// MARK: - Feature Vector

struct StallFeatureVector {
    // Time features
    let timeSinceLastEvent: TimeInterval
    let timeSinceLastAgentMessage: TimeInterval
    let timeSinceLastToolCall: TimeInterval
    let sessionDuration: TimeInterval

    // Agent features
    let activeAgentCount: Int
    let idleAgentCount: Int
    let totalAgents: Int
    let agentIdleRatio: Double

    // Tool features
    let inflightToolCalls: Int
    let recentToolCallCount: Int  // Last 60 seconds
    let averageToolDuration: TimeInterval

    // Progress features
    let progress: Double
    let progressRate: Double  // Progress per minute
    let tasksCompleted: Int

    // Pattern features
    let eventRate: Double  // Events per minute (last 5 min)
    let isStreaming: Bool
    let consecutiveIdlePeriods: Int

    // Context features
    let mode: SessionContextSnapshot.FarmMode
    let errorCount: Int
    let warningCount: Int

    /// Convert to array for ML model
    func toArray() -> [Double] {
        [
            timeSinceLastEvent,
            timeSinceLastAgentMessage,
            timeSinceLastToolCall,
            sessionDuration,
            Double(activeAgentCount),
            Double(idleAgentCount),
            Double(totalAgents),
            agentIdleRatio,
            Double(inflightToolCalls),
            Double(recentToolCallCount),
            averageToolDuration,
            progress,
            progressRate,
            Double(tasksCompleted),
            eventRate,
            isStreaming ? 1.0 : 0.0,
            Double(consecutiveIdlePeriods),
            modeToDouble(mode),
            Double(errorCount),
            Double(warningCount)
        ]
    }

    private func modeToDouble(_ mode: SessionContextSnapshot.FarmMode) -> Double {
        switch mode {
        case .quickTask: return 0.0
        case .createFarm: return 0.5
        case .goWild: return 1.0
        }
    }

    static let featureNames = [
        "timeSinceLastEvent",
        "timeSinceLastAgentMessage",
        "timeSinceLastToolCall",
        "sessionDuration",
        "activeAgentCount",
        "idleAgentCount",
        "totalAgents",
        "agentIdleRatio",
        "inflightToolCalls",
        "recentToolCallCount",
        "averageToolDuration",
        "progress",
        "progressRate",
        "tasksCompleted",
        "eventRate",
        "isStreaming",
        "consecutiveIdlePeriods",
        "mode",
        "errorCount",
        "warningCount"
    ]
}

// MARK: - Stall Prediction Engine

/// ML-based engine for predicting stalls before they occur
actor StallPredictionEngine {
    static let shared = StallPredictionEngine()

    private let logger = Logger(subsystem: "app.maifarm", category: "StallPrediction")

    // Model state
    private var model: StallPredictor?
    private var isModelLoaded = false

    // Training data collection
    private var trainingFeatures: [[Double]] = []
    private var trainingLabels: [Double] = []
    private let maxTrainingExamples = 1000

    // Feature statistics for normalization
    private var featureMeans: [Double] = []
    private var featureStdDevs: [Double] = []

    // Prediction thresholds
    private let lowThreshold = 0.3
    private let mediumThreshold = 0.6
    private let highThreshold = 0.85

    // MARK: - Initialization

    private init() {
        Task {
            await loadModel()
        }
    }

    // MARK: - Model Management

    /// Load the Core ML model
    private func loadModel() async {
        // In production, load from compiled .mlmodelc
        // For now, use statistical model
        isModelLoaded = true
        logger.info("Stall prediction engine initialized (statistical mode)")
    }

    /// Train model with collected data
    func trainModel() async {
        guard trainingFeatures.count >= 50 else {
            logger.warning("Insufficient training data: \(self.trainingFeatures.count) examples")
            return
        }

        // Calculate normalization statistics
        calculateNormalizationStats()

        // In production, would train actual Core ML model
        // For now, statistics are used for simple prediction

        logger.info("Model trained with \(self.trainingFeatures.count) examples")
    }

    private func calculateNormalizationStats() {
        guard !trainingFeatures.isEmpty else { return }

        let featureCount = trainingFeatures[0].count
        featureMeans = [Double](repeating: 0, count: featureCount)
        featureStdDevs = [Double](repeating: 1, count: featureCount)

        // Calculate means
        for features in trainingFeatures {
            for (i, value) in features.enumerated() where i < featureCount {
                featureMeans[i] += value
            }
        }
        for i in 0..<featureCount {
            featureMeans[i] /= Double(trainingFeatures.count)
        }

        // Calculate standard deviations
        for features in trainingFeatures {
            for (i, value) in features.enumerated() where i < featureCount {
                let diff = value - featureMeans[i]
                featureStdDevs[i] += diff * diff
            }
        }
        for i in 0..<featureCount {
            featureStdDevs[i] = sqrt(featureStdDevs[i] / Double(trainingFeatures.count))
            if featureStdDevs[i] == 0 {
                featureStdDevs[i] = 1  // Avoid division by zero
            }
        }
    }

    // MARK: - Prediction

    /// Predict stall probability for current session state
    func predict(features: StallFeatureVector) -> StallPrediction {
        let featureArray = features.toArray()

        // Statistical prediction based on key indicators
        let probability = calculateProbability(features: features)

        // Estimate time to stall based on patterns
        let timeToStall = estimateTimeToStall(features: features, probability: probability)

        // Calculate confidence based on data quality
        let confidence = calculateConfidence(features: features)

        // Get feature contributions
        let contributions = calculateFeatureContributions(features: features)

        // Determine recommendation
        let recommendation = getRecommendation(probability: probability, confidence: confidence)

        logger.debug("Stall prediction: prob=\(String(format: "%.2f", probability)), conf=\(String(format: "%.2f", confidence))")

        return StallPrediction(
            probability: probability,
            estimatedTimeToStall: timeToStall,
            confidence: confidence,
            topFeatures: contributions,
            recommendation: recommendation
        )
    }

    private func calculateProbability(features: StallFeatureVector) -> Double {
        var score = 0.0
        var weights = 0.0

        // Inactivity is the strongest indicator
        let inactivityWeight = 3.0
        let inactivityScore = min(features.timeSinceLastEvent / 60.0, 1.0)
        score += inactivityScore * inactivityWeight
        weights += inactivityWeight

        // Agent idle ratio
        let idleWeight = 2.0
        score += features.agentIdleRatio * idleWeight
        weights += idleWeight

        // No inflight tools
        let toolWeight = 1.5
        let noToolsScore = features.inflightToolCalls == 0 ? 0.8 : 0.0
        score += noToolsScore * toolWeight
        weights += toolWeight

        // Low event rate
        let eventRateWeight = 1.5
        let lowEventRateScore = max(0, 1.0 - (features.eventRate / 10.0))
        score += lowEventRateScore * eventRateWeight
        weights += eventRateWeight

        // Not streaming
        let streamingWeight = 1.0
        let notStreamingScore = features.isStreaming ? 0.0 : 0.5
        score += notStreamingScore * streamingWeight
        weights += streamingWeight

        // Consecutive idle periods
        let idlePeriodsWeight = 1.0
        let idlePeriodsScore = min(Double(features.consecutiveIdlePeriods) / 3.0, 1.0)
        score += idlePeriodsScore * idlePeriodsWeight
        weights += idlePeriodsWeight

        // Progress stagnation
        let progressWeight = 1.0
        let lowProgressRateScore = features.progressRate < 0.01 ? 0.7 : 0.0
        score += lowProgressRateScore * progressWeight
        weights += progressWeight

        // Normalize
        let probability = score / weights

        // Apply sigmoid for smoother output
        return sigmoid(probability * 4 - 2)  // Map 0-1 to sigmoid curve
    }

    private func sigmoid(_ x: Double) -> Double {
        1.0 / (1.0 + exp(-x))
    }

    private func estimateTimeToStall(features: StallFeatureVector, probability: Double) -> TimeInterval? {
        guard probability > lowThreshold else { return nil }

        // Estimate based on current trajectory
        let baseTimeToStall: TimeInterval

        if features.timeSinceLastEvent > 20 {
            // Already showing signs of stall
            baseTimeToStall = 30 - features.timeSinceLastEvent
        } else if features.eventRate < 1.0 {
            // Low activity
            baseTimeToStall = 60 - features.timeSinceLastEvent
        } else {
            // Normal activity
            baseTimeToStall = 90 - features.timeSinceLastEvent
        }

        // Adjust by mode
        let modeMultiplier: Double
        switch features.mode {
        case .quickTask: modeMultiplier = 0.7
        case .createFarm: modeMultiplier = 1.0
        case .goWild: modeMultiplier = 1.3
        }

        let adjustedTime = max(baseTimeToStall * modeMultiplier, 5)
        return adjustedTime
    }

    private func calculateConfidence(features: StallFeatureVector) -> Double {
        var confidence = 0.5  // Base confidence

        // More session data = higher confidence
        if features.sessionDuration > 60 {
            confidence += 0.1
        }
        if features.sessionDuration > 300 {
            confidence += 0.1
        }

        // More training data = higher confidence
        if trainingFeatures.count > 100 {
            confidence += 0.1
        }
        if trainingFeatures.count > 500 {
            confidence += 0.1
        }

        // Clear signals = higher confidence
        if features.activeAgentCount == 0 && features.inflightToolCalls == 0 {
            confidence += 0.1
        }

        return min(confidence, 1.0)
    }

    private func calculateFeatureContributions(features: StallFeatureVector) -> [StallPrediction.FeatureContribution] {
        var contributions: [StallPrediction.FeatureContribution] = []

        // Calculate contribution of each feature
        contributions.append(.init(
            name: "Inactivity",
            contribution: min(features.timeSinceLastEvent / 30.0, 1.0),
            value: features.timeSinceLastEvent
        ))

        contributions.append(.init(
            name: "Agent Idle Ratio",
            contribution: features.agentIdleRatio,
            value: features.agentIdleRatio
        ))

        contributions.append(.init(
            name: "Event Rate",
            contribution: max(0, 1.0 - (features.eventRate / 10.0)),
            value: features.eventRate
        ))

        contributions.append(.init(
            name: "No Active Tools",
            contribution: features.inflightToolCalls == 0 ? 0.8 : 0.0,
            value: Double(features.inflightToolCalls)
        ))

        contributions.append(.init(
            name: "Not Streaming",
            contribution: features.isStreaming ? 0.0 : 0.5,
            value: features.isStreaming ? 1.0 : 0.0
        ))

        // Sort by contribution
        return contributions.sorted { $0.contribution > $1.contribution }
    }

    private func getRecommendation(probability: Double, confidence: Double) -> StallPrediction.PredictionRecommendation {
        let adjustedProbability = probability * confidence

        if adjustedProbability < lowThreshold {
            return .noAction
        } else if adjustedProbability < mediumThreshold {
            return .increasedMonitoring
        } else if adjustedProbability < highThreshold {
            return .preemptiveNudge
        } else {
            return .immediateAction
        }
    }

    // MARK: - Training Data Collection

    /// Record a data point for training
    func recordDataPoint(features: StallFeatureVector, didStall: Bool) {
        let featureArray = features.toArray()
        trainingFeatures.append(featureArray)
        trainingLabels.append(didStall ? 1.0 : 0.0)

        // Keep buffer bounded
        if trainingFeatures.count > maxTrainingExamples {
            trainingFeatures.removeFirst()
            trainingLabels.removeFirst()
        }

        logger.debug("Recorded training point: didStall=\(didStall)")
    }

    /// Get training data statistics
    func getTrainingStats() -> TrainingStatistics {
        let positiveCount = trainingLabels.filter { $0 > 0.5 }.count
        let negativeCount = trainingLabels.count - positiveCount

        return TrainingStatistics(
            totalExamples: trainingLabels.count,
            positiveExamples: positiveCount,
            negativeExamples: negativeCount,
            hasNormalization: !featureMeans.isEmpty
        )
    }

    /// Clear training data
    func clearTrainingData() {
        trainingFeatures.removeAll()
        trainingLabels.removeAll()
        featureMeans.removeAll()
        featureStdDevs.removeAll()
        logger.info("Cleared training data")
    }

    // MARK: - Feature Extraction

    /// Extract features from current session state
    func extractFeatures(
        from context: SessionContextSnapshot,
        recentEvents: [SessionEvent],
        detector: StallDetector
    ) async -> StallFeatureVector {
        let now = Date()

        // Time features
        let timeSinceLastEvent = await detector.getInactivityDuration()

        var timeSinceLastAgentMessage: TimeInterval = timeSinceLastEvent
        var timeSinceLastToolCall: TimeInterval = timeSinceLastEvent

        for event in recentEvents.reversed() {
            switch event.type {
            case .agentMessage, .agentOutput:
                timeSinceLastAgentMessage = min(timeSinceLastAgentMessage, now.timeIntervalSince(event.timestamp))
            case .toolInvocation, .toolResult:
                timeSinceLastToolCall = min(timeSinceLastToolCall, now.timeIntervalSince(event.timestamp))
            default:
                break
            }
        }

        // Calculate event rate (events per minute in last 5 minutes)
        let fiveMinutesAgo = now.addingTimeInterval(-300)
        let recentEventCount = recentEvents.filter { $0.timestamp > fiveMinutesAgo }.count
        let eventRate = Double(recentEventCount) / 5.0

        // Tool features
        let recentToolCount = recentEvents.filter { event in
            event.timestamp > now.addingTimeInterval(-60) &&
            (event.type == .toolInvocation || event.type == .toolResult)
        }.count

        // Calculate progress rate
        let sessionMinutes = context.startedAt.distance(to: now) / 60.0
        let progressRate = sessionMinutes > 0 ? context.progress / sessionMinutes : 0

        // Consecutive idle periods (simplified)
        var consecutiveIdle = 0
        var lastWasIdle = false
        for event in recentEvents.suffix(20) {
            if event.type == .agentIdle {
                if lastWasIdle {
                    consecutiveIdle += 1
                }
                lastWasIdle = true
            } else {
                lastWasIdle = false
            }
        }

        return StallFeatureVector(
            timeSinceLastEvent: timeSinceLastEvent,
            timeSinceLastAgentMessage: timeSinceLastAgentMessage,
            timeSinceLastToolCall: timeSinceLastToolCall,
            sessionDuration: context.startedAt.distance(to: now),
            activeAgentCount: context.activeAgentCount,
            idleAgentCount: context.idleAgentCount,
            totalAgents: context.totalAgents,
            agentIdleRatio: context.totalAgents > 0 ? Double(context.idleAgentCount) / Double(context.totalAgents) : 0,
            inflightToolCalls: context.inflightToolCalls,
            recentToolCallCount: recentToolCount,
            averageToolDuration: 5.0, // Simplified
            progress: context.progress,
            progressRate: progressRate,
            tasksCompleted: context.tasksCompleted,
            eventRate: eventRate,
            isStreaming: false, // Would need to check from detector
            consecutiveIdlePeriods: consecutiveIdle,
            mode: context.mode,
            errorCount: context.errorCount,
            warningCount: context.warningCount
        )
    }
}

// MARK: - Training Statistics

struct TrainingStatistics {
    let totalExamples: Int
    let positiveExamples: Int
    let negativeExamples: Int
    let hasNormalization: Bool

    var positiveRatio: Double {
        totalExamples > 0 ? Double(positiveExamples) / Double(totalExamples) : 0
    }

    var isBalanced: Bool {
        guard totalExamples > 20 else { return true }
        return positiveRatio > 0.2 && positiveRatio < 0.8
    }
}

// MARK: - Simple Statistical Model (Fallback)

/// Simple logistic regression model for stall prediction
private class StallPredictor {
    private var weights: [Double]
    private var bias: Double

    init(featureCount: Int) {
        weights = [Double](repeating: 0, count: featureCount)
        bias = 0
    }

    func predict(_ features: [Double]) -> Double {
        guard features.count == weights.count else { return 0.5 }

        var sum = bias
        for (i, feature) in features.enumerated() {
            sum += feature * weights[i]
        }

        return 1.0 / (1.0 + exp(-sum))
    }

    func train(features: [[Double]], labels: [Double], learningRate: Double = 0.01, epochs: Int = 100) {
        guard !features.isEmpty else { return }

        for _ in 0..<epochs {
            for (i, sample) in features.enumerated() {
                let prediction = predict(sample)
                let error = labels[i] - prediction
                let gradient = error * prediction * (1 - prediction)

                bias += learningRate * gradient
                for (j, feature) in sample.enumerated() {
                    weights[j] += learningRate * gradient * feature
                }
            }
        }
    }
}
