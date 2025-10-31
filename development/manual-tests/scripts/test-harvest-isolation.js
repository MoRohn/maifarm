#!/usr/bin/env node

/**
 * Test script to validate harvest-farm 1-to-1 relationship
 * Ensures Quick Tasks and regular farms have separate, isolated harvests
 */

const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'http://localhost:4567';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function error(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

async function testHarvestIsolation() {
  log('\n=== Testing Harvest-Farm 1-to-1 Relationship ===\n', colors.bright);

  try {
    // Test data - simulate both a Quick Task and a regular farm
    const quickTaskFarmId = 'aab0223b-1234-5678-9abc-def012345678';
    const regularFarmId = 'd084be5e-9876-5432-1abc-098765432100';
    
    info('Testing Quick Task session filtering...');
    
    // Test Quick Task session filtering
    const quickTaskResponse = await fetch(`${API_URL}/api/harvest/terminal/sessions?farmId=${quickTaskFarmId}`);
    const quickTaskData = await quickTaskResponse.json();
    
    if (quickTaskData.success) {
      const quickSessions = quickTaskData.data || [];
      
      // Check that only Quick Task sessions are returned
      const hasOnlyQuickSessions = quickSessions.every(session => 
        session.sessionName.startsWith('quick_')
      );
      
      if (hasOnlyQuickSessions) {
        success(`Quick Task harvest correctly filtered: ${quickSessions.length} Quick Task session(s) found`);
        quickSessions.forEach(s => {
          info(`  - ${s.sessionName} (farmId: ${s.farmId})`);
        });
      } else {
        error('Quick Task harvest contains non-Quick Task sessions!');
        quickSessions.forEach(s => {
          const prefix = s.sessionName.split('_')[0];
          log(`  - ${s.sessionName} (type: ${prefix})`, prefix === 'quick' ? colors.green : colors.red);
        });
      }
    } else {
      error('Failed to fetch Quick Task sessions');
    }
    
    info('\nTesting regular farm session filtering...');
    
    // Test regular farm session filtering
    const farmResponse = await fetch(`${API_URL}/api/harvest/terminal/sessions?farmId=${regularFarmId}`);
    const farmData = await farmResponse.json();
    
    if (farmData.success) {
      const farmSessions = farmData.data || [];
      
      // Check that only farm sessions are returned (no quick_ sessions)
      const hasOnlyFarmSessions = farmSessions.every(session => 
        session.sessionName.startsWith('farm-') || 
        session.sessionName.startsWith('farm_') ||
        session.sessionName === 'claude_agents'
      );
      
      if (hasOnlyFarmSessions) {
        success(`Regular farm harvest correctly filtered: ${farmSessions.length} farm session(s) found`);
        farmSessions.forEach(s => {
          info(`  - ${s.sessionName} (farmId: ${s.farmId})`);
        });
      } else {
        error('Regular farm harvest contains Quick Task sessions!');
        farmSessions.forEach(s => {
          const prefix = s.sessionName.split('_')[0];
          log(`  - ${s.sessionName} (type: ${prefix})`, prefix !== 'quick' ? colors.green : colors.red);
        });
      }
    } else {
      error('Failed to fetch farm sessions');
    }
    
    info('\nTesting session isolation...');
    
    // Test that different farms don't share sessions
    const allSessionsResponse = await fetch(`${API_URL}/api/harvest/terminal/sessions`);
    const allSessionsData = await allSessionsResponse.json();
    
    if (allSessionsData.success) {
      const allSessions = allSessionsData.data || [];
      
      // Group sessions by farmId
      const sessionsByFarm = {};
      allSessions.forEach(session => {
        const farmId = session.farmId || 'unknown';
        if (!sessionsByFarm[farmId]) {
          sessionsByFarm[farmId] = [];
        }
        sessionsByFarm[farmId].push(session.sessionName);
      });
      
      // Check for any session appearing in multiple farms
      const sessionToFarms = {};
      Object.entries(sessionsByFarm).forEach(([farmId, sessions]) => {
        sessions.forEach(sessionName => {
          if (!sessionToFarms[sessionName]) {
            sessionToFarms[sessionName] = [];
          }
          sessionToFarms[sessionName].push(farmId);
        });
      });
      
      const duplicateSessions = Object.entries(sessionToFarms)
        .filter(([_, farms]) => farms.length > 1);
      
      if (duplicateSessions.length === 0) {
        success('No sessions are shared between different farms - perfect isolation!');
      } else {
        error(`Found ${duplicateSessions.length} session(s) appearing in multiple farms:`);
        duplicateSessions.forEach(([sessionName, farms]) => {
          error(`  - ${sessionName} appears in farms: ${farms.join(', ')}`);
        });
      }
      
      // Summary
      log('\n=== Session Distribution Summary ===', colors.bright);
      Object.entries(sessionsByFarm).forEach(([farmId, sessions]) => {
        const sessionTypes = sessions.map(s => {
          if (s.startsWith('quick_')) return 'Quick Task';
          if (s.startsWith('farm-') || s.startsWith('farm_')) return 'Regular Farm';
          if (s === 'claude_agents') return 'Legacy';
          return 'Unknown';
        });
        
        const uniqueTypes = [...new Set(sessionTypes)];
        info(`Farm ${farmId.substring(0, 8)}: ${sessions.length} session(s) [${uniqueTypes.join(', ')}]`);
      });
    }
    
    log('\n=== Test Complete ===\n', colors.bright);
    
  } catch (err) {
    error(`Test failed with error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Run the test
testHarvestIsolation().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});