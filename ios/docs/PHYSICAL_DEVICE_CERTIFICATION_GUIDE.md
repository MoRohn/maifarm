# MaiFarm iOS Physical Device Certification Guide

## Final Certification Run #3

**Purpose**: Verify the app works correctly on real physical devices before App Store submission.

**Requirement**: 1 clean pass with zero critical issues

---

## Prerequisites

### Hardware Required

| Device Type | Minimum | Recommended |
|-------------|---------|-------------|
| iPhone | 1 device (iOS 17.0+) | iPhone 14 or newer |
| iPad | 1 device (iPadOS 17.0+) | iPad Pro or Air |
| Mac | 1 device (macOS 13.0+) | Any Apple Silicon Mac |

### Software Required

- Xcode 15.0+ installed
- Apple Developer account enrolled
- Device registered in Apple Developer Portal
- Development provisioning profile installed

### Backend Requirements

- MaiFarm backend running and healthy
- API accessible from device network

```bash
# Verify backend is running
curl -s http://localhost:4567/api/health | jq .status
# Should return: "healthy"
```

---

## Step 1: Prepare Test Environment

### 1.1 Start Backend Services

```bash
cd /path/to/maifarm
npm run start
```

Wait for:
- API server on port 4567
- Frontend on port 3000 (optional)
- Database connected
- Redis connected

### 1.2 Verify Backend Health

```bash
curl -s http://localhost:4567/api/health | jq
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "database": { "status": "healthy" },
  "redis": { "status": "healthy" }
}
```

### 1.3 Get Your Mac's IP Address

```bash
# Get local IP for device testing
ipconfig getifaddr en0
# Example: 192.168.1.100
```

**Note**: Your iPhone/iPad must be on the same network as your Mac.

### 1.4 Configure iOS App for Local Testing

In the iOS app, the API URL should point to your Mac's IP:

```swift
// In MaiFarmAPI.swift or APIConfiguration
// For local testing, change baseURL to:
// http://YOUR_MAC_IP:4567/api
```

Or use the production URL if backend is deployed.

---

## Step 2: Install App on Physical Devices

### 2.1 Connect Device to Mac

1. Connect iPhone/iPad via USB cable
2. Trust the computer on device (if prompted)
3. Unlock device

### 2.2 Open Xcode Project

```bash
open /path/to/maifarm/ios/MaiFarm.xcodeproj
```

### 2.3 Select Device as Build Target

1. In Xcode toolbar, click device selector
2. Select your physical device (e.g., "John's iPhone")
3. If device not listed:
   - Window > Devices and Simulators
   - Verify device is connected and trusted

### 2.4 Build and Run

1. Press `Cmd + R` or click Play button
2. Wait for build to complete
3. App will install and launch on device

**First Run**: You may need to trust the developer certificate:
- On device: Settings > General > VPN & Device Management
- Tap your developer certificate
- Tap "Trust"

---

## Step 3: Certification Test Script

### Test Duration: 30-45 minutes per device

Complete ALL tests below. Mark each as PASS/FAIL.

---

### 3.1 App Launch & First Run (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 1.1 | Cold start | Launch app from home screen | App opens within 3 seconds | [ ] |
| 1.2 | Splash screen | Observe launch | MaiFarm logo displays | [ ] |
| 1.3 | Welcome screen | First launch | Login options appear | [ ] |
| 1.4 | No crash | Use app for 1 minute | No crashes | [ ] |

---

### 3.2 Authentication (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 2.1 | Apple Sign In | Tap "Sign in with Apple" | Apple auth sheet appears | [ ] |
| 2.2 | Complete sign in | Authenticate with Face ID/password | Redirects to engine selection | [ ] |
| 2.3 | Guest mode | (Alternative) Tap "Continue as Guest" | Proceeds to engine selection | [ ] |
| 2.4 | Sign out | Settings > Sign Out | Returns to welcome screen | [ ] |
| 2.5 | Sign back in | Sign in again | Previous data preserved | [ ] |

---

### 3.3 AI Engine Selection (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 3.1 | Engine list | View engine options | All engines listed (Claude, OpenAI, etc.) | [ ] |
| 3.2 | Select engine | Tap on Claude | Engine selected, checkmark shown | [ ] |
| 3.3 | API key entry | Enter API key | Key accepted, masked display | [ ] |
| 3.4 | Validation | Invalid key test | Error message shown | [ ] |
| 3.5 | Save & continue | Tap "Start Farming" | Navigates to dashboard | [ ] |

---

### 3.4 Dashboard (3 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 4.1 | Dashboard loads | View main screen | Dashboard displays correctly | [ ] |
| 4.2 | Quick actions | View action cards | Quick Task, New Farm visible | [ ] |
| 4.3 | Navigation tabs | Tap each tab | All tabs navigate correctly | [ ] |
| 4.4 | Pull to refresh | Pull down on list | Refresh animation, data updates | [ ] |

---

### 3.5 Quick Task Flow (10 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 5.1 | Open sheet | Tap Quick Task | Sheet opens smoothly | [ ] |
| 5.2 | Task suggestions | View suggested tasks | Device-optimized suggestions shown | [ ] |
| 5.3 | Enter task | Type "Write a hello world function" | Text appears, complexity indicator updates | [ ] |
| 5.4 | Start disabled | Clear text field | Start button disabled | [ ] |
| 5.5 | Start task | Enter task, tap Start | Progress view appears | [ ] |
| 5.6 | Progress feedback | Observe progress | Steps show progress (analyzing, generating, finalizing) | [ ] |
| 5.7 | Completion | Wait for completion | Haptic feedback, sheet dismisses | [ ] |
| 5.8 | Result in Barn | Go to Barn tab | New result appears at top | [ ] |
| 5.9 | View result | Tap result | Detail view opens | [ ] |
| 5.10 | Share result | Tap Share | iOS share sheet opens | [ ] |

---

### 3.6 Create Farm Flow (10 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 6.1 | Open sheet | Tap New Farm | Farm creation sheet opens | [ ] |
| 6.2 | Enter name | Type "Test Farm" | Name field accepts input | [ ] |
| 6.3 | Select farmer | Choose a farmer template | Selection highlighted | [ ] |
| 6.4 | Adjust agents | Change agent count | Slider/stepper works | [ ] |
| 6.5 | Create farm | Tap Create | Farm creation starts | [ ] |
| 6.6 | Farm list | View Farms tab | New farm appears | [ ] |
| 6.7 | Farm status | Observe farm | Status updates (launching > running) | [ ] |
| 6.8 | Stop farm | Tap Stop | Farm stops, status updates | [ ] |
| 6.9 | Harvest appears | Check Barn | Farm harvest available | [ ] |

---

### 3.7 Barn & Harvest (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 7.1 | Barn view | Navigate to Barn | Results list displays | [ ] |
| 7.2 | Search | Enter search text | Results filter correctly | [ ] |
| 7.3 | Delete item | Swipe to delete | Confirmation alert appears | [ ] |
| 7.4 | Confirm delete | Tap Delete | Item removed | [ ] |
| 7.5 | Export | Tap Export | File exporter opens | [ ] |
| 7.6 | Empty state | Delete all items | Empty state message shown | [ ] |

---

### 3.8 Settings (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 8.1 | Open settings | Tap Settings tab | Settings screen opens | [ ] |
| 8.2 | Current engine | View AI Engine | Current engine displayed | [ ] |
| 8.3 | Change engine | Tap to change | Engine selection view opens | [ ] |
| 8.4 | Privacy policy | Tap Privacy Policy | Policy content displays | [ ] |
| 8.5 | About | View About section | Version info shown | [ ] |
| 8.6 | Account deletion | Find delete option | Delete account option exists | [ ] |

---

### 3.9 Network & Offline (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 9.1 | Enable airplane | Turn on Airplane Mode | Offline banner appears | [ ] |
| 9.2 | Offline navigation | Navigate while offline | App remains responsive | [ ] |
| 9.3 | Offline task | Try Quick Task offline | Queued message or offline notice | [ ] |
| 9.4 | Reconnect | Disable Airplane Mode | "Back online" message, sync occurs | [ ] |
| 9.5 | No data loss | Check Barn | All data preserved | [ ] |

---

### 3.10 Device-Specific Tests

#### iPhone Only

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 10.1 | Portrait mode | Use in portrait | Layout correct | [ ] |
| 10.2 | Rotation | Rotate to landscape | Layout adapts (if supported) | [ ] |
| 10.3 | Dynamic Island | (iPhone 14 Pro+) Check status bar | No overlap with Dynamic Island | [ ] |
| 10.4 | Home indicator | Check bottom of screen | Content above home indicator | [ ] |

#### iPad Only

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 10.5 | Portrait mode | Use in portrait | Layout correct | [ ] |
| 10.6 | Landscape mode | Use in landscape | Layout adapts | [ ] |
| 10.7 | Split View 1/2 | Enable Split View 50% | App functional in split | [ ] |
| 10.8 | Slide Over | Enable Slide Over | App functional in narrow mode | [ ] |
| 10.9 | Keyboard shortcuts | Connect keyboard, press Cmd+? | Shortcuts list (if implemented) | [ ] |

#### Mac Only

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 10.10 | Window resize | Resize window | Layout adapts, minimum size respected | [ ] |
| 10.11 | Full screen | Enter full screen | App works in full screen | [ ] |
| 10.12 | Keyboard nav | Tab through elements | Focus moves correctly | [ ] |
| 10.13 | Menu bar | Check menu bar | App menu items work | [ ] |

---

### 3.11 Accessibility (5 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 11.1 | VoiceOver | Enable VoiceOver, navigate | All elements announced | [ ] |
| 11.2 | Large text | Settings > Accessibility > Larger Text (max) | Layout adapts, no clipping | [ ] |
| 11.3 | Bold text | Enable Bold Text | Text remains readable | [ ] |
| 11.4 | Reduce motion | Enable Reduce Motion | Animations minimized | [ ] |
| 11.5 | Dark mode | Enable Dark Mode | All screens render correctly | [ ] |

---

### 3.12 Performance (3 min)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 12.1 | Memory usage | Use app for 5 min | No significant slowdown | [ ] |
| 12.2 | Battery | Check battery usage | Not excessive | [ ] |
| 12.3 | Heat | Feel device | Not overheating | [ ] |
| 12.4 | Responsiveness | Tap buttons rapidly | All taps register, no lag | [ ] |

---

## Step 4: Record Results

### Test Summary

| Device | Tester | Date | Pass | Fail | Blocked |
|--------|--------|------|------|------|---------|
| iPhone | | | /50 | | |
| iPad | | | /54 | | |
| Mac | | | /54 | | |

### Issues Found

| # | Device | Test | Description | Severity | Status |
|---|--------|------|-------------|----------|--------|
| | | | | | |
| | | | | | |
| | | | | | |

**Severity Levels**:
- **Critical**: Crash, data loss, security issue - BLOCKS RELEASE
- **Major**: Feature broken, poor UX - Should fix before release
- **Minor**: Cosmetic, edge case - Can fix in v1.0.1

---

## Step 5: Certification Decision

### Pass Criteria

- [ ] Zero critical issues
- [ ] Zero major issues (or approved exceptions)
- [ ] All core flows complete successfully
- [ ] App runs on iPhone, iPad, and Mac
- [ ] No crashes during testing

### Certification Result

**Date**: _______________

**Tester**: _______________

| Outcome | Check |
|---------|-------|
| PASS - Ready for App Store | [ ] |
| FAIL - Issues must be fixed | [ ] |

**Notes**:
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

### Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Developer | | | |
| Product Lead | | | |

---

## Appendix: Quick Reference

### Xcode Shortcuts

| Action | Shortcut |
|--------|----------|
| Build | Cmd + B |
| Run | Cmd + R |
| Stop | Cmd + . |
| Clean Build | Cmd + Shift + K |
| Devices | Cmd + Shift + 2 |

### Device Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not recognized | Unplug/replug, trust computer |
| Provisioning error | Download profiles in Xcode |
| App won't install | Check device storage |
| App crashes on launch | Check console logs in Xcode |

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
