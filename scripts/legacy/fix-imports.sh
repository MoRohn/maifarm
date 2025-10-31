#!/bin/bash

# Fix orchestratorService imports
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' \
  "s/import { orchestratorService } from '..\/services\/unified\/farmService'/import { unifiedOrchestratorService as orchestratorService } from '..\/services\/UnifiedOrchestratorService'/g" {} \;

# Fix farmManager imports
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' \
  "s/import { farmManager } from '..\/services\/unified\/farmService'/import { farmService as farmManager } from '..\/services\/unified\/farmService'/g" {} \;

# Fix harvestService imports from farmService
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' \
  "s/import { harvestService } from '..\/services\/unified\/farmService'/import { harvestService } from '..\/services\/harvestService'/g" {} \;

# Fix harvestFileCollector imports
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' \
  "s/import { harvestFileCollector } from '..\/services\/unified\/farmService'/import { harvestFileCollector } from '..\/services\/harvestFileCollector'/g" {} \;

echo "Fixed imports"