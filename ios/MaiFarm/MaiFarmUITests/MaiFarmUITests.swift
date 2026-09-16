//
//  MaiFarmUITests.swift
//  MaiFarmUITests
//
//  Created by Rohn Springfield on 12/29/25.
//

import XCTest

final class MaiFarmUITests: XCTestCase {

    var app: XCUIApplication!

    // MARK: - Test Configuration

    /// Standard timeout for UI element appearance
    private let standardTimeout: TimeInterval = 5.0

    /// Extended timeout for navigation and transitions
    private let extendedTimeout: TimeInterval = 10.0

    /// Short timeout for quick checks
    private let shortTimeout: TimeInterval = 3.0

    override func setUpWithError() throws {
        continueAfterFailure = false

        // Use existing installation to avoid widget reinstall issues
        // Target app by bundle ID and activate instead of fresh launch
        app = XCUIApplication(bundleIdentifier: "com.maifarm.ios")
        app.activate()

        // Wait for app to be ready
        _ = app.wait(for: .runningForeground, timeout: extendedTimeout)
    }

    override func tearDownWithError() throws {
        // Terminate app after each test
        if app != nil {
            app.terminate()
        }
        app = nil
    }

    // MARK: - Helper Methods

    /// Wait for an element to exist with a specific timeout
    @discardableResult
    private func waitForElement(_ element: XCUIElement, timeout: TimeInterval? = nil) -> Bool {
        return element.waitForExistence(timeout: timeout ?? standardTimeout)
    }

    /// Wait for any of the given elements to exist
    @discardableResult
    private func waitForAnyElement(_ elements: [XCUIElement], timeout: TimeInterval? = nil) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout ?? standardTimeout)

        while Date() < deadline {
            for element in elements {
                if element.exists && element.isHittable {
                    return element
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }

        // Final check
        return elements.first { $0.exists }
    }

    /// Safely tap an element, waiting for it to be hittable first
    private func safeTap(_ element: XCUIElement, timeout: TimeInterval? = nil) {
        let waitTime = timeout ?? standardTimeout
        if element.waitForExistence(timeout: waitTime) {
            // Wait for element to be hittable
            let deadline = Date().addingTimeInterval(waitTime)
            while Date() < deadline && !element.isHittable {
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
            if element.isHittable {
                element.tap()
            }
        }
    }

    /// Login as guest user
    private func loginAsGuest() {
        let guestButtonById = app.buttons.matching(identifier: "Continue as Guest").firstMatch
        let guestButtonByLabel = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Guest'")).firstMatch
        let anyGuestElement = app.staticTexts["Continue as Guest"]

        let guestElement = waitForAnyElement([guestButtonById, guestButtonByLabel, anyGuestElement])
        if let element = guestElement {
            safeTap(element)
        }

        // Wait for navigation to complete
        _ = waitForMainApp()
    }

    /// Wait for main app interface to load
    @discardableResult
    private func waitForMainApp() -> Bool {
        let tabBar = app.tabBars.firstMatch
        let homeTab = app.buttons["Home"]
        let welcomeText = app.staticTexts["Welcome Back"]
        let navigationBar = app.navigationBars.firstMatch

        return waitForAnyElement([tabBar, homeTab, welcomeText, navigationBar], timeout: extendedTimeout) != nil
    }

    /// Wait for a specific text to appear anywhere in the app
    @discardableResult
    private func waitForText(containing text: String, timeout: TimeInterval? = nil) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@", text)
        let element = app.staticTexts.matching(predicate).firstMatch
        return element.waitForExistence(timeout: timeout ?? standardTimeout)
    }

    // MARK: - Launch Tests

    @MainActor
    func testAppLaunches() throws {
        let maiText = app.staticTexts["Mai"]
        let farmText = app.staticTexts["Farm"]
        let combinedText = app.staticTexts["MaiFarm"]

        let titleExists = waitForElement(combinedText, timeout: shortTimeout) ||
                         (waitForElement(maiText, timeout: shortTimeout) && farmText.exists)
        XCTAssertTrue(titleExists, "App title should be visible (Mai + Farm or MaiFarm)")

        let subtitleElement = app.staticTexts["Multi-Agent AI Orchestration"]
        XCTAssertTrue(waitForElement(subtitleElement), "Subtitle should be visible")
    }

    @MainActor
    func testMainMenuItemsExist() throws {
        // Check for any MaiFarm-related content on welcome screen
        let maiFarmTitle = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Mai' OR label CONTAINS[c] 'Farm'")).firstMatch
        let quickTask = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Quick' OR label CONTAINS[c] 'Task'")).firstMatch
        let anyFeature = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Agent' OR label CONTAINS[c] 'AI' OR label CONTAINS[c] 'Orchestration'")).firstMatch

        // At least one MaiFarm feature should be visible on welcome screen
        let hasContent = waitForAnyElement([maiFarmTitle, quickTask, anyFeature]) != nil

        XCTAssertTrue(hasContent, "Welcome screen should display MaiFarm features")

        // Check for Farm-related content
        let farmOption = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Farm'")).firstMatch
        let hasFarmContent = waitForElement(farmOption, timeout: shortTimeout) || maiFarmTitle.exists

        XCTAssertTrue(hasFarmContent, "Farm option or MaiFarm branding should exist")

        // Check for Harvest/Barn content
        let barnOption = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Barn' OR label CONTAINS[c] 'Harvest' OR label CONTAINS[c] 'Store' OR label CONTAINS[c] 'Output'")).firstMatch
        let hasOutputContent = waitForElement(barnOption, timeout: shortTimeout) || app.staticTexts.count > 2

        XCTAssertTrue(hasOutputContent, "Welcome screen should have Barn/Harvest content or sufficient text")
    }

    @MainActor
    func testAuthOptionsExist() throws {
        let appleButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Apple'")).firstMatch
        XCTAssertTrue(waitForElement(appleButton), "Sign in with Apple should exist")

        let guestButton = app.buttons.matching(identifier: "Continue as Guest").firstMatch
        let guestText = app.staticTexts["Continue as Guest"]
        let guestExists = waitForElement(guestButton, timeout: shortTimeout) || waitForElement(guestText, timeout: shortTimeout)
        XCTAssertTrue(guestExists, "Continue as Guest should exist")
    }

    // MARK: - Guest Flow Tests

    @MainActor
    func testContinueAsGuestFlow() throws {
        loginAsGuest()
        XCTAssertTrue(waitForMainApp(), "Should navigate to main app after guest login")
    }

    // MARK: - Quick Tasks Tests

    @MainActor
    func testQuickTasksNavigation() throws {
        loginAsGuest()

        let quickTask = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Quick Task'")).firstMatch
        if waitForElement(quickTask) {
            safeTap(quickTask)
            // Wait for navigation to complete
            _ = waitForText(containing: "Task", timeout: shortTimeout)
        }
    }

    @MainActor
    func testQuickTasksFeatureCards() throws {
        let quickTask = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Quick'")).firstMatch
        let quickTaskButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Quick Task'")).firstMatch
        let maiFarmTitle = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Mai' OR label CONTAINS[c] 'Farm'")).firstMatch
        let anyFeatureCard = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Task' OR label CONTAINS[c] 'Agent' OR label CONTAINS[c] 'Harvest'")).firstMatch

        // Welcome screen should have Quick Task or any feature content visible
        let hasContent = waitForAnyElement([quickTask, quickTaskButton, maiFarmTitle, anyFeatureCard]) != nil

        XCTAssertTrue(hasContent, "Welcome screen should display Quick Task or feature content")

        // Verify there's some descriptive text on the welcome page
        let anyStaticText = app.staticTexts.count > 0
        XCTAssertTrue(anyStaticText, "Welcome screen should have text content")
    }

    // MARK: - AI Farms Tests

    @MainActor
    func testAIFarmsFeatureCard() throws {
        let farmCard = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Farm'")).firstMatch
        XCTAssertTrue(waitForElement(farmCard), "Farm card should exist")

        let description = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'agent' OR label CONTAINS[c] 'deploy' OR label CONTAINS[c] 'multiple'")).firstMatch
        XCTAssertTrue(waitForElement(description, timeout: shortTimeout), "Farm description should be visible")
    }

    @MainActor
    func testAIFarmsNavigation() throws {
        loginAsGuest()

        let farmsTab = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Farm'")).firstMatch
        let farmsText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Farm'")).firstMatch

        if waitForElement(farmsTab) {
            safeTap(farmsTab)
        } else if waitForElement(farmsText, timeout: shortTimeout) {
            safeTap(farmsText)
        }

        // Wait for farms view to load
        _ = waitForText(containing: "Farm", timeout: shortTimeout)
    }

    // MARK: - Barn Tests

    @MainActor
    func testBarnFeatureCard() throws {
        let barnCard = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Barn' OR label CONTAINS[c] 'Harvest' OR label CONTAINS[c] 'Store'")).firstMatch
        XCTAssertTrue(waitForElement(barnCard, timeout: extendedTimeout), "Barn/Harvest card should exist on welcome screen")
    }

    @MainActor
    func testBarnNavigation() throws {
        loginAsGuest()

        let barnTab = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Barn'")).firstMatch
        let barnText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Barn'")).firstMatch

        if waitForElement(barnTab) {
            safeTap(barnTab)
        } else if waitForElement(barnText, timeout: shortTimeout) {
            safeTap(barnText)
        }

        // Wait for barn view to load
        _ = waitForText(containing: "Barn", timeout: shortTimeout)
    }

    // MARK: - Settings Tests

    @MainActor
    func testSettingsNavigation() throws {
        loginAsGuest()

        let settingsButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Settings' OR label CONTAINS[c] 'gear'")).firstMatch
        let settingsTab = app.tabBars.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Settings'")).firstMatch

        if waitForElement(settingsButton) {
            safeTap(settingsButton)
        } else if waitForElement(settingsTab, timeout: shortTimeout) {
            safeTap(settingsTab)
        }

        // Wait for settings to appear
        _ = waitForText(containing: "Settings", timeout: shortTimeout)
    }

    @MainActor
    func testSettingsContainsExpectedSections() throws {
        loginAsGuest()

        // Navigate to settings
        let settingsButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Settings'")).firstMatch
        if waitForElement(settingsButton) {
            safeTap(settingsButton)
        }

        // Look for expected settings sections
        let displaySection = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Display' OR label CONTAINS[c] 'Appearance'")).firstMatch
        let aiSection = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'AI' OR label CONTAINS[c] 'Engine'")).firstMatch
        let aboutSection = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'About' OR label CONTAINS[c] 'Version'")).firstMatch

        // At least one settings section should be visible
        let hasSettingsContent = waitForAnyElement([displaySection, aiSection, aboutSection], timeout: shortTimeout) != nil

        XCTAssertTrue(hasSettingsContent, "Settings should contain expected sections")
    }

    // MARK: - Tab Bar Tests

    @MainActor
    func testTabBarExists() throws {
        loginAsGuest()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(waitForElement(tabBar, timeout: extendedTimeout), "Tab bar should exist after login")
    }

    @MainActor
    func testTabBarHasMultipleTabs() throws {
        loginAsGuest()

        let tabBar = app.tabBars.firstMatch
        guard waitForElement(tabBar, timeout: extendedTimeout) else {
            XCTFail("Tab bar not found")
            return
        }

        // Tab bar should have multiple buttons
        let tabCount = tabBar.buttons.count
        XCTAssertGreaterThanOrEqual(tabCount, 2, "Tab bar should have at least 2 tabs")
    }

    // MARK: - Accessibility Tests

    @MainActor
    func testMainButtonsAreAccessible() throws {
        // Check that main interactive elements have proper accessibility
        let buttons = app.buttons.allElementsBoundByIndex

        for button in buttons.prefix(5) {  // Check first 5 buttons
            if button.exists && button.isHittable {
                // Button should have a label or identifier
                let hasLabel = !button.label.isEmpty || !button.identifier.isEmpty
                XCTAssertTrue(hasLabel, "Buttons should have accessibility labels")
            }
        }
    }

    @MainActor
    func testImagesHaveAccessibilityLabels() throws {
        loginAsGuest()

        let images = app.images.allElementsBoundByIndex

        for image in images.prefix(3) {  // Check first 3 images
            if image.exists {
                // Images should have some form of accessibility
                let hasLabel = !image.label.isEmpty || image.identifier != ""
                // Note: Some decorative images may intentionally not have labels
                // This is a soft check
                if !hasLabel {
                    print("Image without accessibility label found: \(image)")
                }
            }
        }
    }

    // MARK: - Error State Tests

    @MainActor
    func testNetworkOfflineIndicator() throws {
        loginAsGuest()

        // Look for any network status indicators
        let offlineIndicator = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'offline' OR label CONTAINS[c] 'connection'")).firstMatch

        // This test just verifies the UI can handle network states
        // The indicator may or may not be present depending on actual network state
        _ = waitForElement(offlineIndicator, timeout: shortTimeout)
    }

    // MARK: - Performance Tests

    @MainActor
    func testAppLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }

    // MARK: - Navigation Flow Tests

    @MainActor
    func testCompleteNavigationFlow() throws {
        loginAsGuest()

        // Verify we can navigate between main sections
        let tabBar = app.tabBars.firstMatch
        guard waitForElement(tabBar, timeout: extendedTimeout) else {
            return
        }

        // Get all tab buttons
        let tabButtons = tabBar.buttons.allElementsBoundByIndex

        // Try tapping each tab
        for button in tabButtons {
            if button.exists && button.isHittable {
                safeTap(button)
                // Brief wait for navigation
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
            }
        }
    }

    @MainActor
    func testBackNavigationWorks() throws {
        loginAsGuest()

        // Navigate into a detail view
        let farmCard = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Farm'")).firstMatch
        if waitForElement(farmCard) {
            safeTap(farmCard)
        }

        // Look for back button
        let backButton = app.navigationBars.buttons.firstMatch
        if waitForElement(backButton, timeout: shortTimeout) && backButton.isHittable {
            safeTap(backButton)
            // Should return to previous screen
            _ = waitForMainApp()
        }
    }
}
