//
//  FarmsView.swift
//  MaiFarm
//
//  Farms View - List and manage AI agent farms
//  Displays real farms from AppState, not hardcoded data
//

import SwiftUI

// MARK: - Adaptive Farms View
struct AdaptiveFarmsView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @State private var showingNewFarm = false
    @State private var selectedFarm: Farm? = nil
    @State private var editingFarm: Farm? = nil
    @State private var showingDeleteAlert = false
    @State private var farmToDelete: Farm? = nil
    @State private var showingStopAlert = false
    @State private var farmToStop: Farm? = nil
    @State private var isRefreshing = false

    // Filter farms by status using FarmStatus enum
    private var activeFarms: [Farm] {
        appState.farms.filter { farm in
            farm.status == .running || farm.status == .active || farm.status == .launching
        }
    }

    private var completedFarms: [Farm] {
        appState.farms.filter { farm in
            farm.status == .completed
        }
    }

    private var failedFarms: [Farm] {
        appState.farms.filter { farm in
            farm.status == .failed
        }
    }

    private var pendingFarms: [Farm] {
        appState.farms.filter { farm in
            farm.status == .idle || farm.status == .recovering
        }
    }

    var body: some View {
        NavigationStack {
            List {
                // Device limit notice
                if deviceManager.computeTier != .workstation {
                    Section {
                        HStack {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(.blue)
                            VStack(alignment: .leading) {
                                Text("Device Limit: \(deviceManager.computeTier.maxAgents) agents")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text("Upgrade to Mac for up to 10 agents")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                // Empty state
                if appState.farms.isEmpty {
                    Section {
                        VStack(spacing: 16) {
                            Image(systemName: "leaf.circle")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary)
                            Text("No Farms Yet")
                                .font(.headline)
                            Text("Create your first farm to get started with AI agent orchestration.")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                            Button(action: { showingNewFarm = true }) {
                                Label("Create Farm", systemImage: "plus.circle.fill")
                                    .font(.headline)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                    }
                }

                // Active farms section
                if !activeFarms.isEmpty {
                    Section("Active (\(activeFarms.count))") {
                        ForEach(activeFarms) { farm in
                            FarmRowView(
                                farm: farm,
                                onTap: { selectedFarm = farm },
                                onEdit: { editingFarm = farm },
                                onDelete: {
                                    farmToDelete = farm
                                    showingDeleteAlert = true
                                },
                                onStop: {
                                    farmToStop = farm
                                    showingStopAlert = true
                                }
                            )
                        }
                    }
                }

                // Pending farms section
                if !pendingFarms.isEmpty {
                    Section("Pending (\(pendingFarms.count))") {
                        ForEach(pendingFarms) { farm in
                            FarmRowView(
                                farm: farm,
                                onTap: { selectedFarm = farm },
                                onEdit: { editingFarm = farm },
                                onDelete: {
                                    farmToDelete = farm
                                    showingDeleteAlert = true
                                },
                                onStop: nil
                            )
                        }
                    }
                }

                // Completed farms section
                if !completedFarms.isEmpty {
                    Section("Completed (\(completedFarms.count))") {
                        ForEach(completedFarms) { farm in
                            FarmRowView(
                                farm: farm,
                                onTap: { selectedFarm = farm },
                                onEdit: { editingFarm = farm },
                                onDelete: {
                                    farmToDelete = farm
                                    showingDeleteAlert = true
                                },
                                onStop: nil
                            )
                        }
                    }
                }

                // Failed farms section
                if !failedFarms.isEmpty {
                    Section("Failed (\(failedFarms.count))") {
                        ForEach(failedFarms) { farm in
                            FarmRowView(
                                farm: farm,
                                onTap: { selectedFarm = farm },
                                onEdit: nil,
                                onDelete: {
                                    farmToDelete = farm
                                    showingDeleteAlert = true
                                },
                                onStop: nil
                            )
                        }
                    }
                }
            }
            .navigationTitle("Farms")
            .scrollContentBackground(.hidden)
            .maiFarmBackground()
            .refreshable {
                await refreshFarms()
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingNewFarm = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewFarm) {
                NewFarmSheet()
                    .environmentObject(appState)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(item: $selectedFarm) { farm in
                FarmDetailsSheet(farm: farm)
                    .environmentObject(appState)
            }
            .sheet(item: $editingFarm) { farm in
                EditFarmSheet(farm: farm)
                    .environmentObject(appState)
            }
            .alert("Delete Farm", isPresented: $showingDeleteAlert) {
                Button("Cancel", role: .cancel) {
                    farmToDelete = nil
                }
                Button("Delete", role: .destructive) {
                    if let farm = farmToDelete {
                        deleteFarm(farm)
                    }
                }
            } message: {
                Text("Are you sure you want to delete '\(farmToDelete?.name ?? "")'? This action cannot be undone.")
            }
            .alert("Stop Farm", isPresented: $showingStopAlert) {
                Button("Cancel", role: .cancel) {
                    farmToStop = nil
                }
                Button("Stop", role: .destructive) {
                    if let farm = farmToStop {
                        stopFarm(farm)
                    }
                }
            } message: {
                Text("Are you sure you want to stop '\(farmToStop?.name ?? "")'? Agents will be terminated and results collected.")
            }
            .onAppear {
                Task {
                    await refreshFarms()
                }
            }
        }
    }

    private func refreshFarms() async {
        isRefreshing = true
        await appState.refreshFarms()
        isRefreshing = false
    }

    private func deleteFarm(_ farm: Farm) {
        Task {
            await appState.deleteFarm(farm.id)
        }
        farmToDelete = nil
    }

    private func stopFarm(_ farm: Farm) {
        Task {
            await appState.stopFarm(farm.id)
        }
        farmToStop = nil
    }
}

// MARK: - Farm Row View (Uses Farm Model)
struct FarmRowView: View {
    let farm: Farm
    let onTap: () -> Void
    var onEdit: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var onStop: (() -> Void)? = nil

    // Use the FarmStatus.color computed property
    private var statusColor: Color {
        farm.status.color
    }

    private var agentCount: Int {
        farm.agents.count
    }

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(farm.name)
                        .font(.headline)
                        .foregroundColor(.primary)

                    HStack(spacing: 12) {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(farm.status.displayName)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Text("\(agentCount) agent\(agentCount == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        HStack(spacing: 4) {
                            Image(systemName: "cpu")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Text(farm.provider.capitalized)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Spacer()

                if farm.status == .running || farm.status == .launching {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if let delete = onDelete {
                Button(role: .destructive, action: delete) {
                    Label("Delete", systemImage: "trash")
                }
            }

            if let edit = onEdit {
                Button(action: edit) {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(.blue)
            }

            if let stop = onStop, farm.status == .running {
                Button(action: stop) {
                    Label("Stop", systemImage: "stop.fill")
                }
                .tint(.orange)
            }
        }
    }
}

// MARK: - Farm Details Sheet (Uses Farm Model)
struct FarmDetailsSheet: View {
    let farm: Farm
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var showingHandoffSheet = false

    // Check if farm is eligible for handoff (running, active, or launching)
    private var canHandoff: Bool {
        farm.status == .running || farm.status == .active || farm.status == .launching
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Farm Details") {
                    LabeledContent("Name", value: farm.name)
                    LabeledContent("Status", value: farm.status.displayName)
                    LabeledContent("AI Provider", value: farm.provider.capitalized)
                    LabeledContent("Agents", value: "\(farm.agents.count)")
                    LabeledContent("Duration", value: "\(farm.duration) hour\(farm.duration == 1 ? "" : "s")")
                }

                if !farm.agents.isEmpty {
                    Section("Agents") {
                        ForEach(farm.agents) { agent in
                            HStack {
                                Circle()
                                    .fill(agent.status == .running ? Color.green : Color.gray)
                                    .frame(width: 8, height: 8)
                                Text(agent.name)
                                    .font(.subheadline)
                                Spacer()
                                Text(agent.status.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Section("Timestamps") {
                    LabeledContent("Created", value: farm.createdAt.formatted())
                    LabeledContent("Updated", value: farm.updatedAt.formatted())
                }

                // Cross-Device Actions Section
                if canHandoff {
                    Section("Cross-Device") {
                        Button {
                            HapticManager.shared.impact(.medium)
                            showingHandoffSheet = true
                        } label: {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color.blue.opacity(0.15))
                                        .frame(width: 36, height: 36)
                                    Image(systemName: "desktopcomputer")
                                        .foregroundColor(.blue)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Send to iMac")
                                        .font(.body)
                                        .fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    Text("Transfer this farm to a more powerful device")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle(farm.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingHandoffSheet) {
                FarmHandoffSheet(
                    farm: farm,
                    isPresented: $showingHandoffSheet,
                    onHandoffComplete: { success in
                        if success {
                            appState.showToast("Farm handoff requested!", type: .success)
                        }
                    }
                )
            }
        }
    }
}

// MARK: - Edit Farm Sheet (Uses Farm Model)
struct EditFarmSheet: View {
    let farm: Farm
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var name: String = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Farm Details") {
                    TextField("Farm Name", text: $name)
                }

                Section {
                    Text("Edit functionality coming soon. You can rename your farm here.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Edit Farm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveFarm()
                    }
                    .disabled(name.isEmpty || isSaving)
                }
            }
            .onAppear {
                name = farm.name
            }
        }
    }

    private func saveFarm() {
        isSaving = true
        Task {
            // TODO: Implement actual rename API call
            try? await Task.sleep(nanoseconds: 500_000_000)
            await MainActor.run {
                appState.showToast("Farm renamed to '\(name)'", type: .success)
                HapticManager.shared.notify(.success)
                dismiss()
            }
        }
    }
}

// MARK: - Previews
#Preview("Farms View") {
    AdaptiveFarmsView()
        .environmentObject(AppState.shared)
        .environmentObject(DeviceCapabilityManager.shared)
}
