//
//  SessionEventPersistence.swift
//  MaiFarm
//
//  Handles persistent storage of session events in JSONL format
//  Append-only log with atomic writes for durability
//

import Foundation
import os.log

// MARK: - Session Event Persistence

/// Thread-safe event persistence using append-only JSONL format
actor SessionEventPersistence {
    private let sessionId: String
    private let filePath: URL
    private let logger = Logger(subsystem: "app.maifarm", category: "EventPersistence")

    // Write buffer for batching
    private var writeBuffer: [SessionEvent] = []
    private let maxBufferSize = 20
    private var lastFlushTime = Date()
    private let flushInterval: TimeInterval = 2.0

    // File handle for appending
    private var fileHandle: FileHandle?

    // Stats
    private var totalEventsWritten: Int = 0
    private var totalBytesWritten: Int64 = 0

    // MARK: - Initialization

    init(sessionId: String) throws {
        self.sessionId = sessionId
        self.filePath = AssistantStorageManager.eventsFilePath(for: sessionId)

        // Create session directory
        _ = try AssistantStorageManager.createSessionDirectory(sessionId: sessionId)

        // Create or open file
        if !FileManager.default.fileExists(atPath: filePath.path) {
            FileManager.default.createFile(atPath: filePath.path, contents: nil)
        }

        // Open file handle for appending
        fileHandle = try FileHandle(forWritingTo: filePath)
        try fileHandle?.seekToEnd()

        logger.info("Event persistence initialized for session \(sessionId)")
    }

    deinit {
        // Note: Cannot call async flush from deinit
        // Caller must call flush() before releasing
        try? fileHandle?.close()
    }

    // MARK: - Writing

    /// Append a single event
    func append(_ event: SessionEvent) async {
        writeBuffer.append(event)

        // Flush if buffer is full or enough time has passed
        if writeBuffer.count >= maxBufferSize || Date().timeIntervalSince(lastFlushTime) > flushInterval {
            await flush()
        }
    }

    /// Append multiple events
    func appendBatch(_ events: [SessionEvent]) async {
        writeBuffer.append(contentsOf: events)

        if writeBuffer.count >= maxBufferSize {
            await flush()
        }
    }

    /// Flush buffered events to disk
    func flush() async {
        guard !writeBuffer.isEmpty else { return }

        let eventsToWrite = writeBuffer
        writeBuffer.removeAll(keepingCapacity: true)
        lastFlushTime = Date()

        await writeEvents(eventsToWrite)
    }

    private func writeEvents(_ events: [SessionEvent]) async {
        var jsonLines = ""

        for event in events {
            if let line = event.toJSONL() {
                jsonLines.append(line)
            }
        }

        guard !jsonLines.isEmpty, let data = jsonLines.data(using: .utf8) else {
            return
        }

        do {
            try fileHandle?.write(contentsOf: data)
            try fileHandle?.synchronize()

            totalEventsWritten += events.count
            totalBytesWritten += Int64(data.count)

            logger.debug("Wrote \(events.count) events (\(data.count) bytes)")
        } catch {
            logger.error("Failed to write events: \(error.localizedDescription)")

            // Put events back in buffer for retry
            writeBuffer.insert(contentsOf: events, at: 0)
        }
    }

    // MARK: - Reading

    /// Read all events from the file
    func readAll() async -> [SessionEvent] {
        // Flush any pending writes first
        await flush()

        do {
            let content = try String(contentsOf: filePath, encoding: .utf8)
            return parseJSONL(content)
        } catch {
            logger.error("Failed to read events: \(error.localizedDescription)")
            return []
        }
    }

    /// Read events from a specific offset
    func readFrom(offset: Int) async -> [SessionEvent] {
        let allEvents = await readAll()
        guard offset < allEvents.count else { return [] }
        return Array(allEvents.suffix(from: offset))
    }

    /// Read the last N events
    func readLast(_ count: Int) async -> [SessionEvent] {
        let allEvents = await readAll()
        return Array(allEvents.suffix(count))
    }

    /// Count total events
    func eventCount() async -> Int {
        // Approximate count from file if not tracking
        await flush()

        do {
            let content = try String(contentsOf: filePath, encoding: .utf8)
            return content.components(separatedBy: "\n").filter { !$0.isEmpty }.count
        } catch {
            return totalEventsWritten
        }
    }

    // MARK: - Parsing

    private func parseJSONL(_ content: String) -> [SessionEvent] {
        content
            .components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .compactMap { SessionEvent.fromJSONL($0) }
    }

    // MARK: - Stats

    func getStats() -> PersistenceStats {
        PersistenceStats(
            sessionId: sessionId,
            totalEventsWritten: totalEventsWritten,
            totalBytesWritten: totalBytesWritten,
            bufferSize: writeBuffer.count,
            filePath: filePath.path
        )
    }

    struct PersistenceStats {
        let sessionId: String
        let totalEventsWritten: Int
        let totalBytesWritten: Int64
        let bufferSize: Int
        let filePath: String

        var formattedSize: String {
            ByteCountFormatter.string(fromByteCount: totalBytesWritten, countStyle: .file)
        }
    }
}

// MARK: - Event Query Helpers

extension SessionEventPersistence {
    /// Get events filtered by type
    func eventsByType(_ type: SessionEventType) async -> [SessionEvent] {
        let events = await readAll()
        return events.filter { $0.type == type }
    }

    /// Get events for a specific agent
    func eventsForAgent(_ agentId: String) async -> [SessionEvent] {
        let events = await readAll()
        return events.filter { $0.agentId == agentId }
    }

    /// Get events in a time range
    func eventsInRange(from: Date, to: Date) async -> [SessionEvent] {
        let events = await readAll()
        return events.filter { $0.timestamp >= from && $0.timestamp <= to }
    }

    /// Get error events
    func errorEvents() async -> [SessionEvent] {
        let events = await readAll()
        return events.filter { $0.type == .errorOccurred || $0.type == .toolError || $0.type == .agentFailed }
    }

    /// Get artifact events
    func artifactEvents() async -> [SessionEvent] {
        let events = await readAll()
        return events.filter {
            $0.type == .artifactCreated || $0.type == .harvestItem || $0.type == .barnItem || $0.type == .fileCreated
        }
    }

    /// Get a summary of event distribution
    func eventDistribution() async -> [SessionEventType: Int] {
        let events = await readAll()
        var distribution: [SessionEventType: Int] = [:]

        for event in events {
            distribution[event.type, default: 0] += 1
        }

        return distribution
    }
}

// MARK: - Incremental Reader

/// Reads events incrementally for streaming/resumption
actor IncrementalEventReader {
    private let filePath: URL
    private var readOffset: Int = 0
    private var cachedEvents: [SessionEvent] = []
    private var lastReadTime: Date?

    init(sessionId: String) {
        self.filePath = AssistantStorageManager.eventsFilePath(for: sessionId)
    }

    /// Read new events since last read
    func readNewEvents() async -> [SessionEvent] {
        guard let content = try? String(contentsOf: filePath, encoding: .utf8) else {
            return []
        }

        let lines = content.components(separatedBy: "\n").filter { !$0.isEmpty }

        guard lines.count > readOffset else {
            return []
        }

        let newLines = Array(lines.suffix(from: readOffset))
        let newEvents = newLines.compactMap { SessionEvent.fromJSONL($0) }

        readOffset = lines.count
        lastReadTime = Date()

        return newEvents
    }

    /// Reset to beginning
    func reset() {
        readOffset = 0
        cachedEvents.removeAll()
        lastReadTime = nil
    }

    /// Get current position
    func getOffset() -> Int {
        readOffset
    }
}

// MARK: - Event Export

extension SessionEventPersistence {
    /// Export events to a different format
    func exportAsJSON() async -> Data? {
        let events = await readAll()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        return try? encoder.encode(events)
    }

    /// Export a summary suitable for sending to LLM
    func exportForLLM(maxTokens: Int = 4000) async -> String {
        let events = await readAll()

        var summary = "## Session Events Summary\n\n"
        var tokenEstimate = 50 // Header

        // Group events by type
        var eventsByType: [SessionEventType: [SessionEvent]] = [:]
        for event in events {
            eventsByType[event.type, default: []].append(event)
        }

        // Add event counts
        summary += "### Event Counts\n"
        for (type, typeEvents) in eventsByType.sorted(by: { $0.value.count > $1.value.count }) {
            summary += "- \(type.rawValue): \(typeEvents.count)\n"
            tokenEstimate += 10
        }
        summary += "\n"

        // Add key events (limit to stay within token budget)
        let keyEventTypes: [SessionEventType] = [
            .userGoal, .orchestratorPlanCreated, .agentStarted, .agentCompleted,
            .errorOccurred, .artifactCreated, .toolInvocation
        ]

        for eventType in keyEventTypes {
            guard let typeEvents = eventsByType[eventType], !typeEvents.isEmpty else { continue }
            guard tokenEstimate < maxTokens - 500 else { break }

            summary += "### \(eventType.rawValue)\n"

            for event in typeEvents.prefix(5) {
                let eventSummary = summarizeEvent(event)
                summary += "- \(eventSummary)\n"
                tokenEstimate += eventSummary.count / 4 // Rough token estimate
            }

            if typeEvents.count > 5 {
                summary += "- ... and \(typeEvents.count - 5) more\n"
            }

            summary += "\n"
        }

        return summary
    }

    private func summarizeEvent(_ event: SessionEvent) -> String {
        let timestamp = formatTimestamp(event.timestamp)

        switch event.data {
        case .userGoal(let goal, _):
            return "[\(timestamp)] Goal: \(goal.prefix(100))"

        case .agentStatus(let status, let task):
            let taskPart = task.map { " - \($0.prefix(50))" } ?? ""
            return "[\(timestamp)] \(event.agentName ?? event.agentId ?? "Agent"): \(status)\(taskPart)"

        case .error(_, let message, _):
            return "[\(timestamp)] Error: \(message.prefix(80))"

        case .toolCall(let name, let input):
            return "[\(timestamp)] Tool: \(name) - \(input.prefix(50))"

        case .artifactCreated(let name, let type, _, _):
            return "[\(timestamp)] Created: \(name) (\(type))"

        case .planUpdate(let summary, _):
            return "[\(timestamp)] Plan: \(summary.prefix(80))"

        default:
            return "[\(timestamp)] \(event.type.rawValue)"
        }
    }

    private func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: date)
    }
}
