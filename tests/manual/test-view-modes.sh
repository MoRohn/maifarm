#!/bin/bash

# Test script for all view modes in HarvestTerminal

echo "🚀 Starting continuous terminal streaming test for all view modes..."

# Function to send messages to agents
send_messages() {
    local agent=$1
    local message=$2
    TMUX_TMPDIR=/tmp tmux send-keys -t farm-b89d25bb:agents.$agent "$message" Enter 2>/dev/null || true
}

# Continuous streaming loop
while true; do
    for agent in 0 1; do
        timestamp=$(date +"%H:%M:%S")

        # Send different types of messages
        case $((RANDOM % 5)) in
            0)
                send_messages $agent "echo '[$timestamp] 📊 Grid View Test: Agent $agent processing data...'"
                ;;
            1)
                send_messages $agent "echo '[$timestamp] 🔄 Auto-scroll verification for Agent $agent'"
                ;;
            2)
                send_messages $agent "echo '[$timestamp] 📈 Stacked View: Agent $agent status update'"
                ;;
            3)
                send_messages $agent "echo '[$timestamp] 🖥️ Single View: Focused on Agent $agent'"
                ;;
            4)
                send_messages $agent "echo '[$timestamp] 🌊 Real-time stream flowing for Agent $agent'"
                ;;
        esac

        sleep 0.5
    done

    # Every 5 seconds, send a highlighted message
    if [ $((RANDOM % 10)) -eq 0 ]; then
        for agent in 0 1; do
            send_messages $agent "echo '⭐⭐⭐ [$(date +%H:%M:%S)] IMPORTANT: Auto-scroll should jump here! ⭐⭐⭐'"
        done
    fi

    sleep 2
done