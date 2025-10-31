#!/usr/bin/env node
/**
 * Migration Script: Update imports to use unified services
 * This script updates all imports across the codebase to use the new consolidated services
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

interface ServiceMapping {
  oldServices: string[];
  newService: string;
  importName: string;
}

const serviceMappings: ServiceMapping[] = [
  // Coordination services
  {
    oldServices: [
      'agentCoordinator',
      'agentCoordinatorV2', 
      'coordinationService',
      'workCoordination'
    ],
    newService: 'unifiedCoordinationService',
    importName: 'unifiedCoordinationService'
  },
  
  // Tmux services
  {
    oldServices: [
      'tmuxHelper',
      'tmuxHealthMonitor',
      'tmuxHealthManager'
    ],
    newService: 'unifiedTmuxManager',
    importName: 'unifiedTmuxManager'
  },
  
  // Quick task services (keep V2 as the unified version)
  {
    oldServices: [
      'quickTaskService',
      'quickTaskExecutor',
      'simpleQuickTaskService'
    ],
    newService: 'quickTaskServiceV2',
    importName: 'quickTaskServiceV2'
  }
];

async function updateImports(filePath: string): Promise<boolean> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    
    for (const mapping of serviceMappings) {
      for (const oldService of mapping.oldServices) {
        // Pattern 1: import { serviceName } from './services/serviceName'
        const importPattern1 = new RegExp(
          `import\\s*{[^}]*\\b${oldService}\\b[^}]*}\\s*from\\s*['"]\\.+/services/${oldService}['"]`,
          'g'
        );
        
        // Pattern 2: import serviceName from './services/serviceName'
        const importPattern2 = new RegExp(
          `import\\s+${oldService}\\s+from\\s+['"]\\.+/services/${oldService}['"]`,
          'g'
        );
        
        // Pattern 3: const serviceName = require('./services/serviceName')
        const requirePattern = new RegExp(
          `const\\s+.*=\\s*require\\(['"]\\.+/services/${oldService}['"]\\)`,
          'g'
        );
        
        // Pattern 4: import { serviceName } from '../services/serviceName'
        const relativeImportPattern = new RegExp(
          `from\\s+['"](\\.+/services/)${oldService}['"]`,
          'g'
        );
        
        if (importPattern1.test(content) || importPattern2.test(content) || 
            requirePattern.test(content) || relativeImportPattern.test(content)) {
          
          // Replace with new service
          content = content.replace(importPattern1, (match) => {
            const newImport = match.replace(
              new RegExp(`\\b${oldService}\\b`, 'g'),
              mapping.importName
            ).replace(
              new RegExp(`/services/${oldService}`, 'g'),
              `/services/${mapping.newService}`
            );
            console.log(`  Updating: ${match} -> ${newImport}`);
            return newImport;
          });
          
          content = content.replace(importPattern2, (match) => {
            const newImport = `import ${mapping.importName} from '${match.match(/['"](.*)['"]/)?.[1]?.replace(oldService, mapping.newService)}'`;
            console.log(`  Updating: ${match} -> ${newImport}`);
            return newImport;
          });
          
          content = content.replace(relativeImportPattern, (match, p1) => {
            const newImport = `from '${p1}${mapping.newService}'`;
            console.log(`  Updating: ${match} -> ${newImport}`);
            return newImport;
          });
          
          // Also update any usage of the old service name in the code
          const usagePattern = new RegExp(`\\b${oldService}\\b`, 'g');
          content = content.replace(usagePattern, (match, offset) => {
            // Don't replace if it's part of a string or comment
            const lineStart = content.lastIndexOf('\n', offset);
            const lineEnd = content.indexOf('\n', offset);
            const line = content.substring(lineStart, lineEnd);
            
            if (line.includes('//') || line.includes('/*') || line.includes('"') || line.includes("'")) {
              // Check if we're in a comment or string
              const beforeMatch = content.substring(Math.max(0, offset - 50), offset);
              if (beforeMatch.includes('//') || beforeMatch.includes('"') || beforeMatch.includes("'")) {
                return match; // Don't replace
              }
            }
            
            return mapping.importName;
          });
          
          modified = true;
        }
      }
    }
    
    if (modified) {
      await fs.writeFile(filePath, content, 'utf-8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

async function findFilesToUpdate(): Promise<string[]> {
  const patterns = [
    'server/**/*.ts',
    'server/**/*.js',
    'src/**/*.ts',
    'src/**/*.tsx',
    'tests/**/*.ts'
  ];
  
  const files: string[] = [];
  const basePath = '/Users/rohnspringfield/maifarm';
  
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: basePath,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.d.ts',
        // Don't update the service files themselves
        '**/unifiedCoordinationService.ts',
        '**/unifiedTmuxManager.ts',
        '**/quickTaskServiceV2.ts'
      ]
    });
    
    files.push(...matches.map(f => path.join(basePath, f)));
  }
  
  return files;
}

async function createServiceExports(): Promise<void> {
  // Create an index file that exports all unified services
  const indexContent = `/**
 * Unified Services Export
 * This file exports all consolidated services for easy importing
 */

// Coordination Service (consolidates 4 services)
export { unifiedCoordinationService } from './unifiedCoordinationService';
export type { 
  Agent, Task, WorkClaim, FarmState, CoordinationEvent 
} from './unifiedCoordinationService';

// Tmux Manager (consolidates 3 services)
export { unifiedTmuxManager } from './unifiedTmuxManager';
export type {
  TmuxSession, TmuxPane, TmuxHealth
} from './unifiedTmuxManager';

// Quick Task Service V2 (consolidates 4 services)
export { quickTaskServiceV2 } from './quickTaskServiceV2';
export type {
  QuickTaskConfigV2, QuickTaskResultV2
} from './quickTaskServiceV2';

// Legacy exports for backward compatibility (will be removed in next phase)
export { quickTaskServiceV2 as quickTaskService } from './quickTaskServiceV2';
`;

  const indexPath = '/Users/rohnspringfield/maifarm/server/services/unified.ts';
  await fs.writeFile(indexPath, indexContent, 'utf-8');
  console.log('Created unified services export file:', indexPath);
}

async function main() {
  console.log('🔄 Starting service migration...\n');
  
  // Create unified exports file
  await createServiceExports();
  
  // Find all files that need updating
  console.log('📂 Scanning for files to update...');
  const files = await findFilesToUpdate();
  console.log(`Found ${files.length} files to check\n`);
  
  let updatedCount = 0;
  
  for (const file of files) {
    const relativePath = path.relative('/Users/rohnspringfield/maifarm', file);
    process.stdout.write(`Checking ${relativePath}...`);
    
    const updated = await updateImports(file);
    if (updated) {
      console.log(' ✅ Updated');
      updatedCount++;
    } else {
      console.log(' ⏭️  Skipped');
    }
  }
  
  console.log(`\n✨ Migration complete!`);
  console.log(`📊 Updated ${updatedCount} files`);
  
  // List deprecated files to remove
  console.log('\n🗑️  The following deprecated service files can now be removed:');
  const deprecatedFiles = [
    'server/services/agentCoordinator.ts',
    'server/services/agentCoordinatorV2.ts',
    'server/services/coordinationService.ts',
    'server/services/workCoordination.ts',
    'server/services/tmuxHelper.ts',
    'server/services/tmuxHealthMonitor.ts',
    'server/services/tmuxHealthManager.ts',
    'server/services/quickTaskService.ts',
    'server/services/quickTaskExecutor.ts',
    'server/services/simpleQuickTaskService.ts'
  ];
  
  for (const file of deprecatedFiles) {
    console.log(`  - ${file}`);
  }
  
  console.log('\nRun the following command to remove them:');
  console.log('npm run cleanup:deprecated-services');
}

// Run the migration
main().catch(console.error);