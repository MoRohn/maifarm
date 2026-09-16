//
//  AIEngine.swift
//  MaiFarm
//
//  AI Engine Definitions and Models
//

import SwiftUI

// MARK: - AI Engine Definition
enum AIEngine: String, CaseIterable, Identifiable {
    case claude = "claude"
    case openai = "openai"
    case grok = "grok"
    case ollama = "ollama"
    case localCore = "localCore"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .claude: return "Claude"
        case .openai: return "GPT"
        case .grok: return "Grok"
        case .ollama: return "Ollama"
        case .localCore: return "LocalCore"
        }
    }

    var fullName: String {
        switch self {
        case .claude: return "Claude (Anthropic)"
        case .openai: return "OpenAI GPT-4"
        case .grok: return "Grok (xAI)"
        case .ollama: return "Ollama (Local)"
        case .localCore: return "LocalCore (On-Device)"
        }
    }

    var description: String {
        switch self {
        case .claude: return "Anthropic's Claude 3.5 Sonnet - excellent for coding and analysis"
        case .openai: return "OpenAI's GPT-4 - versatile and powerful for any task"
        case .grok: return "xAI's Grok - fast and capable with real-time knowledge"
        case .ollama: return "Run open-source models locally with full privacy"
        case .localCore: return "On-device AI processing - maximum privacy, works offline"
        }
    }

    var icon: String {
        switch self {
        case .claude: return "brain.head.profile"
        case .openai: return "sparkles"
        case .grok: return "bolt.horizontal.fill"
        case .ollama: return "desktopcomputer"
        case .localCore: return "lock.shield.fill"
        }
    }

    var color: Color {
        switch self {
        case .claude: return .orange
        case .openai: return .green
        case .grok: return .blue
        case .ollama: return .purple
        case .localCore: return .cyan
        }
    }

    var isLocal: Bool {
        switch self {
        case .claude, .openai, .grok: return false
        case .ollama, .localCore: return true
        }
    }

    var isCloudBased: Bool { !isLocal }

    var requiresAPIKey: Bool {
        switch self {
        case .claude, .openai, .grok: return true
        case .ollama, .localCore: return false
        }
    }

    // Available models for each engine
    var availableModels: [AIEngineModel] {
        switch self {
        case .claude:
            return [
                AIEngineModel(
                    id: "claude-3-5-sonnet-20241022",
                    name: "Claude 3.5 Sonnet",
                    description: "Best balance of speed and intelligence",
                    isDefault: true,
                    tier: .standard,
                    contextWindow: 200000,
                    features: ["200K context", "Vision", "Fast", "Coding"]
                ),
                AIEngineModel(
                    id: "claude-3-5-haiku-20241022",
                    name: "Claude 3.5 Haiku",
                    description: "Fastest model, cost-effective",
                    isDefault: false,
                    tier: .basic,
                    contextWindow: 200000,
                    features: ["200K context", "Very fast", "Budget"]
                ),
                AIEngineModel(
                    id: "claude-3-opus-20240229",
                    name: "Claude 3 Opus",
                    description: "Most capable for complex tasks",
                    isDefault: false,
                    tier: .premium,
                    contextWindow: 200000,
                    features: ["200K context", "Best reasoning", "Premium"]
                )
            ]
        case .openai:
            return [
                AIEngineModel(
                    id: "gpt-4o-mini",
                    name: "GPT-4o Mini",
                    description: "Fast and cost-effective",
                    isDefault: true,
                    tier: .basic,
                    contextWindow: 128000,
                    features: ["128K context", "Very fast", "Affordable"]
                ),
                AIEngineModel(
                    id: "gpt-4o",
                    name: "GPT-4o",
                    description: "Advanced multimodal model",
                    isDefault: false,
                    tier: .standard,
                    contextWindow: 128000,
                    features: ["128K context", "Vision", "Audio"]
                ),
                AIEngineModel(
                    id: "gpt-4-turbo",
                    name: "GPT-4 Turbo",
                    description: "Most capable GPT-4 variant",
                    isDefault: false,
                    tier: .premium,
                    contextWindow: 128000,
                    features: ["128K context", "JSON mode", "Functions"]
                )
            ]
        case .grok:
            return [
                AIEngineModel(
                    id: "grok-2",
                    name: "Grok-2",
                    description: "Latest xAI model with real-time knowledge",
                    isDefault: true,
                    tier: .standard,
                    contextWindow: 128000,
                    features: ["128K context", "Real-time", "Fast"]
                ),
                AIEngineModel(
                    id: "grok-2-mini",
                    name: "Grok-2 Mini",
                    description: "Faster, lighter version",
                    isDefault: false,
                    tier: .basic,
                    contextWindow: 128000,
                    features: ["128K context", "Very fast", "Budget"]
                )
            ]
        case .ollama:
            return [
                AIEngineModel(
                    id: "llama3.1:8b",
                    name: "Llama 3.1 8B",
                    description: "Balanced performance (4.7 GB)",
                    isDefault: true,
                    tier: .standard,
                    contextWindow: 128000,
                    features: ["128K context", "8GB RAM", "Apache 2.0"]
                ),
                AIEngineModel(
                    id: "llama3.1:70b",
                    name: "Llama 3.1 70B",
                    description: "Most powerful (40 GB)",
                    isDefault: false,
                    tier: .premium,
                    contextWindow: 128000,
                    features: ["128K context", "40GB+ RAM", "Best quality"]
                ),
                AIEngineModel(
                    id: "qwen2.5-coder:7b",
                    name: "Qwen 2.5 Coder 7B",
                    description: "Optimized for coding (4.4 GB)",
                    isDefault: false,
                    tier: .standard,
                    contextWindow: 32000,
                    features: ["32K context", "Coding", "Fast"]
                ),
                AIEngineModel(
                    id: "mistral:7b",
                    name: "Mistral 7B",
                    description: "Fast general model (4.1 GB)",
                    isDefault: false,
                    tier: .basic,
                    contextWindow: 32000,
                    features: ["32K context", "Fast", "Efficient"]
                )
            ]
        case .localCore:
            return [
                AIEngineModel(
                    id: "localcore-base",
                    name: "LocalCore Base",
                    description: "On-device AI, works offline",
                    isDefault: true,
                    tier: .standard,
                    contextWindow: 8000,
                    features: ["Offline", "Private", "Fast"]
                ),
                AIEngineModel(
                    id: "localcore-code",
                    name: "LocalCore Code",
                    description: "Optimized for coding tasks",
                    isDefault: false,
                    tier: .standard,
                    contextWindow: 8000,
                    features: ["Offline", "Coding", "Fast"]
                )
            ]
        }
    }

    static func availableEngines(for tier: DeviceCapabilityManager.ComputeTier) -> [AIEngine] {
        var engines: [AIEngine] = [.claude, .openai, .grok]
        if tier.supportsLocalModels {
            engines.append(contentsOf: [.ollama, .localCore])
        }
        return engines
    }
}

// MARK: - AI Engine Model
struct AIEngineModel: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let isDefault: Bool
    let tier: ModelTier
    let contextWindow: Int
    let features: [String]

    init(
        id: String,
        name: String,
        description: String,
        isDefault: Bool = false,
        tier: ModelTier = .standard,
        contextWindow: Int = 128000,
        features: [String] = []
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.isDefault = isDefault
        self.tier = tier
        self.contextWindow = contextWindow
        self.features = features
    }

    enum ModelTier: String {
        case basic = "Basic"
        case standard = "Standard"
        case premium = "Premium"

        var color: Color {
            switch self {
            case .basic: return .gray
            case .standard: return .blue
            case .premium: return .purple
            }
        }
    }

    var contextWindowDisplay: String {
        if contextWindow >= 1000000 {
            return "\(contextWindow / 1000000)M context"
        } else if contextWindow >= 1000 {
            return "\(contextWindow / 1000)K context"
        }
        return "\(contextWindow) context"
    }
}
