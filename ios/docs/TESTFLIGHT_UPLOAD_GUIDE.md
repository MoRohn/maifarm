# MaiFarm iOS TestFlight Upload Guide

## Pre-Upload Checklist

### 1. Developer Account Verification
- [ ] Apple Developer Program membership active ($99/year)
- [ ] Team role: Admin or App Manager
- [ ] Certificates valid (not expiring soon)
- [ ] Provisioning profiles up to date

### 2. Xcode Configuration

```bash
# Open project
open /path/to/maifarm/ios/MaiFarm.xcodeproj
```

**Verify in Xcode:**
- [ ] Bundle Identifier: `com.maifarm.ios`
- [ ] Team: Your Apple Developer Team
- [ ] Signing: Automatic
- [ ] Version: 1.0.0
- [ ] Build: 1 (increment for each upload)

### 3. Build Settings Verification

In Xcode, verify these settings for RELEASE configuration:

| Setting | Value |
|---------|-------|
| Deployment Target | iOS 17.0 |
| Supported Destinations | iPhone, iPad, Mac (Catalyst) |
| Swift Version | 5.9+ |
| Optimization Level | -O (Optimize for Speed) |
| Debug Information | DWARF with dSYM |
| Enable Bitcode | NO (deprecated) |
| Strip Debug Symbols | YES |

---

## Step-by-Step Upload Process

### Step 1: Create Archive

```
Xcode Menu: Product > Archive
```

**Wait for archive to complete** (2-5 minutes)

When complete, Xcode Organizer opens automatically.

### Step 2: Validate Archive

1. In Organizer, select the new archive
2. Click **Validate App**
3. Select distribution options:
   - [ ] Upload your app's symbols
   - [ ] Manage version and build number
4. Select signing certificate and profile
5. Click **Validate**

**Common validation issues:**

| Issue | Solution |
|-------|----------|
| Missing icon sizes | Check Assets.xcassets/AppIcon.appiconset |
| Invalid provisioning | Re-download from Developer Portal |
| Missing entitlements | Verify MaiFarm.entitlements file |
| Code signing error | Reset signing in project settings |

### Step 3: Upload to App Store Connect

1. In Organizer, click **Distribute App**
2. Select **App Store Connect**
3. Select **Upload**
4. Review options:
   - [ ] Include bitcode: NO
   - [ ] Upload symbols: YES
   - [ ] Strip Swift symbols: YES (reduces size)
5. Click **Upload**

**Upload takes 5-15 minutes** depending on build size.

### Step 4: Wait for Processing

After upload:
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to My Apps > MaiFarm
3. Select **TestFlight** tab
4. Wait for **Processing** to complete (15-30 minutes)

Status progression: `Uploading` > `Processing` > `Ready to Submit`

---

## TestFlight Configuration

### Internal Testing Group

1. In App Store Connect > TestFlight
2. Click **Internal Testing** > **App Store Connect Users**
3. Add testers (up to 100 internal testers)
4. No review required for internal testers

### External Testing Group (Optional)

1. Click **External Testing** > **+** (Create Group)
2. Name the group (e.g., "Beta Testers")
3. Add testers via email
4. **Requires Beta App Review** (1-2 days)

### Beta App Information

Fill in TestFlight details:

```
What to Test:
- Sign in using Apple Sign In or demo account
- Create a Quick Task and verify completion
- Create a new Farm with 2 agents
- View results in Barn
- Test offline mode (airplane mode)
- Check Settings > Privacy Policy

Known Issues:
- None for v1.0.0

Feedback Email: beta@maifarm.app
```

---

## TestFlight Testing Checklist

### Core Flows

| Test | Device | Status |
|------|--------|--------|
| App launches | iPhone | [ ] |
| App launches | iPad | [ ] |
| App launches | Mac | [ ] |
| Sign in with Apple | All | [ ] |
| Guest login | All | [ ] |
| Engine selection | All | [ ] |
| Quick Task creation | All | [ ] |
| Quick Task completion | All | [ ] |
| Farm creation | All | [ ] |
| Farm monitoring | All | [ ] |
| Harvest collection | All | [ ] |
| Barn viewing | All | [ ] |
| Settings access | All | [ ] |
| Sign out | All | [ ] |

### Edge Cases

| Test | Status |
|------|--------|
| Offline mode banner | [ ] |
| Network reconnection | [ ] |
| Background/foreground | [ ] |
| Large text sizes | [ ] |
| Dark mode | [ ] |
| iPad split view | [ ] |
| Mac window resize | [ ] |

---

## Build Version Management

### Incrementing Build Number

For each TestFlight upload, increment the build number:

```bash
# Current: Version 1.0.0, Build 1
# Next upload: Version 1.0.0, Build 2

# In Xcode:
# Project > MaiFarm > General > Build: 2
```

Or use command line:
```bash
# Increment build number
cd /path/to/maifarm/ios
agvtool next-version -all
```

### Version Number Rules

| Scenario | Version | Build |
|----------|---------|-------|
| Initial release | 1.0.0 | 1 |
| Bug fix (same release) | 1.0.0 | 2 |
| Minor update | 1.0.1 | 1 |
| Feature update | 1.1.0 | 1 |
| Major update | 2.0.0 | 1 |

---

## Troubleshooting

### Upload Fails

```bash
# Clear derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/MaiFarm-*

# Clean build
xcodebuild clean -project MaiFarm.xcodeproj -scheme MaiFarm

# Try again
```

### Processing Stuck

If processing takes > 1 hour:
1. Check Apple System Status: https://developer.apple.com/system-status/
2. Delete the build in App Store Connect
3. Increment build number
4. Upload again

### Certificate Issues

```bash
# List signing certificates
security find-identity -v -p codesigning

# If none found, go to Xcode > Settings > Accounts > Manage Certificates
# Create new Apple Distribution certificate
```

### Provisioning Profile Issues

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Certificates, Identifiers & Profiles
3. Delete old profiles
4. In Xcode: Settings > Accounts > Download Manual Profiles
5. Or use Automatic Signing

---

## Post-Upload Actions

### After Successful Upload

1. [ ] Verify build appears in TestFlight
2. [ ] Wait for processing to complete
3. [ ] Enable internal testing
4. [ ] Send TestFlight invites
5. [ ] Test on at least 3 devices

### Before App Store Submission

1. [ ] Complete 3 TestFlight testing rounds
2. [ ] Fix any critical issues found
3. [ ] Increment build if changes made
4. [ ] Final TestFlight validation
5. [ ] Submit for App Store Review

---

## Quick Commands

```bash
# Open project
open /path/to/maifarm/ios/MaiFarm.xcodeproj

# Clean build
xcodebuild clean -project MaiFarm.xcodeproj -scheme MaiFarm

# Build for release
xcodebuild -project MaiFarm.xcodeproj -scheme MaiFarm -configuration Release

# Archive (use Xcode GUI instead for signing)
xcodebuild archive -project MaiFarm.xcodeproj -scheme MaiFarm -archivePath ./MaiFarm.xcarchive

# Validate archive
xcrun altool --validate-app -f MaiFarm.ipa -t ios -u "your@email.com"

# Upload archive
xcrun altool --upload-app -f MaiFarm.ipa -t ios -u "your@email.com"
```

---

## Timeline

| Step | Time |
|------|------|
| Archive creation | 2-5 min |
| Validation | 1-2 min |
| Upload | 5-15 min |
| Processing | 15-30 min |
| Internal testing available | Immediate |
| External testing review | 1-2 days |
| App Store review | 24-48 hours |

---

## Support

- Apple Developer Support: https://developer.apple.com/contact/
- App Store Connect Help: https://help.apple.com/app-store-connect/
- MaiFarm Support: support@maifarm.app

---

**Last Updated**: 2026-01-07
**Version**: 1.0
