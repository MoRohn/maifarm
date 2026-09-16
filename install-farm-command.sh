#!/bin/bash

# MaiFarm Command Installation Script
# This script installs the 'farm' command and CLI tools for the current user

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}   ${MAGENTA}MaiFarm Command Installation${NC}          ${BLUE}║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MAIFARM_DIR="$SCRIPT_DIR"

echo -e "${BLUE}📍 MaiFarm directory: ${GREEN}$MAIFARM_DIR${NC}"
echo ""

# Step 1: Build CLI if needed
echo -e "${BLUE}🔨 Step 1: Building CLI tools...${NC}"
cd "$MAIFARM_DIR/cli"
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo -e "${YELLOW}Building CLI for the first time...${NC}"
    npm run build
    echo -e "${GREEN}✓ CLI built successfully${NC}"
else
    echo -e "${GREEN}✓ CLI already built${NC}"
fi
cd "$MAIFARM_DIR"
echo ""

# Step 2: Make farm script executable
echo -e "${BLUE}🔧 Step 2: Setting up farm command...${NC}"
chmod +x "$MAIFARM_DIR/farm"
echo -e "${GREEN}✓ Farm script is executable${NC}"
echo ""

# Step 3: Detect shell and config file
SHELL_NAME=$(basename "$SHELL")
echo -e "${BLUE}🐚 Step 3: Configuring shell environment...${NC}"
echo -e "Detected shell: ${GREEN}$SHELL_NAME${NC}"

# Determine shell config file
if [ "$SHELL_NAME" = "zsh" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
    if [ -f "$HOME/.bash_profile" ]; then
        SHELL_CONFIG="$HOME/.bash_profile"
    else
        SHELL_CONFIG="$HOME/.bashrc"
    fi
else
    SHELL_CONFIG="$HOME/.profile"
fi

echo -e "Shell config: ${GREEN}$SHELL_CONFIG${NC}"
echo ""

# Step 4: Create ~/bin directory for user commands
echo -e "${BLUE}📂 Step 4: Setting up user bin directory...${NC}"
mkdir -p "$HOME/bin"
echo -e "${GREEN}✓ Created $HOME/bin${NC}"
echo ""

# Step 5: Create Easter egg commands
echo -e "${BLUE}🎭 Step 5: Installing CLI commands (including Easter eggs)...${NC}"

# Create fart command
cat > "$HOME/bin/fart" << EOF
#!/bin/bash
exec "$MAIFARM_DIR/farm" fart "\$@"
EOF
chmod +x "$HOME/bin/fart"
echo -e "${GREEN}✓ fart${NC} command installed"

# Create konami command
cat > "$HOME/bin/konami" << EOF
#!/bin/bash
exec "$MAIFARM_DIR/farm" konami "\$@"
EOF
chmod +x "$HOME/bin/konami"
echo -e "${GREEN}✓ konami${NC} command installed"

# Create secrets command
cat > "$HOME/bin/secrets" << EOF
#!/bin/bash
exec "$MAIFARM_DIR/farm" secrets "\$@"
EOF
chmod +x "$HOME/bin/secrets"
echo -e "${GREEN}✓ secrets${NC} command installed"
echo ""

# Step 6: Update shell configuration
echo -e "${BLUE}⚙️  Step 6: Updating shell configuration...${NC}"

FARM_ALIAS="alias farm=\"$MAIFARM_DIR/farm\""
FARM_PATH_EXPORT="export PATH=\"$MAIFARM_DIR:\$PATH\""
BIN_PATH_EXPORT="export PATH=\"\$HOME/bin:\$PATH\""

# Check if already installed
if grep -q "maifarm/farm" "$SHELL_CONFIG" 2>/dev/null; then
    echo -e "${YELLOW}MaiFarm already configured in $SHELL_CONFIG${NC}"
else
    echo "" >> "$SHELL_CONFIG"
    echo "# MaiFarm Command" >> "$SHELL_CONFIG"
    echo "$FARM_ALIAS" >> "$SHELL_CONFIG"
    echo "$FARM_PATH_EXPORT" >> "$SHELL_CONFIG"
    echo -e "${GREEN}✓ Added farm command to $SHELL_CONFIG${NC}"
fi

# Add ~/bin to PATH if not already there
if ! grep -q 'export PATH="$HOME/bin:$PATH"' "$SHELL_CONFIG" 2>/dev/null; then
    echo "" >> "$SHELL_CONFIG"
    echo "# User binaries (includes MaiFarm Easter eggs)" >> "$SHELL_CONFIG"
    echo "$BIN_PATH_EXPORT" >> "$SHELL_CONFIG"
    echo -e "${GREEN}✓ Added ~/bin to PATH in $SHELL_CONFIG${NC}"
else
    echo -e "${GREEN}✓ ~/bin already in PATH${NC}"
fi
echo ""

# Step 7: Summary
echo -e "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${MAGENTA}Installation Complete! 🎉${NC}               ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Installed Commands:${NC}"
echo -e "  ${GREEN}farm${NC}          - Main MaiFarm command"
echo -e "  ${GREEN}fart${NC}          - Easter egg (hidden)"
echo -e "  ${GREEN}konami${NC}        - Easter egg (hidden)"
echo -e "  ${GREEN}secrets${NC}       - Easter egg (hidden)"
echo ""
echo -e "${BLUE}🚀 Getting Started:${NC}"
echo -e "1. ${YELLOW}Reload your shell:${NC}"
echo -e "   ${BLUE}source $SHELL_CONFIG${NC}"
echo -e "   ${YELLOW}OR${NC} open a new terminal window"
echo ""
echo -e "2. ${YELLOW}Start MaiFarm:${NC}"
echo -e "   ${BLUE}farm${NC}              # Start production server"
echo -e "   ${BLUE}farm help${NC}         # Show all commands"
echo ""
echo -e "${BLUE}📚 Available Commands:${NC}"
echo -e "  ${GREEN}farm start${NC}        - Start MaiFarm server"
echo -e "  ${GREEN}farm stop${NC}         - Stop MaiFarm server"
echo -e "  ${GREEN}farm restart${NC}      - Restart MaiFarm server"
echo -e "  ${GREEN}farm status${NC}       - Check server status"
echo -e "  ${GREEN}farm create${NC}       - Create new farm 🌱"
echo -e "  ${GREEN}farm list${NC}         - List all farms 📋"
echo -e "  ${GREEN}farm quick${NC}        - Quick 5-minute task ⚡"
echo -e "  ${GREEN}farm wild${NC}         - Go Wild mode 🦅"
echo ""
echo -e "${YELLOW}💡 Tip: Try the hidden Easter egg commands! 🤫${NC}"
echo ""
echo -e "${BLUE}Optional: System-wide installation (requires sudo):${NC}"
echo -e "  ${BLUE}sudo ln -sf $MAIFARM_DIR/farm /usr/local/bin/farm${NC}"
echo ""

# Try to reload shell config automatically
if [ -f "$SHELL_CONFIG" ]; then
    echo -e "${BLUE}Attempting to reload shell configuration...${NC}"
    # Export PATH immediately for current session
    export PATH="$HOME/bin:$MAIFARM_DIR:$PATH"
    echo -e "${GREEN}✓ Commands are ready to use in this session!${NC}"
fi
echo ""
