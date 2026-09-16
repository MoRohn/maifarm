# Claude Code - Xcode Build Commands

Quick reference for running Xcode build commands from Claude Code.

## Quick Commands (Copy & Paste)

### Start Build Loop
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh run
```

### Start in Background with Agent
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh run --background --agent
```

### Check Status
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh status
```

### Monitor Live Output
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh monitor
```

### Stop Build
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh stop
```

### View Errors
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh errors
```

### View Errors as JSON
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh errors --json
```

### Clean Build Artifacts
```bash
/path/to/maifarm/scripts/xcode/xcode-build-cli.sh clean
```

## Single Build (No Loop)

```bash
/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild \
  -project /path/to/maifarm/ios/MaiFarm/MaiFarm.xcodeproj \
  -scheme MaiFarm \
  -configuration Debug \
  -destination 'id=E7026476-D3E1-40C3-BE0F-AB5541CE58DB' \
  build 2>&1 | grep -E "error:|warning:" | head -30
```

## Parse Errors for Fixing

```bash
python3 /path/to/maifarm/scripts/xcode/xcode-error-parser.py \
  /tmp/xcode_build_loop/logs/build_1.log
```
