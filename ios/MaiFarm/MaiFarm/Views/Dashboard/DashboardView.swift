//
//  DashboardView.swift
//  MaiFarm
//
//  Main Dashboard View with responsive layout for iPhone/iPad/Mac
//

import SwiftUI

// MARK: - Adaptive Dashboard View
struct AdaptiveDashboardView: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @State private var showingQuickTask = false
    @State private var showingNewFarm = false
    @State private var showingGoWild = false
    @State private var selectedFarm: String? = nil
    @State private var dashboardStats: DashboardStats = .empty
    @State private var isLoadingStats = true
    @State private var activeFarms: [Farm] = []

    let primaryGreen = MaiFarmColors.primaryGreen

    private func loadDashboardData() async {
        isLoadingStats = true
        do {
            async let statsTask = MaiFarmAPI.shared.getDashboardStats()
            async let farmsTask = MaiFarmAPI.shared.getFarms()

            let stats = try await statsTask
            let farms = try await farmsTask

            await MainActor.run {
                dashboardStats = stats
                activeFarms = farms.filter { $0.status == .running || $0.status == .active }
                isLoadingStats = false
            }
        } catch {
            await MainActor.run {
                isLoadingStats = false
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if horizontalSizeClass == .regular {
                    iPadLayout
                } else {
                    iPhoneLayout
                }
            }
            .maiFarmBackground()
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    HeaderLogoView()
                }
            }
            .sheet(isPresented: $showingQuickTask) {
                QuickTaskSheet()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showingNewFarm) {
                NewFarmSheet()
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showingGoWild) {
                GoWildSheet()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(item: $selectedFarm) { farmName in
                FarmDetailSheet(farmName: farmName)
            }
            .task {
                await loadDashboardData()
            }
            .refreshable {
                await loadDashboardData()
            }
        }
    }

    // MARK: - iPad/Mac Layout
    private var iPadLayout: some View {
        VStack(spacing: 24) {
            // Welcome header with logo
            HStack(alignment: .center, spacing: 16) {
                AppLogoImageView(size: 64, showShadow: true)

                VStack(alignment: .leading, spacing: 4) {
                    Text("MaiFarm")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("AI-Powered Development")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)

            // App Capabilities Section (expanded by default)
            AppCapabilitiesSection()
                .padding(.horizontal, 24)

            // Device Capabilities Section (collapsed by default)
            CollapsibleDeviceCapabilitiesSection()
                .padding(.horizontal, 24)

            // Large Quick Actions - Full width cards
            VStack(alignment: .leading, spacing: 16) {
                Text("Quick Actions")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 24)

                HStack(spacing: 20) {
                    LargeQuickActionCard(
                        icon: "bolt.fill",
                        title: "Quick Task",
                        subtitle: "Get AI help in just 5 minutes",
                        color: primaryGreen
                    ) {
                        showingQuickTask = true
                    }

                    LargeQuickActionCard(
                        icon: "leaf.fill",
                        title: "New Farm",
                        subtitle: "Deploy multiple AI agents",
                        color: .blue
                    ) {
                        showingNewFarm = true
                    }

                    LargeQuickActionCard(
                        icon: "sparkles",
                        title: "Go Wild",
                        subtitle: "Autonomous exploration mode",
                        color: .purple
                    ) {
                        showingGoWild = true
                    }
                }
                .padding(.horizontal, 24)
            }

            // Two column grid for other content
            HStack(alignment: .top, spacing: 20) {
                // Left column - Active Farms
                activeFarmsSection
                    .padding(20)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(20)
                    .frame(maxWidth: .infinity)

                // Right column - Stats
                statisticsSection
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 24)

            // Recent Activity
            recentActivitySection
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
        }
    }

    // MARK: - iPhone Layout
    private var iPhoneLayout: some View {
        VStack(spacing: 20) {
            // Logo header for iPhone
            HStack(spacing: 12) {
                AppLogoImageView(size: 48, showShadow: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("MaiFarm")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("AI-Powered Development")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(.bottom, 4)

            // App Capabilities Section
            AppCapabilitiesSection()

            // Device Capabilities Section (collapsed by default)
            CollapsibleDeviceCapabilitiesSection()

            VStack(alignment: .leading, spacing: 16) {
                Text("Quick Actions")
                    .font(.headline)
                    .foregroundColor(.secondary)

                HStack(spacing: 12) {
                    QuickActionCard(icon: "bolt.fill", title: "Quick Task", subtitle: "Rapid", color: primaryGreen) {
                        showingQuickTask = true
                    }
                    QuickActionCard(icon: "leaf.fill", title: "New Farm", subtitle: "Create", color: .blue) {
                        showingNewFarm = true
                    }
                    QuickActionCard(icon: "sparkles", title: "Go Wild", subtitle: "Explore", color: .purple) {
                        showingGoWild = true
                    }
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                Text("Active Farms")
                    .font(.headline)
                    .foregroundColor(.secondary)

                if isLoadingStats {
                    FarmCardPlaceholder()
                    FarmCardPlaceholder()
                } else if activeFarms.isEmpty {
                    EmptyFarmsCardCompact()
                } else {
                    ForEach(activeFarms.prefix(2)) { farm in
                        FarmCardTappable(
                            name: farm.name,
                            agents: farm.agents.count,
                            progress: farm.progress ?? 0,
                            color: farm.status.color
                        ) {
                            selectedFarm = farm.name
                        }
                    }
                }
            }

            HStack(spacing: 16) {
                StatCard(value: isLoadingStats ? "..." : "\(dashboardStats.tasksCompleted)", label: "Tasks", color: primaryGreen)
                StatCard(value: isLoadingStats ? "..." : "\(dashboardStats.farmsCreated)", label: "Farms", color: .blue)
                StatCard(value: isLoadingStats ? "..." : String(format: "%.0f%%", dashboardStats.successRate), label: "Success", color: .purple)
            }
        }
        .padding()
    }

    // MARK: - Helper Views
    private var activeFarmsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Active Farms")
                    .font(.title2)
                    .fontWeight(.semibold)
                Spacer()
                if !activeFarms.isEmpty {
                    Button("See All") {}
                        .font(.subheadline)
                }
            }

            VStack(spacing: 12) {
                if isLoadingStats {
                    ForEach(0..<3, id: \.self) { _ in
                        FarmCardPlaceholder()
                    }
                } else if activeFarms.isEmpty {
                    EmptyFarmsCard(onCreateFarm: { showingNewFarm = true })
                } else {
                    ForEach(activeFarms.prefix(3)) { farm in
                        LargeFarmCard(
                            name: farm.name,
                            agents: farm.agents.count,
                            progress: farm.progress ?? 0,
                            status: farm.status.displayName,
                            color: farm.status.color
                        ) {
                            selectedFarm = farm.name
                        }
                    }
                }
            }
        }
    }

    private var statisticsSection: some View {
        VStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Statistics")
                    .font(.title2)
                    .fontWeight(.semibold)

                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    LargeStatCard(value: isLoadingStats ? "..." : "\(dashboardStats.tasksCompleted)", label: "Tasks Completed", icon: "checkmark.circle.fill", color: primaryGreen)
                    LargeStatCard(value: isLoadingStats ? "..." : "\(dashboardStats.farmsCreated)", label: "Farms Created", icon: "leaf.fill", color: .blue)
                    LargeStatCard(value: isLoadingStats ? "..." : String(format: "%.0f%%", dashboardStats.successRate), label: "Success Rate", icon: "chart.line.uptrend.xyaxis", color: .purple)
                    LargeStatCard(value: isLoadingStats ? "..." : String(format: "%.0fh", dashboardStats.timeSaved), label: "Time Saved", icon: "clock.fill", color: .orange)
                }
            }
            .padding(20)
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(20)
        }
    }

    private var recentActivitySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Recent Activity")
                    .font(.title2)
                    .fontWeight(.semibold)
                Spacer()
            }

            HStack(spacing: 16) {
                RecentActivityCard(title: "OAuth Implementation", type: "Completed", time: "2 hours ago", icon: "checkmark.circle.fill", color: .green)
                RecentActivityCard(title: "Code Review", type: "In Progress", time: "30 min ago", icon: "arrow.triangle.2.circlepath", color: .blue)
                RecentActivityCard(title: "Bug Analysis", type: "Queued", time: "Just now", icon: "clock.fill", color: .orange)
            }
        }
    }
}

// MARK: - Large Quick Action Card (iPad)
struct LargeQuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: icon)
                        .font(.title)
                        .foregroundColor(.white)
                    Spacer()
                    Image(systemName: "arrow.right.circle.fill")
                        .foregroundColor(.white.opacity(0.7))
                }

                Spacer()

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)

                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, minHeight: 140)
            .background(
                LinearGradient(
                    colors: [color, color.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .cornerRadius(20)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Large Farm Card (iPad)
struct LargeFarmCard: View {
    let name: String
    let agents: Int
    let progress: Double
    let status: String
    let color: Color
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Circle()
                    .fill(color.opacity(0.2))
                    .frame(width: 50, height: 50)
                    .overlay(
                        Image(systemName: "leaf.fill")
                            .foregroundColor(color)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text("\(agents) agents • \(status)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text("\(Int(progress * 100))%")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(color)

                    ProgressView(value: progress)
                        .tint(color)
                        .frame(width: 80)
                }

                Image(systemName: "chevron.right")
                    .foregroundColor(.secondary)
            }
            .padding(16)
            .background(Color(.tertiarySystemGroupedBackground))
            .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Large Stat Card (iPad)
struct LargeStatCard: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(color)
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(value)
                    .font(.title)
                    .fontWeight(.bold)
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(16)
        .background(Color(.tertiarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Recent Activity Card
struct RecentActivityCard: View {
    let title: String
    let type: String
    let time: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Spacer()
                Text(type)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(color.opacity(0.2))
                    .foregroundColor(color)
                    .cornerRadius(8)
            }

            Text(title)
                .font(.headline)
                .lineLimit(2)

            Text(time)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Empty Farms Card Compact (iPhone)
struct EmptyFarmsCardCompact: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "leaf.circle")
                .font(.title)
                .foregroundColor(MaiFarmColors.primaryGreen.opacity(0.5))

            VStack(alignment: .leading, spacing: 2) {
                Text("No Active Farms")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text("Create a farm to get started")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}

// MARK: - App Capabilities Section
struct AppCapabilitiesSection: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Capabilities")
                .font(.headline)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                CapabilityBadge(icon: "cpu", label: "AI Processing", enabled: true)
                CapabilityBadge(icon: "bolt.fill", label: "Quick Tasks", enabled: true)
                CapabilityBadge(icon: "leaf.fill", label: "Multi-Agent", enabled: deviceManager.computeTier != .limited)
                CapabilityBadge(icon: "sparkles", label: "Go Wild", enabled: deviceManager.computeTier != .limited)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Collapsible Device Capabilities Section
struct CollapsibleDeviceCapabilitiesSection: View {
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: { withAnimation { isExpanded.toggle() } }) {
                HStack {
                    Text("Device Info")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    DeviceInfoRow(label: "Compute Tier", value: deviceManager.computeTier.rawValue)
                    DeviceInfoRow(label: "Max Agents", value: "\(deviceManager.computeTier.maxAgents)")
                    DeviceInfoRow(label: "Max Duration", value: "\(deviceManager.computeTier.maxFarmDuration)h")
                    DeviceInfoRow(label: "Local AI", value: deviceManager.computeTier.supportsLocalModels ? "Supported" : "Not Available")
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Capability Badge
struct CapabilityBadge: View {
    let icon: String
    let label: String
    let enabled: Bool

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(enabled ? MaiFarmColors.primaryGreen : .gray)
            Text(label)
                .font(.caption2)
                .foregroundColor(enabled ? .primary : .secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(enabled ? MaiFarmColors.primaryGreen.opacity(0.1) : Color(.tertiarySystemGroupedBackground))
        .cornerRadius(10)
    }
}

// MARK: - Device Info Row
struct DeviceInfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
    }
}

// MARK: - String Extension for Identifiable
extension String: @retroactive Identifiable {
    public var id: String { self }
}

// MARK: - Previews
#Preview("Dashboard - iPhone") {
    AdaptiveDashboardView()
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Large Quick Action Card") {
    LargeQuickActionCard(
        icon: "bolt.fill",
        title: "Quick Task",
        subtitle: "Get AI help in just 5 minutes",
        color: MaiFarmColors.primaryGreen
    )
    .frame(width: 300)
    .padding()
}
