#!/bin/bash

echo "🔍 Monitoring MaiFarm for Farm Creation Demo..."
echo "================================================"
echo ""

# Function to monitor server logs
monitor_server() {
    echo "📡 Server Logs:"
    echo "---------------"
    tail -f /tmp/server.log 2>/dev/null | while read line; do
        # Highlight errors in red
        if echo "$line" | grep -iE "error|fail|exception|reject" > /dev/null; then
            echo -e "\033[31m[SERVER ERROR] $line\033[0m"
        # Highlight warnings in yellow
        elif echo "$line" | grep -iE "warn|warning" > /dev/null; then
            echo -e "\033[33m[SERVER WARN] $line\033[0m"
        # Highlight farm creation events in green
        elif echo "$line" | grep -iE "farm|create|launch" > /dev/null; then
            echo -e "\033[32m[SERVER] $line\033[0m"
        else
            echo "[SERVER] $line"
        fi
    done
}

# Start monitoring
monitor_server &
SERVER_PID=$!

echo "✅ Monitoring started. Press Ctrl+C to stop."
echo ""
echo "🚀 Ready for farm creation demo!"
echo "Please proceed with creating a new farm in the UI..."
echo ""

# Wait for user to stop
trap "kill $SERVER_PID 2>/dev/null; echo ''; echo '🛑 Monitoring stopped.'; exit" INT

wait