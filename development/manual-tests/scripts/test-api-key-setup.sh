#!/bin/bash

echo "🔧 MaiFarm API Key Setup Helper"
echo "================================"
echo ""

# Check if .env.development exists
if [ ! -f ".env.development" ]; then
    echo "❌ .env.development not found"
    exit 1
fi

echo "This script will help you set up API keys for MaiFarm."
echo ""
echo "You have two options:"
echo "1. Add API key directly to .env.development (quick)"
echo "2. Use the Settings UI after starting the server (recommended)"
echo ""

# Check current status
if grep -q "ANTHROPIC_API_KEY=" .env.development; then
    KEY_LINE=$(grep "ANTHROPIC_API_KEY=" .env.development)
    KEY_VALUE=${KEY_LINE#*=}
    if [ ${#KEY_VALUE} -gt 30 ]; then
        echo "✅ ANTHROPIC_API_KEY already configured in .env.development"
        echo "   Length: ${#KEY_VALUE} characters"
        echo ""
        echo "Your system is ready to use!"
        exit 0
    else
        echo "⚠️ ANTHROPIC_API_KEY found but appears invalid"
    fi
fi

echo ""
echo "Would you like to add your API key now? (y/n)"
read -r response

if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    echo ""
    echo "Please enter your Anthropic API key:"
    echo "(It should start with 'sk-ant-' and be about 100+ characters long)"
    read -r api_key
    
    if [ ${#api_key} -lt 30 ]; then
        echo "❌ API key too short. Please use a valid Anthropic API key."
        exit 1
    fi
    
    # Check if ANTHROPIC_API_KEY line exists
    if grep -q "ANTHROPIC_API_KEY=" .env.development; then
        # Replace existing line
        sed -i.bak "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$api_key/" .env.development
        echo "✅ Updated ANTHROPIC_API_KEY in .env.development"
    else
        # Add after AI_PROVIDER line
        if grep -q "AI_PROVIDER=" .env.development; then
            sed -i.bak "/AI_PROVIDER=/a\\
\\
# Claude/Anthropic Configuration\\
ANTHROPIC_API_KEY=$api_key\\
CLAUDE_API_KEY=$api_key" .env.development
            echo "✅ Added ANTHROPIC_API_KEY to .env.development"
        else
            # Just append at the end
            echo "" >> .env.development
            echo "# Claude/Anthropic Configuration" >> .env.development
            echo "ANTHROPIC_API_KEY=$api_key" >> .env.development
            echo "CLAUDE_API_KEY=$api_key" >> .env.development
            echo "✅ Added ANTHROPIC_API_KEY to .env.development"
        fi
    fi
    
    # Clean up backup file
    rm -f .env.development.bak
    
    echo ""
    echo "✅ API key configuration complete!"
    echo ""
    echo "You can now:"
    echo "1. Start the server: npm run dev"
    echo "2. Create and launch farms from the UI"
    echo "3. Agents will use your API key automatically"
    
else
    echo ""
    echo "To configure via the Settings UI:"
    echo "1. Start the server: npm run dev"
    echo "2. Open http://localhost:3000 in your browser"
    echo "3. Go to Settings > API Keys"
    echo "4. Add your Anthropic API key"
    echo ""
    echo "The system will automatically sync the key from Settings to .env.development"
fi