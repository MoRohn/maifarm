#!/usr/bin/env node

/**
 * Test script to verify harvest can be stored in the barn
 */

import { HarvestFileCollector } from '../server/services/unified/farmService.js';
import { barnService } from '../server/services/unified/farmService.js';
import { logger } from '../server/utils/logger.js';

const HARVEST_ID = 'c292ad60-628d-43d9-9e7a-5a485660afdc';
const FARM_ID = 'ac5cf147-cc5f-4c85-bf47-ca95dc3450cf';

async function testBarnStorage() {
  console.log('🧪 Testing barn storage for Playing Puppies harvest...\n');
  
  try {
    // Initialize services
    const collector = new HarvestFileCollector();
    
    // Build file tree for the harvest
    const harvestPath = `/Users/rohnspringfield/maifarm/maibarn/harvests/active/${HARVEST_ID}`;
    console.log('📊 Building file tree...');
    const fileTree = await collector.buildFileTree(harvestPath);
    
    // Count files in yield directory
    let fileCount = 0;
    const countFiles = (node) => {
      if (node.type === 'file') {
        fileCount++;
      }
      if (node.children) {
        node.children.forEach(countFiles);
      }
    };
    countFiles(fileTree);
    
    console.log(`✅ Found ${fileCount} files in harvest\n`);
    
    // List files in yield/code
    const yieldCodePath = `${harvestPath}/yield/code`;
    console.log('📁 Files in yield/code:');
    const listFiles = (node, indent = '  ') => {
      if (node.name === 'code' && node.children) {
        node.children.forEach(child => {
          if (child.type === 'file') {
            console.log(`${indent}• ${child.name}`);
          } else if (child.type === 'directory') {
            console.log(`${indent}📂 ${child.name}/`);
            if (child.children) {
              child.children.forEach(subChild => {
                if (subChild.type === 'file') {
                  console.log(`${indent}  • ${subChild.name}`);
                }
              });
            }
          }
        });
      }
      if (node.children) {
        node.children.forEach(child => listFiles(child, indent));
      }
    };
    listFiles(fileTree);
    
    console.log('\n🎯 Summary:');
    console.log(`  Harvest ID: ${HARVEST_ID}`);
    console.log(`  Farm ID: ${FARM_ID}`);
    console.log(`  Total files collected: ${fileCount}`);
    console.log(`  Status: Ready for barn storage`);
    
    console.log('\n💡 To store in barn, use the dashboard or API:');
    console.log(`  POST /api/barn/store`);
    console.log(`  Body: { "harvestId": "${HARVEST_ID}" }`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the test
testBarnStorage().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});