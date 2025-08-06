#!/bin/bash

# Test script for Qwen3-Coder integration with MaiFarm
# This script validates the complete Qwen integration pipeline

set -e

echo "=========================================="
echo "MaiFarm Qwen3-Coder Integration Test"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="/tmp/qwen_test_$(date +%s)"
COORDINATION_DIR="/tmp/claude_coordination"
LOG_FILE="${TEST_DIR}/test.log"

# Create test directory
mkdir -p "$TEST_DIR"
echo "Test directory: $TEST_DIR" | tee -a "$LOG_FILE"
echo ""

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    
    if [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}✗${NC} $message"
    else
        echo -e "${YELLOW}⚠${NC} $message"
    fi
}

# Function to check if a command exists
check_command() {
    local cmd=$1
    if command -v "$cmd" &> /dev/null; then
        print_status "SUCCESS" "$cmd is installed"
        return 0
    else
        print_status "FAIL" "$cmd is not installed"
        return 1
    fi
}

# Function to check if Ollama is running
check_ollama() {
    echo "Checking Ollama status..."
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        print_status "SUCCESS" "Ollama is running"
        
        # Check for Qwen models
        local qwen_models=$(ollama list 2>/dev/null | grep -i qwen || true)
        if [ -n "$qwen_models" ]; then
            print_status "SUCCESS" "Found Qwen models:"
            echo "$qwen_models" | sed 's/^/  /'
            return 0
        else
            print_status "WARNING" "No Qwen models found in Ollama"
            echo "  To install: ollama pull qwen2.5-coder:7b"
            return 1
        fi
    else
        print_status "WARNING" "Ollama is not running"
        echo "  To start: ollama serve"
        return 1
    fi
}

# Function to test API endpoint
test_api_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo "Testing: $description"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4567${endpoint}")
    
    if [ "$response" = "200" ] || [ "$response" = "201" ] || [ "$response" = "204" ]; then
        print_status "SUCCESS" "$description (HTTP $response)"
        return 0
    else
        print_status "FAIL" "$description (HTTP $response)"
        return 1
    fi
}

# Function to test WebSocket connection
test_websocket() {
    echo "Testing WebSocket connection..."
    
    # Simple WebSocket test using Node.js
    node -e "
    const io = require('socket.io-client');
    const socket = io('http://localhost:4567');
    
    socket.on('connect', () => {
        console.log('WebSocket connected');
        process.exit(0);
    });
    
    socket.on('connect_error', (error) => {
        console.error('WebSocket connection failed:', error.message);
        process.exit(1);
    });
    
    setTimeout(() => {
        console.error('WebSocket connection timeout');
        process.exit(1);
    }, 5000);
    " 2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_status "SUCCESS" "WebSocket connection established"
        return 0
    else
        print_status "FAIL" "WebSocket connection failed"
        return 1
    fi
}

# Function to test Qwen farm creation via API
test_qwen_farm_creation() {
    echo "Testing Qwen farm creation via API..."
    
    # Create a test farm using Qwen
    response=$(curl -s -X POST http://localhost:4567/api/farms \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Qwen Farm",
            "description": "Testing Qwen integration",
            "provider": "qwen",
            "agents": 2,
            "prompt": "Create a simple hello world function in Python",
            "useLocalModel": true
        }' 2>/dev/null)
    
    if echo "$response" | grep -q '"id"'; then
        farm_id=$(echo "$response" | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
        print_status "SUCCESS" "Created Qwen farm with ID: $farm_id"
        echo "$farm_id" > "${TEST_DIR}/farm_id.txt"
        return 0
    else
        print_status "FAIL" "Failed to create Qwen farm"
        echo "Response: $response"
        return 1
    fi
}

# Function to test multi_claude.py with Qwen
test_multi_claude_qwen() {
    echo "Testing multi_claude.py with Qwen provider..."
    
    cd "$(dirname "$0")/.."
    
    # Test with a simple prompt
    timeout 30 python3 multi_claude.py \
        -n 2 \
        -p "Write a function to calculate fibonacci numbers" \
        --provider qwen \
        --session qwen_test \
        --no-kill-on-exit \
        > "${TEST_DIR}/multi_claude.log" 2>&1 &
    
    local pid=$!
    sleep 10
    
    if kill -0 $pid 2>/dev/null; then
        print_status "SUCCESS" "multi_claude.py running with Qwen"
        kill $pid 2>/dev/null || true
        return 0
    else
        print_status "FAIL" "multi_claude.py failed to start with Qwen"
        cat "${TEST_DIR}/multi_claude.log"
        return 1
    fi
}

# Function to test YAML generation with Qwen
test_yaml_generation() {
    echo "Testing YAML generation for Qwen..."
    
    response=$(curl -s -X POST http://localhost:4567/api/yaml/generate \
        -H "Content-Type: application/json" \
        -d '{
            "prompt": "Create a farm with 3 Qwen agents for testing a React application",
            "provider": "qwen",
            "enhancePrompt": true,
            "constraints": {
                "maxAgents": 5,
                "context": "Using Qwen3-Coder for testing"
            }
        }' 2>/dev/null)
    
    if echo "$response" | grep -q '"yaml"'; then
        print_status "SUCCESS" "YAML generation successful for Qwen"
        echo "$response" > "${TEST_DIR}/generated.yaml"
        return 0
    else
        print_status "FAIL" "YAML generation failed"
        return 1
    fi
}

# Main test execution
echo "=== Prerequisites Check ===" | tee -a "$LOG_FILE"
echo ""

# Check required commands
check_command "node"
check_command "python3"
check_command "curl"
check_command "tmux"

echo ""
echo "=== Ollama & Qwen Model Check ===" | tee -a "$LOG_FILE"
echo ""

OLLAMA_OK=false
if check_ollama; then
    OLLAMA_OK=true
fi

echo ""
echo "=== Server Status Check ===" | tee -a "$LOG_FILE"
echo ""

# Check if server is running
if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    print_status "SUCCESS" "MaiFarm server is running"
    
    echo ""
    echo "=== API Tests ===" | tee -a "$LOG_FILE"
    echo ""
    
    # Test various endpoints
    test_api_endpoint "/api/providers/status" "Provider status endpoint"
    test_api_endpoint "/api/farms" "Farms endpoint"
    
    # Test WebSocket
    if command -v node &> /dev/null && [ -d "node_modules/socket.io-client" ]; then
        test_websocket
    else
        print_status "WARNING" "Skipping WebSocket test (socket.io-client not installed)"
    fi
    
    echo ""
    echo "=== Qwen Integration Tests ===" | tee -a "$LOG_FILE"
    echo ""
    
    # Only run Qwen-specific tests if Ollama is available
    if [ "$OLLAMA_OK" = true ]; then
        test_qwen_farm_creation
        test_yaml_generation
    else
        print_status "WARNING" "Skipping Qwen tests (Ollama/Qwen not available)"
    fi
    
    # Test multi_claude.py integration
    if [ -f "multi_claude.py" ]; then
        test_multi_claude_qwen
    else
        print_status "WARNING" "multi_claude.py not found"
    fi
    
else
    print_status "FAIL" "MaiFarm server is not running"
    echo "  Start the server with: npm run dev"
fi

echo ""
echo "=== Test Summary ===" | tee -a "$LOG_FILE"
echo ""

# Check coordination directory
if [ -d "$COORDINATION_DIR" ]; then
    active_agents=$(find "$COORDINATION_DIR" -name "*.json" -mmin -5 2>/dev/null | wc -l)
    print_status "INFO" "Active coordination files: $active_agents"
fi

# Final summary
echo ""
echo "Test artifacts saved to: $TEST_DIR"
echo "Log file: $LOG_FILE"

# Cleanup test tmux sessions
tmux kill-session -t qwen_test 2>/dev/null || true

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="

# Set exit code based on critical tests
if [ "$OLLAMA_OK" = true ]; then
    exit 0
else
    echo ""
    echo "To fully test Qwen integration:"
    echo "1. Install Ollama: https://ollama.ai"
    echo "2. Pull a Qwen model: ollama pull qwen2.5-coder:7b"
    echo "3. Start Ollama: ollama serve"
    echo "4. Re-run this test script"
    exit 1
fi