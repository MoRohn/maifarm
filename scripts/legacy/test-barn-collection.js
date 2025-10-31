#!/usr/bin/env node

/**
 * Test script to validate Barn collection process for workspace files
 * This ensures all workspace folders are properly scanned and collected
 */

import { harvestFileCollector } from '../server/services/unified/farmService.js';
import { barnService } from '../server/services/unified/farmService.js';
import { barnCollectionService } from '../server/services/barnCollectionService.js';
import { pathConfig } from '../server/config/paths.js';
import { fileManager } from '../server/services/fileManagerService.js';
import { logger } from '../server/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_FARM_ID = 'test-barn-collection-' + Date.now();
const TEST_HARVEST_ID = 'harvest-' + TEST_FARM_ID;

async function createTestWorkspace() {
  console.log('\n📁 Creating test workspace structure...');
  
  const workspacePath = pathConfig.getFarmWorkspacePath(TEST_FARM_ID);
  
  // Create comprehensive directory structure
  const directories = [
    'src',
    'src/components',
    'src/services',
    'src/utils',
    'output',
    'output/reports',
    'output/data',
    'docs',
    'docs/api',
    'docs/guides',
    'tests',
    'tests/unit',
    'tests/integration',
    'work_claims',
    'config',  // Additional directory not in default scan
    'scripts', // Additional directory not in default scan
    'assets',  // Additional directory not in default scan
    'lib',     // Additional directory not in default scan
    '.hidden', // Hidden directory (should be skipped)
    'node_modules' // Should be skipped
  ];
  
  // Create all directories
  for (const dir of directories) {
    const dirPath = path.join(workspacePath, dir);
    await fileManager.ensureDirectory(dirPath);
  }
  
  // Create test files in various directories
  const testFiles = [
    { path: 'src/index.ts', content: 'console.log("Main entry point");' },
    { path: 'src/components/App.tsx', content: 'export const App = () => <div>App</div>;' },
    { path: 'src/services/api.ts', content: 'export const api = { fetch: () => {} };' },
    { path: 'src/utils/helpers.ts', content: 'export const helper = () => {};' },
    { path: 'output/report.json', content: JSON.stringify({ status: 'success' }, null, 2) },
    { path: 'output/data/results.csv', content: 'id,name,value\n1,test,100' },
    { path: 'docs/README.md', content: '# Test Documentation\n\nThis is a test.' },
    { path: 'docs/api/endpoints.md', content: '## API Endpoints\n\n- GET /api/test' },
    { path: 'tests/test.spec.ts', content: 'describe("test", () => { it("works", () => {}) });' },
    { path: 'work_claims/claim.txt', content: 'Work claim: Task completed successfully' },
    { path: 'config/settings.yaml', content: 'app:\n  name: test\n  version: 1.0.0' },
    { path: 'scripts/build.sh', content: '#!/bin/bash\necho "Building..."' },
    { path: 'assets/logo.svg', content: '<svg><circle cx="50" cy="50" r="40"/></svg>' },
    { path: 'lib/custom.js', content: 'module.exports = { custom: true };' },
    { path: '.hidden/secret.txt', content: 'This should be skipped' },
    { path: 'node_modules/package/index.js', content: 'This should be skipped' },
    { path: 'package.json', content: JSON.stringify({ name: 'test-farm', version: '1.0.0' }, null, 2) },
    { path: '.env', content: 'API_KEY=test123' },
    { path: 'farm.yaml', content: 'farm:\n  id: ' + TEST_FARM_ID }
  ];
  
  // Write all test files
  for (const file of testFiles) {
    const filePath = path.join(workspacePath, file.path);
    await fileManager.writeFile(filePath, file.content);
  }
  
  console.log(`✅ Created ${testFiles.length} test files in ${directories.length} directories`);
  return workspacePath;
}

async function validateCollection(workspacePath, harvestPath) {
  console.log('\n🔍 Validating collection completeness...');
  
  const issues = [];
  const expectedFiles = [
    'src/index.ts',
    'src/components/App.tsx',
    'src/services/api.ts',
    'src/utils/helpers.ts',
    'output/report.json',
    'output/data/results.csv',
    'docs/README.md',
    'docs/api/endpoints.md',
    'tests/test.spec.ts',
    'work_claims/claim.txt'
  ];
  
  // Additional files that should be collected but might not be in default scan
  const additionalExpected = [
    'config/settings.yaml',
    'scripts/build.sh',
    'assets/logo.svg',
    'lib/custom.js',
    'package.json',
    'farm.yaml'
  ];
  
  // Files that should NOT be collected
  const shouldNotExist = [
    '.hidden/secret.txt',
    'node_modules/package/index.js',
    '.env' // Sensitive file
  ];
  
  // Check expected files in yield
  for (const file of expectedFiles) {
    const category = getFileCategory(file);
    const yieldPath = path.join(harvestPath, 'yield', category, path.basename(file));
    try {
      await fs.access(yieldPath);
      console.log(`✅ Found: ${file} -> yield/${category}/`);
    } catch {
      issues.push(`❌ Missing expected file: ${file}`);
    }
  }
  
  // Check additional files (may or may not be collected based on current implementation)
  for (const file of additionalExpected) {
    const possiblePaths = [
      path.join(harvestPath, 'yield', 'code', path.basename(file)),
      path.join(harvestPath, 'yield', 'data', path.basename(file)),
      path.join(harvestPath, 'yield', 'docs', path.basename(file)),
      path.join(harvestPath, 'yield', path.basename(file))
    ];
    
    let found = false;
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        found = true;
        console.log(`✅ Found additional: ${file}`);
        break;
      } catch {
        // Continue checking other paths
      }
    }
    
    if (!found) {
      console.log(`⚠️  Not collected (might be outside scan dirs): ${file}`);
    }
  }
  
  // Verify files that should NOT be collected
  for (const file of shouldNotExist) {
    const fileName = path.basename(file);
    const possiblePaths = [
      path.join(harvestPath, 'yield', 'code', fileName),
      path.join(harvestPath, 'yield', 'data', fileName),
      path.join(harvestPath, 'yield', fileName)
    ];
    
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        issues.push(`❌ Should not have collected: ${file}`);
      } catch {
        // Good, file doesn't exist
      }
    }
  }
  
  // Count total files collected
  const yieldPath = path.join(harvestPath, 'yield');
  const collectedFiles = await countFilesRecursive(yieldPath);
  
  console.log(`\n📊 Collection Statistics:`);
  console.log(`  - Total files collected: ${collectedFiles}`);
  console.log(`  - Expected core files: ${expectedFiles.length}`);
  console.log(`  - Additional files possible: ${additionalExpected.length}`);
  console.log(`  - Files properly excluded: ${shouldNotExist.length}`);
  
  return { issues, collectedFiles };
}

function getFileCategory(filePath) {
  if (filePath.startsWith('src/') || filePath.startsWith('tests/')) return 'code';
  if (filePath.startsWith('docs/')) return 'docs';
  if (filePath.startsWith('output/')) return 'data';
  if (filePath.startsWith('work_claims/')) return 'reports';
  return 'data'; // default
}

async function countFilesRecursive(dir) {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await countFilesRecursive(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch (error) {
    // Directory might not exist
  }
  return count;
}

async function testWorkspaceScanComprehensiveness() {
  console.log('\n🔬 Testing workspace scan comprehensiveness...');
  
  const workspacePath = pathConfig.getFarmWorkspacePath(TEST_FARM_ID);
  
  // Get all files in workspace (excluding hidden and node_modules)
  const allFiles = [];
  async function scanDir(dir, basePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      const fullPath = path.join(dir, entry.name);
      
      // Skip hidden and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await scanDir(fullPath, relativePath);
      } else if (entry.isFile()) {
        allFiles.push(relativePath);
      }
    }
  }
  
  await scanDir(workspacePath);
  
  console.log(`\n📋 Workspace contains ${allFiles.length} non-hidden files:`);
  allFiles.forEach(f => console.log(`  - ${f}`));
  
  // Check which directories are being scanned
  const scannedDirs = ['src', 'output', 'docs', 'tests', 'work_claims'];
  const allDirs = new Set(allFiles.map(f => f.split('/')[0]));
  const missedDirs = [...allDirs].filter(d => !scannedDirs.includes(d) && d !== '');
  
  if (missedDirs.length > 0) {
    console.log(`\n⚠️  Directories not in default scan list:`);
    missedDirs.forEach(d => console.log(`  - ${d}/`));
  }
  
  return { allFiles, missedDirs };
}

async function runTest() {
  try {
    console.log('🚀 Starting Barn Collection Validation Test');
    console.log('=========================================');
    
    // Step 1: Create test workspace
    const workspacePath = await createTestWorkspace();
    
    // Step 2: Analyze workspace scan coverage
    const { allFiles, missedDirs } = await testWorkspaceScanComprehensiveness();
    
    // Step 3: Initialize harvest directory
    console.log('\n📦 Initializing harvest directory...');
    await harvestFileCollector.initializeHarvestDirectory(TEST_HARVEST_ID);
    
    // Step 4: Collect workspace files
    console.log('\n🌾 Collecting workspace files...');
    const filesCollected = await harvestFileCollector.collectWorkspaceFiles(
      pathConfig.getHarvestPath(TEST_HARVEST_ID),
      TEST_FARM_ID
    );
    console.log(`✅ Collection reported ${filesCollected} files collected`);
    
    // Step 5: Validate collection
    const harvestPath = pathConfig.getHarvestPath(TEST_HARVEST_ID);
    const { issues, collectedFiles } = await validateCollection(workspacePath, harvestPath);
    
    // Step 6: Report results
    console.log('\n📈 Test Results:');
    console.log('================');
    
    if (issues.length === 0) {
      console.log('✅ All expected files were collected successfully!');
    } else {
      console.log('❌ Issues found:');
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    
    if (missedDirs.length > 0) {
      console.log('\n🔧 Recommendation:');
      console.log('  Consider adding these directories to the scan list in collectWorkspaceFiles():');
      missedDirs.forEach(d => console.log(`    - '${d}'`));
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await fileManager.deleteDirectory(workspacePath);
    await fileManager.deleteDirectory(harvestPath);
    
    console.log('\n✨ Test completed!');
    
    process.exit(issues.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest();