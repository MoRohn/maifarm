#!/bin/bash

# Cleanup Script: Remove deprecated service files after migration
# Run this after successfully running migrate-to-unified-services.ts

echo "🗑️  Removing deprecated service files..."

# Coordination services (replaced by unifiedCoordinationService.ts)
rm -f server/services/agentCoordinator.ts
rm -f server/services/agentCoordinatorV2.ts
rm -f server/services/coordinationService.ts
rm -f server/services/workCoordination.ts
echo "  ✅ Removed 4 coordination services"

# Tmux services (replaced by unifiedTmuxManager.ts)
rm -f server/services/tmuxHelper.ts
rm -f server/services/tmuxHealthMonitor.ts
rm -f server/services/tmuxHealthManager.ts
echo "  ✅ Removed 3 tmux services"

# Quick task services (consolidated to quickTaskServiceV2.ts)
rm -f server/services/quickTaskService.ts
rm -f server/services/quickTaskExecutor.ts
rm -f server/services/simpleQuickTaskService.ts
echo "  ✅ Removed 3 quick task services"

# Remove old test files for deprecated services
rm -f tests/unit/agentCoordinator.test.ts
rm -f tests/unit/coordinationService.test.ts
rm -f tests/unit/tmuxHelper.test.ts
rm -f tests/unit/quickTaskService.test.ts
echo "  ✅ Removed deprecated test files"

echo ""
echo "✨ Cleanup complete! Removed 10 deprecated service files"
echo ""
echo "Next steps:"
echo "1. Run 'npm run typecheck' to verify no broken imports"
echo "2. Run 'npm test' to ensure all tests pass"
echo "3. Commit changes with message: 'refactor: Consolidate services - Phase 1'"