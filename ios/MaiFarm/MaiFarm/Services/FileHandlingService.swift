//
//  FileHandlingService.swift
//  MaiFarm
//
//  Cross-platform file handling for iOS, iPadOS, and macOS
//  Handles attachments, uploads, downloads, and file exports
//

import SwiftUI
import UniformTypeIdentifiers
import PhotosUI

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AppKit)
import AppKit
#endif

// MARK: - File Handling Service

@MainActor
final class FileHandlingService: ObservableObject, @unchecked Sendable {
    static let shared = FileHandlingService()

    @Published var isExporting = false
    @Published var isImporting = false
    @Published var exportError: Error?
    @Published var importError: Error?

    private let fileManager = FileManager.default

    // MARK: - Document Directories

    var documentsDirectory: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    var harvestsDirectory: URL {
        let url = documentsDirectory.appendingPathComponent("Harvests", isDirectory: true)
        try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    var tempDirectory: URL {
        fileManager.temporaryDirectory
    }

    // MARK: - Export Harvest to File

    func exportHarvest(_ harvest: HarvestExportData) async throws -> URL {
        let filename = "\(harvest.name.sanitizedFilename)_\(Date().ISO8601Format()).json"
        let fileURL = tempDirectory.appendingPathComponent(filename)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(harvest)
        try data.write(to: fileURL)

        return fileURL
    }

    // MARK: - Export as ZIP

    func exportHarvestAsZip(_ harvest: HarvestExportData, files: [LocalHarvestFile]) async throws -> URL {
        let folderName = harvest.name.sanitizedFilename
        let folderURL = tempDirectory.appendingPathComponent(folderName, isDirectory: true)

        // Create folder - clean up existing first
        do {
            if fileManager.fileExists(atPath: folderURL.path) {
                try fileManager.removeItem(at: folderURL)
            }
        } catch {
            // Log but continue - folder might not exist
            print("Warning: Could not remove existing folder: \(error.localizedDescription)")
        }

        try fileManager.createDirectory(at: folderURL, withIntermediateDirectories: true)

        // Write manifest
        let manifestURL = folderURL.appendingPathComponent("manifest.json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let manifestData = try encoder.encode(harvest)
        try manifestData.write(to: manifestURL)

        // Write files
        for file in files {
            let fileURL = folderURL.appendingPathComponent(file.name)
            if let content = file.content {
                try content.write(to: fileURL, atomically: true, encoding: .utf8)
            }
        }

        // Create ZIP archive
        let zipURL = tempDirectory.appendingPathComponent("\(folderName).zip")

        // Clean up existing zip file if present
        if fileManager.fileExists(atPath: zipURL.path) {
            try fileManager.removeItem(at: zipURL)
        }

        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var copyError: Error?

        coordinator.coordinate(readingItemAt: folderURL, options: .forUploading, error: &coordinationError) { zipSourceURL in
            do {
                try fileManager.copyItem(at: zipSourceURL, to: zipURL)
            } catch {
                copyError = error
            }
        }

        if let coordinationError = coordinationError {
            throw FileHandlingError.exportFailed("File coordination failed: \(coordinationError.localizedDescription)")
        }

        if let copyError = copyError {
            throw FileHandlingError.exportFailed("Failed to create ZIP archive: \(copyError.localizedDescription)")
        }

        // Verify the zip was created
        guard fileManager.fileExists(atPath: zipURL.path) else {
            throw FileHandlingError.exportFailed("ZIP archive was not created")
        }

        // Cleanup folder
        do {
            try fileManager.removeItem(at: folderURL)
        } catch {
            // Log but don't fail - the ZIP was created successfully
            print("Warning: Could not cleanup temp folder: \(error.localizedDescription)")
        }

        return zipURL
    }

    // MARK: - Import File

    func importFile(from url: URL) async throws -> ImportedFile {
        guard url.startAccessingSecurityScopedResource() else {
            throw FileHandlingError.accessDenied
        }
        defer { url.stopAccessingSecurityScopedResource() }

        let data = try Data(contentsOf: url)
        let filename = url.lastPathComponent
        let fileType = UTType(filenameExtension: url.pathExtension) ?? .data

        return ImportedFile(
            name: filename,
            data: data,
            type: fileType,
            originalURL: url
        )
    }

    // MARK: - Save to Downloads (Mac) / Files (iOS)

    func saveToDevice(data: Data, filename: String, type: UTType) async throws -> URL {
        #if targetEnvironment(macCatalyst) || os(macOS)
        // macOS: Save to Downloads folder
        guard let downloadsURL = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first else {
            throw FileHandlingError.directoryNotFound
        }
        let fileURL = downloadsURL.appendingPathComponent(filename)
        try data.write(to: fileURL)
        return fileURL
        #else
        // iOS: Save to app's documents (user can access via Files app)
        let fileURL = documentsDirectory.appendingPathComponent(filename)
        try data.write(to: fileURL)
        return fileURL
        #endif
    }

    // MARK: - Cleanup Temp Files

    func cleanupTempFiles() {
        let tempFiles = try? fileManager.contentsOfDirectory(at: tempDirectory, includingPropertiesForKeys: nil)
        tempFiles?.forEach { url in
            if url.lastPathComponent.hasPrefix("MaiFarm_") {
                try? fileManager.removeItem(at: url)
            }
        }
    }
}

// MARK: - Data Models

struct HarvestExportData: Codable, Identifiable {
    let id: String
    let name: String
    let farmId: String
    let farmName: String
    let createdAt: Date
    let completedAt: Date?
    let status: String
    let agentCount: Int
    let fileCount: Int
    let files: [HarvestFileMetadata]
    let summary: String?
}

struct HarvestFileMetadata: Codable {
    let name: String
    let size: Int64
    let type: String
    let modifiedAt: Date
}

struct LocalHarvestFile: Identifiable {
    let id = UUID()
    let name: String
    let content: String?
    let data: Data?
    let size: Int64
    let type: UTType
}

struct ImportedFile {
    let name: String
    let data: Data
    let type: UTType
    let originalURL: URL

    var stringContent: String? {
        String(data: data, encoding: .utf8)
    }
}

// MARK: - Errors

enum FileHandlingError: LocalizedError {
    case accessDenied
    case directoryNotFound
    case exportFailed(String)
    case importFailed(String)
    case invalidFormat
    case fileTooLarge(Int64)

    var errorDescription: String? {
        switch self {
        case .accessDenied:
            return "Access to the file was denied. Please grant permission."
        case .directoryNotFound:
            return "Could not find the target directory."
        case .exportFailed(let reason):
            return "Export failed: \(reason)"
        case .importFailed(let reason):
            return "Import failed: \(reason)"
        case .invalidFormat:
            return "The file format is not supported."
        case .fileTooLarge(let size):
            return "File is too large (\(size / 1_000_000) MB). Maximum size is 50 MB."
        }
    }
}

// MARK: - String Extension for Filename Sanitization

extension String {
    var sanitizedFilename: String {
        let invalidChars = CharacterSet(charactersIn: ":/\\?%*|\"<>")
        return self.components(separatedBy: invalidChars).joined(separator: "_")
            .trimmingCharacters(in: .whitespaces)
            .prefix(100)
            .description
    }
}

// MARK: - Transferable Document for Export

struct HarvestDocument: Transferable {
    let harvest: HarvestExportData
    let files: [LocalHarvestFile]

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { document in
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            return try encoder.encode(document.harvest)
        }

        FileRepresentation(exportedContentType: .zip) { document in
            let url = try await FileHandlingService.shared.exportHarvestAsZip(
                document.harvest,
                files: document.files
            )
            return SentTransferredFile(url)
        }
    }
}

// MARK: - SwiftUI View Components

/// Cross-platform Share Sheet
struct ShareSheet: View {
    let items: [Any]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        #if os(macOS)
        MacShareView(items: items, dismiss: dismiss)
        #else
        ActivityViewController(items: items)
        #endif
    }
}

#if canImport(UIKit)
/// UIKit Activity View Controller wrapper
struct ActivityViewController: UIViewControllerRepresentable {
    let items: [Any]
    var excludedTypes: [UIActivity.ActivityType] = []

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.excludedActivityTypes = excludedTypes

        // iPad popover configuration
        if let popover = controller.popoverPresentationController {
            popover.permittedArrowDirections = .any
        }

        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif

#if os(macOS)
/// macOS Share View
struct MacShareView: View {
    let items: [Any]
    let dismiss: DismissAction

    var body: some View {
        VStack(spacing: 20) {
            Text("Share")
                .font(.headline)

            HStack(spacing: 20) {
                ShareButton(title: "Copy", icon: "doc.on.doc") {
                    if let url = items.first as? URL {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(url.path, forType: .string)
                    }
                    dismiss()
                }

                ShareButton(title: "Finder", icon: "folder") {
                    if let url = items.first as? URL {
                        NSWorkspace.shared.activateFileViewerSelecting([url])
                    }
                    dismiss()
                }
            }

            Button("Cancel") { dismiss() }
                .keyboardShortcut(.escape)
        }
        .padding(30)
        .frame(minWidth: 300)
    }
}

struct ShareButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title)
                Text(title)
                    .font(.caption)
            }
            .frame(width: 80, height: 80)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }
}
#endif

// MARK: - File Importer Configuration

struct FileImporterConfig {
    let allowedContentTypes: [UTType]
    let allowsMultipleSelection: Bool

    static let harvests = FileImporterConfig(
        allowedContentTypes: [.json, .zip, .folder],
        allowsMultipleSelection: false
    )

    static let attachments = FileImporterConfig(
        allowedContentTypes: [.image, .pdf, .plainText, .sourceCode, .json],
        allowsMultipleSelection: true
    )

    static let images = FileImporterConfig(
        allowedContentTypes: [.image],
        allowsMultipleSelection: true
    )
}

// MARK: - File Exporter Configuration

struct FileExporterConfig {
    let contentType: UTType
    let defaultFilename: String

    static func harvest(name: String) -> FileExporterConfig {
        FileExporterConfig(
            contentType: .json,
            defaultFilename: "\(name.sanitizedFilename)_export.json"
        )
    }

    static func harvestZip(name: String) -> FileExporterConfig {
        FileExporterConfig(
            contentType: .zip,
            defaultFilename: "\(name.sanitizedFilename).zip"
        )
    }
}

// MARK: - Photo Picker Support

struct PhotoPickerItem: Identifiable {
    let id = UUID()
    let item: PhotosPickerItem

    @MainActor
    func loadImage() async -> Image? {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let uiImage = platformImage(from: data) else {
            return nil
        }
        #if canImport(UIKit)
        return Image(uiImage: uiImage)
        #else
        return Image(nsImage: uiImage)
        #endif
    }

    @MainActor
    func loadData() async -> Data? {
        try? await item.loadTransferable(type: Data.self)
    }

    private func platformImage(from data: Data) -> PlatformImage? {
        #if canImport(UIKit)
        return UIImage(data: data)
        #else
        return NSImage(data: data)
        #endif
    }
}

#if canImport(UIKit)
typealias PlatformImage = UIImage
#else
typealias PlatformImage = NSImage
#endif

// MARK: - View Extension for File Operations

extension View {
    /// Adds file export capability to a view
    func harvestExporter(
        isPresented: Binding<Bool>,
        harvest: HarvestExportData,
        files: [LocalHarvestFile] = [],
        onCompletion: @escaping (Result<URL, Error>) -> Void
    ) -> some View {
        self.fileExporter(
            isPresented: isPresented,
            document: HarvestJSONDocument(harvest: harvest),
            contentType: .json,
            defaultFilename: "\(harvest.name.sanitizedFilename).json"
        ) { result in
            onCompletion(result)
        }
    }

    /// Adds file import capability to a view
    func harvestImporter(
        isPresented: Binding<Bool>,
        onImport: @escaping (Result<[URL], Error>) -> Void
    ) -> some View {
        self.fileImporter(
            isPresented: isPresented,
            allowedContentTypes: [.json, .zip],
            allowsMultipleSelection: false
        ) { result in
            onImport(result)
        }
    }
}

// MARK: - FileDocument for JSON Export

struct HarvestJSONDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    let harvest: HarvestExportData

    init(harvest: HarvestExportData) {
        self.harvest = harvest
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        harvest = try decoder.decode(HarvestExportData.self, from: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(harvest)
        return FileWrapper(regularFileWithContents: data)
    }
}

// MARK: - Quick Look Preview Support

#if canImport(QuickLook)
import QuickLook

struct QuickLookPreview: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        #if os(iOS)
        QuickLookPreviewController(url: url)
            .ignoresSafeArea()
        #else
        VStack {
            Text("Preview: \(url.lastPathComponent)")
                .font(.headline)
                .padding()

            Button("Open in Finder") {
                NSWorkspace.shared.activateFileViewerSelecting([url])
                dismiss()
            }
            .padding()
        }
        .frame(minWidth: 400, minHeight: 300)
        #endif
    }
}

#if os(iOS)
struct QuickLookPreviewController: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL

        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as QLPreviewItem
        }
    }
}
#endif
#endif
