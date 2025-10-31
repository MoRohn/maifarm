#!/bin/bash

# MaiFarm Service Consolidation Cleanup Script
# Removes redundant service implementations that have been consolidated into unified services

echo "==========================================="
echo "MaiFarm Service Consolidation Cleanup"
echo "==========================================="
echo

# Define base path
SERVICE_PATH="/Users/rohnspringfield/maifarm/server/services"
BACKUP_DIR="/Users/rohnspringfield/maifarm/backup/redundant-services-$(date +%Y%m%d-%H%M%S)"

# Create backup directory
echo "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# List of redundant services to remove (consolidated into unified services)
REDUNDANT_SERVICES=(
    # Farm launchers (consolidated into unified/farmService.ts)
    "FarmLauncherV2.ts"
    "farmLaunchCoordinator.ts"
    "farmLaunchOptimized.ts"
    "robustFarmLauncher.ts"
    "farmLifecycleManager.ts"
    "farmCompletionFix.ts"

    # Terminal services (consolidated into unified/terminalService.ts)
    "terminalOutputCache.ts"
    "terminalStreamService.ts"
    "terminalViewCoordinator.ts"

    # Orchestration duplicates
    "OrchestratorService.ts"
    "UnifiedOrchestratorService.ts"
    "aiOrchestrationEngine.ts"
    "orchestratorEnhanced.ts"

    # Agent management duplicates
    "agentCoordinator.ts"
    "agentMonitor.ts"
    "agentLifecycleManager.ts"
    "agentHealthMonitor.ts"
    "agentRecoveryService.ts"

    # Harvest duplicates
    "harvestCollector.ts"
    "harvestFileCollector.ts"
    "harvestOptimizer.ts"

    # Quick task duplicates
    "quickTaskExecutor.ts"
    "quickTaskOrchestrator.ts"

    # Barn duplicates
    "barnCollectionService.ts"
    "barnCatalogService.ts"

    # Session management duplicates
    "sessionManager.ts"
    "sessionCleanupService.ts"

    # Coordination duplicates
    "coordinationFileWatcher.ts"
    "workCoordination.ts"

    # Metrics duplicates
    "metricsCollector.ts"
    "performanceMonitor.ts"

    # Cache duplicates
    "cacheManager.ts"
    "cacheService.ts"

    # WebSocket duplicates
    "webSocketManager.ts"
    "socketManager.ts"
)

echo "Services to be backed up and removed:"
echo "--------------------------------------"

# Count services to remove
COUNT=0
for service in "${REDUNDANT_SERVICES[@]}"; do
    if [ -f "$SERVICE_PATH/$service" ]; then
        echo "  - $service"
        ((COUNT++))
    fi
done

echo
echo "Total: $COUNT redundant services found"
echo

# Confirm before proceeding
read -p "Do you want to proceed with backup and removal? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo
echo "Backing up and removing redundant services..."
echo

# Backup and remove each service
SUCCESS=0
FAILED=0

for service in "${REDUNDANT_SERVICES[@]}"; do
    if [ -f "$SERVICE_PATH/$service" ]; then
        echo -n "  Processing $service... "

        # Backup the file
        cp "$SERVICE_PATH/$service" "$BACKUP_DIR/" 2>/dev/null

        if [ $? -eq 0 ]; then
            # Remove the file
            rm "$SERVICE_PATH/$service"

            if [ $? -eq 0 ]; then
                echo "✓ Backed up and removed"
                ((SUCCESS++))
            else
                echo "✗ Failed to remove (backup created)"
                ((FAILED++))
            fi
        else
            echo "✗ Failed to backup"
            ((FAILED++))
        fi
    fi
done

echo
echo "==========================================="
echo "Cleanup Complete"
echo "==========================================="
echo "  Removed: $SUCCESS services"
echo "  Failed:  $FAILED services"
echo "  Backup:  $BACKUP_DIR"
echo

# Check for any remaining imports of removed services
echo "Checking for references to removed services..."
echo

ISSUES=0
for service in "${REDUNDANT_SERVICES[@]}"; do
    SERVICE_NAME="${service%.ts}"

    # Search for imports of this service
    REFS=$(grep -r "from.*['\"].*$SERVICE_NAME['\"]" "$SERVICE_PATH" 2>/dev/null | grep -v "$BACKUP_DIR" | wc -l)

    if [ $REFS -gt 0 ]; then
        echo "  ⚠ Found $REFS references to $SERVICE_NAME"
        ((ISSUES++))
    fi
done

if [ $ISSUES -eq 0 ]; then
    echo "  ✓ No references to removed services found"
else
    echo
    echo "  ⚠ Warning: Found references to removed services"
    echo "  You may need to update imports in the affected files"
fi

echo
echo "Next steps:"
echo "1. Update any remaining imports to use unified services"
echo "2. Test the application to ensure everything works"
echo "3. If issues arise, restore from: $BACKUP_DIR"
echo

# Create restoration script
RESTORE_SCRIPT="$BACKUP_DIR/restore.sh"
cat > "$RESTORE_SCRIPT" << 'EOF'
#!/bin/bash
# Restoration script for redundant services

echo "Restoring services from backup..."
BACKUP_DIR="$(dirname "$0")"
SERVICE_PATH="/Users/rohnspringfield/maifarm/server/services"

for file in "$BACKUP_DIR"/*.ts; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "  Restoring $filename..."
        cp "$file" "$SERVICE_PATH/"
    fi
done

echo "Restoration complete!"
EOF

chmod +x "$RESTORE_SCRIPT"
echo "Restoration script created: $RESTORE_SCRIPT"
echo

echo "==========================================="
echo "Service consolidation cleanup complete!"
echo "==========================================="