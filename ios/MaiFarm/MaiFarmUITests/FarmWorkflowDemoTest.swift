import XCTest

final class FarmWorkflowDemoTest: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    /// Complete Farm workflow demo - navigates through all main screens
    func testCompleteFarmWorkflowDemo() throws {
        // Wait for app to fully load
        sleep(3)

        // === STEP 1: Welcome Screen ===
        print("📱 Demo: Welcome Screen")

        // Look for and tap Continue as Guest
        let guestButton = app.buttons["Continue as Guest"]
        if guestButton.waitForExistence(timeout: 5) {
            guestButton.tap()
            sleep(2)
        }

        // === STEP 2: Dashboard/Home ===
        print("📱 Demo: Dashboard")
        sleep(2)

        // === STEP 3: Tap New Farm ===
        print("📱 Demo: Opening New Farm")
        let newFarmButton = app.buttons["New Farm"]
        if newFarmButton.waitForExistence(timeout: 5) {
            newFarmButton.tap()
            sleep(3)
        } else {
            // Try other identifiers
            let createFarmButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'New Farm' OR label CONTAINS[c] 'Create Farm'")).firstMatch
            if createFarmButton.waitForExistence(timeout: 3) {
                createFarmButton.tap()
                sleep(3)
            }
        }

        // === STEP 4: Farm Creation Form ===
        print("📱 Demo: Farm Creation Form")

        // Try to find and fill the prompt text field
        let textFields = app.textFields.allElementsBoundByIndex
        if textFields.count > 0 {
            let promptField = textFields[0]
            if promptField.waitForExistence(timeout: 3) {
                promptField.tap()
                sleep(1)
                promptField.typeText("Create a weather app with current conditions and 5-day forecast")
                sleep(2)
            }
        }

        // Try text views if no text fields
        let textViews = app.textViews.allElementsBoundByIndex
        if textViews.count > 0 {
            let promptView = textViews[0]
            if promptView.waitForExistence(timeout: 3) {
                promptView.tap()
                sleep(1)
                promptView.typeText("Create a weather app with current conditions and 5-day forecast")
                sleep(2)
            }
        }

        // Look for agent count slider or stepper
        let agentStepper = app.steppers.firstMatch
        if agentStepper.waitForExistence(timeout: 2) {
            // Increment agents
            agentStepper.buttons["Increment"].tap()
            sleep(1)
        }

        // === STEP 5: Start Farm ===
        print("📱 Demo: Starting Farm")
        let startButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Start' OR label CONTAINS[c] 'Create' OR label CONTAINS[c] 'Launch'")).firstMatch
        if startButton.waitForExistence(timeout: 3) && startButton.isHittable {
            startButton.tap()
            sleep(3)
        }

        // Close any sheet if still open
        let cancelButton = app.buttons["Cancel"]
        if cancelButton.exists && cancelButton.isHittable {
            cancelButton.tap()
            sleep(1)
        }

        let closeButton = app.buttons["Close"]
        if closeButton.exists && closeButton.isHittable {
            closeButton.tap()
            sleep(1)
        }

        // === STEP 6: Navigate to Farms tab ===
        print("📱 Demo: Farms Tab")
        let farmsTab = app.buttons["Farms"]
        if farmsTab.waitForExistence(timeout: 3) {
            farmsTab.tap()
            sleep(3)
        }

        // === STEP 7: Navigate to Harvest tab ===
        print("📱 Demo: Harvest Tab")
        let harvestTab = app.buttons["Harvest"]
        if harvestTab.waitForExistence(timeout: 3) {
            harvestTab.tap()
            sleep(3)
        }

        // === STEP 8: Navigate to Farmers tab ===
        print("📱 Demo: Farmers Tab")
        let farmersTab = app.buttons["Farmers"]
        if farmersTab.waitForExistence(timeout: 3) {
            farmersTab.tap()
            sleep(3)
        }

        // === STEP 9: Navigate to Barn tab ===
        print("📱 Demo: Barn Tab")
        let barnTab = app.buttons["Barn"]
        if barnTab.waitForExistence(timeout: 3) {
            barnTab.tap()
            sleep(3)
        }

        // === STEP 10: Navigate to More/Settings ===
        print("📱 Demo: More/Settings Tab")
        let moreTab = app.buttons["More"]
        if moreTab.waitForExistence(timeout: 3) {
            moreTab.tap()
            sleep(2)
        }

        // === STEP 11: Return to Home ===
        print("📱 Demo: Back to Home")
        let homeTab = app.buttons["Home"]
        if homeTab.waitForExistence(timeout: 3) {
            homeTab.tap()
            sleep(2)
        }

        // === STEP 12: Quick Task Demo ===
        print("📱 Demo: Quick Task")
        let quickTaskButton = app.buttons["Quick Task"]
        if quickTaskButton.waitForExistence(timeout: 3) {
            quickTaskButton.tap()
            sleep(3)
        }

        // Close quick task sheet
        if cancelButton.exists && cancelButton.isHittable {
            cancelButton.tap()
            sleep(1)
        }

        // === STEP 13: Go Wild Demo ===
        print("📱 Demo: Go Wild")
        let goWildButton = app.buttons["Go Wild"]
        if goWildButton.waitForExistence(timeout: 3) {
            goWildButton.tap()
            sleep(3)
        }

        // Close go wild sheet
        if cancelButton.exists && cancelButton.isHittable {
            cancelButton.tap()
            sleep(1)
        }

        print("📱 Demo: Complete!")
        sleep(2)
    }
}
