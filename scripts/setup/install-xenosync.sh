#!/bin/bash

# XenoSync Installation Script for MaiFarm
# This script installs XenoSync Python dependencies

echo "=========================================="
echo "XenoSync Installation for MaiFarm"
echo "=========================================="

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Found Python $PYTHON_VERSION"

# Check if pip3 is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is required but not installed"
    echo "Please install pip3"
    exit 1
fi

# Check if Claude CLI is installed
if command -v claude &> /dev/null; then
    echo "✓ Claude CLI is installed"
else
    echo "⚠️  Claude CLI not found"
    echo "XenoSync requires Claude CLI to be installed"
    echo "Visit https://claude.ai/code to install Claude CLI"
fi

# Install XenoSync Python dependencies
echo ""
echo "Installing XenoSync Python dependencies..."
cd apps/api/src/orchestrators/xenosync

# Install requirements
if [ -f requirements.txt ]; then
    if command -v poetry &> /dev/null; then
        poetry run pip install -r requirements.txt
    else
        pip3 install -r requirements.txt
    fi

    if [ $? -eq 0 ]; then
        echo "✓ Python dependencies installed successfully"
    else
        echo "❌ Failed to install Python dependencies"
        exit 1
    fi
else
    echo "⚠️  requirements.txt not found, skipping Python dependencies"
fi

# Create XenoSync sessions directory
echo ""
echo "Setting up XenoSync directories..."
mkdir -p ../../../var/maibarn/xenosync-sessions
mkdir -p ../../../var/maibarn/xenosync-sessions/coordination
echo "✓ XenoSync directories created"

# Test XenoSync module
echo ""
echo "Testing XenoSync module..."
cd ../../..
python3 -c "
import sys
sys.path.insert(0, 'apps/api/src/orchestrators/xenosync')
try:
    import xenosync
    print('✓ XenoSync module imported successfully')
except ImportError as e:
    print(f'❌ Failed to import XenoSync: {e}')
    sys.exit(1)
"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ XenoSync installation complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Ensure Claude CLI is installed (https://claude.ai/code)"
    echo "2. Switch to Claude AI provider in Settings"
    echo "3. Enable XenoSync in Settings > Orchestration"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "❌ XenoSync installation failed"
    echo "=========================================="
    exit 1
fi
