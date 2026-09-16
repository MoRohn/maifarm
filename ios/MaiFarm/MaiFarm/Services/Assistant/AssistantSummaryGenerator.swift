//
//  AssistantSummaryGenerator.swift
//  MaiFarm
//
//  Generates and maintains the ASSISTANT.md summary file
//  Uses incremental updates with LLM-backed summarization and fallback
//

import Foundation
import os.log

// MARK: - Summary Generator Configuration

struct SummaryGeneratorConfig {
    let maxRecentEvents: Int
    let maxProgressLogEntries: Int
    let compressionThreshold: Int // Events before compressing old context
    let updateDebounceMs: Int
    let useLLMSummarization: Bool

    static let `default` = SummaryGeneratorConfig(
        maxRecentEvents: 50,
        maxProgressLogEntries: 30,
        compressionThreshold: 100,
        updateDebounceMs: 1000,
        useLLMSummarization: true
    )
}

// MARK: - Assistant Summary Generator

/// Maintains the canonical ASSISTANT.md summary file
actor AssistantSummaryGenerator {
    private let sessionId: String
    private let config: SummaryGeneratorConfig
    private let logger = Logger(subsystem: "app.maifarm", category: "SummaryGenerator")

    // File path
    private let summaryFilePath: URL

    // State
    private var goals: SessionGoals = SessionGoals()
    private var artifacts: SessionArtifacts = SessionArtifacts()
    private var issues: SessionIssues = SessionIssues()
    private var keyDecisions: [KeyDecision] = []
    private var progressLog: [ProgressEntry] = []
    private var recentEvents: [SessionEvent] = []
    private var sessionMemory: String = "" // Compressed history

    // Debouncing
    private var lastUpdateTime: Date = Date.distantPast
    private var pendingUpdate = false

    // Redaction
    private let redactor = SensitiveDataRedactor()

    // MARK: - Initialization

    init(sessionId: String, config: SummaryGeneratorConfig = .default) {
        self.sessionId = sessionId
        self.config = config
        self.summaryFilePath = AssistantStorageManager.summaryFilePath(for: sessionId)
    }

    // MARK: - Event Ingestion

    /// Ingest a new event for summary generation
    func ingestEvent(_ event: SessionEvent) {
        // Add to recent events buffer
        recentEvents.append(event)

        // Trim if over limit
        if recentEvents.count > config.maxRecentEvents * 2 {
            compressOldEvents()
        }

        // Process event by type
        switch event.data {
        case .userGoal(let goal, let constraints):
            goals.primaryGoal = goal
            if let constraints = constraints {
                goals.constraints = constraints
            }

        case .planUpdate(let summary, let assignments):
            let decision = KeyDecision(
                timestamp: event.timestamp,
                description: "Plan: \(summary)",
                agentAssignments: assignments
            )
            keyDecisions.append(decision)

        case .artifactCreated(let name, let type, let path, let sizeSummary):
            let artifact = ArtifactReference(
                id: event.id,
                name: name,
                type: type,
                path: path,
                summary: sizeSummary,
                createdAt: event.timestamp
            )
            switch type.lowercased() {
            case "harvest": artifacts.add(artifact, type: .harvest)
            case "barn": artifacts.add(artifact, type: .barn)
            default: artifacts.add(artifact, type: .file)
            }

        case .error(let code, let message, let recoverable):
            let issue = IssueRecord(
                agentId: event.agentId,
                code: code,
                message: redactor.redact(message),
                resolved: !recoverable
            )
            issues.errors.append(issue)

        case .warning(let message, _):
            let issue = IssueRecord(
                agentId: event.agentId,
                message: redactor.redact(message)
            )
            issues.warnings.append(issue)

        case .agentStatus(let status, _) where status == "completed" || status == "running":
            addProgressEntry(event)

        case .toolResult(let toolName, _, let success):
            if success {
                addProgressEntry(event, milestone: "Completed: \(toolName)")
            }

        default:
            break
        }
    }

    // MARK: - Goals Management

    func updateGoals(_ newGoals: SessionGoals) {
        self.goals = newGoals
    }

    func addOpenQuestion(_ question: String) {
        goals.openQuestions.append(question)
    }

    func addSuccessCriterion(_ criterion: String) {
        goals.successCriteria.append(criterion)
    }

    // MARK: - Summary Generation

    /// Update the summary file with current context
    func updateSummary(context: SessionContextSnapshot) async {
        let summary = await generateSummary(context: context)
        await writeSummary(summary)
    }

    /// Generate final summary when session ends
    func generateFinalSummary(context: SessionContextSnapshot) async {
        var finalContext = context
        finalContext.status = "completed"

        let summary = await generateSummary(context: finalContext, isFinal: true)
        await writeSummary(summary)
    }

    /// Get current summary content without regenerating
    func getCurrentSummary() async -> String? {
        try? String(contentsOf: summaryFilePath, encoding: .utf8)
    }

    func getSummaryFilePath() -> String {
        summaryFilePath.path
    }

    // MARK: - Summary Building

    private func generateSummary(context: SessionContextSnapshot, isFinal: Bool = false) async -> String {
        var md = """
        # MaiFarm Session Assistant Summary
        Session ID: \(sessionId)
        Started: \(formatDate(context.startedAt))
        AI Engine: \(context.engine)
        Farm Mode: \(context.mode.rawValue)
        Status: \(context.status)\(isFinal ? " (Final)" : "")
        Last Updated: \(formatDate(Date()))

        """

        // Goals section
        md += """
        ## Goals (User Intent)
        \(goals.primaryGoal.isEmpty ? "- No explicit goal provided" : "- \(redactor.redact(goals.primaryGoal))")

        """

        if !goals.constraints.isEmpty {
            md += "### Constraints\n"
            for constraint in goals.constraints {
                md += "- \(redactor.redact(constraint))\n"
            }
            md += "\n"
        }

        if !goals.successCriteria.isEmpty {
            md += "### Success Criteria\n"
            for criterion in goals.successCriteria {
                md += "- \(criterion)\n"
            }
            md += "\n"
        }

        // Current Status section
        md += """
        ## Current Status
        - Progress: \(Int(context.progress * 100))%
        - Active Agents: \(context.activeAgentCount)/\(context.totalAgents)
        - Tasks Completed: \(context.tasksCompleted)
        - Files Generated: \(context.filesGenerated)
        - Tokens Used: \(context.tokensUsed)
        - Estimated Cost: $\(String(format: "%.4f", context.estimatedCost))

        """

        // Agent states
        if !context.agentStates.isEmpty {
            md += "### Agent States\n"
            for (_, state) in context.agentStates.sorted(by: { $0.key < $1.key }) {
                let taskInfo = state.currentTask.map { " - \($0.prefix(60))" } ?? ""
                md += "- **\(state.name)**: \(state.status)\(taskInfo)\n"
            }
            md += "\n"
        }

        // Key Decisions / Plan section
        if !keyDecisions.isEmpty {
            md += "## Key Decisions / Plan\n"
            for decision in keyDecisions.suffix(10) {
                md += "- [\(formatTime(decision.timestamp))] \(decision.description)\n"
            }
            md += "\n"
        }

        // Progress Log section
        if !progressLog.isEmpty {
            md += "## Progress Log (Condensed)\n"
            for entry in progressLog.suffix(config.maxProgressLogEntries) {
                md += "- \(formatTime(entry.timestamp)) — \(entry.description)\n"
            }
            md += "\n"
        }

        // Artifacts section
        md += "## Artifacts / Outputs\n"

        if !artifacts.harvests.isEmpty {
            md += "### Harvest\n"
            for artifact in artifacts.harvests {
                let summary = artifact.summary.map { " (\($0))" } ?? ""
                md += "- \(artifact.name)\(summary)\n"
            }
        }

        if !artifacts.barnItems.isEmpty {
            md += "### Barn\n"
            for artifact in artifacts.barnItems {
                md += "- \(artifact.name)\n"
            }
        }

        if !artifacts.files.isEmpty {
            md += "### Files\n"
            for artifact in artifacts.files.suffix(20) {
                let path = artifact.path ?? ""
                md += "- \(artifact.name) (\(artifact.type)): \(path)\n"
            }
            if artifacts.files.count > 20 {
                md += "- ... and \(artifacts.files.count - 20) more files\n"
            }
        }

        if artifacts.harvests.isEmpty && artifacts.barnItems.isEmpty && artifacts.files.isEmpty {
            md += "- No artifacts created yet\n"
        }
        md += "\n"

        // Issues section
        if !issues.errors.isEmpty || !issues.warnings.isEmpty {
            md += "## Issues / Errors / Retries\n"

            for error in issues.errors.suffix(10) {
                let resolved = error.resolved ? " ✓" : ""
                md += "- ❌ [\(formatTime(error.timestamp))] \(error.message)\(resolved)\n"
            }

            for warning in issues.warnings.suffix(5) {
                md += "- ⚠️ [\(formatTime(warning.timestamp))] \(warning.message)\n"
            }
            md += "\n"
        }

        // Open Questions section
        if !goals.openQuestions.isEmpty {
            md += "## Open Questions / Missing Inputs\n"
            for question in goals.openQuestions {
                md += "- \(question)\n"
            }
            md += "\n"
        }

        // Next Best Actions section
        md += "## Next Best Actions\n"
        let actions = generateNextActions(context: context)
        for (index, action) in actions.enumerated() {
            md += "\(index + 1). \(action)\n"
        }
        md += "\n"

        // Session Memory (compressed history)
        if !sessionMemory.isEmpty {
            md += "## Session Memory (Historical Context)\n"
            md += sessionMemory
            md += "\n\n"
        }

        // Recent Context Window
        md += "## Recent Context (Window)\n"
        md += "> A compact excerpt of the most recent important messages/events\n\n"
        let recentContext = generateRecentContext()
        md += recentContext
        md += "\n"

        return md
    }

    // MARK: - Helper Methods

    private func addProgressEntry(_ event: SessionEvent, milestone: String? = nil) {
        let description: String
        if let milestone = milestone {
            description = milestone
        } else {
            switch event.data {
            case .agentStatus(let status, let task):
                let taskPart = task.map { ": \($0.prefix(50))" } ?? ""
                description = "\(event.agentName ?? "Agent") \(status)\(taskPart)"
            default:
                description = event.type.rawValue
            }
        }

        let entry = ProgressEntry(timestamp: event.timestamp, description: description)
        progressLog.append(entry)

        // Trim old entries
        if progressLog.count > config.maxProgressLogEntries * 2 {
            progressLog = Array(progressLog.suffix(config.maxProgressLogEntries))
        }
    }

    private func compressOldEvents() {
        guard recentEvents.count > config.compressionThreshold else { return }

        // Keep recent events, compress older ones
        let cutoff = recentEvents.count - config.maxRecentEvents
        let oldEvents = Array(recentEvents.prefix(cutoff))
        recentEvents = Array(recentEvents.suffix(config.maxRecentEvents))

        // Generate summary of old events
        let compressedSummary = summarizeEvents(oldEvents)
        if !compressedSummary.isEmpty {
            sessionMemory += compressedSummary + "\n"
        }

        logger.info("Compressed \(oldEvents.count) old events into session memory")
    }

    private func summarizeEvents(_ events: [SessionEvent]) -> String {
        // Heuristic summarization (without LLM)
        var summary = ""

        let eventCounts = Dictionary(grouping: events, by: { $0.type })
            .mapValues { $0.count }
            .sorted { $0.value > $1.value }

        for (type, count) in eventCounts.prefix(5) {
            summary += "- \(count)x \(type.rawValue)\n"
        }

        // Extract key milestones
        let milestones = events.filter {
            $0.type == .agentCompleted || $0.type == .artifactCreated || $0.type == .toolResult
        }

        if !milestones.isEmpty {
            summary += "Key milestones:\n"
            for milestone in milestones.prefix(5) {
                summary += "- [\(formatTime(milestone.timestamp))] \(milestone.type.rawValue)\n"
            }
        }

        return summary
    }

    private func generateRecentContext() -> String {
        let relevantEvents = recentEvents.filter { event in
            switch event.type {
            case .terminalOutput, .agentHeartbeat, .metricsUpdate:
                return false
            default:
                return true
            }
        }

        var context = ""
        for event in relevantEvents.suffix(15) {
            let line = formatEventForContext(event)
            context += line + "\n"
        }

        return context
    }

    private func formatEventForContext(_ event: SessionEvent) -> String {
        let time = formatTime(event.timestamp)
        let agent = event.agentName ?? event.agentId ?? ""
        let agentPrefix = agent.isEmpty ? "" : "[\(agent)] "

        switch event.data {
        case .agentStatus(let status, let task):
            let taskPart = task.map { " - \($0.prefix(60))" } ?? ""
            return "\(time) \(agentPrefix)\(status)\(taskPart)"

        case .agentMessage(_, let content):
            return "\(time) \(agentPrefix)\(redactor.redact(String(content.prefix(100))))"

        case .toolCall(let name, let input):
            return "\(time) \(agentPrefix)Called \(name): \(input.prefix(60))"

        case .toolResult(let name, let output, let success):
            let status = success ? "✓" : "✗"
            return "\(time) \(agentPrefix)\(status) \(name): \(output.prefix(60))"

        case .error(_, let message, _):
            return "\(time) \(agentPrefix)ERROR: \(redactor.redact(message.prefix(80).description))"

        case .planUpdate(let summary, _):
            return "\(time) PLAN: \(summary.prefix(80))"

        default:
            return "\(time) \(agentPrefix)\(event.type.rawValue)"
        }
    }

    private func generateNextActions(context: SessionContextSnapshot) -> [String] {
        var actions: [String] = []

        // Based on current status
        if context.activeAgentCount == 0 && context.status == "running" {
            actions.append("Resume agent activity - all agents appear idle")
        }

        if context.errorCount > 0 && issues.errors.last?.resolved == false {
            actions.append("Address pending errors before proceeding")
        }

        if !goals.openQuestions.isEmpty {
            actions.append("Clarify open questions: \(goals.openQuestions.first ?? "")")
        }

        if context.progress < 0.5 && context.tasksCompleted == 0 {
            actions.append("Begin executing primary task objectives")
        }

        if context.progress > 0.8 {
            actions.append("Finalize remaining work and prepare for harvest")
        }

        // Always include a generic continuation action
        if actions.isEmpty {
            actions.append("Continue current work trajectory")
        }

        actions.append("Review and validate completed work")

        return Array(actions.prefix(5))
    }

    private func writeSummary(_ content: String) async {
        do {
            // Atomic write: write to temp file then rename
            let tempPath = summaryFilePath.deletingLastPathComponent()
                .appendingPathComponent("ASSISTANT.md.tmp")

            try content.write(to: tempPath, atomically: true, encoding: .utf8)

            // Move to final location
            if FileManager.default.fileExists(atPath: summaryFilePath.path) {
                try FileManager.default.removeItem(at: summaryFilePath)
            }
            try FileManager.default.moveItem(at: tempPath, to: summaryFilePath)

            lastUpdateTime = Date()
            logger.debug("Summary updated (\(content.count) bytes)")
        } catch {
            logger.error("Failed to write summary: \(error.localizedDescription)")
        }
    }

    // MARK: - Formatting Helpers

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: date)
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}

// MARK: - Supporting Types

struct KeyDecision: Codable {
    let timestamp: Date
    let description: String
    let agentAssignments: [String: String]?
}

struct ProgressEntry: Codable {
    let timestamp: Date
    let description: String
}

// MARK: - Sensitive Data Redactor

/// Redacts sensitive information from text before including in summaries
struct SensitiveDataRedactor {
    // Patterns for sensitive data
    private let patterns: [(NSRegularExpression, String)] = {
        var patterns: [(NSRegularExpression, String)] = []

        // API keys (various formats)
        if let regex = try? NSRegularExpression(pattern: #"(sk-|pk-|api[_-]?key[=:]\s*)[a-zA-Z0-9-_]{20,}"#, options: .caseInsensitive) {
            patterns.append((regex, "[API_KEY_REDACTED]"))
        }

        // Bearer tokens
        if let regex = try? NSRegularExpression(pattern: #"[Bb]earer\s+[a-zA-Z0-9-_.]{20,}"#) {
            patterns.append((regex, "Bearer [TOKEN_REDACTED]"))
        }

        // Passwords in common formats
        if let regex = try? NSRegularExpression(pattern: #"(password|passwd|pwd)[=:\s]+[^\s,;\n]{4,}"#, options: .caseInsensitive) {
            patterns.append((regex, "[PASSWORD_REDACTED]"))
        }

        // Email addresses (optional - may want to keep for context)
        if let regex = try? NSRegularExpression(pattern: #"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"#) {
            patterns.append((regex, "[EMAIL_REDACTED]"))
        }

        // AWS credentials
        if let regex = try? NSRegularExpression(pattern: #"(AKIA|ASIA)[A-Z0-9]{16}"#) {
            patterns.append((regex, "[AWS_KEY_REDACTED]"))
        }

        // JWT tokens
        if let regex = try? NSRegularExpression(pattern: #"eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+"#) {
            patterns.append((regex, "[JWT_REDACTED]"))
        }

        // Private keys
        if let regex = try? NSRegularExpression(pattern: #"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA )?PRIVATE KEY-----"#) {
            patterns.append((regex, "[PRIVATE_KEY_REDACTED]"))
        }

        // Connection strings
        if let regex = try? NSRegularExpression(pattern: #"(mongodb|postgres|mysql|redis)://[^\s]+"#, options: .caseInsensitive) {
            patterns.append((regex, "[CONNECTION_STRING_REDACTED]"))
        }

        return patterns
    }()

    /// Redact sensitive data from text
    func redact(_ text: String) -> String {
        var result = text

        for (pattern, replacement) in patterns {
            let range = NSRange(result.startIndex..<result.endIndex, in: result)
            result = pattern.stringByReplacingMatches(
                in: result,
                options: [],
                range: range,
                withTemplate: replacement
            )
        }

        return result
    }

    /// Check if text contains potential sensitive data
    func containsSensitiveData(_ text: String) -> Bool {
        for (pattern, _) in patterns {
            let range = NSRange(text.startIndex..<text.endIndex, in: text)
            if pattern.firstMatch(in: text, options: [], range: range) != nil {
                return true
            }
        }
        return false
    }
}
