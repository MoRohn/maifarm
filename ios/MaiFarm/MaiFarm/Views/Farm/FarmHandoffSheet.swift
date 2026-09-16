//
//  FarmHandoffSheet.swift
//  MaiFarm
//
//  Sheet for transferring running farms to other devices (especially iMac)
//  This enables iOS users to send their farms to a more powerful device
//

import SwiftUI
import os.log

// MARK: - Farm Handoff Sheet

struct FarmHandoffSheet: View {
    let farm: Farm
    @Binding var isPresented: Bool
    var onHandoffComplete: ((Bool) -> Void)?

    @StateObject private var crossDeviceService = CrossDeviceService.shared
    @State private var eligibleDevices: [HandoffEligibleDevice] = []
    @State private var selectedDevice: HandoffEligibleDevice?
    @State private var handoffType: HandoffRequest.HandoffType = .transfer
    @State private var reason: String = ""
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showingConfirmation = false

    private let logger = Logger(subsystem: "app.maifarm", category: "FarmHandoff")

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Farm Info Header
                    farmInfoCard

                    // Device Selection
                    deviceSelectionSection

                    // Handoff Type Selection
                    handoffTypeSection

                    // Reason (Optional)
                    reasonSection

                    // Error Message
                    if let error = errorMessage {
                        errorBanner(error)
                    }

                    // Submit Button
                    submitButton
                }
                .padding()
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationTitle("Send to Device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
            .task {
                await loadEligibleDevices()
            }
            .alert("Confirm Handoff", isPresented: $showingConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Send Farm", role: .destructive) {
                    Task { await submitHandoff() }
                }
            } message: {
                if let device = selectedDevice {
                    Text("Send '\(farm.name)' to '\(device.deviceName)'?\n\nThe farm will continue running on the target device.")
                }
            }
        }
    }

    // MARK: - Farm Info Card

    @ViewBuilder
    private var farmInfoCard: some View {
        VStack(spacing: 16) {
            HStack(spacing: 16) {
                // Farm Icon
                Image(systemName: "leaf.fill")
                    .font(.largeTitle)
                    .foregroundColor(.green)
                    .frame(width: 60, height: 60)
                    .background(Color.green.opacity(0.15))
                    .cornerRadius(12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(farm.name)
                        .font(.headline)

                    HStack(spacing: 8) {
                        Label(farm.status.displayText, systemImage: farm.status.icon)
                            .font(.caption)
                            .foregroundColor(farm.status.color)

                        if let agents = farm.agents {
                            Label("\(agents.count) agents", systemImage: "person.3.fill")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    if let progress = farm.progress {
                        HStack {
                            ProgressView(value: progress)
                                .progressViewStyle(.linear)
                            Text("\(Int(progress * 100))%")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Spacer()
            }

            // Warning for active farms
            if farm.status == .running || farm.status == .active {
                HStack {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(.blue)
                    Text("Farm is currently running. It will continue on the target device.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(12)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(8)
            }
        }
        .padding()
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }

    // MARK: - Device Selection

    @ViewBuilder
    private var deviceSelectionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Select Destination")
                    .font(.headline)

                Spacer()

                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }

            if eligibleDevices.isEmpty && !isLoading {
                emptyDevicesView
            } else {
                VStack(spacing: 8) {
                    ForEach(eligibleDevices) { device in
                        DeviceSelectionRow(
                            device: device,
                            isSelected: selectedDevice?.deviceId == device.deviceId,
                            onSelect: { selectedDevice = device }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var emptyDevicesView: some View {
        VStack(spacing: 12) {
            Image(systemName: "desktopcomputer")
                .font(.system(size: 40))
                .foregroundColor(.secondary)

            Text("No Eligible Devices")
                .font(.headline)
                .foregroundColor(.secondary)

            Text("Sign in on your iMac or another device with MaiFarm to enable handoffs.")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: { Task { await loadEligibleDevices() } }) {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }

    // MARK: - Handoff Type

    @ViewBuilder
    private var handoffTypeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Handoff Type")
                .font(.headline)

            VStack(spacing: 8) {
                HandoffTypeRow(
                    type: .transfer,
                    title: "Transfer",
                    description: "Move farm to target device. Control transfers completely.",
                    icon: "arrow.right.circle.fill",
                    color: .blue,
                    isSelected: handoffType == .transfer,
                    onSelect: { handoffType = .transfer }
                )

                HandoffTypeRow(
                    type: .monitorOnly,
                    title: "Monitor Only",
                    description: "Keep control here, but allow target device to monitor.",
                    icon: "eye.circle.fill",
                    color: .green,
                    isSelected: handoffType == .monitorOnly,
                    onSelect: { handoffType = .monitorOnly }
                )
            }
        }
    }

    // MARK: - Reason

    @ViewBuilder
    private var reasonSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Reason (Optional)")
                .font(.headline)

            TextField("e.g., Need more compute power", text: $reason)
                .textFieldStyle(.roundedBorder)
        }
    }

    // MARK: - Error Banner

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text(message)
                .font(.caption)
                .foregroundColor(.red)
            Spacer()
        }
        .padding(12)
        .background(Color.red.opacity(0.1))
        .cornerRadius(8)
    }

    // MARK: - Submit Button

    @ViewBuilder
    private var submitButton: some View {
        Button(action: {
            if selectedDevice != nil {
                showingConfirmation = true
            }
        }) {
            HStack {
                if isSubmitting {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                    Text(selectedDevice != nil ? "Send to \(selectedDevice!.deviceName)" : "Select a Device")
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(selectedDevice != nil ? MaiFarmColors.primaryGreen : Color.gray)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(selectedDevice == nil || isSubmitting)
    }

    // MARK: - Actions

    private func loadEligibleDevices() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            eligibleDevices = try await crossDeviceService.getHandoffEligibleDevices(farmId: farm.id)

            // Auto-select first Mac device if available
            if selectedDevice == nil {
                selectedDevice = eligibleDevices.first { $0.deviceType == "mac" } ?? eligibleDevices.first
            }

            logger.info("Loaded \(self.eligibleDevices.count) eligible devices")
        } catch {
            errorMessage = "Failed to load devices: \(error.localizedDescription)"
            logger.error("Failed to load eligible devices: \(error.localizedDescription)")
        }
    }

    private func submitHandoff() async {
        guard let device = selectedDevice else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            _ = try await crossDeviceService.requestFarmHandoff(
                farmId: farm.id,
                targetDeviceId: device.deviceId,
                handoffType: handoffType,
                reason: reason.isEmpty ? nil : reason
            )

            logger.info("Handoff requested for farm \(self.farm.id) to device \(device.deviceId)")

            HapticManager.shared.notify(.success)
            isPresented = false
            onHandoffComplete?(true)
        } catch {
            errorMessage = "Failed to request handoff: \(error.localizedDescription)"
            logger.error("Handoff request failed: \(error.localizedDescription)")
            HapticManager.shared.notify(.error)
            onHandoffComplete?(false)
        }
    }
}

// MARK: - Device Selection Row

struct DeviceSelectionRow: View {
    let device: HandoffEligibleDevice
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 14) {
                // Device Icon
                Image(systemName: device.icon)
                    .font(.title2)
                    .foregroundColor(isSelected ? .white : deviceColor)
                    .frame(width: 44, height: 44)
                    .background(isSelected ? deviceColor : deviceColor.opacity(0.15))
                    .cornerRadius(10)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(device.deviceName)
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)

                        if device.deviceType == "mac" {
                            Text("Recommended")
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.blue.opacity(0.2))
                                .foregroundColor(.blue)
                                .cornerRadius(4)
                        }
                    }

                    HStack(spacing: 8) {
                        Text(device.computeTier.capitalized)
                            .font(.caption)
                            .foregroundColor(tierColor)

                        Label("\(device.maxAgents) agents max", systemImage: "person.3")
                            .font(.caption2)
                            .foregroundColor(.secondary)

                        if device.supportsLocalModels {
                            Label("Local AI", systemImage: "brain.head.profile")
                                .font(.caption2)
                                .foregroundColor(.purple)
                        }
                    }
                }

                Spacer()

                // Online status
                VStack(alignment: .trailing, spacing: 4) {
                    Circle()
                        .fill(device.isOnline ? .green : .gray)
                        .frame(width: 10, height: 10)

                    Text(device.isOnline ? "Online" : "Offline")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                // Selection indicator
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? MaiFarmColors.primaryGreen : .gray)
                    .font(.title2)
            }
            .padding(12)
            .background(isSelected ? MaiFarmColors.primaryGreen.opacity(0.1) : Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? MaiFarmColors.primaryGreen : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .opacity(device.isOnline ? 1.0 : 0.6)
    }

    private var deviceColor: Color {
        switch device.deviceType {
        case "mac": return .purple
        case "ipad": return .blue
        case "iphone": return .green
        default: return .gray
        }
    }

    private var tierColor: Color {
        switch device.computeTier.lowercased() {
        case "workstation": return .purple
        case "performance": return .blue
        case "standard": return .green
        default: return .orange
        }
    }
}

// MARK: - Handoff Type Row

struct HandoffTypeRow: View {
    let type: HandoffRequest.HandoffType
    let title: String
    let description: String
    let icon: String
    let color: Color
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(isSelected ? .white : color)
                    .frame(width: 44, height: 44)
                    .background(isSelected ? color : color.opacity(0.15))
                    .cornerRadius(10)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)

                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? color : .gray)
                    .font(.title2)
            }
            .padding(12)
            .background(isSelected ? color.opacity(0.1) : Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview {
    FarmHandoffSheet(
        farm: Farm(
            id: "test-farm",
            name: "Test Farm",
            status: .running,
            agents: [],
            createdAt: Date(),
            updatedAt: Date(),
            progress: 0.45,
            duration: 120,
            provider: "claude"
        ),
        isPresented: .constant(true)
    )
}
