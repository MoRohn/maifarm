#!/usr/bin/env node

/**
 * Utility script to retroactively collect files from farm workspaces
 * that weren't properly harvested.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAIBARN_PATH = path.join(__dirname, '..', 'maibarn');
const HARVEST_ID = 'c292ad60-628d-43d9-9e7a-5a485660afdc';
const FARM_ID = 'ac5cf147-cc5f-4c85-bf47-ca95dc3450cf';

async function copyDirectoryRecursive(source, target) {
  let filesCopied = 0;
  
  try {
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden directories and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        await fs.mkdir(targetPath, { recursive: true });
        const subCount = await copyDirectoryRecursive(sourcePath, targetPath);
        filesCopied += subCount;
      } else if (entry.isFile()) {
        // Skip hidden files and certain extensions
        if (entry.name.startsWith('.') || entry.name.endsWith('.log')) {
          continue;
        }
        
        await fs.copyFile(sourcePath, targetPath);
        filesCopied++;
        console.log(`  ✓ Copied: ${entry.name}`);
      }
    }
  } catch (error) {
    console.warn(`Error copying directory ${source}:`, error.message);
  }
  
  return filesCopied;
}

async function fixHarvestCollection() {
  console.log('🔧 Fixing harvest collection for Playing Puppies farm...\n');
  
  const workspacePath = path.join(MAIBARN_PATH, 'workspaces', 'active', FARM_ID);
  const harvestPath = path.join(MAIBARN_PATH, 'harvests', 'active', HARVEST_ID);
  
  console.log(`📁 Workspace: ${workspacePath}`);
  console.log(`📦 Harvest: ${harvestPath}\n`);
  
  // Check if paths exist
  try {
    await fs.access(workspacePath);
    console.log('✅ Workspace found');
  } catch {
    console.error('❌ Workspace not found!');
    process.exit(1);
  }
  
  try {
    await fs.access(harvestPath);
    console.log('✅ Harvest directory found\n');
  } catch {
    console.error('❌ Harvest directory not found!');
    process.exit(1);
  }
  
  // Define directories to scan
  const scanDirs = [
    { source: 'src', target: 'yield/code' },
    { source: 'output', target: 'yield/data' },
    { source: 'docs', target: 'yield/docs' },
    { source: 'tests', target: 'yield/code' },
    { source: 'work_claims', target: 'yield/reports' }
  ];
  
  let totalFilesCopied = 0;
  
  for (const { source, target } of scanDirs) {
    const sourcePath = path.join(workspacePath, source);
    const targetPath = path.join(harvestPath, target);
    
    try {
      await fs.access(sourcePath);
      console.log(`\n📂 Processing ${source} -> ${target}`);
      
      // Ensure target directory exists
      await fs.mkdir(targetPath, { recursive: true });
      
      // Copy all files
      const copiedCount = await copyDirectoryRecursive(sourcePath, targetPath);
      totalFilesCopied += copiedCount;
      
      if (copiedCount > 0) {
        console.log(`  ✨ Collected ${copiedCount} files from ${source}`);
      } else {
        console.log(`  ℹ️  No files found in ${source}`);
      }
    } catch {
      console.log(`  ⏭️  Skipping ${source} (directory not found)`);
    }
  }
  
  // Also copy special files from workspace root
  console.log('\n📄 Checking for special files...');
  const specialFiles = ['HARVEST_SUMMARY.md', 'COMPLETION_REPORT.txt', 'README.md'];
  
  for (const file of specialFiles) {
    const sourcePath = path.join(workspacePath, file);
    try {
      await fs.access(sourcePath);
      const targetPath = path.join(harvestPath, 'yield', 'docs', file);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      totalFilesCopied++;
      console.log(`  ✓ Copied special file: ${file}`);
    } catch {
      // File doesn't exist, skip
    }
  }
  
  // Update harvest summary
  const summaryPath = path.join(harvestPath, 'summary', 'harvest-summary.json');
  try {
    const summaryData = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
    summaryData.filesCollected = totalFilesCopied;
    summaryData.updatedAt = new Date().toISOString();
    summaryData.retroactiveCollection = true;
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2));
    console.log('\n✅ Updated harvest summary');
  } catch (error) {
    console.warn('⚠️  Could not update harvest summary:', error.message);
  }
  
  console.log(`\n🎉 Success! Collected ${totalFilesCopied} files from workspace to harvest.`);
  console.log('\n📍 Files are now available in:');
  console.log(`   ${harvestPath}/yield/`);
  console.log('\n💡 The files should now be available in the Barn after the next sync.');
}

// Run the fix
fixHarvestCollection().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});