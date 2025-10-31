#!/usr/bin/env npx tsx

/**
 * Fix frontend imports that incorrectly reference backend unified services
 * Frontend should use API calls, not direct backend imports
 */

import fs from 'fs/promises';
import path from 'path';

// Map incorrect unified imports back to frontend services
const frontendFixMap = new Map<string, string>([
  // Analytics services
  ['@/services/unified/stateCoordinator', '@/services/analyticsService'],

  // Farm/Harvest/Workflow services
  ['@/services/unified/farmService', '@/services/farmService'],
]);

async function fixFile(filePath: string): Promise<boolean> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;

    for (const [incorrect, correct] of frontendFixMap) {
      const pattern = new RegExp(incorrect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (content.includes(incorrect)) {
        content = content.replace(pattern, correct);
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing frontend imports...\n');

  // List of files that need fixing based on our grep
  const filesToFix = [
    'src/components/Farm/CreateFarmFromSeed.tsx',
    'src/components/Harvest/SaveAsSeedModal.tsx',
    'src/components/Harvest/HarvestList.tsx',
    'src/components/Harvest/HarvestDashboard.tsx',
    'src/components/Harvest/HarvestPage.tsx',
    'src/components/Analytics/AnalyticsPage.tsx',
    'src/components/Analytics/AnalyticsPageSimple.tsx',
    'src/components/Analytics/Analytics.tsx',
    'src/components/Analytics/__tests__/AnalyticsPage.test.tsx',
    'src/components/Analytics/AnalyticsOverview.tsx',
    'src/components/Analytics/AnalyticsDashboard.tsx',
    'src/hooks/useBarn.ts',
    'src/hooks/useHarvest.ts',
    'src/hooks/useWorkflow.ts',
    'src/store/harvestStore.ts',
  ];

  let fixedCount = 0;

  for (const file of filesToFix) {
    const fixed = await fixFile(file);
    if (fixed) fixedCount++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('✨ Frontend Import Fix Complete!');
  console.log('='.repeat(50));
  console.log(`📊 Files fixed: ${fixedCount}/${filesToFix.length}`);
  console.log('\n📝 Next steps:');
  console.log('1. Run: npm run typecheck');
  console.log('2. Run: npm test');
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});