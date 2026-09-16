//
//  DeviceOptimizedFarmingService.swift
//  MaiFarm
//
//  Device-aware farming optimization and file type targeting
//  Intelligently aligns tasks, agents, and file types to device capabilities
//

import SwiftUI
import UniformTypeIdentifiers

// MARK: - Device Optimized Farming Service

@MainActor
final class DeviceOptimizedFarmingService: ObservableObject, @unchecked Sendable {
    static let shared = DeviceOptimizedFarmingService()

    @Published var currentProfile: DeviceFarmingProfile
    @Published var suggestedTasks: [SuggestedTask] = []
    @Published var optimizedFileTypes: [OptimizedFileType] = []

    private let deviceManager = DeviceCapabilityManager.shared

    init() {
        self.currentProfile = DeviceFarmingProfile.forDevice(DeviceCapabilityManager.shared.deviceType)
        setupOptimizations()
    }

    private func setupOptimizations() {
        currentProfile = DeviceFarmingProfile.forDevice(deviceManager.deviceType)
        suggestedTasks = currentProfile.suggestedTasks
        optimizedFileTypes = currentProfile.optimizedFileTypes
    }

    func refresh() {
        setupOptimizations()
    }

    // MARK: - Smart Farm Configuration

    func optimalFarmConfig(for taskType: TaskType) -> OptimalFarmConfig {
        let base = currentProfile.baseFarmConfig
        let baseMemory = Double(base.memoryPerAgent)

        switch taskType {
        case .quickFix:
            return OptimalFarmConfig(
                agents: min(1, base.maxAgents),
                duration: 5,
                provider: base.preferredProvider,
                priority: .high,
                memoryLimit: baseMemory
            )
        case .codeReview:
            return OptimalFarmConfig(
                agents: min(2, base.maxAgents),
                duration: min(30, base.maxDuration),
                provider: base.preferredProvider,
                priority: .normal,
                memoryLimit: baseMemory
            )
        case .featureImplementation:
            return OptimalFarmConfig(
                agents: min(3, base.maxAgents),
                duration: min(60, base.maxDuration),
                provider: base.preferredProvider,
                priority: .normal,
                memoryLimit: baseMemory
            )
        case .research:
            return OptimalFarmConfig(
                agents: min(2, base.maxAgents),
                duration: min(45, base.maxDuration),
                provider: base.preferredProvider,
                priority: .low,
                memoryLimit: baseMemory
            )
        case .refactoring:
            return OptimalFarmConfig(
                agents: min(base.maxAgents, 4),
                duration: min(90, base.maxDuration),
                provider: base.preferredProvider,
                priority: .normal,
                memoryLimit: baseMemory
            )
        case .documentation:
            return OptimalFarmConfig(
                agents: min(2, base.maxAgents),
                duration: min(30, base.maxDuration),
                provider: currentProfile.supportsLocalModels ? "ollama" : base.preferredProvider,
                priority: .low,
                memoryLimit: baseMemory / 2.0
            )
        case .testing:
            return OptimalFarmConfig(
                agents: min(3, base.maxAgents),
                duration: min(45, base.maxDuration),
                provider: base.preferredProvider,
                priority: .high,
                memoryLimit: baseMemory
            )
        case .debugging:
            return OptimalFarmConfig(
                agents: min(2, base.maxAgents),
                duration: min(60, base.maxDuration),
                provider: base.preferredProvider,
                priority: .high,
                memoryLimit: baseMemory * 1.5
            )
        }
    }

    // MARK: - File Type Recommendations

    func recommendedFileTypes(for context: FileContext) -> [UTType] {
        switch context {
        case .quickTask:
            return currentProfile.quickTaskFileTypes
        case .farmContext:
            return currentProfile.farmContextFileTypes
        case .attachment:
            return currentProfile.attachmentFileTypes
        case .export:
            return currentProfile.exportFileTypes
        }
    }

    func fileTypeWeight(for type: UTType) -> Double {
        currentProfile.fileTypeWeights[type] ?? 0.5
    }

    // MARK: - Task Analysis

    func analyzeTaskComplexity(_ description: String) -> TaskComplexity {
        let lowercased = description.lowercased()

        // High complexity indicators
        let highComplexityKeywords = ["refactor", "migrate", "architecture", "redesign", "implement feature", "build system", "full stack"]
        if highComplexityKeywords.contains(where: { lowercased.contains($0) }) {
            return .high
        }

        // Medium complexity indicators
        let mediumComplexityKeywords = ["add", "create", "modify", "update", "fix bug", "integrate", "test"]
        if mediumComplexityKeywords.contains(where: { lowercased.contains($0) }) {
            return .medium
        }

        // Low complexity (default)
        return .low
    }

    func suggestTaskType(from description: String) -> TaskType {
        let lowercased = description.lowercased()

        if lowercased.contains("review") || lowercased.contains("check") {
            return .codeReview
        }
        if lowercased.contains("fix") || lowercased.contains("bug") || lowercased.contains("error") {
            return .debugging
        }
        if lowercased.contains("test") || lowercased.contains("spec") {
            return .testing
        }
        if lowercased.contains("refactor") || lowercased.contains("clean") {
            return .refactoring
        }
        if lowercased.contains("document") || lowercased.contains("readme") || lowercased.contains("comment") {
            return .documentation
        }
        if lowercased.contains("research") || lowercased.contains("explore") || lowercased.contains("investigate") {
            return .research
        }
        if lowercased.contains("implement") || lowercased.contains("add feature") || lowercased.contains("create") {
            return .featureImplementation
        }

        return .quickFix
    }
}

// MARK: - Device Farming Profile

struct DeviceFarmingProfile {
    let deviceType: DeviceCapabilityManager.DeviceType
    let displayName: String
    let description: String

    // Capabilities
    let supportsLocalModels: Bool
    let supportsBackgroundFarming: Bool
    let supportsContinuousFarming: Bool
    let maxConcurrentFarms: Int

    // Base configuration
    let baseFarmConfig: BaseFarmConfig

    // File types optimized for this device
    let quickTaskFileTypes: [UTType]
    let farmContextFileTypes: [UTType]
    let attachmentFileTypes: [UTType]
    let exportFileTypes: [UTType]
    let fileTypeWeights: [UTType: Double]

    // Suggested tasks
    let suggestedTasks: [SuggestedTask]
    let optimizedFileTypes: [OptimizedFileType]

    // MARK: - Factory

    static func forDevice(_ type: DeviceCapabilityManager.DeviceType) -> DeviceFarmingProfile {
        switch type {
        case .iPhone:
            return iPhoneProfile
        case .iPad:
            return iPadProfile
        case .mac:
            return macProfile
        }
    }

    // MARK: - iPhone Profile

    static let iPhoneProfile = DeviceFarmingProfile(
        deviceType: .iPhone,
        displayName: "Mobile Farming",
        description: "Optimized for quick tasks and on-the-go coding",
        supportsLocalModels: false,
        supportsBackgroundFarming: true,
        supportsContinuousFarming: false,
        maxConcurrentFarms: 1,
        baseFarmConfig: BaseFarmConfig(
            maxAgents: 2,
            maxDuration: 60,
            preferredProvider: "claude",
            memoryPerAgent: 256
        ),
        quickTaskFileTypes: [
            .plainText,
            .json,
            .png,
            .jpeg,
            .pdf
        ],
        farmContextFileTypes: [
            .plainText,
            .json,
            .yaml,
            .xml
        ],
        attachmentFileTypes: [
            .image,
            .plainText,
            .json,
            .pdf
        ],
        exportFileTypes: [
            .json,
            .plainText,
            .zip
        ],
        fileTypeWeights: [
            .plainText: 1.0,
            .json: 0.9,
            .png: 0.8,
            .jpeg: 0.8,
            .pdf: 0.7,
            .yaml: 0.6,
            .xml: 0.5
        ],
        suggestedTasks: [
            SuggestedTask(
                title: "Quick Code Review",
                description: "Review a snippet or small file",
                icon: "eye",
                taskType: .codeReview,
                estimatedMinutes: 5
            ),
            SuggestedTask(
                title: "Fix a Bug",
                description: "Debug and fix a specific issue",
                icon: "ladybug",
                taskType: .debugging,
                estimatedMinutes: 10
            ),
            SuggestedTask(
                title: "Write Documentation",
                description: "Add comments or README updates",
                icon: "doc.text",
                taskType: .documentation,
                estimatedMinutes: 15
            ),
            SuggestedTask(
                title: "Photo to Code",
                description: "Convert a screenshot to code",
                icon: "photo",
                taskType: .quickFix,
                estimatedMinutes: 5
            )
        ],
        optimizedFileTypes: [
            OptimizedFileType(
                type: .image,
                name: "Screenshots & Photos",
                description: "Perfect for sharing UI mockups or bug screenshots",
                icon: "photo.fill",
                priority: .high,
                maxSizeMB: 10
            ),
            OptimizedFileType(
                type: .plainText,
                name: "Code Snippets",
                description: "Quick text files and code snippets",
                icon: "doc.text.fill",
                priority: .high,
                maxSizeMB: 1
            ),
            OptimizedFileType(
                type: .json,
                name: "JSON Data",
                description: "API responses, configs, data files",
                icon: "curlybraces",
                priority: .medium,
                maxSizeMB: 5
            ),
            OptimizedFileType(
                type: .pdf,
                name: "Documents",
                description: "PDFs for reference",
                icon: "doc.fill",
                priority: .low,
                maxSizeMB: 20
            )
        ]
    )

    // MARK: - iPad Profile

    static let iPadProfile = DeviceFarmingProfile(
        deviceType: .iPad,
        displayName: "Tablet Farming",
        description: "Balanced for productivity and longer sessions",
        supportsLocalModels: true, // iPad Pro with M-series
        supportsBackgroundFarming: true,
        supportsContinuousFarming: true,
        maxConcurrentFarms: 2,
        baseFarmConfig: BaseFarmConfig(
            maxAgents: 5,
            maxDuration: 180,
            preferredProvider: "claude",
            memoryPerAgent: 512
        ),
        quickTaskFileTypes: [
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .png,
            .jpeg,
            .pdf,
            .rtf
        ],
        farmContextFileTypes: [
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .xml,
            .propertyList
        ],
        attachmentFileTypes: [
            .image,
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .pdf,
            .zip
        ],
        exportFileTypes: [
            .json,
            .plainText,
            .zip,
            .folder
        ],
        fileTypeWeights: [
            .sourceCode: 1.0,
            .plainText: 0.95,
            .json: 0.9,
            .yaml: 0.85,
            .png: 0.8,
            .jpeg: 0.75,
            .pdf: 0.7,
            .xml: 0.6,
            .zip: 0.5
        ],
        suggestedTasks: [
            SuggestedTask(
                title: "Code Review Session",
                description: "Review multiple files or a PR",
                icon: "eye.circle",
                taskType: .codeReview,
                estimatedMinutes: 30
            ),
            SuggestedTask(
                title: "Implement Feature",
                description: "Build a new component or feature",
                icon: "hammer",
                taskType: .featureImplementation,
                estimatedMinutes: 60
            ),
            SuggestedTask(
                title: "Write Tests",
                description: "Create unit or integration tests",
                icon: "checkmark.shield",
                taskType: .testing,
                estimatedMinutes: 45
            ),
            SuggestedTask(
                title: "Debug Issue",
                description: "Investigate and fix bugs",
                icon: "ant",
                taskType: .debugging,
                estimatedMinutes: 30
            ),
            SuggestedTask(
                title: "Research & Explore",
                description: "Investigate solutions or patterns",
                icon: "magnifyingglass",
                taskType: .research,
                estimatedMinutes: 45
            )
        ],
        optimizedFileTypes: [
            OptimizedFileType(
                type: .sourceCode,
                name: "Source Code",
                description: "Swift, TypeScript, Python, and more",
                icon: "chevron.left.forwardslash.chevron.right",
                priority: .high,
                maxSizeMB: 10
            ),
            OptimizedFileType(
                type: .json,
                name: "JSON & Config",
                description: "Configuration and data files",
                icon: "curlybraces",
                priority: .high,
                maxSizeMB: 20
            ),
            OptimizedFileType(
                type: .image,
                name: "Images & Mockups",
                description: "Screenshots, designs, diagrams",
                icon: "photo.stack",
                priority: .medium,
                maxSizeMB: 25
            ),
            OptimizedFileType(
                type: .pdf,
                name: "Documentation",
                description: "Specs, requirements, references",
                icon: "doc.richtext",
                priority: .medium,
                maxSizeMB: 50
            ),
            OptimizedFileType(
                type: .zip,
                name: "Archives",
                description: "Compressed project files",
                icon: "doc.zipper",
                priority: .low,
                maxSizeMB: 100
            )
        ]
    )

    // MARK: - Mac Profile

    static let macProfile = DeviceFarmingProfile(
        deviceType: .mac,
        displayName: "Workstation Farming",
        description: "Full power for complex projects and long sessions",
        supportsLocalModels: true,
        supportsBackgroundFarming: true,
        supportsContinuousFarming: true,
        maxConcurrentFarms: 5,
        baseFarmConfig: BaseFarmConfig(
            maxAgents: 10,
            maxDuration: 360,
            preferredProvider: "claude",
            memoryPerAgent: 1024
        ),
        quickTaskFileTypes: [
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .xml,
            .png,
            .jpeg,
            .pdf,
            .rtf,
            .html
        ],
        farmContextFileTypes: [
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .xml,
            .propertyList,
            .shellScript,
            .makefile
        ],
        attachmentFileTypes: [
            .item, // Almost everything
            .image,
            .plainText,
            .sourceCode,
            .json,
            .yaml,
            .pdf,
            .zip,
            .folder
        ],
        exportFileTypes: [
            .json,
            .plainText,
            .zip,
            .folder,
            .diskImage
        ],
        fileTypeWeights: [
            .sourceCode: 1.0,
            .plainText: 0.95,
            .json: 0.95,
            .yaml: 0.9,
            .shellScript: 0.9,
            .makefile: 0.85,
            .xml: 0.8,
            .html: 0.75,
            .png: 0.7,
            .pdf: 0.7,
            .zip: 0.6,
            .folder: 0.5
        ],
        suggestedTasks: [
            SuggestedTask(
                title: "Full Project Review",
                description: "Comprehensive codebase analysis",
                icon: "folder.badge.gearshape",
                taskType: .codeReview,
                estimatedMinutes: 60
            ),
            SuggestedTask(
                title: "Major Refactoring",
                description: "Large-scale code improvements",
                icon: "arrow.triangle.2.circlepath",
                taskType: .refactoring,
                estimatedMinutes: 120
            ),
            SuggestedTask(
                title: "Build New Feature",
                description: "Implement complex functionality",
                icon: "building.2",
                taskType: .featureImplementation,
                estimatedMinutes: 180
            ),
            SuggestedTask(
                title: "Test Suite Creation",
                description: "Build comprehensive test coverage",
                icon: "checklist",
                taskType: .testing,
                estimatedMinutes: 90
            ),
            SuggestedTask(
                title: "Architecture Research",
                description: "Deep dive into patterns and solutions",
                icon: "book.pages",
                taskType: .research,
                estimatedMinutes: 60
            ),
            SuggestedTask(
                title: "Debug Complex Issue",
                description: "Investigate multi-file bugs",
                icon: "ant.circle",
                taskType: .debugging,
                estimatedMinutes: 60
            )
        ],
        optimizedFileTypes: [
            OptimizedFileType(
                type: .sourceCode,
                name: "Source Code",
                description: "All programming languages supported",
                icon: "chevron.left.forwardslash.chevron.right",
                priority: .high,
                maxSizeMB: 50
            ),
            OptimizedFileType(
                type: .folder,
                name: "Project Folders",
                description: "Entire directories for context",
                icon: "folder.fill",
                priority: .high,
                maxSizeMB: 500
            ),
            OptimizedFileType(
                type: .json,
                name: "Data & Config",
                description: "JSON, YAML, XML, plists",
                icon: "doc.badge.gearshape",
                priority: .high,
                maxSizeMB: 100
            ),
            OptimizedFileType(
                type: .shellScript,
                name: "Scripts",
                description: "Shell, Python, build scripts",
                icon: "terminal",
                priority: .high,
                maxSizeMB: 10
            ),
            OptimizedFileType(
                type: .zip,
                name: "Archives",
                description: "ZIP, TAR, compressed projects",
                icon: "doc.zipper",
                priority: .medium,
                maxSizeMB: 500
            ),
            OptimizedFileType(
                type: .pdf,
                name: "Documentation",
                description: "Specs, diagrams, references",
                icon: "doc.richtext.fill",
                priority: .medium,
                maxSizeMB: 100
            )
        ]
    )
}

// MARK: - Supporting Types

struct BaseFarmConfig {
    let maxAgents: Int
    let maxDuration: Int // minutes
    let preferredProvider: String
    let memoryPerAgent: Int // MB
}

struct OptimalFarmConfig {
    let agents: Int
    let duration: Int // minutes
    let provider: String
    let priority: TaskPriority
    let memoryLimit: Double // MB

    var formattedDuration: String {
        if duration >= 60 {
            let hours = duration / 60
            let mins = duration % 60
            if mins == 0 {
                return "\(hours)h"
            }
            return "\(hours)h \(mins)m"
        }
        return "\(duration)m"
    }
}

enum TaskType: String, CaseIterable, Identifiable {
    case quickFix = "Quick Fix"
    case codeReview = "Code Review"
    case featureImplementation = "Feature"
    case research = "Research"
    case refactoring = "Refactor"
    case documentation = "Docs"
    case testing = "Testing"
    case debugging = "Debug"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .quickFix: return "bolt"
        case .codeReview: return "eye"
        case .featureImplementation: return "hammer"
        case .research: return "magnifyingglass"
        case .refactoring: return "arrow.triangle.2.circlepath"
        case .documentation: return "doc.text"
        case .testing: return "checkmark.shield"
        case .debugging: return "ant"
        }
    }

    var color: Color {
        switch self {
        case .quickFix: return .orange
        case .codeReview: return .blue
        case .featureImplementation: return .green
        case .research: return .purple
        case .refactoring: return .indigo
        case .documentation: return .gray
        case .testing: return .teal
        case .debugging: return .red
        }
    }
}

enum TaskPriority: String {
    case low = "Low"
    case normal = "Normal"
    case high = "High"
}

enum TaskComplexity: String {
    case low = "Simple"
    case medium = "Moderate"
    case high = "Complex"

    var color: Color {
        switch self {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }

    var agentMultiplier: Double {
        switch self {
        case .low: return 1.0
        case .medium: return 1.5
        case .high: return 2.0
        }
    }
}

enum FileContext {
    case quickTask
    case farmContext
    case attachment
    case export
}

struct SuggestedTask: Identifiable {
    let id = UUID()
    let title: String
    let description: String
    let icon: String
    let taskType: TaskType
    let estimatedMinutes: Int

    var formattedTime: String {
        if estimatedMinutes >= 60 {
            let hours = estimatedMinutes / 60
            let mins = estimatedMinutes % 60
            if mins == 0 {
                return "\(hours) hour\(hours > 1 ? "s" : "")"
            }
            return "\(hours)h \(mins)m"
        }
        return "\(estimatedMinutes) min"
    }
}

struct OptimizedFileType: Identifiable {
    let id = UUID()
    let type: UTType
    let name: String
    let description: String
    let icon: String
    let priority: FilePriority
    let maxSizeMB: Int

    enum FilePriority: String {
        case high = "Recommended"
        case medium = "Supported"
        case low = "Available"

        var color: Color {
            switch self {
            case .high: return .green
            case .medium: return .blue
            case .low: return .gray
            }
        }
    }
}

// MARK: - UTType Extensions

extension UTType {
    static let yaml = UTType(filenameExtension: "yaml") ?? .plainText
    static let makefile = UTType(filenameExtension: "makefile") ?? .plainText
    static let swift = UTType(filenameExtension: "swift") ?? .sourceCode
    static let typescript = UTType(filenameExtension: "ts") ?? .sourceCode
    static let python = UTType(filenameExtension: "py") ?? .sourceCode
    static let javascript = UTType(filenameExtension: "js") ?? .sourceCode
    static let markdown = UTType(filenameExtension: "md") ?? .plainText
}

// MARK: - SwiftUI Views

struct DeviceCapabilityBadge: View {
    let profile: DeviceFarmingProfile

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: deviceIcon)
                .font(.caption)
            Text(profile.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.accentColor.opacity(0.15))
        .foregroundColor(.accentColor)
        .cornerRadius(8)
    }

    var deviceIcon: String {
        switch profile.deviceType {
        case .iPhone: return "iphone"
        case .iPad: return "ipad"
        case .mac: return "desktopcomputer"
        }
    }
}

struct SuggestedTaskCard: View {
    let task: SuggestedTask
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: task.icon)
                        .font(.title2)
                        .foregroundColor(task.taskType.color)

                    Spacer()

                    Text(task.formattedTime)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(task.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)

                Text(task.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            .padding()
            .background(isSelected ? task.taskType.color.opacity(0.15) : Color(.secondarySystemBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? task.taskType.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

struct OptimizedFileTypeRow: View {
    let fileType: OptimizedFileType

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: fileType.icon)
                .font(.title2)
                .foregroundColor(.accentColor)
                .frame(width: 40, height: 40)
                .background(Color.accentColor.opacity(0.1))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(fileType.name)
                        .font(.subheadline)
                        .fontWeight(.medium)

                    Text(fileType.priority.rawValue)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(fileType.priority.color.opacity(0.15))
                        .foregroundColor(fileType.priority.color)
                        .cornerRadius(4)
                }

                Text(fileType.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text("≤\(fileType.maxSizeMB)MB")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

struct TaskComplexityIndicator: View {
    let complexity: TaskComplexity

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(index < complexityLevel ? complexity.color : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
            Text(complexity.rawValue)
                .font(.caption)
                .foregroundColor(complexity.color)
        }
    }

    var complexityLevel: Int {
        switch complexity {
        case .low: return 1
        case .medium: return 2
        case .high: return 3
        }
    }
}

struct FarmConfigPreview: View {
    let config: OptimalFarmConfig

    var body: some View {
        HStack(spacing: 16) {
            ConfigItem(icon: "person.2", value: "\(config.agents)", label: "Agents")
            ConfigItem(icon: "clock", value: config.formattedDuration, label: "Duration")
            ConfigItem(icon: "cpu", value: config.provider.capitalized, label: "Provider")
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

struct ConfigItem: View {
    let icon: String
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.accentColor)
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
