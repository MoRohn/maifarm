//
//  HarvestView.swift
//  MaiFarm
//
//  Harvest View - Live progress monitoring for active farms
//

import SwiftUI

// MARK: - Adaptive Harvest View
struct AdaptiveHarvestView: View {
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @State private var showingNewFarm = false
    @State private var hasActiveHarvest = false  // Toggle to show harvest or empty state

    let primaryGreen = MaiFarmColors.primaryGreen

    var body: some View {
        NavigationStack {
            if hasActiveHarvest {
                activeHarvestContent
            } else {
                emptyStateContent
            }
        }
        .sheet(isPresented: $showingNewFarm) {
            NewFarmSheet()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Active Harvest Content
    @ViewBuilder
    private var activeHarvestContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Active harvest card
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Code Refactor")
                                .font(.title3)
                                .fontWeight(.bold)
                            Text("3 agents working")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        Text("65%")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(primaryGreen)
                    }

                    ProgressView(value: 0.65)
                        .tint(primaryGreen)

                    Divider()

                    // Agent activity
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Live Activity")
                            .font(.headline)

                        HarvestActivityRow(agent: "Architect", activity: "Designing OAuth flow...", time: "Just now")
                        HarvestActivityRow(agent: "Developer", activity: "Writing authentication middleware...", time: "2m ago")
                        HarvestActivityRow(agent: "Reviewer", activity: "Waiting for code...", time: "5m ago")
                    }
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(16)
                .padding(.horizontal)

                // Terminal preview
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Terminal Output")
                            .font(.headline)
                        Spacer()
                        Button("View Full") {}
                            .font(.caption)
                    }

                    ScrollView {
                        Text("""
                        [Architect] Analyzing existing auth structure...
                        [Architect] Found 3 endpoints needing OAuth
                        [Developer] Starting implementation...
                        [Developer] Created oauth.ts module
                        [Developer] Adding token validation...
                        """)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 120)
                    .padding()
                    .background(Color.black)
                    .cornerRadius(8)
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .cornerRadius(16)
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .maiFarmBackground()
        .navigationTitle("Harvest")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { hasActiveHarvest = false }) {
                    Image(systemName: "stop.circle")
                }
            }
        }
    }

    // MARK: - Empty State Content
    @ViewBuilder
    private var emptyStateContent: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "tray.full.fill")
                .font(.system(size: 60))
                .foregroundColor(.gray)

            Text("No Active Harvests")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Start a farm to see live harvest progress")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: { showingNewFarm = true }) {
                Label("Create Farm", systemImage: "plus")
                    .font(.headline)
                    .padding()
                    .frame(minWidth: 180)
                    .background(primaryGreen)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }

            Button(action: { hasActiveHarvest = true }) {
                Text("Show Demo Harvest")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .maiFarmBackground()
        .navigationTitle("Harvest")
    }
}

// MARK: - Harvest Activity Row
struct HarvestActivityRow: View {
    let agent: String
    let activity: String
    let time: String

    var body: some View {
        HStack {
            Circle()
                .fill(Color.green)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading) {
                HStack {
                    Text(agent)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    Text(time)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Text(activity)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Previews
#Preview("Harvest View") {
    AdaptiveHarvestView()
        .environmentObject(DeviceCapabilityManager.shared)
}

#Preview("Harvest Activity Row") {
    VStack(spacing: 8) {
        HarvestActivityRow(agent: "Architect", activity: "Designing OAuth flow...", time: "Just now")
        HarvestActivityRow(agent: "Developer", activity: "Writing authentication middleware...", time: "2m ago")
        HarvestActivityRow(agent: "Reviewer", activity: "Waiting for code...", time: "5m ago")
    }
    .padding()
}
