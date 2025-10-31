#!/bin/bash

# MaiFarm Import Fix Script
# Updates imports to use unified services after consolidation

echo "==========================================="
echo "MaiFarm Import Reference Fix"
echo "==========================================="
echo

# Define base paths
SERVER_PATH="/Users/rohnspringfield/maifarm/server"

# Define replacement mappings
declare -A REPLACEMENTS=(
    # Terminal services
    ["terminalStreamService"]="unified/terminalService"
    ["terminalOutputCache"]="unified/terminalService"
    ["terminalViewCoordinator"]="unified/terminalService"

    # Orchestrator services
    ["OrchestratorService"]="unified/orchestratorService"
    ["UnifiedOrchestratorService"]="unified/orchestratorService"

    # Farm services
    ["robustFarmLauncher"]="unified/farmService"
    ["FarmLauncherV2"]="unified/farmService"
    ["farmLaunchCoordinator"]="unified/farmService"
    ["farmLaunchOptimized"]="unified/farmService"
    ["farmLifecycleManager"]="unified/farmService"

    # Agent services
    ["agentHealthMonitor"]="unified/agentService"
    ["agentRecoveryService"]="unified/agentService"

    # Harvest services
    ["harvestFileCollector"]="unified/harvestService"

    # Barn services
    ["barnCatalogService"]="unified/barnService"
    ["barnCollectionService"]="unified/barnService"

    # Socket management
    ["socketManager"]="unified/websocketHub"
    ["webSocketManager"]="unified/websocketHub"
)

echo "Fixing import references..."
echo

FIXED_COUNT=0
FAILED_COUNT=0

# Process each mapping
for OLD_SERVICE in "${!REPLACEMENTS[@]}"; do
    NEW_SERVICE="${REPLACEMENTS[$OLD_SERVICE]}"

    echo "Processing: $OLD_SERVICE → $NEW_SERVICE"

    # Find files with the old import
    FILES=$(grep -r "from.*['\"].*$OLD_SERVICE['\"]" "$SERVER_PATH" --include="*.ts" --include="*.js" -l 2>/dev/null)

    if [ -n "$FILES" ]; then
        while IFS= read -r file; do
            echo "  Updating: $(basename "$file")"

            # Create backup
            cp "$file" "$file.bak"

            # Perform replacement
            # Handle different import patterns
            sed -i '' \
                -e "s|from ['\"].*/$OLD_SERVICE['\"]|from './$NEW_SERVICE'|g" \
                -e "s|from ['\"].*$OLD_SERVICE['\"]|from './$NEW_SERVICE'|g" \
                -e "s|import.*$OLD_SERVICE.*from|import { terminalService } from|g" \
                "$file"

            # Check if successful
            if [ $? -eq 0 ]; then
                ((FIXED_COUNT++))
                # Remove backup if successful
                rm "$file.bak"
            else
                echo "    ✗ Failed to update"
                ((FAILED_COUNT++))
                # Restore from backup
                mv "$file.bak" "$file"
            fi
        done <<< "$FILES"
    fi
done

echo
echo "==========================================="
echo "Import fixes complete!"
echo "==========================================="
echo "  Fixed: $FIXED_COUNT imports"
echo "  Failed: $FAILED_COUNT imports"
echo

# Check for any remaining issues
echo "Checking for any remaining issues..."
ISSUES=0

for OLD_SERVICE in "${!REPLACEMENTS[@]}"; do
    REMAINING=$(grep -r "from.*['\"].*$OLD_SERVICE['\"]" "$SERVER_PATH" --include="*.ts" --include="*.js" 2>/dev/null | wc -l)

    if [ $REMAINING -gt 0 ]; then
        echo "  ⚠ Still found $REMAINING references to $OLD_SERVICE"
        ((ISSUES++))
    fi
done

if [ $ISSUES -eq 0 ]; then
    echo "  ✓ All imports have been updated successfully!"
else
    echo "  ⚠ Some imports may need manual review"
fi

echo
echo "Next steps:"
echo "1. Run 'npm run typecheck' to verify TypeScript compilation"
echo "2. Test the application to ensure everything works"
echo "3. Commit the changes once verified"
echo