//
//  KeyboardShortcutManager.swift
//  MaiFarm
//
//  Centralized keyboard shortcut handling for Mac and iPad with hardware keyboard
//  Provides consistent keyboard navigation across the app
//

import SwiftUI
import Combine

// MARK: - Keyboard Shortcut Manager

@MainActor
final class KeyboardShortcutManager: ObservableObject, @unchecked Sendable {
    static let shared = KeyboardShortcutManager()

    @Published var isKeyboardConnected: Bool = false

    private var cancellables = Set<AnyCancellable>()

    private init() {
        #if canImport(UIKit) && !os(macOS)
        setupKeyboardDetection()
        #else
        // macOS always has keyboard
        isKeyboardConnected = true
        #endif
    }

    #if canImport(UIKit)
    private func setupKeyboardDetection() {
        // Detect hardware keyboard on iPad
        NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.checkHardwareKeyboard(notification)
            }
            .store(in: &cancellables)
    }

    private func checkHardwareKeyboard(_ notification: Notification) {
        // A hardware keyboard is likely connected if the keyboard frame is off-screen
        if let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
            let screenHeight = UIScreen.main.bounds.height
            isKeyboardConnected = frame.origin.y >= screenHeight
        }
    }
    #endif
}

// MARK: - Keyboard Shortcuts Definition

enum MaiFarmShortcut: String, CaseIterable {
    // Navigation
    case goToDashboard = "dashboard"
    case goToFarms = "farms"
    case goToHarvest = "harvest"
    case goToBarn = "barn"
    case goToSettings = "settings"

    // Actions
    case newQuickTask = "quickTask"
    case newFarm = "newFarm"
    case goWild = "goWild"
    case search = "search"
    case refresh = "refresh"

    // Farm Operations
    case stopFarm = "stopFarm"
    case deleteFarm = "deleteFarm"
    case recoverFarm = "recoverFarm"

    // General
    case escape = "escape"
    case help = "help"

    var keyboardShortcut: KeyboardShortcut {
        switch self {
        // Navigation (Cmd+1-5)
        case .goToDashboard: return KeyboardShortcut("1", modifiers: .command)
        case .goToFarms: return KeyboardShortcut("2", modifiers: .command)
        case .goToHarvest: return KeyboardShortcut("3", modifiers: .command)
        case .goToBarn: return KeyboardShortcut("4", modifiers: .command)
        case .goToSettings: return KeyboardShortcut(",", modifiers: .command)

        // Actions
        case .newQuickTask: return KeyboardShortcut("t", modifiers: [.command, .shift])
        case .newFarm: return KeyboardShortcut("n", modifiers: .command)
        case .goWild: return KeyboardShortcut("g", modifiers: [.command, .shift])
        case .search: return KeyboardShortcut("f", modifiers: .command)
        case .refresh: return KeyboardShortcut("r", modifiers: .command)

        // Farm Operations
        case .stopFarm: return KeyboardShortcut(".", modifiers: .command)
        case .deleteFarm: return KeyboardShortcut(.delete, modifiers: .command)
        case .recoverFarm: return KeyboardShortcut("r", modifiers: [.command, .shift])

        // General
        case .escape: return KeyboardShortcut(.escape, modifiers: [])
        case .help: return KeyboardShortcut("/", modifiers: .command)
        }
    }

    var title: String {
        switch self {
        case .goToDashboard: return "Go to Dashboard"
        case .goToFarms: return "Go to Farms"
        case .goToHarvest: return "Go to Harvest"
        case .goToBarn: return "Go to Barn"
        case .goToSettings: return "Open Settings"
        case .newQuickTask: return "New Quick Task"
        case .newFarm: return "New Farm"
        case .goWild: return "Go Wild"
        case .search: return "Search"
        case .refresh: return "Refresh"
        case .stopFarm: return "Stop Farm"
        case .deleteFarm: return "Delete Farm"
        case .recoverFarm: return "Recover Farm"
        case .escape: return "Cancel / Close"
        case .help: return "Show Help"
        }
    }

    var shortcutLabel: String {
        switch self {
        case .goToDashboard: return "⌘1"
        case .goToFarms: return "⌘2"
        case .goToHarvest: return "⌘3"
        case .goToBarn: return "⌘4"
        case .goToSettings: return "⌘,"
        case .newQuickTask: return "⇧⌘T"
        case .newFarm: return "⌘N"
        case .goWild: return "⇧⌘G"
        case .search: return "⌘F"
        case .refresh: return "⌘R"
        case .stopFarm: return "⌘."
        case .deleteFarm: return "⌘⌫"
        case .recoverFarm: return "⇧⌘R"
        case .escape: return "Esc"
        case .help: return "⌘/"
        }
    }

    var systemImage: String {
        switch self {
        case .goToDashboard: return "house.fill"
        case .goToFarms: return "leaf.fill"
        case .goToHarvest: return "tray.full.fill"
        case .goToBarn: return "shippingbox.fill"
        case .goToSettings: return "gearshape.fill"
        case .newQuickTask: return "bolt.fill"
        case .newFarm: return "plus.circle.fill"
        case .goWild: return "sparkles"
        case .search: return "magnifyingglass"
        case .refresh: return "arrow.clockwise"
        case .stopFarm: return "stop.circle.fill"
        case .deleteFarm: return "trash.fill"
        case .recoverFarm: return "arrow.counterclockwise"
        case .escape: return "xmark.circle"
        case .help: return "questionmark.circle"
        }
    }
}

// MARK: - Keyboard Shortcut View Modifier

struct KeyboardShortcutHandlerModifier: ViewModifier {
    @Binding var selectedTab: Int
    @Binding var showingQuickTask: Bool
    @Binding var showingNewFarm: Bool
    @Binding var showingGoWild: Bool
    @Binding var showingSearch: Bool
    @Binding var showingHelp: Bool

    var onRefresh: (() -> Void)?

    func body(content: Content) -> some View {
        content
            // Use individual button overlays for shortcuts
            .background(
                Group {
                    // Tab navigation
                    Button("") { selectedTab = 0 }
                        .keyboardShortcut("1", modifiers: .command)
                        .hidden()

                    Button("") { selectedTab = 1 }
                        .keyboardShortcut("2", modifiers: .command)
                        .hidden()

                    Button("") { selectedTab = 2 }
                        .keyboardShortcut("3", modifiers: .command)
                        .hidden()

                    Button("") { selectedTab = 3 }
                        .keyboardShortcut("4", modifiers: .command)
                        .hidden()

                    Button("") { selectedTab = 4 }
                        .keyboardShortcut(",", modifiers: .command)
                        .hidden()

                    // Action shortcuts
                    Button("") { showingQuickTask = true }
                        .keyboardShortcut("t", modifiers: [.command, .shift])
                        .hidden()

                    Button("") { showingNewFarm = true }
                        .keyboardShortcut("n", modifiers: .command)
                        .hidden()

                    Button("") { showingGoWild = true }
                        .keyboardShortcut("g", modifiers: [.command, .shift])
                        .hidden()

                    Button("") { showingSearch = true }
                        .keyboardShortcut("f", modifiers: .command)
                        .hidden()

                    Button("") { onRefresh?() }
                        .keyboardShortcut("r", modifiers: .command)
                        .hidden()

                    Button("") { showingHelp = true }
                        .keyboardShortcut("/", modifiers: .command)
                        .hidden()
                }
            )
    }
}

extension View {
    func withKeyboardShortcuts(
        selectedTab: Binding<Int>,
        showingQuickTask: Binding<Bool>,
        showingNewFarm: Binding<Bool>,
        showingGoWild: Binding<Bool>,
        showingSearch: Binding<Bool>,
        showingHelp: Binding<Bool>,
        onRefresh: (() -> Void)? = nil
    ) -> some View {
        self.modifier(KeyboardShortcutHandlerModifier(
            selectedTab: selectedTab,
            showingQuickTask: showingQuickTask,
            showingNewFarm: showingNewFarm,
            showingGoWild: showingGoWild,
            showingSearch: showingSearch,
            showingHelp: showingHelp,
            onRefresh: onRefresh
        ))
    }
}

// MARK: - Keyboard Shortcuts Help Sheet

struct KeyboardShortcutsHelpView: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Navigation") {
                    shortcutRow(.goToDashboard)
                    shortcutRow(.goToFarms)
                    shortcutRow(.goToHarvest)
                    shortcutRow(.goToBarn)
                    shortcutRow(.goToSettings)
                }

                Section("Actions") {
                    shortcutRow(.newQuickTask)
                    shortcutRow(.newFarm)
                    shortcutRow(.goWild)
                    shortcutRow(.search)
                    shortcutRow(.refresh)
                }

                Section("Farm Operations") {
                    shortcutRow(.stopFarm)
                    shortcutRow(.recoverFarm)
                    shortcutRow(.deleteFarm)
                }

                Section("General") {
                    shortcutRow(.escape)
                    shortcutRow(.help)
                }
            }
            .navigationTitle("Keyboard Shortcuts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private func shortcutRow(_ shortcut: MaiFarmShortcut) -> some View {
        HStack {
            Label(shortcut.title, systemImage: shortcut.systemImage)
            Spacer()
            Text(shortcut.shortcutLabel)
                .font(.system(.body, design: .monospaced))
                .foregroundColor(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(.tertiarySystemFill))
                .cornerRadius(6)
        }
    }
}

// MARK: - Focusable Button Style for Keyboard Navigation

struct FocusableButtonStyle: ButtonStyle {
    @FocusState private var isFocused: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .focusable(true)
            .focused($isFocused)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isFocused ? Color.accentColor : Color.clear, lineWidth: 2)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
    }
}

// MARK: - Context Menu with Keyboard Shortcuts

extension View {
    func farmContextMenu(
        farm: Farm,
        onStop: @escaping () -> Void,
        onRecover: @escaping () -> Void,
        onDelete: @escaping () -> Void,
        onViewDetails: @escaping () -> Void
    ) -> some View {
        self.contextMenu {
            Button(action: onViewDetails) {
                Label("View Details", systemImage: "info.circle")
            }

            if farm.status == .running || farm.status == .active {
                Button(action: onStop) {
                    Label("Stop Farm", systemImage: "stop.circle.fill")
                }
                .keyboardShortcut(".", modifiers: .command)
            }

            if farm.status == .failed {
                Button(action: onRecover) {
                    Label("Recover Farm", systemImage: "arrow.counterclockwise")
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }

            Divider()

            Button(role: .destructive, action: onDelete) {
                Label("Delete Farm", systemImage: "trash")
            }
            .keyboardShortcut(.delete, modifiers: .command)
        }
    }

    func harvestContextMenu(
        harvest: Harvest,
        onExport: @escaping () -> Void,
        onShare: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        self.contextMenu {
            Button(action: onExport) {
                Label("Export", systemImage: "square.and.arrow.down")
            }
            .keyboardShortcut("e", modifiers: .command)

            Button(action: onShare) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])

            Divider()

            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            .keyboardShortcut(.delete, modifiers: .command)
        }
    }
}

// MARK: - Focus State Management

struct FocusStateKey: FocusedValueKey {
    typealias Value = MaiFarmFocusState
}

extension FocusedValues {
    var maiFarmFocus: MaiFarmFocusState? {
        get { self[FocusStateKey.self] }
        set { self[FocusStateKey.self] = newValue }
    }
}

enum MaiFarmFocusState {
    case dashboard
    case farmList
    case harvestList
    case barnList
    case settings
    case quickTaskInput
    case farmCreationInput
    case goWildInput
    case searchField
}

// MARK: - Keyboard-Navigable List

struct KeyboardNavigableList<Data: RandomAccessCollection, Content: View>: View where Data.Element: Identifiable {
    let data: Data
    let selection: Binding<Data.Element.ID?>
    let content: (Data.Element) -> Content

    @FocusState private var focusedItem: Data.Element.ID?

    init(
        _ data: Data,
        selection: Binding<Data.Element.ID?>,
        @ViewBuilder content: @escaping (Data.Element) -> Content
    ) {
        self.data = data
        self.selection = selection
        self.content = content
    }

    var body: some View {
        List(data, selection: selection) { item in
            content(item)
                .focusable()
                .focused($focusedItem, equals: item.id)
                .onKeyPress(.upArrow) {
                    moveSelection(-1)
                    return .handled
                }
                .onKeyPress(.downArrow) {
                    moveSelection(1)
                    return .handled
                }
                .onKeyPress(.return) {
                    selection.wrappedValue = focusedItem
                    return .handled
                }
        }
    }

    private func moveSelection(_ direction: Int) {
        guard let currentIndex = data.firstIndex(where: { $0.id == focusedItem }) else {
            focusedItem = data.first?.id
            return
        }

        let newIndex = data.index(currentIndex, offsetBy: direction, limitedBy: direction > 0 ? data.endIndex : data.startIndex) ?? currentIndex
        focusedItem = data[newIndex].id
    }
}
