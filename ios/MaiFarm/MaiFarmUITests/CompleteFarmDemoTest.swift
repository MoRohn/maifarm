//
//  CompleteFarmDemoTest.swift
//  MaiFarmUITests
//
//  Complete farm workflow demo for video recording
//  Covers: Login -> AI Engine -> New Farm -> Harvest -> Barn
//

import XCTest

final class CompleteFarmDemoTest: XCTestCase {

    var app: XCUIApplication!

    // Timing constants for smooth demo
    private let shortPause: UInt32 = 1
    private let mediumPause: UInt32 = 2
    private let longPause: UInt32 = 3
    private let extraLongPause: UInt32 = 5

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--demo-mode"]
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Complete Demo Flow

    /// Full demo covering entire New Farm workflow
    /// For video recording: Run with `xcodebuild test` while recording simulator
    @MainActor
    func testCompleteFarmWorkflowDemo() throws {
        app.launch()
        sleep(extraLongPause) // Let splash screen animate

        // ========================================
        // PHASE 1: Welcome Screen & Login
        // ========================================
        print("🎬 PHASE 1: Welcome Screen")

        // Wait for welcome screen to fully load
        sleep(longPause)

        // Explore the feature cards by scrolling
        let scrollView = app.scrollViews.firstMatch
        if scrollView.exists {
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(mediumPause)
        }

        // Tap Continue as Guest
        print("🎬 Tapping Continue as Guest")
        tapButton(containing: "Guest")
        sleep(longPause)

        // ========================================
        // PHASE 2: AI Engine Selection (if shown)
        // ========================================
        print("🎬 PHASE 2: AI Engine Selection")

        // Check if we're on engine selection
        let engineText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Engine' OR label CONTAINS[c] 'Claude' OR label CONTAINS[c] 'AI'")).firstMatch
        if engineText.waitForExistence(timeout: 3) {
            sleep(mediumPause)

            // Look for Claude option and tap it
            let claudeOption = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Claude'")).firstMatch
            if claudeOption.exists && claudeOption.isHittable {
                print("🎬 Selecting Claude AI Engine")
                claudeOption.tap()
                sleep(mediumPause)
            }

            // Tap Start Farming button
            print("🎬 Tapping Start Farming")
            tapButton(containing: "Start Farming")
            sleep(longPause)
        }

        // ========================================
        // PHASE 3: Main Dashboard
        // ========================================
        print("🎬 PHASE 3: Main Dashboard")
        sleep(mediumPause)

        // Explore dashboard - scroll to see content
        if scrollView.exists {
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(mediumPause)
        }

        // ========================================
        // PHASE 4: Navigate to Farms Tab
        // ========================================
        print("🎬 PHASE 4: Farms Page")
        tapTab("Farms")
        sleep(longPause)

        // ========================================
        // PHASE 5: Create New Farm
        // ========================================
        print("🎬 PHASE 5: Creating New Farm")

        // Look for New Farm / Plus button
        let newFarmButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'New Farm' OR label CONTAINS[c] 'Create' OR label CONTAINS[c] 'plus'")).firstMatch
        if newFarmButton.waitForExistence(timeout: 5) && newFarmButton.isHittable {
            print("🎬 Opening New Farm modal")
            newFarmButton.tap()
            sleep(longPause)
        }

        // Or try the plus button in Quick Actions
        let plusButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Create New'")).firstMatch
        if plusButton.waitForExistence(timeout: 3) && plusButton.isHittable {
            print("🎬 Opening Create New modal")
            plusButton.tap()
            sleep(mediumPause)

            // Select New Farm from modal
            let farmOption = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'New Farm'")).firstMatch
            if farmOption.waitForExistence(timeout: 3) && farmOption.isHittable {
                print("🎬 Selecting New Farm option")
                farmOption.tap()
                sleep(longPause)
            }
        }

        // Enter farm details
        enterFarmDetails()
        sleep(longPause)

        // ========================================
        // PHASE 6: Navigate to Harvest Page
        // ========================================
        print("🎬 PHASE 6: Harvest Page")
        tapTab("Harvest")
        sleep(longPause)

        // Explore harvest page
        if scrollView.exists {
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(mediumPause)
        }

        // ========================================
        // PHASE 7: Navigate to Barn Page
        // ========================================
        print("🎬 PHASE 7: Barn Page")
        tapTab("Barn")
        sleep(longPause)

        // Explore barn page
        if scrollView.exists {
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(mediumPause)
        }

        // Try to tap on any harvest item
        let barnItem = app.cells.firstMatch
        if barnItem.exists && barnItem.isHittable {
            print("🎬 Opening barn item details")
            barnItem.tap()
            sleep(longPause)

            // Go back
            let backButton = app.navigationBars.buttons.firstMatch
            if backButton.exists && backButton.isHittable {
                backButton.tap()
                sleep(mediumPause)
            }
        }

        // ========================================
        // PHASE 8: Settings Page
        // ========================================
        print("🎬 PHASE 8: Settings Page")
        tapTab("Settings")
        sleep(longPause)

        // Scroll through settings
        if scrollView.exists {
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeUp()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(shortPause)
            scrollView.swipeDown()
            sleep(mediumPause)
        }

        // ========================================
        // PHASE 9: Return to Dashboard
        // ========================================
        print("🎬 PHASE 9: Return to Dashboard")
        tapTab("Home")
        sleep(longPause)

        print("🎬 Demo Complete!")
        sleep(extraLongPause) // Final pause for video
    }

    // MARK: - Helper Methods

    private func tapButton(containing text: String) {
        let button = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
        if button.waitForExistence(timeout: 5) && button.isHittable {
            button.tap()
        } else {
            // Try static text
            let staticText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
            if staticText.waitForExistence(timeout: 3) && staticText.isHittable {
                staticText.tap()
            }
        }
    }

    private func tapTab(_ name: String) {
        // Try tab bar first
        let tabBarButton = app.tabBars.buttons[name]
        if tabBarButton.waitForExistence(timeout: 3) && tabBarButton.isHittable {
            tabBarButton.tap()
            return
        }

        // Try sidebar (iPad)
        let sidebarButton = app.buttons[name]
        if sidebarButton.waitForExistence(timeout: 2) && sidebarButton.isHittable {
            sidebarButton.tap()
            return
        }

        // Try any button containing the name
        let anyButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", name)).firstMatch
        if anyButton.waitForExistence(timeout: 2) && anyButton.isHittable {
            anyButton.tap()
        }
    }

    private func enterFarmDetails() {
        // Find and tap text fields/views
        let textFields = app.textFields.allElementsBoundByIndex
        let textViews = app.textViews.allElementsBoundByIndex

        // Enter farm name
        if textFields.count > 0 {
            let nameField = textFields[0]
            if nameField.exists && nameField.isHittable {
                print("🎬 Entering farm name")
                nameField.tap()
                sleep(shortPause)
                nameField.typeText("Demo Weather App Farm")
                sleep(mediumPause)
            }
        }

        // Enter prompt
        if textViews.count > 0 {
            let promptView = textViews[0]
            if promptView.exists && promptView.isHittable {
                print("🎬 Entering farm prompt")
                promptView.tap()
                sleep(shortPause)
                promptView.typeText("Create a beautiful weather app with current conditions and 5-day forecast")
                sleep(mediumPause)
            }
        }

        // Look for agent slider and adjust
        let slider = app.sliders.firstMatch
        if slider.exists && slider.isHittable {
            print("🎬 Adjusting agent count")
            slider.adjust(toNormalizedSliderPosition: 0.3) // Set to ~3 agents
            sleep(mediumPause)
        }

        // Try to start the farm (or close the modal for demo)
        let startButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Start' OR label CONTAINS[c] 'Create'")).firstMatch
        if startButton.exists && startButton.isHittable {
            print("🎬 Tapping Start/Create Farm")
            startButton.tap()
            sleep(longPause)
        } else {
            // Close modal if no start button
            let closeButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Cancel' OR label CONTAINS[c] 'Close'")).firstMatch
            if closeButton.exists && closeButton.isHittable {
                closeButton.tap()
                sleep(mediumPause)
            }
        }
    }
}
