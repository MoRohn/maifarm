#!/bin/bash

# Fix all import references after service consolidation

echo "Fixing all service import references..."

# Define base path
SERVER_PATH="/Users/rohnspringfield/maifarm/server"

# Function to fix imports in a file
fix_file_imports() {
    local file=$1
    echo "  Fixing: $(basename $file)"

    # Fix farmLifecycleManager imports
    sed -i '' "s|from '\.\./services/farmLifecycleManager'|from '../services/unified/farmService'|g" "$file"
    sed -i '' "s|from '\./farmLifecycleManager'|from './unified/farmService'|g" "$file"
    sed -i '' "s|{ farmLifecycleManager }|{ farmService as farmLifecycleManager }|g" "$file"

    # Fix UnifiedOrchestratorService imports
    sed -i '' "s|from '\.\./services/UnifiedOrchestratorService'|from '../services/unified/orchestratorService'|g" "$file"
    sed -i '' "s|from '\./UnifiedOrchestratorService'|from './unified/orchestratorService'|g" "$file"
    sed -i '' "s|{ unifiedOrchestratorService|{ orchestratorService|g" "$file"

    # Fix OrchestratorService imports
    sed -i '' "s|from '\.\./services/OrchestratorService'|from '../services/unified/orchestratorService'|g" "$file"
    sed -i '' "s|from '\./OrchestratorService'|from './unified/orchestratorService'|g" "$file"

    # Fix farm launcher service imports
    sed -i '' "s|from '\.\./services/robustFarmLauncher'|from '../services/unified/farmService'|g" "$file"
    sed -i '' "s|from '\./robustFarmLauncher'|from './unified/farmService'|g" "$file"
    sed -i '' "s|from '\.\./services/FarmLauncherV2'|from '../services/unified/farmService'|g" "$file"
    sed -i '' "s|from '\./FarmLauncherV2'|from './unified/farmService'|g" "$file"
    sed -i '' "s|from '\.\./services/farmLaunchCoordinator'|from '../services/unified/farmService'|g" "$file"
    sed -i '' "s|from '\./farmLaunchCoordinator'|from './unified/farmService'|g" "$file"
    sed -i '' "s|from '\.\./services/farmLaunchOptimized'|from '../services/unified/farmService'|g" "$file"
    sed -i '' "s|from '\./farmLaunchOptimized'|from './unified/farmService'|g" "$file"

    # Fix agent service imports
    sed -i '' "s|from '\.\./services/agentHealthMonitor'|from '../services/unified/agentService'|g" "$file"
    sed -i '' "s|from '\./agentHealthMonitor'|from './unified/agentService'|g" "$file"
    sed -i '' "s|from '\.\./services/agentRecoveryService'|from '../services/unified/agentService'|g" "$file"
    sed -i '' "s|from '\./agentRecoveryService'|from './unified/agentService'|g" "$file"

    # Fix harvest service imports
    sed -i '' "s|from '\.\./services/harvestFileCollector'|from '../services/unified/harvestService'|g" "$file"
    sed -i '' "s|from '\./harvestFileCollector'|from './unified/harvestService'|g" "$file"
    sed -i '' "s|{ harvestFileCollector }|{ harvestService as harvestFileCollector }|g" "$file"

    # Fix barn service imports
    sed -i '' "s|from '\.\./services/barnCatalogService'|from '../services/unified/barnService'|g" "$file"
    sed -i '' "s|from '\./barnCatalogService'|from './unified/barnService'|g" "$file"
    sed -i '' "s|from '\.\./services/barnCollectionService'|from '../services/unified/barnService'|g" "$file"
    sed -i '' "s|from '\./barnCollectionService'|from './unified/barnService'|g" "$file"

    # Fix websocket service imports
    sed -i '' "s|from '\.\./services/socketManager'|from '../services/unified/websocketHub'|g" "$file"
    sed -i '' "s|from '\./socketManager'|from './unified/websocketHub'|g" "$file"
    sed -i '' "s|from '\.\./services/webSocketManager'|from '../services/unified/websocketHub'|g" "$file"
    sed -i '' "s|from '\./webSocketManager'|from './unified/websocketHub'|g" "$file"

    # Fix terminal service imports
    sed -i '' "s|from '\.\./services/terminalStreamService'|from '../services/unified/terminalService'|g" "$file"
    sed -i '' "s|from '\./terminalStreamService'|from './unified/terminalService'|g" "$file"
    sed -i '' "s|from '\.\./services/terminalOutputCache'|from '../services/unified/terminalService'|g" "$file"
    sed -i '' "s|from '\./terminalOutputCache'|from './unified/terminalService'|g" "$file"
    sed -i '' "s|from '\.\./services/terminalViewCoordinator'|from '../services/unified/terminalService'|g" "$file"
    sed -i '' "s|from '\./terminalViewCoordinator'|from './unified/terminalService'|g" "$file"

    # Fix variable name references
    sed -i '' "s|{ robustFarmLauncher }|{ farmService }|g" "$file"
    sed -i '' "s|{ FarmLauncherV2 }|{ farmService }|g" "$file"
    sed -i '' "s|{ farmLaunchCoordinator }|{ farmService }|g" "$file"
    sed -i '' "s|{ farmLaunchOptimized }|{ farmService }|g" "$file"
    sed -i '' "s|{ agentHealthMonitor }|{ agentService }|g" "$file"
    sed -i '' "s|{ agentRecoveryService }|{ agentService }|g" "$file"
    sed -i '' "s|{ barnCatalogService }|{ barnService }|g" "$file"
    sed -i '' "s|{ barnCollectionService }|{ barnService }|g" "$file"
    sed -i '' "s|{ socketManager }|{ websocketHub }|g" "$file"
    sed -i '' "s|{ webSocketManager }|{ websocketHub }|g" "$file"
    sed -i '' "s|{ terminalStreamService }|{ terminalService }|g" "$file"
    sed -i '' "s|{ terminalOutputCache }|{ terminalService }|g" "$file"
    sed -i '' "s|{ terminalViewCoordinator }|{ terminalService }|g" "$file"
}

# Find all TypeScript files and fix imports
find "$SERVER_PATH" -name "*.ts" -type f | while read -r file; do
    # Skip node_modules and dist directories
    if [[ "$file" == *"node_modules"* ]] || [[ "$file" == *"dist"* ]]; then
        continue
    fi

    fix_file_imports "$file"
done

echo "Import fixes complete!"