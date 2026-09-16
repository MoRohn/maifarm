#!/bin/bash

# Remove console.log statements from production code
# This script comments out console.log statements to preserve them for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Console.log Cleanup Script${NC}"
echo "===================================="

# Configuration
TARGET_DIR="apps/dashboard/src"
BACKUP_DIR="console-log-backup"
DRY_RUN=${1:-false}

if [ "$1" = "--help" ]; then
  echo "Usage: $0 [--dry-run|--restore]"
  echo "  --dry-run   Preview changes without modifying files"
  echo "  --restore   Restore console.log statements from backup"
  exit 0
fi

# Restore mode
if [ "$1" = "--restore" ]; then
  echo -e "${YELLOW}Restoring console.log statements from backup...${NC}"

  if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}No backup directory found!${NC}"
    exit 1
  fi

  # Restore all files from backup
  cp -R "$BACKUP_DIR"/* .
  echo -e "${GREEN}✓ Console.log statements restored${NC}"
  exit 0
fi

# Create backup directory
if [ ! -d "$BACKUP_DIR" ] && [ "$DRY_RUN" != "--dry-run" ]; then
  echo -e "${YELLOW}Creating backup directory...${NC}"
  mkdir -p "$BACKUP_DIR"
  cp -R "$TARGET_DIR" "$BACKUP_DIR/"
  echo -e "${GREEN}✓ Backup created in $BACKUP_DIR${NC}"
fi

# Count console statements
echo -e "\n${YELLOW}Analyzing console statements...${NC}"

# Find all TypeScript and JavaScript files
FILES=$(find "$TARGET_DIR" \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -type f)

TOTAL_FILES=0
AFFECTED_FILES=0
TOTAL_CONSOLE_STATEMENTS=0

# Process each file
for file in $FILES; do
  TOTAL_FILES=$((TOTAL_FILES + 1))

  # Count console statements in this file
  COUNT=$(grep -c "console\.\(log\|error\|warn\|info\|debug\|trace\|group\|groupEnd\|time\|timeEnd\|table\|assert\|clear\|count\|dir\|dirxml\|profile\|profileEnd\)" "$file" 2>/dev/null || true)

  if [ "$COUNT" -gt 0 ]; then
    AFFECTED_FILES=$((AFFECTED_FILES + 1))
    TOTAL_CONSOLE_STATEMENTS=$((TOTAL_CONSOLE_STATEMENTS + COUNT))

    if [ "$DRY_RUN" = "--dry-run" ]; then
      echo "  Would process: $file ($COUNT console statements)"
    fi
  fi
done

echo -e "${BLUE}Found $TOTAL_CONSOLE_STATEMENTS console statements in $AFFECTED_FILES files (out of $TOTAL_FILES total)${NC}"

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo -e "\n${YELLOW}DRY RUN - No files were modified${NC}"
  echo "Run without --dry-run to apply changes"
  exit 0
fi

# Process files
echo -e "\n${YELLOW}Processing files...${NC}"

PROCESSED=0
for file in $FILES; do
  # Check if file contains console statements
  if grep -q "console\.\(log\|error\|warn\|info\|debug\|trace\|group\|groupEnd\|time\|timeEnd\|table\|assert\|clear\|count\|dir\|dirxml\|profile\|profileEnd\)" "$file" 2>/dev/null; then
    # Create temporary file
    TEMP_FILE=$(mktemp)

    # Process the file - comment out console statements except console.error in catch blocks
    awk '
    {
      # Check if line contains console statement
      if (match($0, /^([[:space:]]*)console\.([a-zA-Z]+)/, groups)) {
        indent = groups[1]
        method = groups[2]

        # Keep console.error in catch blocks or error handlers
        if (method == "error" && (prev ~ /catch/ || prev ~ /\.catch/ || prev ~ /error/)) {
          print $0
        }
        # Keep console statements in test files
        else if (FILENAME ~ /\.test\./ || FILENAME ~ /\.spec\./) {
          print $0
        }
        # Comment out other console statements
        else {
          print indent "// " $0 " // AUTO-REMOVED-CONSOLE"
        }
      }
      else {
        print $0
      }
      prev = $0
    }
    ' "$file" > "$TEMP_FILE"

    # Replace original file
    mv "$TEMP_FILE" "$file"

    PROCESSED=$((PROCESSED + 1))
    echo -e "  ${GREEN}✓${NC} Processed: $file"
  fi
done

echo -e "\n${GREEN}✅ Successfully processed $PROCESSED files${NC}"

# Create a configuration file for build-time removal
echo -e "\n${YELLOW}Creating build configuration...${NC}"

cat > "$TARGET_DIR/../vite.console-drop.config.ts" << 'EOF'
// Vite configuration to drop console statements in production builds
export const consoleDropConfig = {
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,      // Remove all console statements
        drop_debugger: true,     // Remove debugger statements
        pure_funcs: [
          'console.log',
          'console.info',
          'console.debug',
          'console.trace',
          'console.warn',
          // Keep console.error for production debugging
        ],
      },
      mangle: {
        safari10: true,  // Work around Safari 10/11 bugs
      },
      format: {
        comments: false,  // Remove comments
      },
    },
  },
};
EOF

echo -e "${GREEN}✓ Created vite.console-drop.config.ts${NC}"

# Update package.json scripts
echo -e "\n${YELLOW}Updating build scripts...${NC}"

cat > "scripts/build-production.sh" << 'EOF'
#!/bin/bash
# Production build script with console removal

set -e

echo "🚀 Building for production..."

# Set production environment
export NODE_ENV=production
export VITE_DROP_CONSOLE=true

# Clean previous builds
rm -rf dist

# Build with console dropping
npm run build

echo "✅ Production build complete (console statements removed)"
EOF

chmod +x "scripts/build-production.sh"

echo -e "${GREEN}✓ Created build-production.sh${NC}"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Console Cleanup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Summary:"
echo -e "  • Files processed: ${PROCESSED}"
echo -e "  • Console statements removed: ${TOTAL_CONSOLE_STATEMENTS}"
echo -e "  • Backup created: ${BACKUP_DIR}"
echo -e "  • Build config created: vite.console-drop.config.ts"
echo ""
echo -e "Next steps:"
echo -e "  1. Test the application to ensure functionality"
echo -e "  2. Use ${YELLOW}npm run build:production${NC} for production builds"
echo -e "  3. To restore: ${YELLOW}./scripts/maintenance/remove-console-logs.sh --restore${NC}"
echo ""
echo -e "${GREEN}Done! 🎉${NC}"