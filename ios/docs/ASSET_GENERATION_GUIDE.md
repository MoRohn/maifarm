# MaiFarm iOS Asset Generation Guide

This guide documents the process for generating app icons and screenshots for the MaiFarm iOS app. All assets can be regenerated when design changes are made.

## Quick Start

```bash
# Generate all app icons from source
./ios/scripts/generate-app-icons.sh

# Generate all screenshots for all device sizes
./ios/scripts/generate-screenshots.sh
```

## Directory Structure

```
ios/
├── assets/
│   ├── source/
│   │   ├── AppIcon.svg           # Source SVG for app icon
│   │   └── AppIcon-1024.png      # 1024x1024 PNG (generated from SVG)
│   └── screenshots/
│       └── templates/            # SVG templates for screenshots
│           ├── 01-dashboard.svg
│           ├── 02-farm-creation.svg
│           ├── 03-quick-task.svg
│           ├── 04-harvest.svg
│           └── 05-barn.svg
├── scripts/
│   ├── generate-app-icons.sh     # App icon generation script
│   └── generate-screenshots.sh   # Screenshot generation script
├── MaiFarm/
│   └── Resources/
│       └── Assets.xcassets/
│           └── AppIcon.appiconset/  # Generated icons go here
└── AppStoreConnect/
    └── screenshots/              # Generated screenshots
        ├── iPhone-6.7/           # 1290x2796
        ├── iPhone-6.5/           # 1284x2778
        ├── iPhone-5.5/           # 1242x2208
        └── iPad-12.9/            # 2048x2732
```

## Prerequisites

- macOS (uses built-in `sips` for image manipulation)
- `rsvg-convert` for SVG to PNG conversion:
  ```bash
  brew install librsvg
  ```

## App Icons

### Updating the App Icon

1. **Edit the source SVG:**
   ```bash
   # Edit ios/assets/source/AppIcon.svg with your preferred editor
   open -a "Figma" ios/assets/source/AppIcon.svg
   # Or use any SVG editor like Sketch, Illustrator, Inkscape
   ```

2. **Convert SVG to PNG:**
   ```bash
   rsvg-convert -w 1024 -h 1024 ios/assets/source/AppIcon.svg -o ios/assets/source/AppIcon-1024.png
   ```

3. **Generate all icon sizes:**
   ```bash
   ./ios/scripts/generate-app-icons.sh
   ```

### Icon Sizes Generated

| File Name | Size | Usage |
|-----------|------|-------|
| AppIcon-20@2x.png | 40x40 | iPhone Notification @2x |
| AppIcon-20@3x.png | 60x60 | iPhone Notification @3x |
| AppIcon-29@2x.png | 58x58 | iPhone Settings @2x |
| AppIcon-29@3x.png | 87x87 | iPhone Settings @3x |
| AppIcon-40@2x.png | 80x80 | iPhone Spotlight @2x |
| AppIcon-40@3x.png | 120x120 | iPhone Spotlight @3x |
| AppIcon-60@2x.png | 120x120 | iPhone App @2x |
| AppIcon-60@3x.png | 180x180 | iPhone App @3x |
| AppIcon-20.png | 20x20 | iPad Notification @1x |
| AppIcon-20@2x-ipad.png | 40x40 | iPad Notification @2x |
| AppIcon-29.png | 29x29 | iPad Settings @1x |
| AppIcon-29@2x-ipad.png | 58x58 | iPad Settings @2x |
| AppIcon-40.png | 40x40 | iPad Spotlight @1x |
| AppIcon-40@2x-ipad.png | 80x80 | iPad Spotlight @2x |
| AppIcon-76.png | 76x76 | iPad App @1x |
| AppIcon-76@2x.png | 152x152 | iPad App @2x |
| AppIcon-83.5@2x.png | 167x167 | iPad Pro App @2x |
| AppIcon-1024.png | 1024x1024 | App Store |

## Screenshots

### Updating Screenshots

1. **Edit the SVG templates:**
   ```bash
   # Templates are in ios/assets/screenshots/templates/
   # Edit with any SVG editor
   ```

2. **Generate all screenshots:**
   ```bash
   ./ios/scripts/generate-screenshots.sh
   ```

### Screenshot Templates

| Template | Description |
|----------|-------------|
| 01-dashboard.svg | Main dashboard showing active farms and quick actions |
| 02-farm-creation.svg | Chat-based farm creation interface |
| 03-quick-task.svg | 5-minute quick task execution view |
| 04-harvest.svg | Real-time harvest monitoring with agent terminals |
| 05-barn.svg | Barn view showing collected outputs |

### Device Sizes

| Device | Resolution | Folder |
|--------|------------|--------|
| iPhone 6.7" (15 Pro Max) | 1290 x 2796 | iPhone-6.7 |
| iPhone 6.5" (14 Plus) | 1284 x 2778 | iPhone-6.5 |
| iPhone 5.5" (8 Plus) | 1242 x 2208 | iPhone-5.5 |
| iPad Pro 12.9" | 2048 x 2732 | iPad-12.9 |

## SVG Design Guidelines

### Fonts
Use system fonts for best compatibility:
```xml
font-family="SF Pro Display, -apple-system"
```

### Colors (MaiFarm Brand)
```
Primary Green: #059669, #10B981
Background Dark: #0f172a, #064e3b
Card Background: #1e293b
Text Primary: #f1f5f9
Text Secondary: #94a3b8
Text Muted: #64748b
```

### XML Entities
In SVG, use numeric entities instead of named entities:
- Bullet: `&#x2022;` (not `&bull;`)
- Ampersand: `&amp;` or use "and"
- Less than: `&lt;`
- Greater than: `&gt;`

### Gradients
Define gradients in `<defs>` section:
```xml
<defs>
  <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" style="stop-color:#059669"/>
    <stop offset="100%" style="stop-color:#10B981"/>
  </linearGradient>
</defs>
```

## Automation

### Full Regeneration
```bash
# Regenerate everything
cd /path/to/maifarm

# Convert SVG icon to PNG
rsvg-convert -w 1024 -h 1024 ios/assets/source/AppIcon.svg -o ios/assets/source/AppIcon-1024.png

# Generate all icon sizes
./ios/scripts/generate-app-icons.sh

# Generate all screenshots
./ios/scripts/generate-screenshots.sh
```

### CI/CD Integration
Add to your CI pipeline:
```yaml
- name: Generate iOS Assets
  run: |
    brew install librsvg
    rsvg-convert -w 1024 -h 1024 ios/assets/source/AppIcon.svg -o ios/assets/source/AppIcon-1024.png
    ./ios/scripts/generate-app-icons.sh
    ./ios/scripts/generate-screenshots.sh
```

## Troubleshooting

### "rsvg-convert not found"
```bash
brew install librsvg
```

### "Source image not found"
Ensure the 1024x1024 PNG exists:
```bash
rsvg-convert -w 1024 -h 1024 ios/assets/source/AppIcon.svg -o ios/assets/source/AppIcon-1024.png
```

### SVG Parse Errors
Check for:
- Unescaped `&` characters (use `&amp;` or "and")
- Named entities like `&bull;` (use `&#x2022;`)
- Unclosed tags

### Screenshots Look Wrong
- Verify the viewBox matches target dimensions
- Check that all gradients are defined in `<defs>`
- Ensure font-family includes system fallbacks

## Output Verification

After generation, verify in Xcode:
1. Open `ios/MaiFarm.xcodeproj`
2. Navigate to Assets.xcassets > AppIcon
3. Verify all icon slots are filled
4. Build and run on simulator to verify

For screenshots:
1. Open `ios/AppStoreConnect/screenshots/`
2. Preview each PNG
3. Upload to App Store Connect

---

Last updated: January 2025
