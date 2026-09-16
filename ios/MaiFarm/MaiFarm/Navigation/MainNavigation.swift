//
//  MainNavigation.swift
//  MaiFarm
//
//  Main Navigation Components - Tab Bar, Sidebar, and Adaptive Layout
//

import SwiftUI

// MARK: - Adaptive Main View
/// Automatically switches between sidebar (iPad/Mac) and tab bar (iPhone) navigation
struct AdaptiveMainView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @Environment(\.horizontalSizeClass) var horizontalSizeClass

    var body: some View {
        Group {
            if deviceManager.deviceType.supportsSidebar && horizontalSizeClass == .regular {
                // Mac/iPad: Sidebar navigation
                NavigationSplitView {
                    SidebarView(selectedTab: $selectedTab)
                } detail: {
                    DetailView(selectedTab: selectedTab)
                }
                .navigationSplitViewStyle(.balanced)
            } else {
                // iPhone: Tab bar navigation
                MainTabView(selectedTab: $selectedTab)
            }
        }
        #if targetEnvironment(macCatalyst) || os(macOS)
        .commands {
            // Mac menu bar commands
            CommandGroup(after: .newItem) {
                Button("New Farm") {
                    // Create new farm
                }
                .keyboardShortcut("n", modifiers: [.command])

                Button("Quick Task") {
                    // Start quick task
                }
                .keyboardShortcut("t", modifiers: [.command, .shift])
            }
        }
        #endif
    }
}

// MARK: - Main Tab View (iPhone)
struct MainTabView: View {
    @Binding var selectedTab: Int

    var body: some View {
        TabView(selection: $selectedTab) {
            AdaptiveDashboardView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)

            AdaptiveFarmsView()
                .tabItem {
                    Label("Farms", systemImage: "square.stack.3d.up.fill")
                }
                .tag(1)

            AdaptiveFarmersView()
                .tabItem {
                    Label("Farmers", systemImage: "person.3.fill")
                }
                .tag(2)

            AdaptiveHarvestView()
                .tabItem {
                    Label("Harvest", systemImage: "trophy.fill")
                }
                .tag(3)

            AdaptiveBarnView()
                .tabItem {
                    Label("Barn", systemImage: "archivebox.fill")
                }
                .tag(4)

            AdaptiveSettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(5)
        }
        .tint(MaiFarmColors.primaryGreen)
    }
}

// MARK: - Sidebar View (Mac/iPad)
struct SidebarView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var deviceManager: DeviceCapabilityManager
    @State private var showingQuickActionsModal = false
    @State private var showingNewFarm = false
    @State private var showingQuickTask = false
    @State private var showingGoWild = false

    var body: some View {
        List {
            Section("Main") {
                SidebarButton(
                    label: "Dashboard",
                    icon: "house.fill",
                    isSelected: selectedTab == 0
                ) { selectedTab = 0 }

                SidebarButton(
                    label: "Farms",
                    icon: "leaf.fill",
                    isSelected: selectedTab == 1
                ) { selectedTab = 1 }

                SidebarButton(
                    label: "Farmers",
                    icon: "person.crop.circle.badge.checkmark",
                    isSelected: selectedTab == 2
                ) { selectedTab = 2 }

                SidebarButton(
                    label: "Harvest",
                    icon: "tray.full.fill",
                    isSelected: selectedTab == 3
                ) { selectedTab = 3 }

                SidebarButton(
                    label: "Barn",
                    icon: "shippingbox.fill",
                    isSelected: selectedTab == 4
                ) { selectedTab = 4 }
            }

            Section("Quick Actions") {
                // Single green plus button that opens modal
                Button(action: { showingQuickActionsModal = true }) {
                    HStack {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [MaiFarmColors.primaryGreen, MaiFarmColors.accentGreen],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 36, height: 36)

                            Image(systemName: "plus")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                        }

                        Text("Create New")
                            .font(.subheadline)
                            .fontWeight(.medium)

                        Spacer()
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }

            Section {
                SidebarButton(
                    label: "Settings",
                    icon: "gearshape.fill",
                    isSelected: selectedTab == 5
                ) { selectedTab = 5 }
            }

            // Device capabilities section
            Section("Device") {
                HStack {
                    Image(systemName: deviceIcon)
                        .foregroundColor(.blue)
                    VStack(alignment: .leading) {
                        Text(deviceManager.deviceType.displayName)
                            .font(.caption)
                        Text(deviceManager.computeTier.rawValue)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                HStack {
                    Text("Max Agents")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(deviceManager.computeTier.maxAgents)")
                        .font(.caption)
                        .fontWeight(.semibold)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("MaiFarm")
        .sheet(isPresented: $showingQuickActionsModal) {
            QuickActionsModalView(
                showingNewFarm: $showingNewFarm,
                showingQuickTask: $showingQuickTask,
                showingGoWild: $showingGoWild,
                dismissModal: { showingQuickActionsModal = false }
            )
            .presentationDetents([.height(320)])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingNewFarm) {
            NewFarmSheet()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingQuickTask) {
            QuickTaskSheet()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingGoWild) {
            GoWildSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    var deviceIcon: String {
        switch deviceManager.deviceType {
        case .mac: return "desktopcomputer"
        case .iPad: return "ipad"
        case .iPhone: return "iphone"
        }
    }
}

// MARK: - Quick Actions Modal View
struct QuickActionsModalView: View {
    @Binding var showingNewFarm: Bool
    @Binding var showingQuickTask: Bool
    @Binding var showingGoWild: Bool
    let dismissModal: () -> Void
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 20) {
            // Header
            VStack(spacing: 8) {
                Text("Create New")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Choose what you'd like to start")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 8)

            // Action buttons
            VStack(spacing: 12) {
                QuickActionButton(
                    icon: "leaf.fill",
                    iconColor: MaiFarmColors.primaryGreen,
                    title: "New Farm",
                    subtitle: "Create a multi-agent farm (2-6 hours)"
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showingNewFarm = true
                    }
                }

                QuickActionButton(
                    icon: "bolt.fill",
                    iconColor: .yellow,
                    title: "Quick Task",
                    subtitle: "Fast 5-minute AI task"
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showingQuickTask = true
                    }
                }

                QuickActionButton(
                    icon: "sparkles",
                    iconColor: .purple,
                    title: "Go Wild",
                    subtitle: "Autonomous exploration mode"
                ) {
                    dismiss()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showingGoWild = true
                    }
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .padding(.top, 20)
    }
}

// MARK: - Quick Action Button
struct QuickActionButton: View {
    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(iconColor.opacity(0.15))
                        .frame(width: 48, height: 48)

                    Image(systemName: icon)
                        .font(.system(size: 22))
                        .foregroundColor(iconColor)
                }

                // Text
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundColor(.primary)

                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sidebar Button
struct SidebarButton: View {
    let label: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Label(label, systemImage: icon)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(isSelected ? Color.accentColor.opacity(0.2) : Color.clear)
        .foregroundColor(isSelected ? .accentColor : .primary)
    }
}

// MARK: - Detail View
struct DetailView: View {
    let selectedTab: Int

    var body: some View {
        switch selectedTab {
        case 0: AdaptiveDashboardView()
        case 1: AdaptiveFarmsView()
        case 2: AdaptiveFarmersView()
        case 3: AdaptiveHarvestView()
        case 4: AdaptiveBarnView()
        case 5: AdaptiveSettingsView()
        default: AdaptiveDashboardView()
        }
    }
}

// MARK: - Previews
#Preview("Tab View - iPhone") {
    MainTabView(selectedTab: .constant(0))
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Sidebar - iPad/Mac") {
    NavigationSplitView {
        SidebarView(selectedTab: .constant(0))
            .environmentObject(DeviceCapabilityManager.shared)
    } detail: {
        Text("Detail View")
    }
}
