//
//  AssistantSummaryView.swift
//  MaiFarm
//
//  UI components for displaying and interacting with the Assistant summary
//

import SwiftUI
import UniformTypeIdentifiers

// MARK: - Assistant Summary View

struct AssistantSummaryView: View {
    let sessionId: String
    @State private var summaryContent: String = ""
    @State private var isLoading = true
    @State private var lastUpdated: Date?
    @State private var showShareSheet = false
    @State private var showFullScreen = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView("Loading summary...")
                        .padding()
                } else if summaryContent.isEmpty {
                    EmptyStateView()
                } else {
                    SummaryContentView(content: summaryContent)
                }
            }
            .navigationTitle("Assistant Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }

                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        Task { await refreshSummary() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }

                    Menu {
                        Button {
                            copyToClipboard()
                        } label: {
                            Label("Copy Summary", systemImage: "doc.on.doc")
                        }

                        Button {
                            showShareSheet = true
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }

                        Button {
                            showFullScreen = true
                        } label: {
                            Label("Full Screen", systemImage: "arrow.up.left.and.arrow.down.right")
                        }

                        Divider()

                        Button(role: .destructive) {
                            Task { await deleteSessionData() }
                        } label: {
                            Label("Delete Session Data", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                AssistantShareSheet(items: [summaryContent])
            }
            .fullScreenCover(isPresented: $showFullScreen) {
                FullScreenSummaryView(content: summaryContent, sessionId: sessionId)
            }
            .task {
                await loadSummary()
            }
        }
    }

    private func loadSummary() async {
        isLoading = true
        if let content = await AssistantService.shared.getSummaryContent() {
            summaryContent = content
            lastUpdated = Date()
        }
        isLoading = false
    }

    private func refreshSummary() async {
        await AssistantService.shared.refreshSummary()
        await loadSummary()
    }

    private func copyToClipboard() {
        UIPasteboard.general.string = summaryContent
        HapticManager.shared.notify(.success)
    }

    private func deleteSessionData() async {
        try? AssistantStorageManager.deleteSession(sessionId: sessionId)
        dismiss()
    }
}

// MARK: - Summary Content View

struct SummaryContentView: View {
    let content: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(parseMarkdownSections(content), id: \.title) { section in
                SectionView(section: section)
            }
        }
        .padding()
    }

    private func parseMarkdownSections(_ markdown: String) -> [MarkdownSection] {
        var sections: [MarkdownSection] = []
        var currentTitle = ""
        var currentContent = ""

        for line in markdown.components(separatedBy: "\n") {
            if line.hasPrefix("## ") {
                if !currentTitle.isEmpty || !currentContent.isEmpty {
                    sections.append(MarkdownSection(title: currentTitle, content: currentContent.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
                currentTitle = String(line.dropFirst(3))
                currentContent = ""
            } else if line.hasPrefix("# ") {
                if !currentTitle.isEmpty || !currentContent.isEmpty {
                    sections.append(MarkdownSection(title: currentTitle, content: currentContent.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
                currentTitle = String(line.dropFirst(2))
                currentContent = ""
            } else {
                currentContent += line + "\n"
            }
        }

        if !currentTitle.isEmpty || !currentContent.isEmpty {
            sections.append(MarkdownSection(title: currentTitle, content: currentContent.trimmingCharacters(in: .whitespacesAndNewlines)))
        }

        return sections
    }
}

struct MarkdownSection: Hashable {
    let title: String
    let content: String
}

struct SectionView: View {
    let section: MarkdownSection
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !section.title.isEmpty {
                Button {
                    withAnimation { isExpanded.toggle() }
                } label: {
                    HStack {
                        Image(systemName: sectionIcon)
                            .foregroundColor(sectionColor)
                            .frame(width: 24)

                        Text(section.title)
                            .font(.headline)
                            .foregroundColor(.primary)

                        Spacer()

                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                }
                .buttonStyle(.plain)
            }

            if isExpanded && !section.content.isEmpty {
                Text(section.content)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.secondary)
                    .textSelection(.enabled)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private var sectionIcon: String {
        let title = section.title.lowercased()
        if title.contains("goal") { return "target" }
        if title.contains("status") { return "chart.bar" }
        if title.contains("progress") { return "list.bullet" }
        if title.contains("artifact") { return "doc.fill" }
        if title.contains("issue") || title.contains("error") { return "exclamationmark.triangle" }
        if title.contains("action") { return "arrow.right.circle" }
        if title.contains("context") { return "text.quote" }
        if title.contains("decision") || title.contains("plan") { return "lightbulb" }
        return "doc.text"
    }

    private var sectionColor: Color {
        let title = section.title.lowercased()
        if title.contains("goal") { return .blue }
        if title.contains("status") { return .green }
        if title.contains("progress") { return .purple }
        if title.contains("artifact") { return .orange }
        if title.contains("issue") || title.contains("error") { return .red }
        if title.contains("action") { return .green }
        return .gray
    }
}

// MARK: - Empty State View

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Summary Available")
                .font(.headline)

            Text("The Assistant summary will appear here once the session generates content.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
    }
}

// MARK: - Full Screen Summary View

struct FullScreenSummaryView: View {
    let content: String
    let sessionId: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(content)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .padding()
            }
            .navigationTitle("ASSISTANT.md")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Share Sheet

struct AssistantShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Assistant Status Badge

struct AssistantStatusBadge: View {
    @State private var status: AssistantStatus = .idle
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.color)
                .frame(width: 8, height: 8)
                .scaleEffect(isAnimating ? 1.2 : 1.0)
                .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isAnimating)

            Text(status.displayName)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(status.color.opacity(0.1))
        .cornerRadius(12)
        .task {
            await updateStatus()
        }
    }

    private func updateStatus() async {
        if await AssistantService.shared.isActive() {
            if let stallStatus = await AssistantService.shared.getStallStatus(), stallStatus.isStalled {
                status = .stalled
            } else if let nudgeStatus = await AssistantService.shared.getNudgeStatus(),
                      nudgeStatus.state == .awaitingResponse {
                status = .nudging
            } else {
                status = .running
            }
            isAnimating = true
        } else {
            status = .idle
            isAnimating = false
        }
    }
}

enum AssistantStatus {
    case idle
    case running
    case stalled
    case nudging

    var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .running: return "Active"
        case .stalled: return "Stalled"
        case .nudging: return "Nudging..."
        }
    }

    var color: Color {
        switch self {
        case .idle: return .gray
        case .running: return .green
        case .stalled: return .orange
        case .nudging: return .blue
        }
    }
}

// MARK: - Assistant Mini View (for embedding in farm views)

struct AssistantMiniView: View {
    let sessionId: String
    @State private var previewContent: String = ""
    @State private var showFullSummary = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "brain")
                    .foregroundColor(.purple)

                Text("Assistant")
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                AssistantStatusBadge()
            }

            if !previewContent.isEmpty {
                Text(previewContent)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
            }

            HStack {
                Button {
                    showFullSummary = true
                } label: {
                    Text("View Summary")
                        .font(.caption)
                }

                Spacer()

                Button {
                    copyPreview()
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
        .sheet(isPresented: $showFullSummary) {
            AssistantSummaryView(sessionId: sessionId)
        }
        .task {
            await loadPreview()
        }
    }

    private func loadPreview() async {
        if let content = await AssistantService.shared.getSummaryContent() {
            // Extract first few lines
            let lines = content.components(separatedBy: "\n")
                .filter { !$0.isEmpty && !$0.hasPrefix("#") }
                .prefix(4)
            previewContent = lines.joined(separator: "\n")
        }
    }

    private func copyPreview() {
        Task {
            if let content = await AssistantService.shared.getSummaryContent() {
                UIPasteboard.general.string = content
                HapticManager.shared.notify(.success)
            }
        }
    }
}

// MARK: - Stall Alert View

struct StallAlertView: View {
    let stallStatus: StallStatus
    let onDismiss: () -> Void
    let onNudge: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                    .font(.title2)

                Text("Session Stalled")
                    .font(.headline)

                Spacer()

                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }

            Text(stallStatus.reason ?? "No activity detected")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                ForEach(stallStatus.signalsChecked.prefix(4), id: \.name) { signal in
                    SignalBadge(signal: signal)
                }
            }

            HStack(spacing: 12) {
                Button(role: .cancel) {
                    onDismiss()
                } label: {
                    Text("Dismiss")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    onNudge()
                } label: {
                    Text("Send Nudge")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(radius: 10)
    }
}

struct SignalBadge: View {
    let signal: StallStatus.StallSignal

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: signal.passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(signal.passed ? .green : .red)
                .font(.caption)

            Text(signal.name.replacingOccurrences(of: "_", with: " "))
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }
}

// MARK: - Session Storage Info View

struct SessionStorageInfoView: View {
    @State private var sessionCount = 0
    @State private var totalSize: Int64 = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "folder.fill")
                    .foregroundColor(.blue)

                Text("Session Storage")
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()
            }

            HStack {
                VStack(alignment: .leading) {
                    Text("\(sessionCount)")
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Sessions")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    Text(formattedSize)
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Used")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Button(role: .destructive) {
                cleanupOldSessions()
            } label: {
                Label("Clean Up Old Sessions", systemImage: "trash")
                    .font(.caption)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
        .task {
            loadStorageInfo()
        }
    }

    private var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: totalSize, countStyle: .file)
    }

    private func loadStorageInfo() {
        sessionCount = AssistantStorageManager.listSessionIds().count
        totalSize = AssistantStorageManager.getTotalStorageUsed()
    }

    private func cleanupOldSessions() {
        AssistantStorageManager.cleanupOldSessions(olderThan: 30)
        loadStorageInfo()
        HapticManager.shared.notify(.success)
    }
}
