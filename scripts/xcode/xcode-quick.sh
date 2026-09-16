#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# xcode-quick.sh - Quick one-liner commands for Claude Code
# These are designed to be fast and produce clean output

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$SCRIPT_DIR/xcode-build-cli.sh"
XCODEBUILD="/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild"
PROJECT="${MAIFARM_ROOT}/ios/MaiFarm/MaiFarm.xcodeproj"
SCHEME="MaiFarm"
SIM_ID="E7026476-D3E1-40C3-BE0F-AB5541CE58DB"

case "$1" in
    # Quick single build - returns errors only
    build)
        $XCODEBUILD -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
            -destination "id=$SIM_ID" build 2>&1 | grep -E "error:" || echo "BUILD SUCCESS"
        ;;

    # Quick build with all output
    build-full)
        $XCODEBUILD -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
            -destination "id=$SIM_ID" build 2>&1
        ;;

    # Start background loop
    start)
        $CLI run --background ${2:+--agent}
        ;;

    # Start foreground loop
    start-fg)
        $CLI run ${2:+--agent}
        ;;

    # Get status as JSON
    status)
        cat /tmp/xcode_build_loop/status.json 2>/dev/null || echo '{"status":"idle"}'
        ;;

    # Get status as text
    status-text)
        $CLI status
        ;;

    # Stop build
    stop)
        $CLI stop
        ;;

    # Get current errors as text
    errors)
        $CLI errors
        ;;

    # Get current errors as JSON
    errors-json)
        $CLI errors --json
        ;;

    # Monitor (blocking)
    monitor)
        $CLI monitor
        ;;

    # Clean
    clean)
        $CLI clean
        ;;

    # Check if running
    is-running)
        if [ -f /tmp/xcode_build_loop/build.pid ]; then
            pid=$(cat /tmp/xcode_build_loop/build.pid)
            if kill -0 "$pid" 2>/dev/null; then
                echo "running:$pid"
                exit 0
            fi
        fi
        echo "stopped"
        exit 1
        ;;

    # Help
    *)
        echo "xcode-quick.sh - Quick Xcode build commands"
        echo ""
        echo "Commands:"
        echo "  build        Quick build, show errors only"
        echo "  build-full   Full build with all output"
        echo "  start        Start background loop (add 'agent' for AI fixes)"
        echo "  start-fg     Start foreground loop"
        echo "  status       Get status as JSON"
        echo "  status-text  Get status as formatted text"
        echo "  stop         Stop running build"
        echo "  errors       Show current errors"
        echo "  errors-json  Show errors as JSON"
        echo "  monitor      Watch live output"
        echo "  clean        Clean build artifacts"
        echo "  is-running   Check if build loop is running"
        ;;
esac
