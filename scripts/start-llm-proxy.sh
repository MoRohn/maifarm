#!/bin/bash

# Start LLM Proxy Server for Qwen Integration
# This script starts the proxy server that enables Qwen3-Coder integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default settings
PROXY_PORT=${LLM_PROXY_PORT:-8001}
PROXY_HOST=${LLM_PROXY_HOST:-0.0.0.0}
LOG_FILE="/tmp/llm_proxy.log"

echo -e "${GREEN}=== MaiFarm LLM Proxy Server ===${NC}"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    echo "Please install Python 3 to run the proxy server"
    exit 1
fi

# Check if required Python packages are installed
echo "Checking Python dependencies..."
MISSING_DEPS=""

python3 -c "import fastapi" 2>/dev/null || MISSING_DEPS="$MISSING_DEPS fastapi"
python3 -c "import uvicorn" 2>/dev/null || MISSING_DEPS="$MISSING_DEPS uvicorn"
python3 -c "import aiohttp" 2>/dev/null || MISSING_DEPS="$MISSING_DEPS aiohttp"
python3 -c "import requests" 2>/dev/null || MISSING_DEPS="$MISSING_DEPS requests"

if [ -n "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}Installing missing dependencies: $MISSING_DEPS${NC}"
    pip3 install $MISSING_DEPS
fi

# Check for API keys
echo ""
echo "Checking provider configuration..."

PROVIDERS_AVAILABLE=""

# Check Claude
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "${GREEN}✓ Claude (Anthropic) configured${NC}"
    PROVIDERS_AVAILABLE="$PROVIDERS_AVAILABLE claude"
else
    echo -e "${YELLOW}○ Claude: Set ANTHROPIC_API_KEY to enable${NC}"
fi

# Check Qwen
if [ -n "$QWEN_API_KEY" ] || [ -n "$DASHSCOPE_API_KEY" ]; then
    echo -e "${GREEN}✓ Qwen3-Coder configured${NC}"
    PROVIDERS_AVAILABLE="$PROVIDERS_AVAILABLE qwen"
else
    echo -e "${YELLOW}○ Qwen: Set QWEN_API_KEY or DASHSCOPE_API_KEY to enable${NC}"
fi

# Check OpenAI
if [ -n "$OPENAI_API_KEY" ]; then
    echo -e "${GREEN}✓ OpenAI configured${NC}"
    PROVIDERS_AVAILABLE="$PROVIDERS_AVAILABLE openai"
else
    echo -e "${YELLOW}○ OpenAI: Set OPENAI_API_KEY to enable${NC}"
fi

# Check Ollama
if command -v ollama &> /dev/null; then
    if ollama list | grep -q "qwen" 2>/dev/null; then
        echo -e "${GREEN}✓ Ollama with Qwen model available${NC}"
        PROVIDERS_AVAILABLE="$PROVIDERS_AVAILABLE ollama"
    else
        echo -e "${YELLOW}○ Ollama: Install Qwen model with 'ollama pull qwen2.5-coder:7b'${NC}"
    fi
else
    echo -e "${YELLOW}○ Ollama: Not installed${NC}"
fi

if [ -z "$PROVIDERS_AVAILABLE" ]; then
    echo ""
    echo -e "${RED}Warning: No providers configured!${NC}"
    echo "Please configure at least one provider to use the proxy."
    echo ""
fi

# Kill any existing proxy server
echo ""
echo "Checking for existing proxy server..."
if lsof -i:$PROXY_PORT &>/dev/null; then
    echo -e "${YELLOW}Stopping existing proxy server on port $PROXY_PORT${NC}"
    kill -9 $(lsof -t -i:$PROXY_PORT) 2>/dev/null || true
    sleep 2
fi

# Start the proxy server
echo ""
echo -e "${GREEN}Starting LLM Proxy Server${NC}"
echo "  Host: $PROXY_HOST"
echo "  Port: $PROXY_PORT"
echo "  Log: $LOG_FILE"
echo ""
echo "Available providers:$PROVIDERS_AVAILABLE"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Export environment variables for the proxy
export USE_LLM_PROXY=true
export LLM_PROXY_URL="http://localhost:$PROXY_PORT"

# Start the proxy server
cd "$(dirname "$0")/.."
python3 llm_proxy.py --proxy --port $PROXY_PORT --host $PROXY_HOST 2>&1 | tee $LOG_FILE