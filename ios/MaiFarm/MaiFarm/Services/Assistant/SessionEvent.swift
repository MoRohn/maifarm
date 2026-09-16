//
//  SessionEvent.swift
//  MaiFarm
//
//  Session event models for the Assistant service
//  Captures all meaningful events during a farm run
//

import Foundation

// MARK: - Session Event Types

/// All event types that the Assistant captures during a farm session
enum SessionEventType: String, Codable, CaseIterable {
    // Session lifecycle
    case sessionStarted = "session:started"
    case sessionEnded = "session:ended"
    case sessionPaused = "session:paused"
    case sessionResumed = "session:resumed"

    // User inputs
    case userInput = "user:input"
    case userGoal = "user:goal"
    case userFeedback = "user:feedback"

    // AI Engine
    case engineSelected = "engine:selected"
    case engineConfigured = "engine:configured"

    // Orchestrator events
    case orchestratorPlanCreated = "orchestrator:plan_created"
    case orchestratorPlanUpdated = "orchestrator:plan_updated"
    case orchestratorDecision = "orchestrator:decision"
    case orchestratorNudgeReceived = "orchestrator:nudge_received"
    case orchestratorNudgeAck = "orchestrator:nudge_ack"

    // Agent lifecycle
    case agentStarted = "agent:started"
    case agentCompleted = "agent:completed"
    case agentFailed = "agent:failed"
    case agentIdle = "agent:idle"
    case agentHeartbeat = "agent:heartbeat"

    // Agent messages
    case agentMessage = "agent:message"
    case agentThinking = "agent:thinking"
    case agentOutput = "agent:output"

    // Tool usage
    case toolInvocation = "tool:invocation"
    case toolResult = "tool:result"
    case toolError = "tool:error"

    // Artifacts
    case artifactCreated = "artifact:created"
    case artifactModified = "artifact:modified"
    case harvestItem = "artifact:harvest"
    case barnItem = "artifact:barn"
    case fileCreated = "artifact:file"

    // Errors and recovery
    case errorOccurred = "error:occurred"
    case errorRecovered = "error:recovered"
    case retryAttempt = "error:retry"
    case warningIssued = "warning:issued"

    // Metrics
    case metricsUpdate = "metrics:update"
    case costUpdate = "metrics:cost"
    case progressUpdate = "metrics:progress"

    // Terminal
    case terminalOutput = "terminal:output"
    case terminalCommand = "terminal:command"

    // Farm status
    case farmStatusChange = "farm:status"
    case farmProgress = "farm:progress"
}

// MARK: - Session Event

/// Represents a single event captured during a farm session
struct SessionEvent: Codable, Identifiable {
    let id: String
    let sessionId: String
    let type: SessionEventType
    let timestamp: Date
    let agentId: String?
    let agentName: String?
    let correlationId: String?
    let data: SessionEventData

    init(
        sessionId: String,
        type: SessionEventType,
        agentId: String? = nil,
        agentName: String? = nil,
        correlationId: String? = nil,
        data: SessionEventData
    ) {
        self.id = UUID().uuidString
        self.sessionId = sessionId
        self.type = type
        self.timestamp = Date()
        self.agentId = agentId
        self.agentName = agentName
        self.correlationId = correlationId
        self.data = data
    }

    /// Create event from monitoring WebSocket message
    static func from(monitoringMessage: MonitoringMessage, sessionId: String) -> SessionEvent? {
        switch monitoringMessage.type {
        case .terminalOutput:
            guard let output = monitoringMessage.terminalOutput else { return nil }
            return SessionEvent(
                sessionId: sessionId,
                type: .terminalOutput,
                agentId: output.agentId,
                agentName: output.agentName,
                data: .terminalOutput(content: output.content)
            )

        case .agentStatus:
            guard let status = monitoringMessage.agentStatus else { return nil }
            let eventType: SessionEventType
            switch status.status.lowercased() {
            case "running", "active": eventType = .agentStarted
            case "completed", "succeeded": eventType = .agentCompleted
            case "failed", "error": eventType = .agentFailed
            case "idle", "waiting": eventType = .agentIdle
            default: eventType = .agentMessage
            }
            return SessionEvent(
                sessionId: sessionId,
                type: eventType,
                agentId: status.agentId,
                data: .agentStatus(status: status.status, task: status.currentTask)
            )

        case .farmMetrics:
            guard let metrics = monitoringMessage.metrics else { return nil }
            return SessionEvent(
                sessionId: sessionId,
                type: .metricsUpdate,
                data: .metrics(
                    tokensUsed: metrics.tokensUsed,
                    cost: metrics.estimatedCost,
                    tasksCompleted: metrics.tasksCompleted,
                    filesGenerated: metrics.filesGenerated
                )
            )

        case .farmStatus:
            guard let status = monitoringMessage.farmStatus else { return nil }
            return SessionEvent(
                sessionId: sessionId,
                type: .farmStatusChange,
                data: .farmStatus(
                    status: status.status,
                    progress: status.progress,
                    timeRemaining: status.estimatedTimeRemaining
                )
            )
        }
    }
}

// MARK: - Session Event Data

/// Typed payload for session events
enum SessionEventData: Codable {
    // Session
    case sessionStart(farmId: String, farmName: String, mode: String, engine: String, agentCount: Int, duration: Int)
    case sessionEnd(finalStatus: String, totalTokens: Int, totalCost: Double)

    // User
    case userInput(content: String)
    case userGoal(goal: String, constraints: [String]?)

    // Engine
    case engineConfig(provider: String, model: String?, parameters: [String: String]?)

    // Orchestrator
    case planUpdate(planSummary: String, agentAssignments: [String: String]?)
    case decision(description: String, rationale: String?)

    // Agent
    case agentStatus(status: String, task: String?)
    case agentMessage(role: String, content: String)
    case agentThinking(thought: String)

    // Tool
    case toolCall(toolName: String, inputSummary: String)
    case toolResult(toolName: String, outputSummary: String, success: Bool)

    // Artifacts
    case artifactCreated(name: String, type: String, path: String?, sizeSummary: String?)
    case fileOperation(operation: String, path: String, description: String?)

    // Terminal
    case terminalOutput(content: String)
    case terminalCommand(command: String)

    // Metrics
    case metrics(tokensUsed: Int, cost: Double, tasksCompleted: Int, filesGenerated: Int)
    case costDelta(amount: Double, reason: String?)
    case progress(percentage: Double, milestone: String?)

    // Farm status
    case farmStatus(status: String, progress: Double, timeRemaining: TimeInterval?)

    // Errors
    case error(code: String?, message: String, recoverable: Bool)
    case warning(message: String, severity: String?)
    case retry(attempt: Int, maxAttempts: Int, reason: String)

    // Nudge
    case nudgeSent(nudgeId: String, content: String)
    case nudgeAck(nudgeId: String, response: String?)

    // Generic
    case raw(json: String)
}

// MARK: - Session Context Snapshot

/// A snapshot of the current session state for the Assistant
struct SessionContextSnapshot: Codable {
    let sessionId: String
    let farmId: String
    let farmName: String
    let mode: FarmMode
    let engine: String
    let startedAt: Date

    // Current state
    var status: String
    var progress: Double
    var activeAgentCount: Int
    var idleAgentCount: Int
    var totalAgents: Int

    // Metrics
    var tokensUsed: Int
    var estimatedCost: Double
    var tasksCompleted: Int
    var filesGenerated: Int

    // Event tracking
    var lastEventAt: Date
    var totalEventCount: Int
    var eventCountByType: [String: Int]

    // Agent states
    var agentStates: [String: AgentContextState]

    // Inflight operations
    var inflightToolCalls: Int
    var pendingOperations: Int

    // Issues
    var errorCount: Int
    var warningCount: Int
    var lastError: String?

    enum FarmMode: String, Codable {
        case quickTask = "quick_task"
        case createFarm = "create_farm"
        case goWild = "go_wild"
    }

    mutating func update(with event: SessionEvent) {
        lastEventAt = event.timestamp
        totalEventCount += 1

        let typeKey = event.type.rawValue
        eventCountByType[typeKey, default: 0] += 1

        switch event.data {
        case .metrics(let tokens, let cost, let tasks, let files):
            tokensUsed = tokens
            estimatedCost = cost
            tasksCompleted = tasks
            filesGenerated = files

        case .farmStatus(let newStatus, let newProgress, _):
            status = newStatus
            progress = newProgress

        case .agentStatus(let agentStatus, let task):
            if let agentId = event.agentId {
                var state = agentStates[agentId] ?? AgentContextState(agentId: agentId, name: event.agentName ?? agentId)
                state.status = agentStatus
                state.currentTask = task
                state.lastActivityAt = event.timestamp
                agentStates[agentId] = state

                // Update active/idle counts
                recalculateAgentCounts()
            }

        case .toolCall(_, _):
            inflightToolCalls += 1

        case .toolResult(_, _, _):
            inflightToolCalls = max(0, inflightToolCalls - 1)

        case .error(_, let message, _):
            errorCount += 1
            lastError = message

        case .warning(_, _):
            warningCount += 1

        default:
            break
        }
    }

    private mutating func recalculateAgentCounts() {
        activeAgentCount = agentStates.values.filter {
            $0.status == "running" || $0.status == "active"
        }.count
        idleAgentCount = agentStates.values.filter {
            $0.status == "idle" || $0.status == "waiting" || $0.status == "completed"
        }.count
        totalAgents = agentStates.count
    }
}

/// Tracks the state of a single agent
struct AgentContextState: Codable {
    let agentId: String
    var name: String
    var role: String?
    var status: String = "initializing"
    var currentTask: String?
    var lastActivityAt: Date = Date()
    var messageCount: Int = 0
    var toolCallCount: Int = 0
    var errorCount: Int = 0
}

// MARK: - Session Goals

/// Parsed user intent and goals
struct SessionGoals: Codable {
    var primaryGoal: String
    var constraints: [String]
    var successCriteria: [String]
    var artifacts: [String]
    var openQuestions: [String]

    init(primaryGoal: String = "", constraints: [String] = [], successCriteria: [String] = [], artifacts: [String] = [], openQuestions: [String] = []) {
        self.primaryGoal = primaryGoal
        self.constraints = constraints
        self.successCriteria = successCriteria
        self.artifacts = artifacts
        self.openQuestions = openQuestions
    }
}

// MARK: - Session Artifacts

/// Tracks artifacts produced during the session
struct SessionArtifacts: Codable {
    var harvests: [ArtifactReference]
    var barnItems: [ArtifactReference]
    var files: [ArtifactReference]

    init() {
        harvests = []
        barnItems = []
        files = []
    }

    mutating func add(_ artifact: ArtifactReference, type: ArtifactType) {
        switch type {
        case .harvest: harvests.append(artifact)
        case .barn: barnItems.append(artifact)
        case .file: files.append(artifact)
        }
    }

    enum ArtifactType {
        case harvest, barn, file
    }
}

struct ArtifactReference: Codable, Identifiable {
    let id: String
    let name: String
    let type: String
    let path: String?
    let summary: String?
    let createdAt: Date
}

// MARK: - Session Issues

/// Tracks issues encountered during the session
struct SessionIssues: Codable {
    var errors: [IssueRecord]
    var warnings: [IssueRecord]
    var retries: [RetryRecord]

    init() {
        errors = []
        warnings = []
        retries = []
    }
}

struct IssueRecord: Codable, Identifiable {
    let id: String
    let timestamp: Date
    let agentId: String?
    let code: String?
    let message: String
    let context: String?
    let resolved: Bool

    init(agentId: String? = nil, code: String? = nil, message: String, context: String? = nil, resolved: Bool = false) {
        self.id = UUID().uuidString
        self.timestamp = Date()
        self.agentId = agentId
        self.code = code
        self.message = message
        self.context = context
        self.resolved = resolved
    }
}

struct RetryRecord: Codable, Identifiable {
    let id: String
    let timestamp: Date
    let agentId: String?
    let attempt: Int
    let maxAttempts: Int
    let reason: String
    let succeeded: Bool?
}

// MARK: - JSONL Encoding

extension SessionEvent {
    /// Encode event as JSONL line
    func toJSONL() -> String? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        guard let data = try? encoder.encode(self),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }

        // JSONL format: single line JSON followed by newline
        return json.replacingOccurrences(of: "\n", with: " ") + "\n"
    }

    /// Decode event from JSONL line
    static func fromJSONL(_ line: String) -> SessionEvent? {
        guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let data = line.data(using: .utf8) else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        return try? decoder.decode(SessionEvent.self, from: data)
    }
}
