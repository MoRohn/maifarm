#!/bin/bash

# MaiFarm CLI Theme System Demo
# Showcases all themes with agent messaging examples

clear

echo "╔════════════════════════════════════════════════╗"
echo "║  🎨 MaiFarm CLI Theme System Demo 🎨          ║"
echo "║                                                ║"
echo "║  Showcasing 9 beautiful terminal themes       ║"
echo "║  with agent messaging examples                ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Press ENTER to start the demo..."
read

THEMES=("matrix" "cyberpunk" "synthwave" "quantum" "dracula" "hacker" "tokyo" "aurora" "forest-walk")

for theme in "${THEMES[@]}"; do
  clear
  echo "════════════════════════════════════════════════"
  echo "  Demonstrating: $theme theme"
  echo "════════════════════════════════════════════════"
  echo ""

  # Set the theme
  node cli/dist/index.js theme set "$theme" 2>/dev/null

  echo ""
  echo "Preview of agent messaging in $theme theme:"
  echo "────────────────────────────────────────────────"
  echo ""

  # Show current theme with full preview
  node cli/dist/index.js theme current 2>/dev/null | tail -40

  echo ""
  echo "Press ENTER for next theme (Ctrl+C to exit)..."
  read
done

clear
echo "╔════════════════════════════════════════════════╗"
echo "║  ✨ Demo Complete! ✨                          ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Commands to try:"
echo ""
echo "  farm theme list        # See all themes"
echo "  farm theme set <name>  # Change your theme"
echo "  farm theme demo        # Interactive picker"
echo "  farm theme current     # Show active theme"
echo ""
echo "Your current theme:"
cat ~/.maifarm/cli-theme.json 2>/dev/null | grep -o '"theme":"[^"]*"' || echo "  Not set yet"
echo ""
echo "Happy farming! 🌾"
