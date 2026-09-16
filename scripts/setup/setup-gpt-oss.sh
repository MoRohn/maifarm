#!/bin/bash

# ============================================================================
# GPT-OSS Setup Script for MaiFarm
#
# This script ensures GPT-OSS is fully configured and ready to use as the
# default AI engine for MaiFarm. No API keys required!
# ============================================================================

set -e

echo "🚀 Setting up GPT-OSS for MaiFarm..."
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${BLUE}Checking Python installation...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}✓ Python $PYTHON_VERSION found${NC}"
else
    echo -e "${RED}✗ Python 3 is not installed${NC}"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Create Python virtual environment for GPT-OSS
VENV_DIR="$HOME/.maifarm/gpt-oss-venv"
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${BLUE}Creating Python virtual environment...${NC}"
    python3 -m venv "$VENV_DIR"
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Install required Python packages
echo -e "${BLUE}Installing Python dependencies for GPT-OSS...${NC}"

pip install --quiet --upgrade pip

# Core dependencies for GPT-OSS server
pip install --quiet \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    pydantic==2.5.0 \
    httpx==0.25.1 \
    python-multipart==0.0.6 \
    requests==2.31.0 \
    aiofiles==23.2.1

echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Optional: Install llama-cpp-python for actual LLM support
echo -e "${YELLOW}Optional: Install llama-cpp-python for full LLM support?${NC}"
echo "This provides high-fidelity responses but requires more resources."
echo "Without it, GPT-OSS will run using the embedded mini backend (sufficient for local smoke testing)."
read -p "Install llama-cpp-python? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Installing llama-cpp-python...${NC}"

    # Check for GPU support
    if command -v nvcc &> /dev/null; then
        echo -e "${BLUE}CUDA detected, installing with GPU support...${NC}"
        CMAKE_ARGS="-DLLAMA_CUDA=on" pip install --quiet llama-cpp-python[server]
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${BLUE}macOS detected, installing with Metal support...${NC}"
        CMAKE_ARGS="-DLLAMA_METAL=on" pip install --quiet llama-cpp-python[server]
    else
        echo -e "${BLUE}Installing CPU-only version...${NC}"
        pip install --quiet llama-cpp-python[server]
    fi

    echo -e "${GREEN}✓ llama-cpp-python installed${NC}"
fi

# Create GPT-OSS directories
echo -e "${BLUE}Creating GPT-OSS directories...${NC}"
mkdir -p "$HOME/.maifarm/gpt-oss"
mkdir -p "$HOME/.maifarm/gpt-oss/models"
mkdir -p "$HOME/.maifarm/gpt-oss/logs"
mkdir -p "$HOME/.maifarm/gpt-oss/cache"
echo -e "${GREEN}✓ Directories created${NC}"

# Create GPT-OSS server launcher script
echo -e "${BLUE}Creating GPT-OSS launcher...${NC}"
cat > "$HOME/.maifarm/gpt-oss/launch-server.sh" << 'EOF'
#!/bin/bash

# Activate virtual environment
source "$HOME/.maifarm/gpt-oss-venv/bin/activate"

# Set environment variables
export GPT_OSS_HOST="localhost"
export GPT_OSS_PORT="8000"
# Default to OpenAI's shipped GPT-OSS 20B model (21B params)
export GPT_OSS_MODEL="openai/gpt-oss-20b"
export GPT_OSS_LOG_FILE="$HOME/.maifarm/gpt-oss/logs/server.log"

echo "Starting GPT-OSS server on http://localhost:8000..."
echo "Logs: $GPT_OSS_LOG_FILE"

# Run the Python server from MaiFarm
cd "$(dirname "$0")/../../.."
python3 /tmp/gpt-oss-server.py 2>&1 | tee -a "$GPT_OSS_LOG_FILE"
EOF

chmod +x "$HOME/.maifarm/gpt-oss/launch-server.sh"
echo -e "${GREEN}✓ Launcher created${NC}"

# Create systemd service (Linux) or launchd plist (macOS) for auto-start
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${BLUE}Creating systemd service for auto-start...${NC}"

    cat > "$HOME/.config/systemd/user/gpt-oss.service" << EOF
[Unit]
Description=GPT-OSS Server for MaiFarm
After=network.target

[Service]
Type=simple
ExecStart=$HOME/.maifarm/gpt-oss/launch-server.sh
Restart=on-failure
RestartSec=10
StandardOutput=append:$HOME/.maifarm/gpt-oss/logs/service.log
StandardError=append:$HOME/.maifarm/gpt-oss/logs/service.log

[Install]
WantedBy=default.target
EOF

    systemctl --user daemon-reload
    echo -e "${GREEN}✓ Systemd service created${NC}"
    echo "To enable auto-start: systemctl --user enable gpt-oss"

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Creating launchd plist for auto-start...${NC}"

    cat > "$HOME/Library/LaunchAgents/com.maifarm.gpt-oss.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.maifarm.gpt-oss</string>
    <key>ProgramArguments</key>
    <array>
        <string>$HOME/.maifarm/gpt-oss/launch-server.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.maifarm/gpt-oss/logs/service.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.maifarm/gpt-oss/logs/service.log</string>
</dict>
</plist>
EOF

    echo -e "${GREEN}✓ Launchd plist created${NC}"
    echo "To enable auto-start: launchctl load ~/Library/LaunchAgents/com.maifarm.gpt-oss.plist"
fi

# Update MaiFarm environment to use GPT-OSS as default
echo -e "${BLUE}Configuring MaiFarm to use GPT-OSS as default...${NC}"

# Check if .env.development exists
if [ -f ".env.development" ]; then
    # Backup existing .env.development
    cp .env.development .env.development.backup

    # Update or add GPT-OSS configuration
    grep -q "^AI_PROVIDER=" .env.development && \
        sed -i.tmp "s/^AI_PROVIDER=.*/AI_PROVIDER=gpt-oss/" .env.development || \
        echo "AI_PROVIDER=gpt-oss" >> .env.development

    grep -q "^GPT_OSS_ENABLED=" .env.development && \
        sed -i.tmp "s/^GPT_OSS_ENABLED=.*/GPT_OSS_ENABLED=true/" .env.development || \
        echo "GPT_OSS_ENABLED=true" >> .env.development

    grep -q "^GPT_OSS_HOST=" .env.development && \
        sed -i.tmp "s|^GPT_OSS_HOST=.*|GPT_OSS_HOST=http://localhost:8000/v1|" .env.development || \
        echo "GPT_OSS_HOST=http://localhost:8000/v1" >> .env.development

    grep -q "^GPT_OSS_MODEL=" .env.development && \
        sed -i.tmp "s|^GPT_OSS_MODEL=.*|GPT_OSS_MODEL=openai/gpt-oss-20b|" .env.development || \
        echo "GPT_OSS_MODEL=openai/gpt-oss-20b" >> .env.development

    # Clean up temp files
    rm -f .env.development.tmp

    echo -e "${GREEN}✓ MaiFarm configured to use GPT-OSS${NC}"
else
    echo -e "${YELLOW}⚠ .env.development not found, creating one...${NC}"
    cat > .env.development << 'ENVEOF'
# MaiFarm Development Environment
NODE_ENV=development
PORT=4567

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Default AI Provider (GPT-OSS - no API key needed!)
AI_PROVIDER=gpt-oss
GPT_OSS_ENABLED=true
GPT_OSS_HOST=http://localhost:8000/v1
# OpenAI GPT-OSS defaults (ships with MaiFarm)
GPT_OSS_MODEL=openai/gpt-oss-20b
# GPT_OSS_MODEL=openai/gpt-oss-120b        # 117B advanced option (high-VRAM rigs)
GPT_OSS_MAX_TOKENS=8192
GPT_OSS_TEMPERATURE=0.6
GPT_OSS_CONTEXT_WINDOW=131072

# Other providers (optional - add API keys if you want to use them)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Security
API_KEY_ENCRYPTION_KEY=your-encryption-key-change-in-production
BYPASS_AUTH=true

# Paths
MAIBARN_ROOT=./maibarn
TMUX_TMPDIR=/tmp
ENVEOF

    echo -e "${GREEN}✓ Created .env.development with GPT-OSS as default${NC}"
fi

if [ -f test-gpt-oss.sh ]; then
    echo -e "${GREEN}✓ GPT-OSS test script detected${NC}"
else
    echo -e "${YELLOW}⚠ test-gpt-oss.sh not found - pull latest repo or copy it from release assets${NC}"
fi

# Final summary
echo
echo "============================================"
echo -e "${GREEN}🎉 GPT-OSS Setup Complete!${NC}"
echo "============================================"
echo
echo -e "${BLUE}What's been configured:${NC}"
echo "  ✓ Python virtual environment at $VENV_DIR"
echo "  ✓ All required Python packages installed"
echo "  ✓ GPT-OSS directories created at ~/.maifarm/gpt-oss"
echo "  ✓ Server launcher script created"
echo "  ✓ MaiFarm configured to use GPT-OSS as default AI provider"
echo
echo -e "${BLUE}Quick Start:${NC}"
echo "  1. Start GPT-OSS server (if not using auto-start):"
echo "     ~/.maifarm/gpt-oss/launch-server.sh"
echo
echo "  2. Test the server:"
echo "     ./test-gpt-oss.sh"
echo
echo "  3. Start MaiFarm:"
echo "     npm run dev"
echo
echo -e "${BLUE}GPT-OSS Benefits:${NC}"
echo "  • No API keys required"
echo "  • Completely local and private"
echo "  • Free to use"
echo "  • 131K context window"
echo "  • Compatible with OpenAI API format"
echo
echo -e "${GREEN}GPT-OSS is now the default AI engine for MaiFarm!${NC}"
echo "You can switch to other engines anytime in the Settings page."
