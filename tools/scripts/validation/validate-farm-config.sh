#!/bin/bash

echo "🔍 MaiFarm Configuration Validation"
echo "===================================="
echo ""

# Check for API key
echo "1️⃣ Checking API Keys..."
if [ -f ".env.development" ]; then
    if grep -q "ANTHROPIC_API_KEY=" .env.development; then
        KEY_LENGTH=$(grep "ANTHROPIC_API_KEY=" .env.development | cut -d'=' -f2 | wc -c)
        if [ $KEY_LENGTH -gt 30 ]; then
            echo "✅ ANTHROPIC_API_KEY found in .env.development (length: $KEY_LENGTH)"
        else
            echo "⚠️ ANTHROPIC_API_KEY found but appears invalid (too short)"
        fi
    else
        echo "❌ ANTHROPIC_API_KEY not found in .env.development"
        echo "   Please add: ANTHROPIC_API_KEY=your-actual-key"
    fi
else
    echo "❌ .env.development file not found"
fi

echo ""
echo "2️⃣ Checking Claude CLI..."
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>&1 || echo "unknown")
    echo "✅ Claude CLI installed: $CLAUDE_VERSION"
else
    echo "❌ Claude CLI not found"
    echo "   Install with: npm install -g @anthropic-ai/cli"
fi

echo ""
echo "3️⃣ Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL client installed"
    # Try to connect to database
    if PGPASSWORD=maifarm123 psql -h localhost -U maifarm -d maifarm_dev -c "SELECT 1;" &> /dev/null; then
        echo "✅ Database connection successful"
    else
        echo "⚠️ Could not connect to database (may need to start PostgreSQL)"
    fi
else
    echo "⚠️ PostgreSQL client not found"
fi

echo ""
echo "4️⃣ Checking tmux..."
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V)
    echo "✅ tmux installed: $TMUX_VERSION"
    
    # Check for any existing farm sessions
    SESSIONS=$(tmux list-sessions 2>/dev/null | grep -E "farm-|quick_" | wc -l)
    if [ $SESSIONS -gt 0 ]; then
        echo "   Found $SESSIONS existing farm session(s)"
        tmux list-sessions 2>/dev/null | grep -E "farm-|quick_"
    fi
else
    echo "❌ tmux not installed"
    echo "   Install with: brew install tmux"
fi

echo ""
echo "5️⃣ Checking Node.js environment..."
if [ -f "package.json" ]; then
    NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
    NPM_VERSION=$(npm -v 2>/dev/null || echo "not found")
    echo "✅ Node.js: $NODE_VERSION"
    echo "✅ npm: $NPM_VERSION"
    
    # Check if dependencies are installed
    if [ -d "node_modules" ]; then
        MODULE_COUNT=$(ls node_modules | wc -l)
        echo "✅ Dependencies installed ($MODULE_COUNT modules)"
    else
        echo "⚠️ Dependencies not installed - run: npm install"
    fi
else
    echo "❌ package.json not found"
fi

echo ""
echo "===================================="
echo "📊 Configuration Summary"
echo "===================================="

ISSUES=0

# Count issues
if ! grep -q "ANTHROPIC_API_KEY=" .env.development 2>/dev/null; then
    ((ISSUES++))
fi
if ! command -v claude &> /dev/null; then
    ((ISSUES++))
fi
if ! command -v tmux &> /dev/null; then
    ((ISSUES++))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✅ All critical components configured correctly!"
    echo ""
    echo "You can now:"
    echo "  1. Start the server: npm run dev"
    echo "  2. Create and launch farms from the UI"
    echo "  3. Agents will start properly with Claude CLI"
else
    echo "⚠️ Found $ISSUES configuration issue(s)"
    echo ""
    echo "To fix:"
    if ! grep -q "ANTHROPIC_API_KEY=" .env.development 2>/dev/null; then
        echo "  • Add ANTHROPIC_API_KEY to .env.development"
    fi
    if ! command -v claude &> /dev/null; then
        echo "  • Install Claude CLI: npm install -g @anthropic-ai/cli"
    fi
    if ! command -v tmux &> /dev/null; then
        echo "  • Install tmux: brew install tmux"
    fi
fi