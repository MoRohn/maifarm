#!/bin/bash

# MaiFarm Demo Recording Script
# This script records the screen while running the Playwright demo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/demo-output"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VIDEO_FILE="$OUTPUT_DIR/maifarm_demo_${TIMESTAMP}.mov"
PID_FILE="$OUTPUT_DIR/recording.pid"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "🎬 MaiFarm Demo Recording"
echo "========================="
echo "Output: $VIDEO_FILE"
echo ""

# Check if ffmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ ffmpeg is required but not installed."
    exit 1
fi

# Check if frontend is running
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "⚠️  Frontend not running on port 3000"
    echo "   Please start the frontend first: cd apps/dashboard && npm run dev"
    exit 1
fi

# Check if backend is running
if ! curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo "⚠️  Backend not running on port 4567"
    echo "   Please start the backend first: cd apps/api && npm run dev"
    exit 1
fi

echo "✅ Frontend and backend are running"
echo ""

# Start screen recording in background
echo "🎥 Starting screen recording..."
ffmpeg -f avfoundation -i "Capture screen 0" \
    -c:v libx264 -preset ultrafast -crf 18 \
    -pix_fmt yuv420p \
    -r 30 \
    "$VIDEO_FILE" \
    -y 2>/dev/null &

FFMPEG_PID=$!
echo $FFMPEG_PID > "$PID_FILE"
echo "   Recording PID: $FFMPEG_PID"
echo ""

# Give ffmpeg time to start
sleep 2

# Check if recording started
if ! ps -p $FFMPEG_PID > /dev/null 2>&1; then
    echo "❌ Failed to start screen recording"
    exit 1
fi

echo "✅ Screen recording started"
echo ""

# Run the Playwright demo
echo "🎭 Running Playwright demo..."
echo ""

cd "$PROJECT_ROOT"
npx tsx "$SCRIPT_DIR/maifarm-demo.ts" || {
    echo "⚠️  Demo script encountered an error, stopping recording..."
}

echo ""
echo "🛑 Stopping screen recording..."

# Stop the recording gracefully
kill -INT $FFMPEG_PID 2>/dev/null || true
sleep 2

# Make sure it's stopped
if ps -p $FFMPEG_PID > /dev/null 2>&1; then
    kill -TERM $FFMPEG_PID 2>/dev/null || true
    sleep 1
fi

# Cleanup
rm -f "$PID_FILE"

# Check if video file was created
if [ -f "$VIDEO_FILE" ]; then
    FILE_SIZE=$(ls -lh "$VIDEO_FILE" | awk '{print $5}')
    echo ""
    echo "✅ Demo recording complete!"
    echo "📹 Video file: $VIDEO_FILE"
    echo "📦 File size: $FILE_SIZE"
    echo ""

    # Verify the video
    if ffprobe "$VIDEO_FILE" 2>&1 | grep -q "Duration"; then
        DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null)
        echo "⏱️  Duration: ${DURATION}s"
        echo ""
        echo "🎉 Recording successful!"
    else
        echo "⚠️  Video file may be corrupted"
    fi
else
    echo "❌ Video file was not created"
    exit 1
fi
