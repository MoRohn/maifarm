//
//  BarnView.swift
//  MaiFarm
//
//  Barn View - Storage and management of harvested outputs
//

import SwiftUI
import UniformTypeIdentifiers
import os.log

// MARK: - Harvest Result Model (Codable)

struct HarvestResult: Identifiable, Codable {
    let id: String
    let name: String
    let taskDescription: String
    let taskType: String
    let files: Int
    let createdAt: Date
    let completedAt: Date
    let status: String
    let type: String // "quicktask", "farm", "gowild"

    var date: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }
}

// MARK: - Harvest Result Store

@MainActor
final class HarvestResultStore: ObservableObject, @unchecked Sendable {
    static let shared = HarvestResultStore()

    private let logger = Logger(subsystem: "app.maifarm", category: "HarvestStore")
    private let storageKey = "maifarm.harvest.results"

    @Published private(set) var results: [HarvestResult] = []
    @Published private(set) var isLoading = false

    private init() {
        loadFromStorage()
        logger.info("HarvestResultStore initialized with \(self.results.count) items")
    }

    func addResult(_ result: HarvestResult) {
        results.insert(result, at: 0)
        saveToStorage()
        logger.info("Added harvest result: \(result.name)")
    }

    func addQuickTaskResult(name: String, taskDescription: String, taskType: String = "code") -> HarvestResult {
        let result = HarvestResult(
            id: UUID().uuidString,
            name: name,
            taskDescription: taskDescription,
            taskType: taskType,
            files: Int.random(in: 1...10),
            createdAt: Date(),
            completedAt: Date(),
            status: "completed",
            type: "quicktask"
        )
        addResult(result)
        return result
    }

    func recentResults(limit: Int = 10) -> [HarvestResult] {
        Array(results.prefix(limit))
    }

    func thisWeekResults() -> [HarvestResult] {
        let weekAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
        return results.filter { $0.createdAt >= weekAgo }
    }

    func deleteResult(id: String) {
        results.removeAll { $0.id == id }
        saveToStorage()
        logger.info("Deleted harvest result: \(id)")
    }

    private func loadFromStorage() {
        isLoading = true
        defer { isLoading = false }

        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            initializeWithDemoData()
            return
        }

        do {
            results = try JSONDecoder().decode([HarvestResult].self, from: data)
        } catch {
            logger.error("Failed to decode harvest results: \(error.localizedDescription)")
            initializeWithDemoData()
        }
    }

    private func saveToStorage() {
        do {
            let data = try JSONEncoder().encode(results)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            logger.error("Failed to encode harvest results: \(error.localizedDescription)")
        }
    }

    private func initializeWithDemoData() {
        results = [
            HarvestResult(id: UUID().uuidString, name: "OAuth Implementation",
                         taskDescription: "Implement OAuth 2.0 flow", taskType: "code",
                         files: 15, createdAt: Date(), completedAt: Date(),
                         status: "completed", type: "quicktask"),
            HarvestResult(id: UUID().uuidString, name: "API Documentation",
                         taskDescription: "Generate API docs", taskType: "docs",
                         files: 8, createdAt: Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date(),
                         completedAt: Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date(),
                         status: "completed", type: "quicktask"),
            HarvestResult(id: UUID().uuidString, name: "Competitor Analysis",
                         taskDescription: "Research competitors", taskType: "research",
                         files: 1, createdAt: Calendar.current.date(byAdding: .day, value: -3, to: Date()) ?? Date(),
                         completedAt: Calendar.current.date(byAdding: .day, value: -3, to: Date()) ?? Date(),
                         status: "completed", type: "gowild")
        ]
        saveToStorage()
    }
}

// MARK: - Adaptive Barn View
struct AdaptiveBarnView: View {
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @StateObject private var harvestStore = HarvestResultStore.shared
    @State private var selectedItem: BarnItem? = nil
    @State private var searchText = ""
    @State private var itemToDelete: BarnItem? = nil
    @State private var showingDeleteAlert = false
    @State private var itemToShare: BarnItem? = nil
    @State private var showingShareSheet = false
    @Environment(\.editMode) private var editMode

    // Computed barn items from HarvestResultStore
    private var recentItems: [BarnItem] {
        harvestStore.recentResults(limit: 5).map { result in
            BarnItem(name: result.name, files: result.files, date: result.date, type: result.taskType)
        }
    }

    private var weekItems: [BarnItem] {
        let recent = Set(harvestStore.recentResults(limit: 5).map { $0.id })
        return harvestStore.thisWeekResults()
            .filter { !recent.contains($0.id) }
            .map { result in
                BarnItem(name: result.name, files: result.files, date: result.date, type: result.taskType)
            }
    }

    // Filtered items based on search
    private var filteredRecentItems: [BarnItem] {
        if searchText.isEmpty { return recentItems }
        return recentItems.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    private var filteredWeekItems: [BarnItem] {
        if searchText.isEmpty { return weekItems }
        return weekItems.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List {
                if filteredRecentItems.isEmpty && filteredWeekItems.isEmpty {
                    Section {
                        VStack(spacing: 16) {
                            Image(systemName: "archivebox")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary)
                            Text("No Harvests Yet")
                                .font(.headline)
                            Text("Complete a Quick Task or Farm to see results here.")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    }
                } else {
                    if !filteredRecentItems.isEmpty {
                        Section("Recent") {
                            ForEach(filteredRecentItems) { item in
                                BarnItemRowTappable(
                                    item: item,
                                    action: { selectedItem = item },
                                    onShare: {
                                        itemToShare = item
                                        shareItem(item)
                                    },
                                    onExport: { exportItem(item) },
                                    onDelete: {
                                        itemToDelete = item
                                        showingDeleteAlert = true
                                    }
                                )
                            }
                        }
                    }

                    if !filteredWeekItems.isEmpty {
                        Section("This Week") {
                            ForEach(filteredWeekItems) { item in
                                BarnItemRowTappable(
                                    item: item,
                                    action: { selectedItem = item },
                                    onShare: {
                                        itemToShare = item
                                        shareItem(item)
                                    },
                                    onExport: { exportItem(item) },
                                    onDelete: {
                                        itemToDelete = item
                                        showingDeleteAlert = true
                                    }
                                )
                            }
                        }
                    }
                }
            }
            .navigationTitle("Barn")
            .searchable(text: $searchText, prompt: "Search harvests")
            .scrollContentBackground(.hidden)
            .maiFarmBackground()
            .sheet(item: $selectedItem) { item in
                BarnItemDetailSheet(item: item)
            }
            .alert("Delete Harvest", isPresented: $showingDeleteAlert) {
                Button("Cancel", role: .cancel) {
                    itemToDelete = nil
                }
                Button("Delete", role: .destructive) {
                    if let item = itemToDelete {
                        deleteItem(item)
                    }
                }
            } message: {
                Text("Are you sure you want to delete '\(itemToDelete?.name ?? "")'? This action cannot be undone.")
            }
        }
    }

    private func deleteItem(_ item: BarnItem) {
        // Find and delete from HarvestResultStore by matching name
        if let result = harvestStore.results.first(where: { $0.name == item.name }) {
            harvestStore.deleteResult(id: result.id)
        }
        AppState.shared.showToast("'\(item.name)' deleted", type: .success)
        itemToDelete = nil
    }

    private func shareItem(_ item: BarnItem) {
        let shareText = """
        MaiFarm Harvest: \(item.name)
        Type: \(item.type.capitalized)
        Files: \(item.files)
        Date: \(item.date)

        Harvested with MaiFarm - AI-Powered Development
        """

        let activityItems: [Any] = [shareText]

        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            let activityVC = UIActivityViewController(
                activityItems: activityItems,
                applicationActivities: nil
            )

            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = rootVC.view
                popover.sourceRect = CGRect(x: rootVC.view.bounds.midX, y: rootVC.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }

            rootVC.present(activityVC, animated: true)
        } else {
            AppState.shared.showToast("Unable to share", type: .error)
        }
    }

    private func exportItem(_ item: BarnItem) {
        let exportContent = """
        # MaiFarm Harvest Export

        ## \(item.name)

        - **Type:** \(item.type.capitalized)
        - **Files:** \(item.files)
        - **Date:** \(item.date)

        ---

        *Exported from MaiFarm - AI-Powered Development*
        """

        let fileName = "\(item.name.replacingOccurrences(of: " ", with: "_"))_harvest.md"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        do {
            try exportContent.write(to: tempURL, atomically: true, encoding: .utf8)

            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let rootVC = windowScene.windows.first?.rootViewController {
                let documentPicker = UIDocumentPickerViewController(forExporting: [tempURL], asCopy: true)
                rootVC.present(documentPicker, animated: true)
                AppState.shared.showToast("Select export location", type: .info)
            }
        } catch {
            AppState.shared.showToast("Export failed: \(error.localizedDescription)", type: .error)
        }
    }
}

// MARK: - Barn Item Model
struct BarnItem: Identifiable {
    let id = UUID()
    let name: String
    let files: Int
    let date: String
    let type: String

    var icon: String {
        switch type {
        case "code": return "doc.text.fill"
        case "docs": return "doc.richtext.fill"
        case "research": return "magnifyingglass.circle.fill"
        default: return "doc.fill"
        }
    }

    var iconColor: Color {
        switch type {
        case "code": return .blue
        case "docs": return .purple
        case "research": return .orange
        default: return .gray
        }
    }
}

// MARK: - Barn Item Row
struct BarnItemRow: View {
    let name: String
    let files: Int
    let date: String

    var body: some View {
        HStack {
            Image(systemName: "doc.fill")
                .foregroundColor(.blue)

            VStack(alignment: .leading) {
                Text(name)
                    .font(.headline)
                Text("\(files) files")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text(date)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Barn Item Row Tappable
struct BarnItemRowTappable: View {
    let item: BarnItem
    let action: () -> Void
    var onShare: (() -> Void)? = nil
    var onExport: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: item.icon)
                    .foregroundColor(item.iconColor)

                VStack(alignment: .leading) {
                    Text(item.name)
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text("\(item.files) files")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text(item.date)
                    .font(.caption)
                    .foregroundColor(.secondary)

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if let onDelete = onDelete {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
            if let onShare = onShare {
                Button(action: onShare) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .tint(.blue)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if let onExport = onExport {
                Button(action: onExport) {
                    Label("Export", systemImage: "arrow.down.doc")
                }
                .tint(.green)
            }
        }
        .contextMenu {
            Button(action: action) {
                Label("View Details", systemImage: "info.circle")
            }
            if let onExport = onExport {
                Button(action: onExport) {
                    Label("Export to Files", systemImage: "arrow.down.doc")
                }
            }
            if let onShare = onShare {
                Button(action: onShare) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
            Divider()
            if let onDelete = onDelete {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete Harvest", systemImage: "trash")
                }
            }
        }
    }
}

// MARK: - Barn Item Detail Sheet
struct BarnItemDetailSheet: View {
    let item: BarnItem
    @Environment(\.dismiss) var dismiss
    @State private var showingShareSheet = false
    @State private var showingExporter = false
    @State private var showingDeleteAlert = false
    @State private var exportURL: URL?
    @State private var isExporting = false
    @State private var exportError: String?
    @State private var showExportSuccess = false

    // Create export data from barn item
    private var harvestExportData: HarvestExportData {
        HarvestExportData(
            id: item.id.uuidString,
            name: item.name,
            farmId: "farm-\(item.id.uuidString.prefix(8))",
            farmName: item.name,
            createdAt: Date(),
            completedAt: Date(),
            status: "completed",
            agentCount: 3,
            fileCount: item.files,
            files: sampleFileMetadata,
            summary: "Harvest containing \(item.files) files"
        )
    }

    private var sampleFileMetadata: [HarvestFileMetadata] {
        [
            HarvestFileMetadata(name: "oauth.ts", size: 4300, type: "typescript", modifiedAt: Date()),
            HarvestFileMetadata(name: "middleware.ts", size: 2150, type: "typescript", modifiedAt: Date()),
            HarvestFileMetadata(name: "types.ts", size: 1536, type: "typescript", modifiedAt: Date()),
            HarvestFileMetadata(name: "README.md", size: 3891, type: "markdown", modifiedAt: Date())
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    headerSection

                    // Files list
                    filesSection

                    // Actions
                    actionsSection

                    // Export error message
                    if let error = exportError {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Harvest Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            // File Exporter
            .fileExporter(
                isPresented: $showingExporter,
                document: HarvestJSONDocument(harvest: harvestExportData),
                contentType: .json,
                defaultFilename: "\(item.name.sanitizedFilename).json"
            ) { result in
                switch result {
                case .success(let url):
                    exportURL = url
                    showExportSuccess = true
                    HapticManager.shared.notify(.success)
                case .failure(let error):
                    exportError = error.localizedDescription
                    HapticManager.shared.notify(.error)
                }
            }
            // Delete confirmation
            .alert("Delete Harvest", isPresented: $showingDeleteAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task {
                        await AppState.shared.deleteHarvest(item.id.uuidString)
                    }
                    dismiss()
                }
            } message: {
                Text("Are you sure you want to delete this harvest? This cannot be undone.")
            }
            // Export success
            .alert("Export Successful", isPresented: $showExportSuccess) {
                Button("OK", role: .cancel) {}
                if let url = exportURL {
                    Button("Show in Files") {
                        #if os(macOS) || targetEnvironment(macCatalyst)
                        NSWorkspace.shared.activateFileViewerSelecting([url])
                        #endif
                    }
                }
            } message: {
                Text("Harvest exported successfully to Files.")
            }
        }
    }

    // MARK: - Header Section
    @ViewBuilder
    private var headerSection: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(item.iconColor.opacity(0.2))
                    .frame(width: 80, height: 80)

                Image(systemName: item.icon)
                    .font(.system(size: 36))
                    .foregroundColor(item.iconColor)
            }

            Text(item.name)
                .font(.title2)
                .fontWeight(.bold)

            HStack {
                Label("\(item.files) files", systemImage: "doc.on.doc")
                Text("•")
                Text(item.date)
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding()
    }

    // MARK: - Files Section
    @ViewBuilder
    private var filesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Files")
                .font(.headline)
                .padding(.horizontal)

            VStack(spacing: 1) {
                FileRow(name: "oauth.ts", size: "4.2 KB")
                FileRow(name: "middleware.ts", size: "2.1 KB")
                FileRow(name: "types.ts", size: "1.5 KB")
                FileRow(name: "README.md", size: "3.8 KB")
                FileRow(name: "tests/", size: "12.4 KB")
            }
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(12)
            .padding(.horizontal)
        }
    }

    // MARK: - Actions Section
    @ViewBuilder
    private var actionsSection: some View {
        VStack(spacing: 12) {
            // Share Button with ShareLink (iOS 16+)
            ShareLink(
                item: harvestExportData.name,
                subject: Text("MaiFarm Harvest: \(item.name)"),
                message: Text("Sharing harvest '\(item.name)' with \(item.files) files.")
            ) {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                    Text("Share")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(12)
            }
            .foregroundColor(.primary)

            // Export to Files Button
            Button(action: { showingExporter = true }) {
                HStack {
                    if isExporting {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "arrow.down.doc")
                    }
                    Text("Export to Files")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(12)
            }
            .foregroundColor(.primary)
            .disabled(isExporting)

            // Delete Button
            Button(action: { showingDeleteAlert = true }) {
                HStack {
                    Image(systemName: "trash")
                    Text("Delete")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.red.opacity(0.1))
                .foregroundColor(.red)
                .cornerRadius(12)
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - File Row
struct FileRow: View {
    let name: String
    let size: String

    var body: some View {
        HStack {
            Image(systemName: name.hasSuffix("/") ? "folder.fill" : "doc.text")
                .foregroundColor(name.hasSuffix("/") ? .blue : .gray)

            Text(name)
                .font(.subheadline)

            Spacer()

            Text(size)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.tertiarySystemGroupedBackground))
    }
}

// MARK: - Previews
#Preview("Barn View") {
    AdaptiveBarnView()
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Barn Item Row") {
    List {
        BarnItemRowTappable(
            item: BarnItem(name: "OAuth Implementation", files: 15, date: "Today", type: "code"),
            action: {}
        )
        BarnItemRowTappable(
            item: BarnItem(name: "API Documentation", files: 8, date: "Yesterday", type: "docs"),
            action: {}
        )
    }
}
