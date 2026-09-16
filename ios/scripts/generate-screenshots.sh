#!/bin/bash
#
# MaiFarm App Store Screenshot Generator
# Generates professional screenshots for all required device sizes
#
# Usage: ./generate-screenshots.sh
#
# Requirements:
# - macOS with rsvg-convert (brew install librsvg)
# - Node.js (for HTML-to-image conversion if needed)
#
# This script generates screenshots from SVG templates and saves them
# in the correct dimensions for App Store submission.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$PROJECT_ROOT/ios/assets/screenshots/templates"
OUTPUT_DIR="$PROJECT_ROOT/ios/AppStoreConnect/screenshots"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MaiFarm Screenshot Generator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Device specifications
# Format: device_name:width:height:output_folder
declare -a DEVICES=(
    "iPhone-6.7:1290:2796:iPhone-6.7"
    "iPhone-6.5:1284:2778:iPhone-6.5"
    "iPhone-5.5:1242:2208:iPhone-5.5"
    "iPad-12.9:2048:2732:iPad-12.9"
)

# Screenshot names (these will be generated for each device)
declare -a SCREENSHOTS=(
    "01-dashboard"
    "02-farm-creation"
    "03-quick-task"
    "04-harvest"
    "05-barn"
)

# Check for rsvg-convert
if ! command -v rsvg-convert &> /dev/null; then
    echo -e "${RED}Error: rsvg-convert not found${NC}"
    echo "Install with: brew install librsvg"
    exit 1
fi

# Create output directories
for device_spec in "${DEVICES[@]}"; do
    folder="${device_spec##*:}"
    mkdir -p "$OUTPUT_DIR/$folder"
done

# Create template directory
mkdir -p "$TEMPLATE_DIR"

echo -e "${GREEN}Checking for SVG templates in: $TEMPLATE_DIR${NC}"
echo ""

# Function to generate screenshot from SVG template
generate_screenshot() {
    local template="$1"
    local width="$2"
    local height="$3"
    local output="$4"

    if [[ -f "$template" ]]; then
        rsvg-convert -w "$width" -h "$height" "$template" -o "$output"
        return 0
    fi
    return 1
}

# Generate screenshots for each device
for device_spec in "${DEVICES[@]}"; do
    IFS=':' read -r device_name width height folder <<< "$device_spec"

    echo -e "${BLUE}Generating screenshots for $device_name (${width}x${height})...${NC}"

    for screenshot in "${SCREENSHOTS[@]}"; do
        template="$TEMPLATE_DIR/${screenshot}.svg"
        output="$OUTPUT_DIR/$folder/${screenshot}.png"

        if [[ -f "$template" ]]; then
            echo -n "  ${screenshot}... "
            if generate_screenshot "$template" "$width" "$height" "$output"; then
                echo -e "${GREEN}Done${NC}"
            else
                echo -e "${RED}Failed${NC}"
            fi
        else
            echo -e "  ${YELLOW}Skipping ${screenshot} (no template found)${NC}"
        fi
    done
    echo ""
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Screenshot generation complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "To create/update screenshots:"
echo "  1. Edit SVG templates in: $TEMPLATE_DIR"
echo "  2. Run this script again"
echo ""
echo "Template files needed:"
for screenshot in "${SCREENSHOTS[@]}"; do
    echo "  - $TEMPLATE_DIR/${screenshot}.svg"
done
echo ""
