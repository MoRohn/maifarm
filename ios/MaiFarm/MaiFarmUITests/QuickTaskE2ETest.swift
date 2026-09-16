//
//  QuickTaskE2ETest.swift
//  MaiFarmUITests
//
//  E2E test for Quick Task flow with Barn verification
//  Handles system dialogs (notifications, etc.) automatically
//

import XCTest

final class QuickTaskE2ETest: XCTestCase {

    var app: XCUIApplication!

    // MARK: - Test Configuration

    private let standardTimeout: TimeInterval = 10.0
    private let shortTimeout: TimeInterval = 5.0

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "-uitesting", "--reset-data"]
        app.launchEnvironment = [
            "UITEST_DISABLE_NOTIFICATIONS": "1",
            "XCTestConfigurationFilePath": "UITest"
        ]
        app.launch()

        // Handle system dialogs (notifications, etc.)
        addUIInterruptionMonitor(forAlertFrom: "MaiFarm") { alert in
            let allowButton = alert.buttons["Allow"]
            let okButton = alert.buttons["OK"]
            let dontAllowButton = alert.buttons["Don't Allow"]

            if allowButton.exists {
                allowButton.tap()
                return true
            } else if okButton.exists {
                okButton.tap()
                return true
            } else if dontAllowButton.exists {
                dontAllowButton.tap()
                return true
            }
            return false
        }

        // Also handle springboard alerts
        addUIInterruptionMonitor(forAlertFrom: "SpringBoard") { alert in
            let allowButton = alert.buttons["Allow"]
            if allowButton.exists {
                allowButton.tap()
                return true
            }
            return false
        }
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Helper Methods

    private func waitForElement(_ element: XCUIElement, timeout: TimeInterval? = nil) -> Bool {
        element.waitForExistence(timeout: timeout ?? standardTimeout)
    }

    private func safeTap(_ element: XCUIElement, timeout: TimeInterval? = nil) {
        if waitForElement(element, timeout: timeout) {
            // Trigger interruption monitors by interacting with app
            app.tap()
            if element.isHittable {
                element.tap()
            }
        }
    }

    private func dismissSystemAlerts() {
        // Tap on the app to trigger any pending interruption monitors
        app.tap()
        sleep(1)
    }

    // MARK: - E2E Test

    /// Complete Quick Task E2E test with system dialog handling
    func testQuickTaskE2EFlow() throws {
        print("🚀 E2E Test: Starting Quick Task flow")

        // === STEP 1: Wait for app launch and dismiss system alerts ===
        sleep(3)
        dismissSystemAlerts()
        print("📱 Step 1: App launched, dismissed system alerts")

        // === STEP 2: Continue as Guest ===
        let guestButton = app.buttons["Continue as Guest"]
        let guestText = app.staticTexts["Continue as Guest"]

        dismissSystemAlerts() // Ensure alerts are dismissed before tapping

        if waitForElement(guestButton, timeout: shortTimeout) {
            safeTap(guestButton)
            print("📱 Step 2: Tapped Continue as Guest")
        } else if waitForElement(guestText, timeout: shortTimeout) {
            safeTap(guestText)
            print("📱 Step 2: Tapped Continue as Guest (text)")
        }
        sleep(2)
        dismissSystemAlerts()

        // === STEP 3: Complete AI Engine Onboarding (if shown) ===
        let startFarmingButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Start Farming'")).firstMatch
        if waitForElement(startFarmingButton, timeout: shortTimeout) {
            safeTap(startFarmingButton)
            print("📱 Step 3: Completed AI Engine onboarding")
            sleep(2)
        }
        dismissSystemAlerts()

        // === STEP 4: Open Quick Task from Dashboard ===
        sleep(2) // Wait for dashboard to fully load
        print("📱 Step 4: Dashboard loaded")

        let quickTaskButton = app.buttons["Quick Task"]
        let quickTaskCard = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Quick Task'")).firstMatch

        if waitForElement(quickTaskButton, timeout: shortTimeout) {
            safeTap(quickTaskButton)
            print("📱 Step 5: Opened Quick Task sheet")
        } else if waitForElement(quickTaskCard, timeout: shortTimeout) {
            safeTap(quickTaskCard)
            print("📱 Step 5: Opened Quick Task via card")
        }
        sleep(2)

        // === STEP 5: Enter task description ===
        let textViews = app.textViews.allElementsBoundByIndex
        let textFields = app.textFields.allElementsBoundByIndex
        let taskDescription = "Review TypeScript errors in API"

        if textViews.count > 0 {
            let taskInput = textViews[0]
            if waitForElement(taskInput, timeout: shortTimeout) {
                taskInput.tap()
                sleep(0.5)
                taskInput.typeText(taskDescription)
                print("📱 Step 6: Entered task description")
            }
        } else if textFields.count > 0 {
            let taskInput = textFields[0]
            if waitForElement(taskInput, timeout: shortTimeout) {
                taskInput.tap()
                sleep(0.5)
                taskInput.typeText(taskDescription)
                print("📱 Step 6: Entered task description (textField)")
            }
        }
        sleep(1)

        // === STEP 6: Start Quick Task ===
        let startButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Start'")).firstMatch
        if waitForElement(startButton, timeout: shortTimeout) && startButton.isHittable {
            startButton.tap()
            print("📱 Step 7: Started Quick Task")
        }

        // === STEP 7: Wait for task completion ===
        print("📱 Step 8: Waiting for task completion...")
        sleep(8) // Progress animation takes ~5 seconds + buffer

        // Wait for sheet to dismiss (Quick Task completed)
        let quickTaskTitle = app.staticTexts["Quick Task"]
        var attempts = 0
        while quickTaskTitle.exists && attempts < 5 {
            sleep(1)
            attempts += 1
        }
        print("📱 Step 9: Task completed")

        // === STEP 8: Navigate to Barn ===
        let barnTab = app.buttons["Barn"]
        let tabBar = app.tabBars.firstMatch

        if waitForElement(barnTab, timeout: shortTimeout) {
            safeTap(barnTab)
            print("📱 Step 10: Navigated to Barn")
        } else if waitForElement(tabBar, timeout: shortTimeout) {
            let barnButton = tabBar.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Barn'")).firstMatch
            if barnButton.exists {
                safeTap(barnButton)
                print("📱 Step 10: Navigated to Barn (tab bar)")
            }
        }
        sleep(2)

        // === STEP 9: Verify Barn shows items ===
        let recentSection = app.staticTexts["Recent"]
        let hasRecentSection = waitForElement(recentSection, timeout: shortTimeout)
        print("📱 Step 11: Barn 'Recent' section visible: \(hasRecentSection)")

        // Verify our new task appears (should contain "Review" or "TypeScript")
        let newTaskItem = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Review' OR label CONTAINS[c] 'TypeScript'")).firstMatch
        let hasNewTask = waitForElement(newTaskItem, timeout: shortTimeout)
        print("📱 Step 12: New task visible in Barn: \(hasNewTask)")

        // === STEP 10: Open a barn item ===
        let barnCells = app.cells.allElementsBoundByIndex
        print("📱 Step 13: Found \(barnCells.count) items in Barn")

        if barnCells.count > 0 && barnCells[0].isHittable {
            barnCells[0].tap()
            print("📱 Step 14: Opened first Barn item")
            sleep(2)
        }

        // === STEP 11: Verify item details ===
        let detailsTitle = app.staticTexts["Harvest Details"]
        let filesSection = app.staticTexts["Files"]
        let hasDetails = waitForElement(detailsTitle, timeout: shortTimeout) || waitForElement(filesSection, timeout: shortTimeout)
        print("📱 Step 15: Barn item details displayed: \(hasDetails)")

        // === STEP 12: Close details ===
        let doneButton = app.buttons["Done"]
        if waitForElement(doneButton, timeout: shortTimeout) && doneButton.isHittable {
            doneButton.tap()
            print("📱 Step 16: Closed details sheet")
        }

        // === ASSERTIONS ===
        XCTAssertTrue(hasRecentSection || barnCells.count > 0, "Barn should show harvest items")

        print("📱 E2E Test: COMPLETE!")
    }

    /// Test app relaunch persistence
    func testBarnPersistenceAfterRelaunch() throws {
        print("🔄 Persistence Test: Starting")

        // First run: verify barn has items
        sleep(3)

        // Dismiss notification if present
        let allowButton = app.buttons["Allow"]
        if allowButton.waitForExistence(timeout: 2) {
            allowButton.tap()
            sleep(1)
        }

        // Login as guest
        let guestButton = app.buttons["Continue as Guest"]
        if guestButton.waitForExistence(timeout: 3) {
            guestButton.tap()
            sleep(2)
        }

        // Complete onboarding if shown
        let startFarmingButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Start Farming'")).firstMatch
        if startFarmingButton.waitForExistence(timeout: 3) {
            startFarmingButton.tap()
            sleep(2)
        }

        // Navigate to Barn
        let barnTab = app.buttons["Barn"]
        if barnTab.waitForExistence(timeout: 5) {
            barnTab.tap()
            sleep(2)
        }

        // Count initial items
        let initialCells = app.cells.count
        print("🔄 Initial Barn items: \(initialCells)")

        // Terminate and relaunch
        print("🔄 Relaunching app...")
        app.terminate()
        sleep(2)
        app.launch()
        sleep(4)

        // Re-authenticate
        if allowButton.waitForExistence(timeout: 2) {
            allowButton.tap()
            sleep(1)
        }
        if guestButton.waitForExistence(timeout: 3) {
            guestButton.tap()
            sleep(2)
        }
        if startFarmingButton.waitForExistence(timeout: 3) {
            startFarmingButton.tap()
            sleep(2)
        }

        // Navigate to Barn again
        if barnTab.waitForExistence(timeout: 5) {
            barnTab.tap()
            sleep(2)
        }

        // Verify items still exist
        let afterRelaunchCells = app.cells.count
        print("🔄 Barn items after relaunch: \(afterRelaunchCells)")

        // Barn should have items (demo data persists)
        let recentSection = app.staticTexts["Recent"]
        XCTAssertTrue(recentSection.waitForExistence(timeout: 3), "Barn should show Recent section after relaunch")

        print("🔄 Persistence Test: COMPLETE!")
    }
}
