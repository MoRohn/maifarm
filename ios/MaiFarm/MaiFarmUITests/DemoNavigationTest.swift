//
//  DemoNavigationTest.swift
//  MaiFarmUITests
//
//  Demo navigation for video recording
//

import XCTest

final class DemoNavigationTest: XCTestCase {
    
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
    }
    
    override func tearDownWithError() throws {
        app = nil
    }
    
    /// Navigate through all screens for demo video
    func testDemoNavigation() throws {
        app.launch()
        sleep(3)
        
        // === Welcome Screen ===
        print("📱 Starting on Welcome Screen")
        
        // Tap Continue as Guest
        let guestButton = app.buttons["Continue as Guest"]
        if guestButton.waitForExistence(timeout: 5) {
            print("📱 Tapping Continue as Guest")
            guestButton.tap()
            sleep(2)
        }
        
        // === Dashboard ===
        print("📱 Now on Dashboard")
        sleep(2)
        
        // === Tap New Farm ===
        let newFarmButton = app.buttons["New Farm"]
        if newFarmButton.waitForExistence(timeout: 5) {
            print("📱 Tapping New Farm")
            newFarmButton.tap()
            sleep(3)
        }
        
        // Look for form fields
        let textViews = app.textViews.allElementsBoundByIndex
        if textViews.count > 0 {
            let firstTextView = textViews[0]
            if firstTextView.exists && firstTextView.isHittable {
                print("📱 Entering farm prompt")
                firstTextView.tap()
                sleep(1)
                firstTextView.typeText("Create a simple weather app")
                sleep(2)
            }
        }
        
        // Close sheet
        let closeButton = app.buttons["Cancel"]
        if closeButton.exists && closeButton.isHittable {
            print("📱 Closing sheet")
            closeButton.tap()
            sleep(1)
        }
        
        // === Navigate tabs ===
        let tabs = ["Farms", "Harvest", "Farmers", "Barn", "More", "Home"]
        for tabName in tabs {
            let tab = app.buttons[tabName]
            if tab.waitForExistence(timeout: 3) && tab.isHittable {
                print("📱 Navigating to \(tabName)")
                tab.tap()
                sleep(2)
            }
        }
        
        // === Quick Task ===
        let quickTaskButton = app.buttons["Quick Task"]
        if quickTaskButton.waitForExistence(timeout: 3) {
            print("📱 Opening Quick Task")
            quickTaskButton.tap()
            sleep(3)
            
            // Close
            if closeButton.exists && closeButton.isHittable {
                closeButton.tap()
                sleep(1)
            }
        }
        
        // === Go Wild ===
        let goWildButton = app.buttons["Go Wild"]
        if goWildButton.waitForExistence(timeout: 3) {
            print("📱 Opening Go Wild")
            goWildButton.tap()
            sleep(3)
            
            // Close
            if closeButton.exists && closeButton.isHittable {
                closeButton.tap()
                sleep(1)
            }
        }
        
        print("📱 Demo navigation complete!")
        sleep(2)
    }
}
