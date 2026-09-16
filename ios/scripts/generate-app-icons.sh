#!/bin/bash
#
# MaiFarm App Icon Generator
# Generates all required iOS app icon sizes from a source image
#
# Usage: ./generate-app-icons.sh [source_image]
# Default source: ios/assets/source/AppIcon-1024.png
#
# Requirements:
# - macOS with sips (built-in)
# - Source image should be 1024x1024 PNG
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/ios/assets/source"
OUTPUT_DIR="$PROJECT_ROOT/ios/MaiFarm/Resources/Assets.xcassets/AppIcon.appiconset"

# Source image (default or provided as argument)
SOURCE_IMAGE="${1:-$SOURCE_DIR/AppIcon-1024.png}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MaiFarm App Icon Generator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if source image exists
if [[ ! -f "$SOURCE_IMAGE" ]]; then
    echo -e "${RED}Error: Source image not found: $SOURCE_IMAGE${NC}"
    echo ""
    echo "Please ensure you have a 1024x1024 PNG source image."
    echo "You can:"
    echo "  1. Convert the SVG to PNG using an online tool or Figma"
    echo "  2. Place the PNG at: $SOURCE_DIR/AppIcon-1024.png"
    echo ""
    echo -e "${YELLOW}To convert SVG to PNG on macOS:${NC}"
    echo "  qlmanage -t -s 1024 -o $SOURCE_DIR $SOURCE_DIR/AppIcon.svg"
    echo "  mv $SOURCE_DIR/AppIcon.svg.png $SOURCE_DIR/AppIcon-1024.png"
    exit 1
fi

# Verify source image dimensions
DIMENSIONS=$(sips -g pixelWidth -g pixelHeight "$SOURCE_IMAGE" | tail -2 | awk '{print $2}')
WIDTH=$(echo "$DIMENSIONS" | head -1)
HEIGHT=$(echo "$DIMENSIONS" | tail -1)

if [[ "$WIDTH" != "1024" ]] || [[ "$HEIGHT" != "1024" ]]; then
    echo -e "${YELLOW}Warning: Source image is ${WIDTH}x${HEIGHT}, expected 1024x1024${NC}"
    echo "Proceeding anyway, but quality may be affected."
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}Source image: $SOURCE_IMAGE${NC}"
echo -e "${GREEN}Output directory: $OUTPUT_DIR${NC}"
echo ""

# iOS App Icon sizes (name:size pairs)
# Format: filename:size_in_pixels
# These match the Contents.json in the asset catalog
declare -a ICON_SIZES=(
    # iPhone icons
    "AppIcon-20@2x:40"
    "AppIcon-20@3x:60"
    "AppIcon-29@2x:58"
    "AppIcon-29@3x:87"
    "AppIcon-40@2x:80"
    "AppIcon-40@3x:120"
    "AppIcon-60@2x:120"
    "AppIcon-60@3x:180"
    # iPad icons
    "AppIcon-20:20"
    "AppIcon-20@2x-ipad:40"
    "AppIcon-29:29"
    "AppIcon-29@2x-ipad:58"
    "AppIcon-40:40"
    "AppIcon-40@2x-ipad:80"
    "AppIcon-76:76"
    "AppIcon-76@2x:152"
    "AppIcon-83.5@2x:167"
    # App Store
    "AppIcon-1024:1024"
)

echo "Generating icon sizes..."
echo ""

for entry in "${ICON_SIZES[@]}"; do
    NAME="${entry%%:*}"
    SIZE="${entry##*:}"
    OUTPUT_FILE="$OUTPUT_DIR/$NAME.png"

    echo -n "  Creating $NAME.png (${SIZE}x${SIZE})... "

    # Use sips to resize
    cp "$SOURCE_IMAGE" "$OUTPUT_FILE"
    sips -z "$SIZE" "$SIZE" "$OUTPUT_FILE" > /dev/null 2>&1

    echo -e "${GREEN}Done${NC}"
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Icon generation complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Generated icons in: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Open ios/MaiFarm.xcodeproj in Xcode"
echo "  2. Navigate to Assets.xcassets > AppIcon"
echo "  3. Verify all icons are properly displayed"
echo ""
