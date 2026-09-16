//
//  MaiFarmApp.swift
//  MaiFarm
//
//  Multi-Agent AI Orchestration Platform
//  Universal App for iPhone, iPad, and Mac
//
//  iOS Platform Optimizations:
//  - Thermal & battery-aware operation
//  - System accessibility settings respect
//  - App Intents for Siri Shortcuts
//  - Keyboard shortcuts for Mac/iPad
//  - Enhanced network monitoring
//

import SwiftUI
import AppIntents
import UserNotifications

@main
struct MaiFarmApp: App {
    // Core state
    @StateObject private var appState = AppState.shared
    @StateObject private var deviceManager = DeviceCapabilityManager.shared

    // Platform optimizations
    @StateObject private var thermalMonitor = ThermalStateMonitor.shared
    @StateObject private var systemSettings = SystemSettingsObserver.shared
    @StateObject private var networkMonitor = NetworkMonitor.shared

    // User preferences - Default to Dark (2) to match web dashboard behavior
    @AppStorage("appearanceMode") private var appearanceMode = 2  // 0=System, 1=Light, 2=Dark

    // App delegate for UIKit integration
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    #endif

    init() {
        // Register background tasks
        BackgroundTaskManager.shared.registerBackgroundTasks()

        // Setup notification categories
        Task { @MainActor in
            NotificationService.shared.setupNotificationCategories()
        }

        // Restore app state from disk
        Task {
            await BackgroundTaskManager.shared.restoreAppState()
            await RunStatePreserver.shared.loadPersistedStates()
        }

        // Pre-warm haptic generators
        HapticManager.shared.prepareGenerators()

        // Initialize intent handler
        _ = IntentHandler.shared

        // Configure app appearance
        configureAppearance()

        // Update App Shortcuts
        updateAppShortcuts()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(deviceManager)
                .environmentObject(thermalMonitor)
                .environmentObject(systemSettings)
                .environmentObject(networkMonitor)
                .withToasts()
                .withOfflineIndicator()
                .observeAppLifecycle()
                .observeThermalState()
                .onOpenURL { url in
                    handleDeepLink(url)
                }
                .preferredColorScheme(colorSchemeForMode(appearanceMode))
        }
        #if os(macOS) || targetEnvironment(macCatalyst)
        .commands {
            // File menu
            CommandGroup(after: .newItem) {
                Button("New Farm") {
                    NotificationCenter.default.post(name: .showNewFarmSheet, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command])

                Button("Quick Task") {
                    NotificationCenter.default.post(name: .showQuickTaskSheet, object: nil)
                }
                .keyboardShortcut("t", modifiers: [.command, .shift])

                Divider()

                Button("Go Wild") {
                    NotificationCenter.default.post(name: .showGoWildSheet, object: nil)
                }
                .keyboardShortcut("g", modifiers: [.command, .shift])
            }

            // View menu - Navigation
            CommandGroup(after: .toolbar) {
                Button("Dashboard") {
                    appState.selectedTab = 0
                }
                .keyboardShortcut("1", modifiers: .command)

                Button("Farms") {
                    appState.selectedTab = 1
                }
                .keyboardShortcut("2", modifiers: .command)

                Button("Harvest") {
                    appState.selectedTab = 2
                }
                .keyboardShortcut("3", modifiers: .command)

                Button("Barn") {
                    appState.selectedTab = 3
                }
                .keyboardShortcut("4", modifiers: .command)

                Divider()

                Button("Refresh") {
                    Task {
                        await appState.refreshFarms()
                        await appState.refreshHarvests()
                    }
                }
                .keyboardShortcut("r", modifiers: .command)
            }

            // App settings
            CommandGroup(replacing: .appSettings) {
                Button("Settings...") {
                    appState.selectedTab = 4
                }
                .keyboardShortcut(",", modifiers: .command)
            }

            // Help menu
            CommandGroup(replacing: .help) {
                Button("Keyboard Shortcuts") {
                    NotificationCenter.default.post(name: .showKeyboardShortcuts, object: nil)
                }
                .keyboardShortcut("/", modifiers: .command)

                Divider()

                Button("MaiFarm Help") {
                    // Open help documentation
                }
            }
        }
        #endif
    }

    private func configureAppearance() {
        #if canImport(UIKit)
        // Configure navigation bar appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()

        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance

        // Configure tab bar
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = tabBarAppearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        }
        #endif
    }

    /// Update App Shortcuts for Siri
    private func updateAppShortcuts() {
        Task {
            do {
                try await MaiFarmShortcuts.updateAppShortcutParameters()
            } catch {
                // Shortcut update failed - not critical
            }
        }
    }

    /// Convert appearance mode to ColorScheme
    /// - Parameter mode: 0=System (nil), 1=Light, 2=Dark
    private func colorSchemeForMode(_ mode: Int) -> ColorScheme? {
        switch mode {
        case 1: return .light
        case 2: return .dark
        default: return nil  // System default
        }
    }

    private func handleDeepLink(_ url: URL) {
        // Handle deep links: maifarm://farm/{id}, maifarm://harvest/{id}, etc.
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }

        switch components.host {
        case "farm":
            if let farmId = components.path.dropFirst().description.split(separator: "/").first {
                // Navigate to farm
                Task {
                    if let farm = try? await MaiFarmAPI.shared.getFarm(String(farmId)) {
                        await MainActor.run {
                            appState.activeFarm = farm
                            appState.selectedTab = 1 // Farms tab
                        }
                    }
                }
            }
        case "harvest":
            // Check for farmId query parameter (from widgets)
            if let farmIdParam = components.queryItems?.first(where: { $0.name == "farmId" })?.value {
                // Navigate to specific farm's harvest view
                Task {
                    if let farm = try? await MaiFarmAPI.shared.getFarm(farmIdParam) {
                        await MainActor.run {
                            appState.activeFarm = farm
                            appState.selectedTab = 2 // Harvest tab
                            // Post notification to open specific farm's terminal
                            NotificationCenter.default.post(
                                name: .openFarmHarvest,
                                object: nil,
                                userInfo: ["farmId": farmIdParam]
                            )
                        }
                    } else {
                        await MainActor.run {
                            appState.selectedTab = 2 // Harvest tab (default)
                        }
                    }
                }
            } else if let harvestId = components.path.dropFirst().description.split(separator: "/").first {
                // Navigate to harvest in barn by harvest ID
                appState.selectedTab = 3 // Barn tab
                NotificationCenter.default.post(
                    name: .openHarvestDetail,
                    object: nil,
                    userInfo: ["harvestId": String(harvestId)]
                )
            } else {
                // Default: open Harvest tab
                appState.selectedTab = 2 // Harvest tab
            }
        case "farms":
            // Navigate to farms tab
            appState.selectedTab = 1
        case "quick", "quicktask":
            // Open quick task - check for task parameter
            if let taskParam = components.queryItems?.first(where: { $0.name == "task" })?.value {
                NotificationCenter.default.post(
                    name: .startQuickTaskFromIntent,
                    object: nil,
                    userInfo: ["description": taskParam]
                )
            } else {
                NotificationCenter.default.post(name: .showQuickTaskSheet, object: nil)
            }
            appState.selectedTab = 0
        case "gowild":
            // Open Go Wild
            if let goalParam = components.queryItems?.first(where: { $0.name == "goal" })?.value {
                NotificationCenter.default.post(
                    name: .goWildFromIntent,
                    object: nil,
                    userInfo: ["goal": goalParam]
                )
            } else {
                NotificationCenter.default.post(name: .showGoWildSheet, object: nil)
            }
            appState.selectedTab = 0
        default:
            break
        }
    }
}

// MARK: - Notification Names for Menu Commands

extension Notification.Name {
    static let showNewFarmSheet = Notification.Name("app.maifarm.showNewFarmSheet")
    static let showQuickTaskSheet = Notification.Name("app.maifarm.showQuickTaskSheet")
    static let showGoWildSheet = Notification.Name("app.maifarm.showGoWildSheet")
    static let showKeyboardShortcuts = Notification.Name("app.maifarm.showKeyboardShortcuts")

    // Deep link navigation
    static let openFarmHarvest = Notification.Name("app.maifarm.openFarmHarvest")
    static let openHarvestDetail = Notification.Name("app.maifarm.openHarvestDetail")
}

// MARK: - Thermal State Observer Modifier

struct ThermalStateObserverModifier: ViewModifier {
    @ObservedObject var thermalMonitor = ThermalStateMonitor.shared

    func body(content: Content) -> some View {
        content
            .onChange(of: thermalMonitor.operationalMode) { _, newMode in
                handleOperationalModeChange(newMode)
            }
    }

    private func handleOperationalModeChange(_ mode: ThermalStateMonitor.OperationalMode) {
        switch mode {
        case .minimal:
            // Show alert about reduced functionality
            AppState.shared.showToast("Device is hot - reducing operations", type: .warning)
            HapticManager.shared.notify(.warning)
        case .efficient:
            AppState.shared.showToast("Power saving mode active", type: .info)
        default:
            break
        }
    }
}

extension View {
    func observeThermalState() -> some View {
        self.modifier(ThermalStateObserverModifier())
    }
}

// MARK: - App Delegate for Background Tasks

#if canImport(UIKit)
class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set up notification delegates
        setupNotificationDelegates()

        // Register for remote notifications if needed
        requestNotificationPermissions()

        // Handle notification if app was launched from one
        if let remoteNotification = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            Task { @MainActor in
                await PushNotificationManager.shared.handleRemoteNotification(userInfo: remoteNotification)
            }
        }

        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
        Task { @MainActor in
            BackgroundTaskManager.shared.handleAppWillTerminate()
        }
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        // Handle Siri Shortcuts continuation
        return true
    }

    // MARK: - Remote Notification Registration

    /// Called when APNs successfully registers the device
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    /// Called when APNs registration fails
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.didFailToRegisterForRemoteNotifications(error: error)
        }
    }

    /// Called when a remote notification arrives (background fetch or silent push)
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            await PushNotificationManager.shared.handleRemoteNotification(userInfo: userInfo)
            completionHandler(.newData)
        }
    }

    // MARK: - Notification Setup

    private func setupNotificationDelegates() {
        // Set push notification delegate
        UNUserNotificationCenter.current().delegate = PushNotificationDelegate.shared
    }

    private func requestNotificationPermissions() {
        // Skip in UI testing mode
        let isUITesting = ProcessInfo.processInfo.arguments.contains("--uitesting") ||
                          ProcessInfo.processInfo.arguments.contains("-uitesting") ||
                          ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil ||
                          ProcessInfo.processInfo.environment["UITEST_DISABLE_NOTIFICATIONS"] == "1" ||
                          UserDefaults.standard.bool(forKey: "UITEST_MODE")

        guard !isUITesting else {
            print("[MaiFarm] Skipping notification request - UI testing mode detected")
            return
        }

        // Request permissions and register for remote notifications
        Task { @MainActor in
            // Request local notification permissions
            _ = await NotificationService.shared.requestPermissions()

            // Request remote notification permissions and register with APNs
            let granted = await PushNotificationManager.shared.requestPermissionsAndRegister()
            if granted {
                print("[MaiFarm] Push notification permissions granted, registered with APNs")
            } else {
                print("[MaiFarm] Push notification permissions denied or deferred")
            }
        }
    }
}

// MARK: - Scene Delegate for iPad Multitasking

class SceneDelegate: NSObject, UIWindowSceneDelegate {

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Handle window scene connection
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Clear badge when app becomes active
        Task { @MainActor in
            NotificationService.shared.clearBadge()
        }
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // Save state when resigning active
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        // Handle background entry
        Task { @MainActor in
            BackgroundTaskManager.shared.handleAppDidEnterBackground()
        }
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        didUpdate previousCoordinateSpace: UICoordinateSpace,
        interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
        traitCollection previousTraitCollection: UITraitCollection
    ) {
        // Handle window size changes (iPad multitasking, Stage Manager)
        // The SwiftUI views will automatically adapt via size classes
    }
}
#endif

// MARK: - macOS App Delegate

#if os(macOS)
class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // macOS-specific setup
    }

    func applicationWillTerminate(_ notification: Notification) {
        Task { @MainActor in
            BackgroundTaskManager.shared.handleAppWillTerminate()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false // Keep running in menu bar
    }
}
#endif
