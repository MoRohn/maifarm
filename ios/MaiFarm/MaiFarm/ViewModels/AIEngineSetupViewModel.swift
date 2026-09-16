//
//  AIEngineSetupViewModel.swift
//  MaiFarm
//
//  MVVM ViewModel for AI Engine setup with device-aware optimizations
//  Handles API key validation, model selection, and configuration persistence
//

import Foundation
import SwiftUI
import Combine
import os.log

// MARK: - Validation Status

enum ValidationStatus: Equatable {
    case idle
    case validating
    case valid(message: String)
    case invalid(message: String)
    case deferred(reason: String)
    case offline

    var isValid: Bool {
        if case .valid = self { return true }
        return false
    }

    var color: Color {
        switch self {
        case .idle: return .gray
        case .validating: return .blue
        case .valid: return .green
        case .invalid: return .red
        case .deferred: return .orange
        case .offline: return .yellow
        }
    }

    var icon: String {
        switch self {
        case .idle: return "circle"
        case .validating: return "arrow.trianglehead.2.clockwise.rotate.90"
        case .valid: return "checkmark.circle.fill"
        case .invalid: return "xmark.circle.fill"
        case .deferred: return "clock.fill"
        case .offline: return "wifi.slash"
        }
    }
}

// MARK: - Configuration Result

struct EngineConfigurationResult {
    let success: Bool
    let engine: AIEngine
    let model: AIEngineModel?
    let message: String
}

// MARK: - API Response Types

struct EngineConfigureResponse: Codable {
    let success: Bool
    let message: String?
    let engine: EngineInfo?

    struct EngineInfo: Codable {
        let provider: String
        let configured: Bool
        let model: String?
        let hasApiKey: Bool
        let isLocal: Bool
    }
}

struct EngineValidationResponse: Codable {
    let valid: Bool
    let message: String
    let details: ValidationDetails?

    struct ValidationDetails: Codable {
        let format: Bool
        let connection: Bool
        let permissions: [String]?
    }
}

struct EngineStatusResponse: Codable {
    let success: Bool
    let provider: String
    let configured: Bool
    let hasApiKey: Bool
    let isLocal: Bool
    let storedConfig: StoredConfig?

    struct StoredConfig: Codable {
        let name: String?
        let createdAt: String?
        let lastUsed: String?
    }
}

// MARK: - View Model

@MainActor
class AIEngineSetupViewModel: ObservableObject {

    // MARK: - Published State

    @Published var selectedEngine: AIEngine = .claude
    @Published var selectedModel: AIEngineModel?
    @Published var apiKey: String = ""
    @Published var isValidating: Bool = false
    @Published var validationStatus: ValidationStatus = .idle
    @Published var isConfigured: Bool = false
    @Published var isSaving: Bool = false
    @Published var showError: Bool = false
    @Published var errorMessage: String = ""
    @Published var showSuccess: Bool = false
    @Published var availableEngines: [AIEngine] = []
    @Published var engineStatuses: [AIEngine: Bool] = [:]

    // Llama-specific
    @Published var llamaDeployment: LlamaDeployment = .local

    enum LlamaDeployment: String, CaseIterable {
        case local = "local"
        case cloud = "cloud"

        var displayName: String {
            switch self {
            case .local: return "Local (Ollama)"
            case .cloud: return "Cloud (DashScope)"
            }
        }
    }

    // MARK: - Private Properties

    private let logger = Logger(subsystem: "app.maifarm", category: "AIEngineSetup")
    private var validationTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    // Debounce delay for API key validation (300ms)
    private let validationDebounceDelay: TimeInterval = 0.3

    // MARK: - Initialization

    init() {
        setupBindings()
        loadAvailableEngines()
        loadStoredConfiguration()
    }

    // MARK: - Setup

    private func setupBindings() {
        // Debounced API key validation
        $apiKey
            .dropFirst()
            .debounce(for: .seconds(validationDebounceDelay), scheduler: DispatchQueue.main)
            .sink { [weak self] key in
                guard let self = self, !key.isEmpty else {
                    self?.validationStatus = .idle
                    return
                }
                Task {
                    await self.validateAPIKey()
                }
            }
            .store(in: &cancellables)

        // Update selected model when engine changes
        $selectedEngine
            .sink { [weak self] engine in
                self?.selectedModel = engine.availableModels.first { $0.isDefault }
            }
            .store(in: &cancellables)
    }

    func loadAvailableEngines() {
        let tier = DeviceCapabilityManager.shared.computeTier
        availableEngines = AIEngine.availableEngines(for: tier)

        logger.info("Loaded \(self.availableEngines.count) engines for \(tier.rawValue) tier")
    }

    private func loadStoredConfiguration() {
        // Load saved engine preference
        if let savedEngine = UserDefaults.standard.string(forKey: "selectedAIEngine"),
           let engine = AIEngine(rawValue: savedEngine) {
            selectedEngine = engine
        }

        // Load saved model for current engine
        if let savedModel = UserDefaults.standard.string(forKey: "\(selectedEngine.rawValue)_model"),
           let model = selectedEngine.availableModels.first(where: { $0.id == savedModel }) {
            selectedModel = model
        }
    }

    // MARK: - API Key Validation

    func validateAPIKey() async {
        // Cancel any existing validation
        validationTask?.cancel()

        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)

        // Empty key
        guard !key.isEmpty else {
            validationStatus = .idle
            return
        }

        // Format validation first (fast, local)
        guard validateKeyFormat(key) else {
            return
        }

        // Check thermal state - defer if device is hot
        if ThermalStateMonitor.shared.operationalMode == .minimal {
            validationStatus = .deferred(reason: "Validation paused - device is warm")
            logger.warning("API key validation deferred due to thermal state")
            return
        }

        // Check network connectivity
        guard NetworkMonitor.shared.isConnected else {
            validationStatus = .offline
            return
        }

        // Perform server validation
        validationStatus = .validating
        isValidating = true

        validationTask = Task {
            do {
                let response = try await performValidation(key)

                guard !Task.isCancelled else { return }

                if response.valid {
                    validationStatus = .valid(message: response.message)
                    HapticManager.shared.notify(.success)
                } else {
                    validationStatus = .invalid(message: response.message)
                    HapticManager.shared.notify(.warning)
                }
            } catch {
                guard !Task.isCancelled else { return }

                if error is CancellationError {
                    return
                }

                logger.error("API key validation failed: \(error.localizedDescription)")
                validationStatus = .invalid(message: "Validation failed. Please try again.")
                HapticManager.shared.notify(.error)
            }

            isValidating = false
        }
    }

    private func validateKeyFormat(_ key: String) -> Bool {
        switch selectedEngine {
        case .claude:
            if !key.hasPrefix("sk-") && !key.hasPrefix("anthropic-") {
                validationStatus = .invalid(message: "Claude keys start with 'sk-' or 'anthropic-'")
                return false
            }
        case .openai:
            if !key.hasPrefix("sk-") {
                validationStatus = .invalid(message: "OpenAI keys start with 'sk-'")
                return false
            }
        case .grok:
            if !key.hasPrefix("xai-") && !key.hasPrefix("grok-") {
                validationStatus = .invalid(message: "Grok keys start with 'xai-' or 'grok-'")
                return false
            }
        case .ollama, .localCore:
            // No API key needed
            return true
        }

        if key.count < 20 {
            validationStatus = .invalid(message: "API key appears too short")
            return false
        }

        return true
    }

    private func performValidation(_ key: String) async throws -> EngineValidationResponse {
        let endpoint = "/engines/\(selectedEngine.rawValue)/validate-key"

        struct ValidationRequest: Codable {
            let apiKey: String
        }

        let response: EngineValidationResponse = try await MaiFarmAPI.shared.post(
            endpoint,
            body: ValidationRequest(apiKey: key)
        )

        return response
    }

    // MARK: - Configuration

    func saveConfiguration() async -> EngineConfigurationResult {
        isSaving = true
        defer { isSaving = false }

        do {
            let result = try await performConfiguration()

            if result.success {
                // Persist locally
                UserDefaults.standard.set(selectedEngine.rawValue, forKey: "selectedAIEngine")
                if let model = selectedModel {
                    UserDefaults.standard.set(model.id, forKey: "\(selectedEngine.rawValue)_model")
                }

                isConfigured = true
                showSuccess = true
                HapticManager.shared.celebrate()

                logger.info("Engine \(self.selectedEngine.rawValue) configured successfully")
            } else {
                errorMessage = result.message
                showError = true
                HapticManager.shared.errorShake()
            }

            return result

        } catch {
            logger.error("Configuration failed: \(error.localizedDescription)")

            let result = EngineConfigurationResult(
                success: false,
                engine: selectedEngine,
                model: selectedModel,
                message: error.localizedDescription
            )

            errorMessage = error.localizedDescription
            showError = true
            HapticManager.shared.errorShake()

            return result
        }
    }

    private func performConfiguration() async throws -> EngineConfigurationResult {
        let endpoint = "/engines/\(selectedEngine.rawValue)/configure"

        struct ConfigRequest: Codable {
            let apiKey: String?
            let model: String?
            let config: ConfigOptions?

            struct ConfigOptions: Codable {
                let acknowledged: Bool?
                let useLocal: Bool?
                let deployment: String?
            }
        }

        let request: ConfigRequest

        switch selectedEngine {
        case .claude, .openai, .grok:
            request = ConfigRequest(
                apiKey: apiKey,
                model: selectedModel?.id,
                config: nil
            )

        case .ollama:
            request = ConfigRequest(
                apiKey: nil,
                model: selectedModel?.id,
                config: ConfigRequest.ConfigOptions(
                    acknowledged: true,
                    useLocal: true,
                    deployment: nil
                )
            )

        case .localCore:
            request = ConfigRequest(
                apiKey: nil,
                model: selectedModel?.id,
                config: ConfigRequest.ConfigOptions(
                    acknowledged: true,
                    useLocal: true,
                    deployment: "local"
                )
            )
        }

        let response: EngineConfigureResponse = try await MaiFarmAPI.shared.post(endpoint, body: request)

        return EngineConfigurationResult(
            success: response.success,
            engine: selectedEngine,
            model: selectedModel,
            message: response.message ?? (response.success ? "Configuration saved" : "Configuration failed")
        )
    }

    // MARK: - Engine Status

    func loadEngineStatus(_ engine: AIEngine) async {
        do {
            let response: EngineStatusResponse = try await MaiFarmAPI.shared.get(
                "/engines/\(engine.rawValue)/status",
                cacheTTL: 60
            )

            engineStatuses[engine] = response.configured

            if engine == selectedEngine {
                isConfigured = response.configured
            }

        } catch {
            logger.error("Failed to load status for \(engine.rawValue): \(error.localizedDescription)")
            engineStatuses[engine] = false
        }
    }

    func loadAllEngineStatuses() async {
        await withTaskGroup(of: Void.self) { group in
            for engine in availableEngines {
                group.addTask {
                    await self.loadEngineStatus(engine)
                }
            }
        }
    }

    // MARK: - Model Selection

    func selectModel(_ model: AIEngineModel) {
        selectedModel = model
        HapticManager.shared.selectionChanged()

        // Persist selection
        UserDefaults.standard.set(model.id, forKey: "\(selectedEngine.rawValue)_model")
    }

    // MARK: - Helpers

    var canSave: Bool {
        switch selectedEngine {
        case .claude, .openai, .grok:
            return validationStatus.isValid && selectedModel != nil
        case .ollama, .localCore:
            return selectedModel != nil
        }
    }

    var requiresAPIKey: Bool {
        selectedEngine.requiresAPIKey
    }

    var currentModelDisplayName: String {
        selectedModel?.name ?? "Select a model"
    }

    func clearAPIKey() {
        apiKey = ""
        validationStatus = .idle
    }
}

// MARK: - API Extensions

extension MaiFarmAPI {

    func getEngineStatus(_ engine: String) async throws -> EngineStatusResponse {
        try await get("/engines/\(engine)/status", cacheTTL: 60)
    }

    func configureEngine(_ engine: String, apiKey: String?, model: String?) async throws -> EngineConfigureResponse {
        struct Request: Codable {
            let apiKey: String?
            let model: String?
        }
        return try await post("/engines/\(engine)/configure", body: Request(apiKey: apiKey, model: model))
    }

    func validateEngineKey(_ engine: String, apiKey: String) async throws -> EngineValidationResponse {
        struct Request: Codable {
            let apiKey: String
        }
        return try await post("/engines/\(engine)/validate-key", body: Request(apiKey: apiKey))
    }
}
