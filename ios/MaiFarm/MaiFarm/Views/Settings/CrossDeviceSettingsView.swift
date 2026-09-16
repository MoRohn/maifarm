//
//  CrossDeviceSettingsView.swift
//  MaiFarm
//
//  Cross-Device Settings and Farm Handoff UI
//  Allows iOS users to manage devices and transfer farms to iMac
//

import SwiftUI
import os.log
import UserNotifications

// MARK: - Cross Device Settings View

struct CrossDeviceSettingsView: View {
    @StateObject private var crossDeviceService = CrossDeviceService.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @State private var isLoading = false
    @State private var showingAddDevice = false
    @State private var showingRemoveAlert = false
    @State private var deviceToRemove: UserDevice?

    var body: some View {
        List {
            // Current Device Section
            currentDeviceSection

            // Sync Settings Section
            syncSettingsSection

            // Push Notification Settings Section
            pushNotificationSettingsSection

            // Other Devices Section
            otherDevicesSection

            // Pending Handoffs Section
            if !crossDeviceService.pendingHandoffRequests.isEmpty {
                pendingHandoffsSection
            }
        }
        .navigationTitle("Cross-Device Sync")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await refreshDevices()
        }
        .task {
            await refreshDevices()
        }
        .alert("Remove Device", isPresented: $showingRemoveAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Remove", role: .destructive) {
                if let device = deviceToRemove {
                    Task {
                        await removeDevice(device)
                    }
                }
            }
        } message: {
            if let device = deviceToRemove {
                Text("Are you sure you want to remove '\(device.deviceName)' from your devices?")
            }
        }
    }

    // MARK: - Current Device Section

    @ViewBuilder
    private var currentDeviceSection: some View {
        Section {
            if let device = crossDeviceService.currentDevice {
                HStack(spacing: 14) {
                    Image(systemName: device.icon)
                        .font(.title)
                        .foregroundColor(device.tierColor)
                        .frame(width: 44, height: 44)
                        .background(device.tierColor.opacity(0.15))
                        .cornerRadius(10)

                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(device.deviceName)
                                .font(.headline)
                            Text("(This Device)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        HStack(spacing: 12) {
                            Label(device.computeTier.rawValue.capitalized, systemImage: "bolt.fill")
                                .font(.caption)
                                .foregroundColor(device.tierColor)

                            Label("\(device.maxAgents) agents max", systemImage: "person.3.fill")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    Circle()
                        .fill(.green)
                        .frame(width: 10, height: 10)
                }
                .padding(.vertical, 4)
            } else {
                HStack {
                    ProgressView()
                        .padding(.trailing, 8)
                    Text("Registering device...")
                        .foregroundColor(.secondary)
                }
            }
        } header: {
            Text("Current Device")
        } footer: {
            Text("This device is automatically registered when you sign in.")
        }
    }

    // MARK: - Sync Settings Section

    @ViewBuilder
    private var syncSettingsSection: some View {
        Section {
            Toggle(isOn: $crossDeviceService.acceptHandoffs) {
                HStack {
                    SettingsIconView(icon: "arrow.triangle.2.circlepath", color: .blue)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Accept Farm Handoffs")
                        Text("Allow other devices to transfer farms here")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .onChange(of: crossDeviceService.acceptHandoffs) { newValue in
                Task {
                    try? await crossDeviceService.updateDeviceSettings(acceptHandoffs: newValue)
                }
            }

            Toggle(isOn: $crossDeviceService.autoSyncEnabled) {
                HStack {
                    SettingsIconView(icon: "arrow.clockwise.icloud.fill", color: .green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Auto-Sync")
                        Text("Automatically sync farms and harvests")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .onChange(of: crossDeviceService.autoSyncEnabled) { newValue in
                Task {
                    try? await crossDeviceService.updateDeviceSettings(autoSyncEnabled: newValue)
                }
            }
        } header: {
            Text("Sync Settings")
        }
    }

    // MARK: - Push Notification Settings Section

    @ViewBuilder
    private var pushNotificationSettingsSection: some View {
        Section {
            // Main toggle
            Toggle(isOn: $pushManager.isEnabled) {
                HStack {
                    SettingsIconView(icon: "bell.badge.fill", color: .red)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Push Notifications")
                        Text("Receive alerts when farms change status")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .onChange(of: pushManager.isEnabled) { newValue in
                Task {
                    if newValue {
                        _ = await pushManager.requestPermissionsAndRegister()
                    } else {
                        await pushManager.removePushToken()
                    }
                }
            }

            // Registration status
            HStack {
                SettingsIconView(icon: registrationStatusIcon, color: registrationStatusColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Registration Status")
                    Text(registrationStatusText)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Circle()
                    .fill(pushManager.isRegisteredWithBackend ? .green : .orange)
                    .frame(width: 10, height: 10)
            }

            // Notification types (when enabled)
            if pushManager.isEnabled {
                NavigationLink {
                    NotificationTypesView()
                } label: {
                    HStack {
                        SettingsIconView(icon: "checklist", color: .purple)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Notification Types")
                            Text("Choose which notifications to receive")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            // Test notification button (debug)
            #if DEBUG
            Button(action: sendTestNotification) {
                HStack {
                    SettingsIconView(icon: "paperplane.fill", color: .blue)
                    Text("Send Test Notification")
                }
            }
            #endif
        } header: {
            Text("Push Notifications")
        } footer: {
            Text("Push notifications allow you to receive updates about your farms even when the app is in the background.")
        }
    }

    private var registrationStatusIcon: String {
        if pushManager.registrationError != nil {
            return "exclamationmark.triangle.fill"
        } else if pushManager.isRegisteredWithBackend {
            return "checkmark.shield.fill"
        } else if pushManager.deviceToken != nil {
            return "arrow.clockwise"
        } else {
            return "questionmark.circle"
        }
    }

    private var registrationStatusColor: Color {
        if pushManager.registrationError != nil {
            return .red
        } else if pushManager.isRegisteredWithBackend {
            return .green
        } else {
            return .orange
        }
    }

    private var registrationStatusText: String {
        if let error = pushManager.registrationError {
            return "Error: \(error)"
        } else if pushManager.isRegisteredWithBackend {
            return "Registered with MaiFarm"
        } else if pushManager.deviceToken != nil {
            return "Registering with server..."
        } else {
            return "Not registered"
        }
    }

    #if DEBUG
    private func sendTestNotification() {
        Task {
            // Trigger a local notification for testing
            let content = UNMutableNotificationContent()
            content.title = "Test Notification"
            content.body = "Push notifications are working correctly!"
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: "test-\(Date().timeIntervalSince1970)",
                content: content,
                trigger: nil
            )

            try? await UNUserNotificationCenter.current().add(request)
        }
    }
    #endif

    // MARK: - Other Devices Section

    @ViewBuilder
    private var otherDevicesSection: some View {
        Section {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if crossDeviceService.devices.filter({ $0.deviceId != crossDeviceService.deviceId }).isEmpty {
                HStack {
                    Image(systemName: "desktopcomputer")
                        .foregroundColor(.secondary)
                    Text("No other devices found")
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            } else {
                ForEach(crossDeviceService.devices.filter { $0.deviceId != crossDeviceService.deviceId }) { device in
                    DeviceRow(device: device)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                deviceToRemove = device
                                showingRemoveAlert = true
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                }
            }
        } header: {
            HStack {
                Text("Your Devices")
                Spacer()
                Text("\(crossDeviceService.devices.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Color.gray.opacity(0.2))
                    .cornerRadius(8)
            }
        } footer: {
            Text("Sign in on your iMac or iPad to see them here. You can transfer running farms to more powerful devices.")
        }
    }

    // MARK: - Pending Handoffs Section

    @ViewBuilder
    private var pendingHandoffsSection: some View {
        Section {
            ForEach(crossDeviceService.pendingHandoffRequests) { request in
                PendingHandoffRow(request: request)
            }
        } header: {
            HStack {
                Text("Pending Farm Handoffs")
                Spacer()
                Image(systemName: "bell.badge.fill")
                    .foregroundColor(.orange)
            }
        }
    }

    // MARK: - Actions

    private func refreshDevices() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await crossDeviceService.fetchDevices()
            try await crossDeviceService.fetchPendingHandoffRequests()
        } catch {
            AppState.shared.showToast("Failed to load devices", type: .error)
        }
    }

    private func removeDevice(_ device: UserDevice) async {
        do {
            try await MaiFarmAPI.shared.removeDevice(deviceId: device.deviceId)
            crossDeviceService.devices.removeAll { $0.deviceId == device.deviceId }
            AppState.shared.showToast("Device removed", type: .success)
        } catch {
            AppState.shared.showToast("Failed to remove device", type: .error)
        }
    }
}

// MARK: - Device Row

struct DeviceRow: View {
    let device: UserDevice

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: device.icon)
                .font(.title2)
                .foregroundColor(device.tierColor)
                .frame(width: 40, height: 40)
                .background(device.tierColor.opacity(0.15))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(device.deviceName)
                        .font(.body)
                        .fontWeight(.medium)

                    if device.isPrimaryDevice {
                        Text("Primary")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.2))
                            .foregroundColor(.blue)
                            .cornerRadius(4)
                    }
                }

                HStack(spacing: 8) {
                    Text(device.computeTier.rawValue.capitalized)
                        .font(.caption)
                        .foregroundColor(device.tierColor)

                    if device.supportsLocalModels {
                        Label("Local AI", systemImage: "brain.head.profile")
                            .font(.caption2)
                            .foregroundColor(.purple)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Circle()
                    .fill(device.isOnline ? .green : .gray)
                    .frame(width: 8, height: 8)

                Text(device.isOnline ? "Online" : timeAgo(device.lastSeenAt))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func timeAgo(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Pending Handoff Row

struct PendingHandoffRow: View {
    let request: HandoffRequest
    @State private var isProcessing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                    .font(.title2)
                    .foregroundColor(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Farm: \(request.farmStateSnapshot.name)")
                        .font(.headline)

                    Text(request.handoffType == .transfer ? "Transfer Request" : "Monitor Request")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                if request.isExpired {
                    Text("Expired")
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }

            if let reason = request.reason, !reason.isEmpty {
                Text("Reason: \(reason)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Progress if available
            if let progress = request.progressAtHandoff {
                HStack {
                    Text("Farm Progress:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    ProgressView(value: progress)
                        .progressViewStyle(.linear)
                    Text("\(Int(progress * 100))%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            // Action buttons
            if !request.isExpired && request.status == .pending {
                HStack(spacing: 12) {
                    Button(action: { acceptHandoff() }) {
                        HStack {
                            if isProcessing {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "checkmark.circle.fill")
                            }
                            Text("Accept")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(MaiFarmColors.primaryGreen)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .disabled(isProcessing)

                    Button(action: { declineHandoff() }) {
                        HStack {
                            Image(systemName: "xmark.circle.fill")
                            Text("Decline")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.gray.opacity(0.2))
                        .foregroundColor(.primary)
                        .cornerRadius(8)
                    }
                    .disabled(isProcessing)
                }
            }

            // Time remaining
            if !request.isExpired {
                Text("Expires \(timeRemaining(request.expiresAt))")
                    .font(.caption2)
                    .foregroundColor(.orange)
            }
        }
        .padding(.vertical, 8)
    }

    private func acceptHandoff() {
        isProcessing = true
        Task {
            defer { Task { @MainActor in isProcessing = false } }

            do {
                _ = try await CrossDeviceService.shared.acceptHandoffRequest(request)
            } catch {
                AppState.shared.showToast("Failed to accept handoff", type: .error)
            }
        }
    }

    private func declineHandoff() {
        Task {
            do {
                try await CrossDeviceService.shared.cancelHandoffRequest(request.id)
            } catch {
                AppState.shared.showToast("Failed to decline handoff", type: .error)
            }
        }
    }

    private func timeRemaining(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Notification Types View

struct NotificationTypesView: View {
    @AppStorage("notify_farm_completed") private var notifyFarmCompleted = true
    @AppStorage("notify_farm_failed") private var notifyFarmFailed = true
    @AppStorage("notify_farm_status") private var notifyFarmStatus = true
    @AppStorage("notify_handoff") private var notifyHandoff = true
    @AppStorage("notify_harvest") private var notifyHarvest = true
    @AppStorage("notify_agents") private var notifyAgents = false

    var body: some View {
        List {
            Section {
                notificationToggle(
                    isOn: $notifyFarmCompleted,
                    icon: "checkmark.circle.fill",
                    color: .green,
                    title: "Farm Completed",
                    description: "When a farm finishes successfully"
                )

                notificationToggle(
                    isOn: $notifyFarmFailed,
                    icon: "exclamationmark.triangle.fill",
                    color: .red,
                    title: "Farm Failed",
                    description: "When a farm encounters an error"
                )

                notificationToggle(
                    isOn: $notifyFarmStatus,
                    icon: "arrow.triangle.2.circlepath",
                    color: .blue,
                    title: "Farm Status Changes",
                    description: "When a farm starts running or recovers"
                )
            } header: {
                Text("Farm Notifications")
            }

            Section {
                notificationToggle(
                    isOn: $notifyHandoff,
                    icon: "arrow.left.arrow.right",
                    color: .orange,
                    title: "Handoff Requests",
                    description: "When another device wants to transfer a farm"
                )
            } header: {
                Text("Cross-Device")
            }

            Section {
                notificationToggle(
                    isOn: $notifyHarvest,
                    icon: "shippingbox.fill",
                    color: .purple,
                    title: "Harvest Ready",
                    description: "When a harvest is ready to collect"
                )
            } header: {
                Text("Harvest")
            }

            Section {
                notificationToggle(
                    isOn: $notifyAgents,
                    icon: "person.3.fill",
                    color: .cyan,
                    title: "Agent Updates",
                    description: "When individual agents have status changes"
                )
            } header: {
                Text("Agent Activity")
            } footer: {
                Text("Agent notifications can be frequent. Enable only if you want detailed updates.")
            }
        }
        .navigationTitle("Notification Types")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func notificationToggle(
        isOn: Binding<Bool>,
        icon: String,
        color: Color,
        title: String,
        description: String
    ) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(color)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body)
                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        CrossDeviceSettingsView()
    }
}
