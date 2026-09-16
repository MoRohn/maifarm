#!/bin/bash

#############################################################
#  MaiFarm CLI Setup Script
#
#  Integrates the MaiFarm CLI with the main project
#############################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║    🚜 Setting up MaiFarm CLI 🚜                     ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Change to CLI directory
cd cli

# Install dependencies
echo -e "${CYAN}Installing CLI dependencies...${NC}"
npm install

# Build the CLI
echo -e "${CYAN}Building CLI...${NC}"
npm run build

# Create global link
echo -e "${CYAN}Creating global 'farm' command...${NC}"
npm link

# Make install script executable
chmod +x install.sh

# Success message
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║    ✅ CLI Setup Complete!                           ║"
echo "║                                                      ║"
echo "║    You can now use the 'farm' command globally!     ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${YELLOW}Try these commands:${NC}"
echo "  farm              # Start MaiFarm UI"
echo "  farm cli          # Start CLI interactive mode"
echo "  farm cli create test  # Create a test farm"
echo "  farm cli list     # List all farms"
echo "  farm cli help     # Show all CLI commands"
echo ""