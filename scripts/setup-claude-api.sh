#!/bin/bash
# Helper script to configure Claude API key for MaiFarm

echo "═══════════════════════════════════════════════════════════════"
echo "    MaiFarm Claude API Configuration Helper"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "To use Claude agents in MaiFarm, you need an Anthropic API key."
echo ""
echo "Steps to configure:"
echo "1. Get your API key from: https://console.anthropic.com/account/keys"
echo "2. Add it to your .env.development file:"
echo ""
echo "   ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE"
echo ""
echo "3. Restart the MaiFarm server: npm run dev"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if API key is already configured
if grep -q "^ANTHROPIC_API_KEY=.*sk-ant" .env.development 2>/dev/null; then
    echo "✅ API key is already configured in .env.development"
elif grep -q "^CLAUDE_API_KEY=.*sk-ant" .env.development 2>/dev/null; then
    echo "✅ API key is already configured in .env.development (as CLAUDE_API_KEY)"
else
    echo "❌ No API key found in .env.development"
    echo ""
    read -p "Would you like to add your API key now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Please enter your Anthropic API key:"
        read -s API_KEY
        echo ""
        
        if [[ $API_KEY == sk-ant-* ]]; then
            # Add to .env.development
            echo "" >> .env.development
            echo "# Claude API Configuration" >> .env.development
            echo "ANTHROPIC_API_KEY=$API_KEY" >> .env.development
            echo "✅ API key added to .env.development"
            echo ""
            echo "Please restart the MaiFarm server for changes to take effect."
        else
            echo "❌ Invalid API key format. API keys should start with 'sk-ant-'"
        fi
    fi
fi