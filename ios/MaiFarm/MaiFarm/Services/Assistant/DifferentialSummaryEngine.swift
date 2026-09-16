//
//  DifferentialSummaryEngine.swift
//  MaiFarm
//
//  Differential summary updates for better performance
//  Only regenerates changed sections, not entire document
//

import Foundation
import os.log

// MARK: - Section Types

enum SummarySection: String, CaseIterable {
    case goals = "Goals"
    case currentStatus = "Current Status"
    case keyDecisions = "Key Decisions / Plan"
    case progressLog = "Progress Log"
    case artifacts = "Artifacts / Outputs"
    case issues = "Issues / Errors"
    case openQuestions = "Open Questions"
    case nextBestActions = "Next Best Actions"
    case recentContext = "Recent Context"

    var order: Int {
        switch self {
        case .goals: return 0
        case .currentStatus: return 1
        case .keyDecisions: return 2
        case .progressLog: return 3
        case .artifacts: return 4
        case .issues: return 5
        case .openQuestions: return 6
        case .nextBestActions: return 7
        case .recentContext: return 8
        }
    }
}

// MARK: - Section Content

struct SectionContent: Equatable {
    let section: SummarySection
    var content: String
    var hash: Int
    var lastModified: Date

    init(section: SummarySection, content: String) {
        self.section = section
        self.content = content
        self.hash = content.hashValue
        self.lastModified = Date()
    }

    mutating func update(content: String) {
        let newHash = content.hashValue
        if newHash != self.hash {
            self.content = content
            self.hash = newHash
            self.lastModified = Date()
        }
    }

    var isModified: Bool {
        content.hashValue != hash
    }
}

// MARK: - Section Delta

struct SectionDelta {
    let section: SummarySection
    let previousContent: String?
    let newContent: String
    let changeType: ChangeType

    enum ChangeType {
        case added
        case modified
        case removed
        case unchanged
    }
}

// MARK: - Differential Summary Engine

/// Manages incremental summary updates for performance
actor DifferentialSummaryEngine {
    private let logger = Logger(subsystem: "app.maifarm", category: "DifferentialSummary")

    // Current section state
    private var sections: [SummarySection: SectionContent] = [:]
    private var documentHash: Int = 0
    private var lastFullRebuild: Date = .distantPast

    // Configuration
    private let fullRebuildInterval: TimeInterval = 300 // 5 minutes
    private let maxDeltasBeforeRebuild = 50

    // Delta tracking
    private var pendingDeltas: [SectionDelta] = []
    private var deltaCount = 0

    // MARK: - Initialization

    init() {
        // Initialize empty sections
        for section in SummarySection.allCases {
            sections[section] = SectionContent(section: section, content: "")
        }
    }

    // MARK: - Section Updates

    /// Update a specific section with new content
    func updateSection(_ section: SummarySection, content: String) -> SectionDelta {
        let previousContent = sections[section]?.content

        if sections[section] == nil {
            sections[section] = SectionContent(section: section, content: content)
        } else {
            sections[section]?.update(content: content)
        }

        let changeType: SectionDelta.ChangeType
        if previousContent == nil {
            changeType = .added
        } else if previousContent != content {
            changeType = .modified
        } else {
            changeType = .unchanged
        }

        let delta = SectionDelta(
            section: section,
            previousContent: previousContent,
            newContent: content,
            changeType: changeType
        )

        if changeType != .unchanged {
            pendingDeltas.append(delta)
            deltaCount += 1
        }

        return delta
    }

    /// Update goals section
    func updateGoals(_ goals: SummaryGoals) -> SectionDelta {
        var content = ""

        content += "**Primary Goal:** \(goals.primaryGoal)\n"

        if !goals.subGoals.isEmpty {
            content += "\n**Sub-goals:**\n"
            for goal in goals.subGoals {
                let status = goal.completed ? "[x]" : "[ ]"
                content += "- \(status) \(goal.description)\n"
            }
        }

        return updateSection(.goals, content: content)
    }

    /// Update current status section
    func updateStatus(context: SessionContextSnapshot) -> SectionDelta {
        let progress = Int(context.progress * 100)
        var content = """
        - **Status:** \(context.status.capitalized)
        - **Progress:** \(progress)%
        - **Active Agents:** \(context.activeAgentCount)/\(context.totalAgents)
        - **Tasks Completed:** \(context.tasksCompleted)
        - **Files Generated:** \(context.filesGenerated)
        - **Tokens Used:** \(formatNumber(context.tokensUsed))
        - **Estimated Cost:** $\(String(format: "%.4f", context.estimatedCost))
        """

        if context.errorCount > 0 {
            content += "\n- **Errors:** \(context.errorCount)"
        }

        return updateSection(.currentStatus, content: content)
    }

    /// Update progress log with new entry
    func appendToProgressLog(entry: String, timestamp: Date = Date()) -> SectionDelta {
        let timeString = formatTime(timestamp)
        let newEntry = "- [\(timeString)] \(entry)"

        var currentContent = sections[.progressLog]?.content ?? ""

        // Keep only last 50 entries
        var lines = currentContent.components(separatedBy: "\n").filter { !$0.isEmpty }
        lines.append(newEntry)

        if lines.count > 50 {
            lines = Array(lines.suffix(50))
        }

        return updateSection(.progressLog, content: lines.joined(separator: "\n"))
    }

    /// Update artifacts section
    func updateArtifacts(_ artifacts: SummaryArtifacts) -> SectionDelta {
        var content = ""

        if !artifacts.filesCreated.isEmpty {
            content += "**Files Created:**\n"
            for file in artifacts.filesCreated.suffix(20) {
                content += "- `\(file)`\n"
            }
        }

        if !artifacts.filesModified.isEmpty {
            content += "\n**Files Modified:**\n"
            for file in artifacts.filesModified.suffix(20) {
                content += "- `\(file)`\n"
            }
        }

        if !artifacts.codeSnippets.isEmpty {
            content += "\n**Notable Code:**\n"
            for snippet in artifacts.codeSnippets.suffix(5) {
                content += "```\(snippet.language)\n\(snippet.preview)\n```\n"
            }
        }

        return updateSection(.artifacts, content: content)
    }

    /// Update issues section
    func updateIssues(_ issues: SummaryIssues) -> SectionDelta {
        var content = ""

        if !issues.errors.isEmpty {
            content += "**Errors:**\n"
            for error in issues.errors.suffix(10) {
                content += "- [\(formatTime(error.timestamp))] \(error.message)\n"
            }
        }

        if !issues.warnings.isEmpty {
            content += "\n**Warnings:**\n"
            for warning in issues.warnings.suffix(10) {
                content += "- [\(formatTime(warning.timestamp))] \(warning.message)\n"
            }
        }

        if !issues.blockers.isEmpty {
            content += "\n**Blockers:**\n"
            for blocker in issues.blockers {
                content += "- \(blocker)\n"
            }
        }

        return updateSection(.issues, content: content)
    }

    /// Update key decisions section
    func updateKeyDecisions(_ decisions: [String]) -> SectionDelta {
        var content = ""

        for (index, decision) in decisions.enumerated() {
            content += "\(index + 1). \(decision)\n"
        }

        return updateSection(.keyDecisions, content: content)
    }

    /// Update next best actions
    func updateNextActions(_ actions: [String]) -> SectionDelta {
        var content = ""

        for (index, action) in actions.enumerated() {
            content += "\(index + 1). \(action)\n"
        }

        return updateSection(.nextBestActions, content: content)
    }

    /// Update recent context with compressed events
    func updateRecentContext(events: [SessionEvent], maxEvents: Int = 30) -> SectionDelta {
        var content = ""

        let relevantEvents = events.filter { event in
            switch event.type {
            case .terminalOutput, .agentHeartbeat, .metricsUpdate:
                return false
            default:
                return true
            }
        }.suffix(maxEvents)

        for event in relevantEvents {
            let timeString = formatTime(event.timestamp)
            let summary = summarizeEvent(event)
            content += "- [\(timeString)] \(summary)\n"
        }

        return updateSection(.recentContext, content: content)
    }

    // MARK: - Document Generation

    /// Generate full document from current sections
    func generateDocument() -> String {
        var document = "# ASSISTANT.md\n\n"
        document += "_Session summary maintained by MaiFarm Assistant_\n\n"
        document += "---\n\n"

        let sortedSections = SummarySection.allCases.sorted { $0.order < $1.order }

        for section in sortedSections {
            if let sectionContent = sections[section], !sectionContent.content.isEmpty {
                document += "## \(section.rawValue)\n\n"
                document += sectionContent.content
                document += "\n\n"
            }
        }

        document += "---\n\n"
        document += "_Last updated: \(formatTime(Date()))_\n"

        documentHash = document.hashValue
        return document
    }

    /// Generate document with only modified sections
    func generateDifferentialDocument(previousDocument: String) -> (document: String, changedSections: [SummarySection]) {
        var changedSections: [SummarySection] = []
        var document = previousDocument

        // Parse previous document sections
        let previousSections = parseSections(from: previousDocument)

        // Find and replace changed sections
        for section in SummarySection.allCases {
            guard let currentContent = sections[section]?.content, !currentContent.isEmpty else { continue }

            let previousContent = previousSections[section] ?? ""

            if currentContent != previousContent {
                changedSections.append(section)

                // Replace section in document
                let sectionHeader = "## \(section.rawValue)"
                let newSectionContent = "\(sectionHeader)\n\n\(currentContent)\n\n"

                if let range = document.range(of: sectionHeader) {
                    // Find end of section
                    let afterHeader = document[range.upperBound...]
                    if let nextSection = afterHeader.range(of: "## ") {
                        let sectionEnd = afterHeader.distance(from: afterHeader.startIndex, to: nextSection.lowerBound)
                        let replaceEnd = document.index(range.lowerBound, offsetBy: sectionEnd + sectionHeader.count)
                        document.replaceSubrange(range.lowerBound..<replaceEnd, with: newSectionContent)
                    } else if let endRange = afterHeader.range(of: "---\n\n_Last") {
                        let sectionEnd = afterHeader.distance(from: afterHeader.startIndex, to: endRange.lowerBound)
                        let replaceEnd = document.index(range.lowerBound, offsetBy: sectionEnd + sectionHeader.count)
                        document.replaceSubrange(range.lowerBound..<replaceEnd, with: newSectionContent)
                    }
                } else {
                    // Section doesn't exist, add it
                    // Insert before footer
                    if let footerRange = document.range(of: "---\n\n_Last") {
                        document.insert(contentsOf: newSectionContent, at: footerRange.lowerBound)
                    }
                }
            }
        }

        // Update timestamp
        if let timestampRange = document.range(of: "_Last updated: [^_]+_", options: .regularExpression) {
            document.replaceSubrange(timestampRange, with: "_Last updated: \(formatTime(Date()))_")
        }

        return (document, changedSections)
    }

    /// Check if full rebuild is needed
    func needsFullRebuild() -> Bool {
        let timeSinceRebuild = Date().timeIntervalSince(lastFullRebuild)
        return timeSinceRebuild > fullRebuildInterval || deltaCount > maxDeltasBeforeRebuild
    }

    /// Mark full rebuild completed
    func markRebuilt() {
        lastFullRebuild = Date()
        deltaCount = 0
        pendingDeltas.removeAll()
    }

    // MARK: - Helpers

    private func parseSections(from document: String) -> [SummarySection: String] {
        var result: [SummarySection: String] = [:]

        for section in SummarySection.allCases {
            let pattern = "## \(section.rawValue)\n\n([\\s\\S]*?)(?=\n## |---\n\n_Last|$)"
            if let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: document, range: NSRange(document.startIndex..., in: document)),
               let contentRange = Range(match.range(at: 1), in: document) {
                result[section] = String(document[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        return result
    }

    private func summarizeEvent(_ event: SessionEvent) -> String {
        switch event.type {
        case .sessionStarted:
            return "Session started"
        case .sessionEnded:
            return "Session ended"
        case .agentStarted:
            return "Agent '\(event.agentName ?? "unknown")' started"
        case .agentCompleted:
            return "Agent '\(event.agentName ?? "unknown")' completed"
        case .agentFailed:
            return "Agent '\(event.agentName ?? "unknown")' failed"
        case .agentMessage:
            if case .agentMessage(let role, let content) = event.data {
                let preview = String(content.prefix(50))
                return "\(role.capitalized): \(preview)..."
            }
            return "Agent message"
        case .toolInvocation:
            if case .toolCall(let toolName, _) = event.data {
                return "Tool called: \(toolName)"
            }
            return "Tool invocation"
        case .toolResult:
            if case .toolResult(let toolName, _, let success) = event.data {
                return "Tool '\(toolName)' \(success ? "succeeded" : "failed")"
            }
            return "Tool result"
        case .fileCreated:
            if case .artifactCreated(let name, _, let path, _) = event.data {
                return "File created: \(path ?? name)"
            }
            return "File created"
        case .artifactModified:
            if case .fileOperation(_, let path, _) = event.data {
                return "File modified: \(path)"
            }
            return "File modified"
        case .errorOccurred:
            if case .error(let code, let message, _) = event.data {
                return "Error [\(code ?? "")]: \(message.prefix(40))"
            }
            return "Error occurred"
        default:
            return event.type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }

    private func formatNumber(_ number: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: number)) ?? "\(number)"
    }

    // MARK: - Statistics

    func getStatistics() -> DifferentialStatistics {
        let modifiedSections = sections.values.filter { section in
            Date().timeIntervalSince(section.lastModified) < 60
        }.count

        return DifferentialStatistics(
            totalSections: sections.count,
            recentlyModifiedSections: modifiedSections,
            pendingDeltas: pendingDeltas.count,
            totalDeltaCount: deltaCount,
            timeSinceRebuild: Date().timeIntervalSince(lastFullRebuild)
        )
    }

    /// Get pending deltas
    func getPendingDeltas() -> [SectionDelta] {
        pendingDeltas
    }

    /// Clear pending deltas
    func clearPendingDeltas() {
        pendingDeltas.removeAll()
    }
}

// MARK: - Statistics

struct DifferentialStatistics {
    let totalSections: Int
    let recentlyModifiedSections: Int
    let pendingDeltas: Int
    let totalDeltaCount: Int
    let timeSinceRebuild: TimeInterval

    var rebuildDue: Bool {
        timeSinceRebuild > 300 || totalDeltaCount > 50
    }
}

// MARK: - Summary-Specific Data Types
// These are distinct from SessionEvent types, used for differential summary formatting

struct SummaryGoals {
    let primaryGoal: String
    var subGoals: [SubGoal] = []

    struct SubGoal {
        let description: String
        var completed: Bool = false
    }
}

struct SummaryArtifacts {
    var filesCreated: [String] = []
    var filesModified: [String] = []
    var codeSnippets: [CodeSnippet] = []

    struct CodeSnippet {
        let language: String
        let preview: String
    }
}

struct SummaryIssues {
    var errors: [Issue] = []
    var warnings: [Issue] = []
    var blockers: [String] = []

    struct Issue {
        let message: String
        let timestamp: Date
    }
}
