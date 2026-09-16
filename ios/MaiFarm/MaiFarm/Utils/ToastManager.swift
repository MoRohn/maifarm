//
//  ToastManager.swift
//  MaiFarm
//
//  Non-blocking toast notification system for user feedback
//

import SwiftUI

// MARK: - Toast View
struct ToastView: View {
    let message: String
    let type: ToastType
    let action: (() -> Void)?
    let actionLabel: String?

    @State private var appeared = false
    @Environment(\.colorScheme) var colorScheme

    enum ToastType {
        case success
        case error
        case warning
        case info
        case offline
        case syncing

        var icon: String {
            switch self {
            case .success: return "checkmark.circle.fill"
            case .error: return "xmark.circle.fill"
            case .warning: return "exclamationmark.triangle.fill"
            case .info: return "info.circle.fill"
            case .offline: return "wifi.slash"
            case .syncing: return "arrow.triangle.2.circlepath"
            }
        }

        var color: Color {
            switch self {
            case .success: return .green
            case .error: return .red
            case .warning: return .orange
            case .info: return .blue
            case .offline: return .gray
            case .syncing: return .purple
            }
        }

        var backgroundColor: Color {
            switch self {
            case .success: return Color.green.opacity(0.15)
            case .error: return Color.red.opacity(0.15)
            case .warning: return Color.orange.opacity(0.15)
            case .info: return Color.blue.opacity(0.15)
            case .offline: return Color.gray.opacity(0.15)
            case .syncing: return Color.purple.opacity(0.15)
            }
        }
    }

    init(message: String, type: ToastType, action: (() -> Void)? = nil, actionLabel: String? = nil) {
        self.message = message
        self.type = type
        self.action = action
        self.actionLabel = actionLabel
    }

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            Group {
                if type == .syncing {
                    Image(systemName: type.icon)
                        .rotationEffect(.degrees(appeared ? 360 : 0))
                        .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: appeared)
                } else {
                    Image(systemName: type.icon)
                }
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(type.color)

            // Message
            Text(message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(2)

            Spacer()

            // Optional action button
            if let action = action, let label = actionLabel {
                Button(action: action) {
                    Text(label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(type.color)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(colorScheme == .dark ? Color(.systemGray6) : .white)
                .shadow(color: .black.opacity(0.1), radius: 10, x: 0, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(type.color.opacity(0.3), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .onAppear {
            appeared = true
        }
    }
}

// MARK: - Toast Container Modifier
struct ToastContainerModifier: ViewModifier {
    @ObservedObject var appState: AppState
    @State private var offset: CGFloat = -100
    @State private var opacity: Double = 0

    func body(content: Content) -> some View {
        ZStack(alignment: .top) {
            content

            if appState.showingToast {
                ToastView(
                    message: appState.toastMessage,
                    type: mapToastType(appState.toastType)
                )
                .offset(y: offset)
                .opacity(opacity)
                .onAppear {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                        offset = 50
                        opacity = 1
                    }
                }
                .onChange(of: appState.showingToast) { _, showing in
                    if !showing {
                        withAnimation(.easeOut(duration: 0.3)) {
                            offset = -100
                            opacity = 0
                        }
                    }
                }
                .gesture(
                    DragGesture()
                        .onEnded { value in
                            if value.translation.height < -20 {
                                withAnimation(.easeOut(duration: 0.2)) {
                                    offset = -100
                                    opacity = 0
                                }
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                    appState.showingToast = false
                                }
                            }
                        }
                )
                .zIndex(1000)
            }
        }
    }

    private func mapToastType(_ type: AppState.ToastType) -> ToastView.ToastType {
        switch type {
        case .success: return .success
        case .error: return .error
        case .warning: return .warning
        case .info: return .info
        }
    }
}

// MARK: - Sync Status Banner
struct SyncStatusBanner: View {
    @ObservedObject var appState: AppState

    var body: some View {
        if appState.isSyncing || !appState.isOnline || appState.pendingOperations > 0 {
            HStack(spacing: 8) {
                if appState.isSyncing {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Syncing changes...")
                } else if !appState.isOnline {
                    Image(systemName: "wifi.slash")
                    Text("Working offline")
                } else if appState.pendingOperations > 0 {
                    Image(systemName: "clock.arrow.circlepath")
                    Text("\(appState.pendingOperations) pending")
                }
            }
            .font(.caption)
            .foregroundColor(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(20)
            .transition(.opacity.combined(with: .scale))
        }
    }
}

// MARK: - Error Banner View
struct ErrorBannerView: View {
    let message: String
    let retryAction: (() -> Void)?
    let dismissAction: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Something went wrong")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                if let retry = retryAction {
                    Button("Retry", action: retry)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.blue)
                }

                Button(action: dismissAction) {
                    Image(systemName: "xmark")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(Color(.systemBackground))
        }
    }
}

// MARK: - Generic Empty State View
struct GenericEmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    let actionLabel: String?
    let action: (() -> Void)?

    init(
        icon: String,
        title: String,
        message: String,
        actionLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.actionLabel = actionLabel
        self.action = action
    }

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 50))
                .foregroundColor(.secondary)

            Text(title)
                .font(.title3)
                .fontWeight(.semibold)

            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            if let label = actionLabel, let action = action {
                Button(action: action) {
                    Text(label)
                        .font(.headline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(MaiFarmColors.primaryGreen)
                        .cornerRadius(10)
                }
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Loading State View
struct LoadingStateView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)

            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Retry View
struct RetryView: View {
    let error: String
    let retryAction: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.clockwise.circle")
                .font(.system(size: 50))
                .foregroundColor(.orange)

            Text("Something went wrong")
                .font(.title3)
                .fontWeight(.semibold)

            Text(error)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button(action: retryAction) {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Try Again")
                }
                .font(.headline)
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color.blue)
                .cornerRadius(10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - View Extensions
extension View {
    func withToasts() -> some View {
        self.modifier(ToastContainerModifier(appState: AppState.shared))
    }

    func showToast(_ message: String, type: AppState.ToastType = .info) {
        AppState.shared.showToast(message, type: type)
    }
}

// MARK: - Confirmation Dialog Helpers
struct DestructiveConfirmation: ViewModifier {
    @Binding var isPresented: Bool
    let title: String
    let message: String
    let destructiveLabel: String
    let action: () -> Void

    func body(content: Content) -> some View {
        content
            .alert(title, isPresented: $isPresented) {
                Button("Cancel", role: .cancel) {}
                Button(destructiveLabel, role: .destructive, action: action)
            } message: {
                Text(message)
            }
    }
}

extension View {
    func destructiveConfirmation(
        isPresented: Binding<Bool>,
        title: String,
        message: String,
        destructiveLabel: String = "Delete",
        action: @escaping () -> Void
    ) -> some View {
        self.modifier(DestructiveConfirmation(
            isPresented: isPresented,
            title: title,
            message: message,
            destructiveLabel: destructiveLabel,
            action: action
        ))
    }
}
