#!/bin/bash

#
# Logging Migration Script
# Helps identify and optionally replace console.log statements with production logger
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
API_SRC="$PROJECT_ROOT/apps/api/src"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  MaiFarm Logging Migration Tool${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Function to count console.log statements
count_console_logs() {
    local count=$(find "$API_SRC" -type f \( -name "*.ts" -o -name "*.js" \) \
        -exec grep -l "console\.\(log\|warn\|error\|debug\|info\)" {} \; 2>/dev/null | wc -l)
    echo "$count"
}

# Function to list files with console statements
list_console_files() {
    echo -e "${YELLOW}Files with console.* statements:${NC}"
    echo ""

    find "$API_SRC" -type f \( -name "*.ts" -o -name "*.js" \) \
        -exec grep -l "console\.\(log\|warn\|error\|debug\|info\)" {} \; 2>/dev/null | \
        while read file; do
            local count=$(grep -c "console\.\(log\|warn\|error\|debug\|info\)" "$file" 2>/dev/null || echo "0")
            local rel_path="${file#$PROJECT_ROOT/}"
            echo -e "  ${GREEN}$count${NC} occurrences in ${BLUE}$rel_path${NC}"
        done
}

# Function to generate migration report
generate_report() {
    local report_file="$PROJECT_ROOT/logs/logging-migration-report.md"
    mkdir -p "$PROJECT_ROOT/logs"

    echo "# Logging Migration Report" > "$report_file"
    echo "" >> "$report_file"
    echo "**Generated**: $(date)" >> "$report_file"
    echo "" >> "$report_file"

    echo "## Summary" >> "$report_file"
    echo "" >> "$report_file"
    local total_files=$(count_console_logs)
    echo "- **Total files with console statements**: $total_files" >> "$report_file"
    echo "" >> "$report_file"

    echo "## Files Requiring Migration" >> "$report_file"
    echo "" >> "$report_file"

    find "$API_SRC" -type f \( -name "*.ts" -o -name "*.js" \) \
        -exec grep -l "console\.\(log\|warn\|error\|debug\|info\)" {} \; 2>/dev/null | \
        sort | \
        while read file; do
            local count=$(grep -c "console\.\(log\|warn\|error\|debug\|info\)" "$file" 2>/dev/null || echo "0")
            local rel_path="${file#$PROJECT_ROOT/}"
            echo "### \`$rel_path\` ($count occurrences)" >> "$report_file"
            echo "" >> "$report_file"
            echo '```typescript' >> "$report_file"
            grep -n "console\.\(log\|warn\|error\|debug\|info\)" "$file" 2>/dev/null | head -10 >> "$report_file"
            if [ $(grep -c "console\.\(log\|warn\|error\|debug\|info\)" "$file" 2>/dev/null) -gt 10 ]; then
                echo "... and more" >> "$report_file"
            fi
            echo '```' >> "$report_file"
            echo "" >> "$report_file"
        done

    echo "" >> "$report_file"
    echo "## Migration Recommendations" >> "$report_file"
    echo "" >> "$report_file"
    echo "1. Replace \`console.log\` with \`logger.info\`" >> "$report_file"
    echo "2. Replace \`console.error\` with \`logger.error\`" >> "$report_file"
    echo "3. Replace \`console.warn\` with \`logger.warn\`" >> "$report_file"
    echo "4. Replace \`console.debug\` with \`logger.debug\`" >> "$report_file"
    echo "" >> "$report_file"
    echo "See \`LOGGING_STANDARDS.md\` for complete migration guide." >> "$report_file"

    echo -e "${GREEN}Report generated: $report_file${NC}"
}

# Function to show examples
show_examples() {
    echo -e "${YELLOW}Migration Examples:${NC}"
    echo ""
    echo -e "${RED}Before:${NC}"
    echo "  console.log('Farm created:', farmId);"
    echo ""
    echo -e "${GREEN}After:${NC}"
    echo "  import { logger, LogCategory } from '@/services/ProductionLogger';"
    echo "  logger.info(LogCategory.FARM, 'Farm created', { farmId });"
    echo ""
    echo -e "${RED}Before:${NC}"
    echo "  console.error('Error:', error);"
    echo ""
    echo -e "${GREEN}After:${NC}"
    echo "  logger.error(LogCategory.FARM, 'Operation failed', { error: error.message });"
    echo ""
}

# Main menu
while true; do
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  1) Count console.* statements"
    echo "  2) List files with console.* statements"
    echo "  3) Generate migration report"
    echo "  4) Show migration examples"
    echo "  5) Exit"
    echo ""
    read -p "Select option: " choice

    case $choice in
        1)
            count=$(count_console_logs)
            echo ""
            echo -e "${GREEN}Total files with console.* statements: $count${NC}"
            ;;
        2)
            echo ""
            list_console_files
            ;;
        3)
            echo ""
            generate_report
            ;;
        4)
            echo ""
            show_examples
            ;;
        5)
            echo ""
            echo -e "${GREEN}Exiting migration tool${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
done
