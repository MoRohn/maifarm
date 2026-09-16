#!/bin/bash

#############################################################
#  MaiFarm CLI Installation Script
#
#  "Plant the seeds of command-line farming!" 🌱
#
#  This script installs the MaiFarm CLI globally on your
#  system, making the 'farm' command available everywhere.
#############################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emojis
CHECKMARK="✅"
CROSS="❌"
TRACTOR="🚜"
SEEDLING="🌱"
HARVEST="🌾"
COW="🐄"

# Banner
echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║    ${TRACTOR} MaiFarm CLI Installer ${TRACTOR}                    ║"
echo "║                                                      ║"
echo "║    Where Code Grows and Harvests Flow! ${HARVEST}           ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Function to print colored messages
print_msg() {
    echo -e "${2}${1}${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to compare versions
version_gt() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1";
}

# Step 1: Check prerequisites
print_msg "📋 Checking prerequisites..." "${CYAN}"

# Check Node.js
if ! command_exists node; then
    print_msg "${CROSS} Node.js is not installed!" "${RED}"
    print_msg "   Please install Node.js v18 or higher from: https://nodejs.org" "${YELLOW}"
    exit 1
else
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    if version_gt "18.0.0" "$NODE_VERSION"; then
        print_msg "${CROSS} Node.js version $NODE_VERSION is too old!" "${RED}"
        print_msg "   Please upgrade to Node.js v18 or higher" "${YELLOW}"
        exit 1
    fi
    print_msg "${CHECKMARK} Node.js v$NODE_VERSION found" "${GREEN}"
fi

# Check npm
if ! command_exists npm; then
    print_msg "${CROSS} npm is not installed!" "${RED}"
    exit 1
else
    NPM_VERSION=$(npm -v)
    print_msg "${CHECKMARK} npm v$NPM_VERSION found" "${GREEN}"
fi

# Check tmux (optional but recommended)
if ! command_exists tmux; then
    print_msg "⚠️  tmux is not installed (optional but recommended)" "${YELLOW}"
    print_msg "   Install with: brew install tmux (macOS) or apt-get install tmux (Ubuntu)" "${YELLOW}"
else
    TMUX_VERSION=$(tmux -V | cut -d' ' -f2)
    print_msg "${CHECKMARK} tmux $TMUX_VERSION found" "${GREEN}"
fi

echo ""

# Step 2: Install dependencies
print_msg "${SEEDLING} Installing dependencies..." "${CYAN}"
cd "$(dirname "$0")"

if [ -f "package-lock.json" ]; then
    npm ci --silent
else
    npm install --silent
fi

print_msg "${CHECKMARK} Dependencies installed" "${GREEN}"
echo ""

# Step 3: Build the CLI
print_msg "${COW} Building the CLI..." "${CYAN}"
npm run build

if [ $? -ne 0 ]; then
    print_msg "${CROSS} Build failed!" "${RED}"
    exit 1
fi

print_msg "${CHECKMARK} Build successful" "${GREEN}"
echo ""

# Step 4: Create global link
print_msg "${TRACTOR} Installing globally..." "${CYAN}"

# Remove any existing global installation
npm unlink -g @maifarm/cli 2>/dev/null || true

# Create new global link
npm link

if [ $? -ne 0 ]; then
    print_msg "${CROSS} Global installation failed!" "${RED}"
    print_msg "   Try running with sudo: sudo npm link" "${YELLOW}"
    exit 1
fi

print_msg "${CHECKMARK} Global installation complete" "${GREEN}"
echo ""

# Step 5: Verify installation
print_msg "🔍 Verifying installation..." "${CYAN}"

# Link the main farm command
npm link

if command_exists farm; then
    print_msg "${CHECKMARK} 'farm' command is available" "${GREEN}"
    # Test the CLI version
    if farm --version >/dev/null 2>&1; then
        FARM_VERSION=$(farm --version 2>/dev/null || echo "unknown")
        print_msg "   CLI Version: $FARM_VERSION" "${GREEN}"
    fi
else
    print_msg "${CROSS} 'farm' command not found in PATH" "${RED}"
    print_msg "   You may need to restart your terminal or add npm global bin to PATH" "${YELLOW}"

    # Try to help with PATH
    NPM_BIN=$(npm bin -g)
    print_msg "   Add this to your shell profile:" "${YELLOW}"
    print_msg "   export PATH=\"$NPM_BIN:\$PATH\"" "${CYAN}"
fi

echo ""

# Step 6: Create config directory
print_msg "📁 Setting up configuration..." "${CYAN}"

CONFIG_DIR="$HOME/.maifarm"
if [ ! -d "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
    print_msg "${CHECKMARK} Created config directory: $CONFIG_DIR" "${GREEN}"
else
    print_msg "${CHECKMARK} Config directory exists: $CONFIG_DIR" "${GREEN}"
fi

# Create default config if it doesn't exist
CONFIG_FILE="$CONFIG_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    cat > "$CONFIG_FILE" << EOF
{
  "apiUrl": "http://localhost:4567",
  "theme": "barn-red",
  "animalSounds": true,
  "weatherReports": true,
  "tips": true,
  "ascii": true
}
EOF
    print_msg "${CHECKMARK} Created default config: $CONFIG_FILE" "${GREEN}"
else
    print_msg "${CHECKMARK} Config file exists: $CONFIG_FILE" "${GREEN}"
fi

echo ""

# Step 7: Success message
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║    ${HARVEST} Installation Complete! ${HARVEST}                   ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

print_msg "🎉 MaiFarm CLI is ready to use!" "${GREEN}"
echo ""
print_msg "Quick Start Commands:" "${CYAN}"
print_msg "  farm                  # Start interactive mode" "${YELLOW}"
print_msg "  farm create <name>    # Create a new farm" "${YELLOW}"
print_msg "  farm list             # List all farms" "${YELLOW}"
print_msg "  farm watch <id>       # Watch farm progress" "${YELLOW}"
print_msg "  farm harvest <id>     # Harvest farm results" "${YELLOW}"
print_msg "  farm help             # Show all commands" "${YELLOW}"
echo ""
print_msg "Documentation:" "${CYAN}"
print_msg "  https://github.com/maifarm/maifarm-cli" "${YELLOW}"
echo ""
print_msg "Happy Farming! ${TRACTOR} ${COW} ${HARVEST}" "${MAGENTA}"
echo ""

# Optional: Start with a fun message
if command_exists farm; then
    echo -e "${CYAN}"
    echo "Let's test it out! Running 'farm tips'..."
    echo -e "${NC}"
    farm tips 2>/dev/null || true
fi