#!/usr/bin/env node

/**
 * Simple script to verify harvest files were collected
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARVEST_PATH = path.join(__dirname, '..', 'maibarn', 'harvests', 'active', 'c292ad60-628d-43d9-9e7a-5a485660afdc');

async function countFiles(dir) {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await countFiles(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch (error) {
    // Directory doesn't exist
  }
  return count;
}

async function verifyHarvest() {
  console.log('🔍 Verifying Playing Puppies harvest files...\n');
  
  const yieldPath = path.join(HARVEST_PATH, 'yield');
  
  // Check each yield subdirectory
  const dirs = ['code', 'docs', 'data', 'reports'];
  let totalFiles = 0;
  
  for (const dir of dirs) {
    const dirPath = path.join(yieldPath, dir);
    const fileCount = await countFiles(dirPath);
    if (fileCount > 0) {
      console.log(`✅ ${dir.padEnd(8)} - ${fileCount} file(s)`);
      
      // List files for code directory
      if (dir === 'code') {
        console.log('   Files:');
        const listFilesRecursive = async (basePath, indent = '   ') => {
          try {
            const entries = await fs.readdir(basePath, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile()) {
                console.log(`${indent}• ${entry.name}`);
              } else if (entry.isDirectory()) {
                console.log(`${indent}📂 ${entry.name}/`);
                await listFilesRecursive(path.join(basePath, entry.name), indent + '  ');
              }
            }
          } catch {
            // Skip if can't read
          }
        };
        await listFilesRecursive(dirPath);
      }
    } else {
      console.log(`⚪ ${dir.padEnd(8)} - empty`);
    }
    totalFiles += fileCount;
  }
  
  console.log(`\n📊 Total files in harvest: ${totalFiles}`);
  
  // Read harvest summary
  try {
    const summaryPath = path.join(HARVEST_PATH, 'summary', 'harvest-summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
    console.log('\n📋 Harvest Summary:');
    console.log(`   Farm: ${summary.farmName}`);
    console.log(`   Agents: ${summary.agentCount}`);
    console.log(`   Files Collected: ${summary.filesCollected || 'N/A'}`);
    console.log(`   Retroactive: ${summary.retroactiveCollection ? 'Yes' : 'No'}`);
  } catch {
    console.log('\n⚠️  Could not read harvest summary');
  }
  
  if (totalFiles > 0) {
    console.log('\n✨ Success! The harvest contains files ready for the Barn.');
  } else {
    console.log('\n⚠️  Warning: No files found in harvest yield directories.');
  }
}

// Run verification
verifyHarvest().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});