#!/bin/bash

# Script to identify and remove unused files from the MaiFarm codebase
# This script will find files that are not imported anywhere

set -e

echo "================================================"
echo "MaiFarm Codebase Cleanup - Removing Unused Files"
echo "================================================"

# Arrays to track files
declare -a UNUSED_FILES=()
declare -a DUPLICATE_ORCHESTRATORS=()
declare -a UNUSED_SERVICES=()

# Function to check if a TypeScript file is imported anywhere
check_ts_import() {
  local file=$1
  local basename=$(basename "$file" .ts)
  local dirname=$(dirname "$file")

  # Check for various import patterns
  local import_count=$(grep -r "\(from.*['\"].*$basename['\"\]]\|import.*$basename\|require.*$basename\)" apps --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | grep -v "$file:" | wc -l | tr -d ' ')

  if [ "$import_count" -eq 0 ]; then
    return 1  # Not imported
  else
    return 0  # Is imported
  fi
}

# 1. Clean up duplicate orchestrator files
echo ""
echo "1. Checking for duplicate orchestrator files..."

# Remove symbolic links that point to non-existent files
if [ -L "server/orchestrators/xenosync-launcher.py" ]; then
  echo "  - Removing symlink: server/orchestrators/xenosync-launcher.py"
  rm -f server/orchestrators/xenosync-launcher.py
fi

if [ -L "server/orchestrators/xenosync-maifarm-launcher.py" ]; then
  echo "  - Removing symlink: server/orchestrators/xenosync-maifarm-launcher.py"
  rm -f server/orchestrators/xenosync-maifarm-launcher.py
fi

# Remove duplicate orchestrator files in apps/api/src/orchestrators
if [ -f "apps/api/src/orchestrators/xenosync-launcher.py" ]; then
  echo "  - Removing duplicate: apps/api/src/orchestrators/xenosync-launcher.py"
  rm -f apps/api/src/orchestrators/xenosync-launcher.py
fi

if [ -f "apps/api/src/orchestrators/xenosync-maifarm-launcher.py" ]; then
  echo "  - Removing duplicate: apps/api/src/orchestrators/xenosync-maifarm-launcher.py"
  rm -f apps/api/src/orchestrators/xenosync-maifarm-launcher.py
fi

if [ -f "apps/api/src/orchestrators/quick-task-launcher.py" ]; then
  echo "  - Removing unused: apps/api/src/orchestrators/quick-task-launcher.py"
  rm -f apps/api/src/orchestrators/quick-task-launcher.py
fi

# Remove old orchestrator_fixed.py if it exists
if [ -f "scripts/python/orchestrator_fixed.py" ]; then
  echo "  - Removing old: scripts/python/orchestrator_fixed.py"
  rm -f scripts/python/orchestrator_fixed.py
fi

# Remove root orchestrator.py if it exists (should be in scripts/python/)
if [ -f "./orchestrator.py" ]; then
  echo "  - Removing misplaced: ./orchestrator.py"
  rm -f ./orchestrator.py
fi

# 2. Clean up unused service files
echo ""
echo "2. Checking for unused TypeScript services..."

# List of known unused services based on our analysis
UNUSED_SERVICES=(
  "apps/api/src/services/farmLaunchCoordinator.ts"
  "apps/api/src/services/farmLaunchIntegration.ts"
  "apps/api/src/services/RobustFarmLaunchOrchestrator.ts"
  "apps/api/src/services/barnCatalogService.ts"
  "apps/api/src/services/barnCollectionServiceV2.ts"
  "apps/api/src/services/coordinationFileWatcher.ts"
  "apps/api/src/services/farmCompletionFix.ts"
  "apps/api/src/services/farmLaunchOptimized.ts"
  "apps/api/src/services/harvestFileCollector.ts"
  "apps/api/src/services/quickTaskExecutor.ts"
  "apps/api/src/services/robustFarmLauncher.ts"
  "apps/api/src/services/sessionCleanupService.ts"
  "apps/api/src/services/terminalOutputCache.ts"
  "apps/api/src/services/terminalStreamServiceV2.ts"
  "apps/api/src/services/terminalViewCoordinator.ts"
  "apps/api/src/services/FarmLauncherV2.ts"
  "apps/api/src/services/UnifiedOrchestratorService.ts"
)

for service in "${UNUSED_SERVICES[@]}"; do
  if [ -f "$service" ]; then
    basename=$(basename "$service" .ts)
    # Double-check it's not imported
    import_count=$(grep -r "$basename" apps --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "$service:" | grep -E "import|from" | wc -l | tr -d ' ')
    if [ "$import_count" -eq 0 ]; then
      echo "  - Removing unused service: $service"
      rm -f "$service"
    else
      echo "  - Keeping $basename (found $import_count imports)"
    fi
  fi
done

# 3. Clean up XenoSync directories with old coordination files
echo ""
echo "3. Cleaning up old XenoSync coordination files..."

# Remove old xenosync coordination files if they exist
if [ -d "apps/api/src/orchestrators/xenosync/.xenosync_coordination" ]; then
  echo "  - Removing old coordination directory"
  rm -rf apps/api/src/orchestrators/xenosync/.xenosync_coordination
fi

if [ -d "server/orchestrators/xenosync/.xenosync_coordination" ]; then
  echo "  - Removing old server coordination directory"
  rm -rf server/orchestrators/xenosync/.xenosync_coordination
fi

# 4. Clean up empty directories
echo ""
echo "4. Cleaning up empty directories..."

# Remove empty orchestrator directories
if [ -d "server/orchestrators/xenosync" ]; then
  rmdir server/orchestrators/xenosync 2>/dev/null && echo "  - Removed empty: server/orchestrators/xenosync" || true
fi

if [ -d "server/orchestrators/reapagents" ]; then
  rmdir server/orchestrators/reapagents 2>/dev/null && echo "  - Removed empty: server/orchestrators/reapagents" || true
fi

if [ -d "server/orchestrators" ]; then
  rmdir server/orchestrators 2>/dev/null && echo "  - Removed empty: server/orchestrators" || true
fi

# 5. Clean up backup directories
echo ""
echo "5. Checking for old backup directories..."

if [ -d "backup" ]; then
  echo "  - Found backup directory with redundant services"
  read -p "  Remove backup directory? (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf backup
    echo "  - Removed backup directory"
  fi
fi

# 6. Clean up duplicate API endpoint files
echo ""
echo "6. Checking for duplicate API files..."

# Check for duplicate health check endpoints
HEALTH_FILES=(
  "apps/api/src/api/health.ts"
  "apps/api/src/api/healthCheck.ts"
  "apps/api/src/api/healthz.ts"
)

active_health=""
for file in "${HEALTH_FILES[@]}"; do
  if [ -f "$file" ]; then
    import_count=$(grep -r "$(basename $file .ts)" apps/api/src/index.ts 2>/dev/null | wc -l | tr -d ' ')
    if [ "$import_count" -gt 0 ]; then
      active_health=$file
      echo "  - Active health endpoint: $file"
    fi
  fi
done

for file in "${HEALTH_FILES[@]}"; do
  if [ -f "$file" ] && [ "$file" != "$active_health" ]; then
    echo "  - Removing duplicate health endpoint: $file"
    rm -f "$file"
  fi
done

# 7. Report summary
echo ""
echo "================================================"
echo "Cleanup Summary"
echo "================================================"

# Count remaining services
service_count=$(ls apps/api/src/services/*.ts 2>/dev/null | wc -l | tr -d ' ')
api_count=$(ls apps/api/src/api/*.ts 2>/dev/null | wc -l | tr -d ' ')

echo "Remaining files:"
echo "  - Services: $service_count"
echo "  - API endpoints: $api_count"
echo ""
echo "Main orchestrator: scripts/python/orchestrator.py"
echo "Reap orchestrator: scripts/python/orchestrator_reap.py"
echo ""
echo "Cleanup complete!"