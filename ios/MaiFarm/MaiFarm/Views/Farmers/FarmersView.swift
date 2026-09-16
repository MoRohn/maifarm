//
//  FarmersView.swift
//  MaiFarm
//
//  Farmers View - Browse and select farmer templates
//

import SwiftUI

// MARK: - Adaptive Farmers View
struct AdaptiveFarmersView: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @State private var farmerGroups: [FarmerGroup] = []
    @State private var allFarmers: [FarmerTemplate] = []
    @State private var favoriteFarmers: [FarmerTemplate] = []
    @State private var selectedGroupId: String? = nil
    @State private var selectedFarmer: FarmerTemplate? = nil
    @State private var isLoading = true
    @State private var errorMessage: String? = nil
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Group filter pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        // All farmers pill
                        GroupPill(
                            name: "All",
                            icon: "square.grid.2x2.fill",
                            count: allFarmers.count,
                            isSelected: selectedGroupId == nil,
                            color: .blue
                        ) {
                            selectedGroupId = nil
                        }

                        // Favorites pill
                        if !favoriteFarmers.isEmpty {
                            GroupPill(
                                name: "Favorites",
                                icon: "star.fill",
                                count: favoriteFarmers.count,
                                isSelected: selectedGroupId == "favorites",
                                color: .yellow
                            ) {
                                selectedGroupId = "favorites"
                            }
                        }

                        // Group pills
                        ForEach(farmerGroups) { group in
                            GroupPill(
                                name: group.name,
                                icon: nil,
                                emoji: group.icon,
                                count: group.farmerCount,
                                isSelected: selectedGroupId == group.id,
                                color: colorFromString(group.color)
                            ) {
                                selectedGroupId = group.id
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 12)
                }
                .background(MaiFarmColors.adaptiveSecondaryBackground.opacity(0.5))

                if isLoading {
                    Spacer()
                    ProgressView("Loading farmers...")
                        .progressViewStyle(CircularProgressViewStyle())
                    Spacer()
                } else if let error = errorMessage {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.largeTitle)
                            .foregroundColor(.orange)
                        Text(error)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                        Button("Retry") {
                            Task { await loadData() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    Spacer()
                } else {
                    // Farmers grid
                    ScrollView {
                        LazyVGrid(columns: gridColumns, spacing: 16) {
                            ForEach(filteredFarmers) { farmer in
                                FarmerCardView(
                                    farmer: farmer,
                                    onTap: { selectedFarmer = farmer },
                                    onFavoriteToggle: { toggleFavorite(farmer) }
                                )
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Farmers")
            .searchable(text: $searchText, prompt: "Search farmers...")
            .maiFarmBackground()
            .sheet(item: $selectedFarmer) { farmer in
                FarmerDetailSheet(farmer: farmer)
            }
            .task {
                await loadData()
            }
            .refreshable {
                await loadData()
            }
        }
    }

    private var gridColumns: [GridItem] {
        if horizontalSizeClass == .regular {
            return [GridItem(.adaptive(minimum: 280, maximum: 350), spacing: 16)]
        } else {
            return [GridItem(.flexible(), spacing: 16)]
        }
    }

    private var filteredFarmers: [FarmerTemplate] {
        var farmers: [FarmerTemplate]

        if selectedGroupId == "favorites" {
            farmers = favoriteFarmers
        } else if let groupId = selectedGroupId {
            farmers = allFarmers.filter { $0.groupId == groupId }
        } else {
            farmers = allFarmers
        }

        if searchText.isEmpty {
            return farmers
        }

        let search = searchText.lowercased()
        return farmers.filter { farmer in
            farmer.name.lowercased().contains(search) ||
            (farmer.description?.lowercased().contains(search) ?? false) ||
            farmer.specialties.contains { $0.lowercased().contains(search) }
        }
    }

    private func loadData() async {
        isLoading = true
        errorMessage = nil

        do {
            async let groupsTask = MaiFarmAPI.shared.getFarmerGroups()
            async let farmersTask = MaiFarmAPI.shared.getAllFarmers()
            async let favoritesTask = MaiFarmAPI.shared.getFavoriteFarmers()

            let (groups, farmers, favorites) = try await (groupsTask, farmersTask, favoritesTask)

            await MainActor.run {
                farmerGroups = groups
                allFarmers = farmers
                favoriteFarmers = favorites
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = "Failed to load farmers: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }

    private func toggleFavorite(_ farmer: FarmerTemplate) {
        Task {
            do {
                let response = try await MaiFarmAPI.shared.toggleFarmerFavorite(farmer.id)
                await MainActor.run {
                    if response.isFavorite {
                        if !favoriteFarmers.contains(where: { $0.id == farmer.id }) {
                            favoriteFarmers.append(farmer)
                        }
                        HapticManager.shared.notify(.success)
                    } else {
                        favoriteFarmers.removeAll { $0.id == farmer.id }
                    }
                }
            } catch {
                await MainActor.run {
                    AppState.shared.showToast("Failed to update favorite", type: .error)
                }
            }
        }
    }

    private func colorFromString(_ colorString: String?) -> Color {
        guard let color = colorString else { return .blue }
        if color.contains("purple") { return .purple }
        if color.contains("blue") { return .blue }
        if color.contains("green") { return .green }
        if color.contains("orange") { return .orange }
        if color.contains("pink") { return .pink }
        if color.contains("amber") || color.contains("yellow") { return .yellow }
        return .blue
    }
}

// MARK: - Group Pill
struct GroupPill: View {
    let name: String
    let icon: String?
    var emoji: String? = nil
    let count: Int
    let isSelected: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let emoji = emoji {
                    Text(emoji)
                        .font(.system(size: 16))
                } else if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .semibold))
                }

                Text(name)
                    .font(.system(size: 14, weight: .medium))

                Text("\(count)")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(isSelected ? Color.white.opacity(0.25) : Color.gray.opacity(0.2))
                    .cornerRadius(8)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                isSelected
                    ? color.opacity(0.9)
                    : MaiFarmColors.adaptiveSecondaryBackground
            )
            .foregroundColor(isSelected ? .white : .primary)
            .cornerRadius(20)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(isSelected ? Color.clear : Color.gray.opacity(0.3), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Farmer Card View
struct FarmerCardView: View {
    let farmer: FarmerTemplate
    let onTap: () -> Void
    let onFavoriteToggle: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                // Header with icon and favorite
                HStack {
                    Text(farmer.icon)
                        .font(.system(size: 36))
                        .frame(width: 56, height: 56)
                        .background(MaiFarmColors.primaryGreen.opacity(0.15))
                        .cornerRadius(14)

                    Spacer()

                    // Favorite button
                    Button(action: onFavoriteToggle) {
                        Image(systemName: farmer.isFavorite ? "star.fill" : "star")
                            .font(.system(size: 18))
                            .foregroundColor(farmer.isFavorite ? .yellow : .gray)
                    }
                    .buttonStyle(.plain)
                }

                // Name and description
                VStack(alignment: .leading, spacing: 4) {
                    Text(farmer.name)
                        .font(.headline)
                        .foregroundColor(.primary)

                    if let description = farmer.description {
                        Text(description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }

                // Stats row
                HStack(spacing: 12) {
                    // Rating
                    if let rating = farmer.averageRating, rating > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.yellow)
                            Text(String(format: "%.1f", rating))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    // Usage count
                    if farmer.usageCount > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "chart.bar.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.blue)
                            Text("\(farmer.usageCount) uses")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    // Default agents
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.green)
                        Text("\(farmer.defaultAgentCount)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                // Specialties tags
                if !farmer.specialties.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(farmer.specialties.prefix(3), id: \.self) { specialty in
                                Text(specialty)
                                    .font(.system(size: 10, weight: .medium))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(MaiFarmColors.primaryGreen.opacity(0.1))
                                    .foregroundColor(MaiFarmColors.primaryGreen)
                                    .cornerRadius(6)
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(MaiFarmColors.adaptiveSecondaryBackground)
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Farmer Detail Sheet
struct FarmerDetailSheet: View {
    let farmer: FarmerTemplate
    @Environment(\.dismiss) var dismiss
    @State private var showingCreateFarm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 16) {
                        Text(farmer.icon)
                            .font(.system(size: 72))
                            .frame(width: 120, height: 120)
                            .background(MaiFarmColors.primaryGreen.opacity(0.15))
                            .cornerRadius(28)

                        VStack(spacing: 8) {
                            Text(farmer.name)
                                .font(.title)
                                .fontWeight(.bold)

                            if let description = farmer.description {
                                Text(description)
                                    .font(.body)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                        }
                    }
                    .padding(.top)

                    // Stats cards
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        StatCard(value: farmer.averageRating.map { String(format: "%.1f ⭐", $0) } ?? "N/A", label: "Rating", color: .yellow)
                        StatCard(value: "\(farmer.usageCount)", label: "Uses", color: .blue)
                        StatCard(value: "\(farmer.defaultAgentCount)", label: "Agents", color: .green)
                        StatCard(value: "\(farmer.defaultDuration) min", label: "Duration", color: .orange)
                    }
                    .padding(.horizontal)

                    // Specialties
                    if !farmer.specialties.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Specialties")
                                .font(.headline)
                                .padding(.horizontal)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(farmer.specialties, id: \.self) { specialty in
                                        Text(specialty)
                                            .font(.subheadline)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 8)
                                            .background(MaiFarmColors.primaryGreen.opacity(0.1))
                                            .foregroundColor(MaiFarmColors.primaryGreen)
                                            .cornerRadius(12)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    // Capabilities
                    if !farmer.capabilities.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Capabilities")
                                .font(.headline)
                                .padding(.horizontal)

                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(farmer.capabilities, id: \.self) { capability in
                                    HStack(spacing: 10) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(.green)
                                        Text(capability)
                                            .font(.subheadline)
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }

                    // Create farm button
                    Button(action: { showingCreateFarm = true }) {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("Create Farm with \(farmer.name)")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(MaiFarmColors.primaryGreen)
                        .cornerRadius(14)
                    }
                    .padding(.horizontal)
                    .padding(.bottom)
                }
            }
            .maiFarmBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .sheet(isPresented: $showingCreateFarm) {
                CreateFarmFromFarmerSheet(farmer: farmer)
            }
        }
    }
}

// MARK: - Create Farm from Farmer Sheet
struct CreateFarmFromFarmerSheet: View {
    let farmer: FarmerTemplate
    @Environment(\.dismiss) var dismiss
    @State private var taskDescription = ""
    @State private var agentCount: Int
    @State private var duration: Int
    @State private var isCreating = false

    init(farmer: FarmerTemplate) {
        self.farmer = farmer
        _agentCount = State(initialValue: farmer.defaultAgentCount)
        _duration = State(initialValue: farmer.defaultDuration)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        Text(farmer.icon)
                            .font(.system(size: 40))
                            .frame(width: 60, height: 60)
                            .background(MaiFarmColors.primaryGreen.opacity(0.15))
                            .cornerRadius(14)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(farmer.name)
                                .font(.headline)
                            if let desc = farmer.description {
                                Text(desc)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .listRowBackground(Color.clear)
                }

                Section("Task Description") {
                    TextField("What would you like this farmer to do?", text: $taskDescription, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Configuration") {
                    Stepper("Agents: \(agentCount)", value: $agentCount, in: 1...10)
                    Stepper("Duration: \(duration) minutes", value: $duration, in: 15...360, step: 15)
                }
            }
            .navigationTitle("New Farm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        createFarm()
                    }
                    .disabled(taskDescription.isEmpty || isCreating)
                }
            }
        }
    }

    private func createFarm() {
        isCreating = true
        Task {
            do {
                let request = CreateFarmRequest(
                    name: "\(farmer.name) Farm",
                    agentCount: agentCount,
                    duration: duration,
                    taskDescription: taskDescription,
                    farmerTemplateId: farmer.id
                )
                _ = try await MaiFarmAPI.shared.createFarm(request)
                await MainActor.run {
                    HapticManager.shared.notify(.success)
                    AppState.shared.showToast("Farm created successfully!", type: .success)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isCreating = false
                    AppState.shared.showToast("Failed to create farm: \(error.localizedDescription)", type: .error)
                }
            }
        }
    }
}

// MARK: - Previews
#Preview("Farmers View") {
    AdaptiveFarmersView()
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Group Pill") {
    HStack(spacing: 10) {
        GroupPill(name: "All", icon: "square.grid.2x2.fill", count: 12, isSelected: true, color: .blue) {}
        GroupPill(name: "Favorites", icon: "star.fill", count: 3, isSelected: false, color: .yellow) {}
    }
    .padding()
}
