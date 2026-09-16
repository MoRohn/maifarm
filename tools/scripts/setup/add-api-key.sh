#!/bin/bash

# Simple script to add Claude API key to .env.development
# This is a quick fix until you add the key through Settings UI

echo "========================================="
echo "   Add Claude API Key to MaiFarm"
echo "========================================="
echo ""
echo "This script will add your Claude API key to .env.development"
echo "for immediate use with farms and agents."
echo ""
echo "Please enter your Anthropic/Claude API key:"
echo "(It should start with 'sk-ant-api' and be 100+ characters long)"
echo ""
read -p "API Key: " API_KEY

# Validate the API key
if [[ -z "$API_KEY" ]]; then
    echo "❌ No API key provided"
    exit 1
fi

if [[ ${#API_KEY} -lt 30 ]]; then
    echo "❌ API key seems too short. Real API keys are typically 100+ characters"
    exit 1
fi

if [[ ! "$API_KEY" =~ ^sk-ant- ]]; then
    echo "⚠️  Warning: API key doesn't start with 'sk-ant-'. This might not be a valid Claude API key."
    read -p "Continue anyway? (y/n): " CONTINUE
    if [[ "$CONTINUE" != "y" ]]; then
        exit 1
    fi
fi

echo ""
echo "Adding API key to .env.development..."

# Check if .env.development exists
if [ ! -f .env.development ]; then
    echo "Creating .env.development file..."
    cp .env.example .env.development 2>/dev/null || touch .env.development
fi

# Check if API keys already exist
if grep -q "ANTHROPIC_API_KEY=" .env.development; then
    echo "Updating existing ANTHROPIC_API_KEY..."
    # Use a different delimiter for sed to avoid issues with forward slashes in the key
    sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY|" .env.development
else
    echo "Adding ANTHROPIC_API_KEY..."
    # Find AI_PROVIDER line and add after it
    if grep -q "AI_PROVIDER=" .env.development; then
        sed -i.bak "/AI_PROVIDER=/a\\
\\
# Claude/Anthropic Configuration\\
ANTHROPIC_API_KEY=$API_KEY" .env.development
    else
        # Just append at the end
        echo "" >> .env.development
        echo "# Claude/Anthropic Configuration" >> .env.development
        echo "ANTHROPIC_API_KEY=$API_KEY" >> .env.development
    fi
fi

if grep -q "CLAUDE_API_KEY=" .env.development; then
    echo "Updating existing CLAUDE_API_KEY..."
    sed -i.bak "s|CLAUDE_API_KEY=.*|CLAUDE_API_KEY=$API_KEY|" .env.development
else
    echo "Adding CLAUDE_API_KEY..."
    # Add right after ANTHROPIC_API_KEY
    sed -i.bak "/ANTHROPIC_API_KEY=/a\\
CLAUDE_API_KEY=$API_KEY" .env.development
fi

# Clean up backup files
rm -f .env.development.bak

# Also create .env.runtime for subprocess access
echo "Creating .env.runtime for subprocess access..."
cat > .env.runtime << EOF
# Runtime API Keys - Auto-generated
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

ANTHROPIC_API_KEY=$API_KEY
CLAUDE_API_KEY=$API_KEY
EOF

echo ""
echo "✅ API key has been added to:"
echo "   - .env.development (persistent storage)"
echo "   - .env.runtime (subprocess access)"
echo ""
echo "🎉 Success! Your Claude API key is now configured."
echo ""
echo "Next steps:"
echo "1. Restart the server: npm run dev"
echo "2. The API key will be available to all farms and agents"
echo "3. You can also add this key through Settings > API Keys in the UI"
echo ""
echo "Note: The API key sync service will automatically detect and use this key."