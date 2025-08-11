# macOS/iOS Integration Guide for MaiFarm

## Overview

MaiFarm provides comprehensive API support for macOS and iOS desktop/tablet applications, enabling native clients to interact with the farm orchestration system. This guide covers authentication, API endpoints, WebSocket connections, and push notifications for Apple platforms.

## Prerequisites

- macOS 11.0+ / iOS 14.0+ (optimized for desktop/tablet)
- Swift 5.5+ or Objective-C
- Xcode 13+
- Valid Apple Developer account (for push notifications)

## Base Configuration

```swift
// Production
let baseURL = "https://api.maifarm.ai"
let wsURL = "wss://api.maifarm.ai"

// Development
let baseURL = "http://localhost:4567"
let wsURL = "ws://localhost:4567"
```

## Authentication

### 1. Standard Login

```swift
struct LoginRequest: Codable {
    let email: String
    let password: String
    let deviceId: String
    let platform: String = "macos" // or "ios"
}

func login(email: String, password: String) async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/api/auth/login")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let loginData = LoginRequest(
        email: email,
        password: password,
        deviceId: getDeviceID()
    )
    
    request.httpBody = try JSONEncoder().encode(loginData)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(AuthResponse.self, from: data)
}
```

### 2. Biometric Authentication (Face ID/Touch ID)

```swift
import LocalAuthentication

func authenticateWithBiometrics() async throws -> AuthResponse {
    let context = LAContext()
    var error: NSError?
    
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
        throw BiometricError.notAvailable
    }
    
    let reason = "Authenticate to access MaiFarm"
    try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
    
    // Send biometric token to server
    let url = URL(string: "\(baseURL)/api/auth/biometric")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let biometricData = [
        "deviceId": getDeviceID(),
        "biometricToken": generateBiometricToken(),
        "platform": getCurrentPlatform()
    ]
    
    request.httpBody = try JSONSerialization.data(withJSONObject: biometricData)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONDecoder().decode(AuthResponse.self, from: data)
}
```

### 3. Refresh Token Management

```swift
class TokenManager {
    private let keychain = Keychain(service: "com.maifarm.desktop")
    
    func saveTokens(_ response: AuthResponse) {
        keychain["accessToken"] = response.accessToken
        keychain["refreshToken"] = response.refreshToken
        keychain["expiresAt"] = String(Date().timeIntervalSince1970 + Double(response.expiresIn))
    }
    
    func refreshAccessToken() async throws -> String {
        guard let refreshToken = keychain["refreshToken"] else {
            throw AuthError.noRefreshToken
        }
        
        let url = URL(string: "\(baseURL)/api/auth/refresh")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let refreshData = [
            "refreshToken": refreshToken,
            "deviceId": getDeviceID()
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: refreshData)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(AuthResponse.self, from: data)
        
        saveTokens(response)
        return response.accessToken
    }
}
```

## API Endpoints

### Client-Specific Endpoints

All client endpoints require authentication via Bearer token:

```swift
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
```

#### 1. Farm Management

```swift
// Get user's farms with pagination
func getFarms(page: Int = 1, limit: Int = 10) async throws -> FarmsResponse {
    let url = URL(string: "\(baseURL)/api/client/farms?page=\(page)&limit=\(limit)")!
    // ... make authenticated request
}

// Launch a new farm
func launchFarm(name: String, prompt: String, agentCount: Int) async throws -> FarmLaunchResponse {
    let url = URL(string: "\(baseURL)/api/client/farm/launch")!
    
    let multipartData = MultipartFormData()
    multipartData.append(name.data(using: .utf8)!, withName: "name")
    multipartData.append(prompt.data(using: .utf8)!, withName: "prompt")
    multipartData.append("\(agentCount)".data(using: .utf8)!, withName: "agentCount")
    
    // Add context files if needed
    for file in contextFiles {
        multipartData.append(file.data, withName: "contextFiles", fileName: file.name, mimeType: file.mimeType)
    }
    
    // ... make authenticated multipart request
}
```

#### 2. Quick Tasks

```swift
// Create a quick task with attachments
func createQuickTask(prompt: String, attachments: [URL]) async throws -> TaskResponse {
    let url = URL(string: "\(baseURL)/api/client/quick-task")!
    
    let multipartData = MultipartFormData()
    multipartData.append(prompt.data(using: .utf8)!, withName: "prompt")
    
    // Handle HEIC images automatically
    for attachment in attachments {
        let data = try Data(contentsOf: attachment)
        let mimeType = attachment.pathExtension == "heic" ? "image/heic" : "image/jpeg"
        multipartData.append(data, withName: "attachments", fileName: attachment.lastPathComponent, mimeType: mimeType)
    }
    
    // ... make authenticated multipart request
}
```

#### 3. Terminal Output (Desktop Feature)

```swift
// Stream terminal output from a specific agent
func getTerminalOutput(farmId: String, agentId: String) async throws -> TerminalOutput {
    let url = URL(string: "\(baseURL)/api/client/farm/\(farmId)/terminal/\(agentId)?lines=100")!
    // ... make authenticated request
}
```

#### 4. Workspace Sync (Desktop Feature)

```swift
// Sync workspace files bidirectionally
func syncWorkspace(farmId: String, direction: SyncDirection) async throws {
    if direction == .upload {
        // Upload local files to server
        let url = URL(string: "\(baseURL)/api/client/workspace/sync")!
        let multipartData = MultipartFormData()
        multipartData.append(farmId.data(using: .utf8)!, withName: "farmId")
        multipartData.append("upload".data(using: .utf8)!, withName: "syncDirection")
        
        for file in localFiles {
            multipartData.append(file.data, withName: "files", fileName: file.name)
        }
        // ... make authenticated multipart request
    } else {
        // Download files from server
        let url = URL(string: "\(baseURL)/api/client/workspace/sync")!
        // ... make authenticated POST request with syncDirection: "download"
    }
}
```

## WebSocket Connection

### Optimized for Desktop Clients

```swift
import SocketIO

class MaiFarmSocketManager {
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    private let reconnectStrategy = ExponentialBackoffReconnect()
    
    init(token: String) {
        let config: SocketIOClientConfiguration = [
            .log(false),
            .compress,
            .reconnects(true),
            .reconnectAttempts(-1), // Infinite attempts
            .reconnectWait(1),
            .reconnectWaitMax(30),
            .forceWebsockets(true),
            .secure(true),
            .extraHeaders(["Authorization": "Bearer \(token)"])
        ]
        
        manager = SocketManager(socketURL: URL(string: wsURL)!, config: config)
        socket = manager.defaultSocket
        
        setupEventHandlers()
    }
    
    private func setupEventHandlers() {
        // Connection events
        socket.on(clientEvent: .connect) { data, ack in
            print("WebSocket connected")
            self.subscribeToEvents()
        }
        
        socket.on(clientEvent: .disconnect) { data, ack in
            print("WebSocket disconnected")
            self.handleDisconnect()
        }
        
        // Farm events
        socket.on("farm:status") { data, ack in
            self.handleFarmStatus(data)
        }
        
        socket.on("farm:completed") { data, ack in
            self.handleFarmCompleted(data)
        }
        
        // Agent events
        socket.on("agent:updated") { data, ack in
            self.handleAgentUpdate(data)
        }
        
        socket.on("agent:output") { data, ack in
            self.handleAgentOutput(data)
        }
        
        // Harvest events
        socket.on("harvest:ready") { data, ack in
            self.handleHarvestReady(data)
        }
        
        // Analytics events (desktop specific)
        socket.on("analytics:metrics") { data, ack in
            self.handleAnalyticsUpdate(data)
        }
        
        // Terminal output (desktop specific)
        socket.on("terminal:output") { data, ack in
            self.handleTerminalOutput(data)
        }
    }
    
    func connect() {
        socket.connect()
    }
    
    func disconnect() {
        socket.disconnect()
    }
    
    // Desktop-specific: Subscribe to multiple farms
    func subscribeToFarm(_ farmId: String) {
        socket.emit("subscribe:farm", ["farmId": farmId])
    }
    
    // Desktop-specific: Request analytics stream
    func requestAnalytics() {
        socket.emit("request:analytics", ["interval": 5000])
    }
}
```

## Push Notifications

### Setup for macOS/iOS

1. **Configure Push Notification Entitlements**

```xml
<!-- Entitlements.plist -->
<key>aps-environment</key>
<string>development</string> <!-- or "production" -->
```

2. **Register for Push Notifications**

```swift
import UserNotifications

class PushNotificationManager: NSObject {
    
    func registerForPushNotifications() async throws {
        let center = UNUserNotificationCenter.current()
        let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
        
        guard granted else {
            throw PushError.permissionDenied
        }
        
        await MainActor.run {
            #if os(macOS)
            NSApp.registerForRemoteNotifications()
            #else
            UIApplication.shared.registerForRemoteNotifications()
            #endif
        }
    }
    
    func handleDeviceToken(_ deviceToken: Data) async throws {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        
        // Register device with server
        let url = URL(string: "\(baseURL)/api/client/device")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        let deviceData = [
            "deviceToken": token,
            "deviceId": getDeviceID(),
            "platform": getCurrentPlatform()
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: deviceData)
        
        let (_, _) = try await URLSession.shared.data(for: request)
    }
}
```

3. **Handle Incoming Notifications**

```swift
extension PushNotificationManager: UNUserNotificationCenterDelegate {
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, 
                                didReceive response: UNNotificationResponse) async {
        let userInfo = response.notification.request.content.userInfo
        
        guard let type = userInfo["type"] as? String else { return }
        
        switch type {
        case "farm_completed":
            if let farmId = userInfo["farmId"] as? String {
                await handleFarmCompleted(farmId: farmId)
            }
            
        case "harvest_ready":
            if let harvestId = userInfo["harvestId"] as? String {
                await handleHarvestReady(harvestId: harvestId)
            }
            
        case "task_failed":
            if let taskId = userInfo["taskId"] as? String {
                await handleTaskFailed(taskId: taskId)
            }
            
        default:
            break
        }
    }
    
    // Show notification while app is in foreground (desktop apps)
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        return [.banner, .badge, .sound]
    }
}
```

## File Handling

### HEIC Image Support

MaiFarm automatically converts HEIC images from iOS devices to JPEG for compatibility:

```swift
func prepareImageForUpload(_ imageURL: URL) async throws -> Data {
    if imageURL.pathExtension.lowercased() == "heic" {
        // Server will handle HEIC conversion automatically
        return try Data(contentsOf: imageURL)
    } else {
        return try Data(contentsOf: imageURL)
    }
}
```

## Desktop-Specific Features

### 1. Multi-Window Support (macOS)

```swift
// Support multiple farm windows
class FarmWindowController: NSWindowController {
    let farmId: String
    let socketManager: MaiFarmSocketManager
    
    init(farmId: String) {
        self.farmId = farmId
        self.socketManager = MaiFarmSocketManager(token: TokenManager.shared.accessToken)
        super.init(window: nil)
        
        socketManager.subscribeToFarm(farmId)
    }
}
```

### 2. Menu Bar Integration (macOS)

```swift
// Quick access from menu bar
class MenuBarController {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    
    func setupMenuBar() {
        statusItem.button?.title = "MaiFarm"
        
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Quick Task", action: #selector(showQuickTask), keyEquivalent: "t"))
        menu.addItem(NSMenuItem(title: "Active Farms", action: #selector(showActiveFarms), keyEquivalent: "f"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApp.terminate), keyEquivalent: "q"))
        
        statusItem.menu = menu
    }
}
```

### 3. Keyboard Shortcuts (Desktop)

```swift
// Global keyboard shortcuts for desktop productivity
extension NSViewController {
    override func keyDown(with event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        
        if flags.contains(.command) {
            switch event.keyCode {
            case 45: // Cmd+N - New Farm
                createNewFarm()
            case 17: // Cmd+T - Quick Task
                showQuickTask()
            case 5: // Cmd+G - Go Wild Mode
                launchGoWildMode()
            default:
                super.keyDown(with: event)
            }
        }
    }
}
```

## Error Handling

```swift
enum MaiFarmError: LocalizedError {
    case authenticationFailed
    case networkError(String)
    case serverError(Int, String)
    case invalidResponse
    case tokenExpired
    
    var errorDescription: String? {
        switch self {
        case .authenticationFailed:
            return "Authentication failed. Please login again."
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .invalidResponse:
            return "Invalid response from server"
        case .tokenExpired:
            return "Session expired. Refreshing..."
        }
    }
}

// Automatic token refresh on 401
class APIClient {
    func makeRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        var request = request
        request.setValue("Bearer \(currentToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        if let httpResponse = response as? HTTPURLResponse {
            if httpResponse.statusCode == 401 {
                // Token expired, refresh and retry
                let newToken = try await TokenManager.shared.refreshAccessToken()
                request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                let (retryData, _) = try await URLSession.shared.data(for: request)
                return try JSONDecoder().decode(T.self, from: retryData)
            }
            
            guard httpResponse.statusCode == 200 else {
                throw MaiFarmError.serverError(httpResponse.statusCode, "Request failed")
            }
        }
        
        return try JSONDecoder().decode(T.self, from: data)
    }
}
```

## Sample SwiftUI App Structure

```swift
import SwiftUI

@main
struct MaiFarmApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var socketManager = SocketManager()
    @StateObject private var pushManager = PushNotificationManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(socketManager)
                .environmentObject(pushManager)
                .onAppear {
                    Task {
                        await setupApp()
                    }
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Farm") {
                    showNewFarmWindow()
                }.keyboardShortcut("n")
                
                Button("Quick Task") {
                    showQuickTaskWindow()
                }.keyboardShortcut("t")
            }
        }
        
        #if os(macOS)
        Settings {
            SettingsView()
                .environmentObject(authManager)
        }
        #endif
    }
    
    private func setupApp() async {
        // Initialize authentication
        if await authManager.hasValidSession() {
            await authManager.refreshTokenIfNeeded()
        }
        
        // Setup WebSocket connection
        socketManager.connect()
        
        // Register for push notifications
        try? await pushManager.registerForPushNotifications()
    }
}
```

## Testing

### Development Environment

```swift
// Configure for local development
struct DevelopmentConfig {
    static let baseURL = "http://localhost:4567"
    static let wsURL = "ws://localhost:4567"
    static let mockToken = "dev-api-key"
    static let bypassAuth = true
}

// Use in development
#if DEBUG
let config = DevelopmentConfig.self
#else
let config = ProductionConfig.self
#endif
```

### Test Credentials

```swift
// Development test account
let testCredentials = [
    "email": "test@maifarm.ai",
    "password": "test123",
    "apiKey": "dev-api-key"
]
```

## Performance Optimization

### 1. Connection Pooling

```swift
// Reuse URLSession for better performance
extension URLSession {
    static let maifarm: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        config.waitsForConnectivity = true
        config.multipathServiceType = .handover
        return URLSession(configuration: config)
    }()
}
```

### 2. Caching Strategy

```swift
// Cache frequently accessed data
class MaiFarmCache {
    private let cache = NSCache<NSString, AnyObject>()
    
    func cacheFarms(_ farms: [Farm]) {
        cache.setObject(farms as AnyObject, forKey: "farms")
    }
    
    func getCachedFarms() -> [Farm]? {
        return cache.object(forKey: "farms") as? [Farm]
    }
}
```

### 3. Background Processing

```swift
// Handle long-running operations in background
class BackgroundTaskManager {
    func processHarvestInBackground(_ harvestId: String) {
        Task.detached(priority: .background) {
            let harvest = try await self.fetchHarvest(harvestId)
            await self.processHarvestData(harvest)
            
            await MainActor.run {
                // Update UI on main thread
                NotificationCenter.default.post(name: .harvestProcessed, object: harvest)
            }
        }
    }
}
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Drops**
   - Implement exponential backoff reconnection
   - Monitor network reachability
   - Use connection state restoration

2. **Token Expiration**
   - Implement automatic token refresh
   - Store refresh token securely in Keychain
   - Handle 401 responses gracefully

3. **Push Notifications Not Received**
   - Verify APN certificates are configured
   - Check device token registration
   - Ensure proper entitlements

4. **File Upload Issues**
   - Handle HEIC conversion automatically
   - Implement chunked uploads for large files
   - Add progress tracking for better UX

## Support

For additional support and updates:
- API Documentation: https://docs.maifarm.ai/api
- GitHub Issues: https://github.com/maifarm/issues
- Discord Community: https://discord.gg/maifarm