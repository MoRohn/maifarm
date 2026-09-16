#!/bin/bash

# MaiFarm iOS Deployment Script
# Complete pipeline for building and preparing the app for iOS App Store deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="MaiFarm"
BUILD_DIR="dist/dashboard-ios"
OUTPUT_DIR="ios-build"
ASSETS_DIR="apps/dashboard/public"

echo -e "${BLUE}🚀 MaiFarm iOS Deployment Pipeline${NC}"
echo "======================================"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Environment checks
echo -e "\n${YELLOW}Step 1: Environment Verification${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version)${NC}"

# Step 2: Install dependencies
echo -e "\n${YELLOW}Step 2: Installing Dependencies${NC}"

# Install vite-plugin-pwa and compression plugins if not already installed
npm ls vite-plugin-pwa >/dev/null 2>&1 || npm install --save-dev vite-plugin-pwa
npm ls vite-plugin-compression >/dev/null 2>&1 || npm install --save-dev vite-plugin-compression
npm ls rollup-plugin-visualizer >/dev/null 2>&1 || npm install --save-dev rollup-plugin-visualizer

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 3: Generate iOS icons and splash screens
echo -e "\n${YELLOW}Step 3: Generating iOS Assets${NC}"

# Create icon directory if it doesn't exist
mkdir -p "$ASSETS_DIR/icons"

# Check if source icon exists
if [ ! -f "$ASSETS_DIR/logo.png" ]; then
    echo -e "${YELLOW}⚠ No logo.png found, using placeholder${NC}"
    # Create a simple placeholder icon using ImageMagick if available
    if command_exists convert; then
        convert -size 1024x1024 xc:'#0ea5e9' \
                -gravity center \
                -fill white \
                -font Helvetica-Bold \
                -pointsize 400 \
                -annotate +0+0 'MF' \
                "$ASSETS_DIR/logo.png"
    fi
fi

# Generate iOS icon sizes if logo exists
if [ -f "$ASSETS_DIR/logo.png" ]; then
    if command_exists convert; then
        # iOS App Icon sizes
        convert "$ASSETS_DIR/logo.png" -resize 20x20 "$ASSETS_DIR/icons/icon-20x20.png"
        convert "$ASSETS_DIR/logo.png" -resize 29x29 "$ASSETS_DIR/icons/icon-29x29.png"
        convert "$ASSETS_DIR/logo.png" -resize 40x40 "$ASSETS_DIR/icons/icon-40x40.png"
        convert "$ASSETS_DIR/logo.png" -resize 58x58 "$ASSETS_DIR/icons/icon-58x58.png"
        convert "$ASSETS_DIR/logo.png" -resize 60x60 "$ASSETS_DIR/icons/icon-60x60.png"
        convert "$ASSETS_DIR/logo.png" -resize 76x76 "$ASSETS_DIR/icons/icon-76x76.png"
        convert "$ASSETS_DIR/logo.png" -resize 80x80 "$ASSETS_DIR/icons/icon-80x80.png"
        convert "$ASSETS_DIR/logo.png" -resize 87x87 "$ASSETS_DIR/icons/icon-87x87.png"
        convert "$ASSETS_DIR/logo.png" -resize 120x120 "$ASSETS_DIR/icons/icon-120x120.png"
        convert "$ASSETS_DIR/logo.png" -resize 152x152 "$ASSETS_DIR/icons/icon-152x152.png"
        convert "$ASSETS_DIR/logo.png" -resize 167x167 "$ASSETS_DIR/icons/icon-167x167.png"
        convert "$ASSETS_DIR/logo.png" -resize 180x180 "$ASSETS_DIR/icons/icon-180x180.png"
        convert "$ASSETS_DIR/logo.png" -resize 1024x1024 "$ASSETS_DIR/icons/icon-1024x1024.png"

        # PWA icons
        convert "$ASSETS_DIR/logo.png" -resize 192x192 "$ASSETS_DIR/icons/icon-192x192.png"
        convert "$ASSETS_DIR/logo.png" -resize 512x512 "$ASSETS_DIR/icons/icon-512x512.png"

        # Apple touch icon
        convert "$ASSETS_DIR/logo.png" -resize 180x180 "$ASSETS_DIR/icons/apple-touch-icon.png"

        echo -e "${GREEN}✓ iOS icons generated${NC}"
    else
        echo -e "${YELLOW}⚠ ImageMagick not installed, skipping icon generation${NC}"
    fi
fi

# Step 4: Clean previous builds
echo -e "\n${YELLOW}Step 4: Cleaning Previous Builds${NC}"

rm -rf "$BUILD_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}✓ Previous builds cleaned${NC}"

# Step 5: Run iOS optimized build
echo -e "\n${YELLOW}Step 5: Building iOS Optimized Version${NC}"

# Set environment variables for production build
export NODE_ENV=production
export VITE_BUILD_TARGET=ios

# Run build with iOS configuration
npm run build -- --config apps/dashboard/vite.config.ios.ts

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ iOS build completed${NC}"

# Step 6: Analyze bundle size
echo -e "\n${YELLOW}Step 6: Bundle Analysis${NC}"

# Get build size
BUILD_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
echo -e "${BLUE}Total build size: $BUILD_SIZE${NC}"

# Check individual chunk sizes
echo -e "\n${BLUE}Chunk sizes:${NC}"
find "$BUILD_DIR" -name "*.js" -exec ls -lh {} \; | awk '{print $9, $5}' | sort -k2 -hr | head -10

# Step 7: Optimize assets
echo -e "\n${YELLOW}Step 7: Asset Optimization${NC}"

# Compress images if pngquant is available
if command_exists pngquant; then
    find "$BUILD_DIR" -name "*.png" -exec pngquant --quality=65-80 --ext .png --force {} \;
    echo -e "${GREEN}✓ PNG images optimized${NC}"
fi

# Convert images to WebP if cwebp is available
if command_exists cwebp; then
    find "$BUILD_DIR" -name "*.jpg" -o -name "*.jpeg" | while read img; do
        cwebp -q 80 "$img" -o "${img%.*}.webp"
    done
    echo -e "${GREEN}✓ Images converted to WebP${NC}"
fi

# Step 8: Generate service worker
echo -e "\n${YELLOW}Step 8: Service Worker Generation${NC}"

# The service worker should be generated by vite-plugin-pwa
if [ -f "$BUILD_DIR/sw.js" ]; then
    echo -e "${GREEN}✓ Service worker generated${NC}"
else
    echo -e "${YELLOW}⚠ Service worker not found${NC}"
fi

# Step 9: Create iOS-specific files
echo -e "\n${YELLOW}Step 9: Creating iOS Configuration Files${NC}"

# Create apple-app-site-association for Universal Links
cat > "$BUILD_DIR/.well-known/apple-app-site-association" << EOF
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.ai.maifarm.app",
        "paths": [
          "/",
          "/farms/*",
          "/harvest/*"
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["TEAMID.ai.maifarm.app"]
  }
}
EOF

echo -e "${GREEN}✓ iOS configuration files created${NC}"

# Step 10: Performance validation
echo -e "\n${YELLOW}Step 10: Performance Validation${NC}"

# Check if critical files are within size limits
MAX_JS_SIZE=500 # KB
MAX_CSS_SIZE=100 # KB

# Check JS bundles
for file in "$BUILD_DIR"/**/*.js; do
    if [ -f "$file" ]; then
        SIZE_KB=$(du -k "$file" | cut -f1)
        if [ $SIZE_KB -gt $MAX_JS_SIZE ]; then
            echo -e "${YELLOW}⚠ Warning: $(basename $file) is ${SIZE_KB}KB (limit: ${MAX_JS_SIZE}KB)${NC}"
        fi
    fi
done

# Check CSS bundles
for file in "$BUILD_DIR"/**/*.css; do
    if [ -f "$file" ]; then
        SIZE_KB=$(du -k "$file" | cut -f1)
        if [ $SIZE_KB -gt $MAX_CSS_SIZE ]; then
            echo -e "${YELLOW}⚠ Warning: $(basename $file) is ${SIZE_KB}KB (limit: ${MAX_CSS_SIZE}KB)${NC}"
        fi
    fi
done

echo -e "${GREEN}✓ Performance validation complete${NC}"

# Step 11: Create deployment package
echo -e "\n${YELLOW}Step 11: Creating Deployment Package${NC}"

# Copy build to output directory
cp -r "$BUILD_DIR"/* "$OUTPUT_DIR/"

# Create deployment manifest
cat > "$OUTPUT_DIR/deployment-manifest.json" << EOF
{
  "name": "$APP_NAME",
  "version": "$(node -p "require('./package.json').version")",
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platform": "ios",
  "buildType": "production",
  "features": {
    "pwa": true,
    "offline": true,
    "pushNotifications": true,
    "backgroundSync": true
  },
  "performance": {
    "buildSize": "$BUILD_SIZE",
    "targetFPS": 60,
    "targetLoadTime": 3000
  }
}
EOF

echo -e "${GREEN}✓ Deployment package created${NC}"

# Step 12: Generate deployment instructions
echo -e "\n${YELLOW}Step 12: Deployment Instructions${NC}"

cat > "$OUTPUT_DIR/DEPLOYMENT_INSTRUCTIONS.md" << EOF
# MaiFarm iOS Deployment Instructions

## Build Information
- **Version**: $(node -p "require('./package.json').version")
- **Build Date**: $(date)
- **Build Size**: $BUILD_SIZE
- **Target Platform**: iOS 14+

## Deployment Steps

### 1. Web Deployment (PWA)
1. Upload contents of \`$OUTPUT_DIR\` to your web server
2. Configure HTTPS (required for PWA features)
3. Set up proper CORS headers for API access
4. Configure CDN for static assets

### 2. App Store Submission
1. Open Xcode and create new project (if not exists)
2. Configure WKWebView to load your deployed URL
3. Add required capabilities:
   - Push Notifications
   - Background Modes
   - Associated Domains
4. Configure Info.plist:
   - Add camera usage description (if needed)
   - Add location usage description (if needed)
   - Configure URL schemes
5. Archive and submit to App Store Connect

### 3. Server Configuration
Ensure your web server has:
- HTTPS enabled
- Proper MIME types for manifest.json and service worker
- CORS configured for API endpoints
- Compression enabled (gzip/brotli)

### 4. Testing Checklist
- [ ] PWA installation works
- [ ] Offline mode functions correctly
- [ ] Push notifications work
- [ ] WebSocket connection is stable
- [ ] Performance meets targets (< 3s load time)
- [ ] All gestures work (swipe, pull-to-refresh)
- [ ] Safe area insets are respected (notch devices)

### 5. Post-Deployment
1. Monitor performance metrics
2. Set up error tracking
3. Configure analytics
4. Test on various iOS devices

## Support
For issues, refer to the documentation or contact support.
EOF

echo -e "${GREEN}✓ Deployment instructions generated${NC}"

# Step 13: Final summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}✅ iOS Deployment Build Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Build Summary:${NC}"
echo -e "  • Build location: ${BUILD_DIR}"
echo -e "  • Package location: ${OUTPUT_DIR}"
echo -e "  • Total size: ${BUILD_SIZE}"
echo -e "  • Target iOS version: 14+"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Review ${OUTPUT_DIR}/DEPLOYMENT_INSTRUCTIONS.md"
echo -e "  2. Test the build locally: npm run preview"
echo -e "  3. Deploy to staging environment"
echo -e "  4. Run performance tests"
echo -e "  5. Submit to App Store (if applicable)"
echo ""
echo -e "${GREEN}Build completed successfully! 🎉${NC}"