//
//  Cards.swift
//  MaiFarm
//
//  Reusable Card Components
//

import SwiftUI

// MARK: - Quick Action Card
struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.white)

                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)

                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(color)
            .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Farm Card
struct FarmCard: View {
    let name: String
    let agents: Int
    let progress: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundColor(color)

                VStack(alignment: .leading) {
                    Text(name)
                        .font(.headline)
                    Text("\(agents) agents working")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text("\(Int(progress * 100))%")
                    .font(.headline)
                    .foregroundColor(color)
            }

            ProgressView(value: progress)
                .tint(color)
        }
        .padding()
        .background(Color(.tertiarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Farm Card Tappable
struct FarmCardTappable: View {
    let name: String
    let agents: Int
    let progress: Double
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "leaf.fill")
                        .foregroundColor(color)

                    VStack(alignment: .leading) {
                        Text(name)
                            .font(.headline)
                            .foregroundColor(.primary)
                        Text("\(agents) agents working")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Text("\(Int(progress * 100))%")
                        .font(.headline)
                        .foregroundColor(color)

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                ProgressView(value: progress)
                    .tint(color)
            }
            .padding()
            .background(Color(.tertiarySystemGroupedBackground))
            .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Stat Card
struct StatCard: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}

// MARK: - Farm Card Placeholder
struct FarmCardPlaceholder: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                        .frame(width: 120, height: 16)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 80, height: 12)
                }

                Spacer()

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: 40, height: 20)
            }

            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray5))
                .frame(height: 4)
        }
        .padding()
        .background(Color(.tertiarySystemGroupedBackground))
        .cornerRadius(16)
    }
}

// MARK: - Empty Farms Card
struct EmptyFarmsCard: View {
    let onCreateFarm: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "leaf.circle")
                .font(.system(size: 48))
                .foregroundColor(MaiFarmColors.primaryGreen.opacity(0.5))

            Text("No Active Farms")
                .font(.headline)

            Text("Create your first farm to start orchestrating AI agents")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button(action: onCreateFarm) {
                Label("Create Farm", systemImage: "plus.circle.fill")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(MaiFarmColors.primaryGreen)
                    .cornerRadius(12)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(20)
    }
}

// MARK: - Previews
#Preview("Quick Action Card") {
    QuickActionCard(
        icon: "bolt.fill",
        title: "Quick Task",
        subtitle: "5 min focused task",
        color: .orange
    )
    .padding()
}

#Preview("Farm Card") {
    VStack(spacing: 16) {
        FarmCard(
            name: "Research Farm",
            agents: 3,
            progress: 0.65,
            color: MaiFarmColors.primaryGreen
        )
        FarmCardTappable(
            name: "Dev Farm",
            agents: 5,
            progress: 0.30,
            color: .blue
        ) {
            print("Tapped")
        }
        FarmCardPlaceholder()
    }
    .padding()
}

#Preview("Stat Card") {
    HStack(spacing: 12) {
        StatCard(value: "12", label: "Active", color: MaiFarmColors.primaryGreen)
        StatCard(value: "45", label: "Completed", color: .blue)
        StatCard(value: "98%", label: "Success", color: .orange)
    }
    .padding()
}
