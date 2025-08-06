#!/bin/bash
# Qwen CLI Proxy Script
# This script acts as a proxy to translate Claude commands to Qwen

# Check if AI_PROVIDER is set to qwen
if [ "$AI_PROVIDER" = "qwen" ]; then
    echo "[Qwen Proxy] Intercepting Claude command for Qwen3-Coder"
    
    # Extract the command and arguments
    COMMAND="$1"
    shift
    ARGS="$@"
    
    # Check if qwen-code CLI is available
    if ! command -v qwen-code &> /dev/null; then
        echo "[Qwen Proxy] qwen-code CLI not found. Using API fallback."
        # Use the API directly via a Python script
        python3 $(dirname "$0")/qwen-api-wrapper.py "$COMMAND" "$ARGS"
    else
        # Use the qwen-code CLI
        qwen-code "$ARGS"
    fi
else
    # Pass through to Claude
    claude "$@"
fi