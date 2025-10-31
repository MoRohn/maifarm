#!/usr/bin/env npx tsx

import { goWildManager } from '../../../apps/api/src/services/unified/farmService';
import { farmManager } from '../../../apps/api/src/services/unified/farmService';
import { terminalStreamService } from '../../../apps/api/src/services/unified/terminalService';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface ValidationResult {
  step: string;
  success: boolean;
  message: string;
  details?: any;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function validateGoWildFarm(): Promise<void> {
  const results: ValidationResult[] = [];
  let sessionId: string | undefined;
  let farmId: string | undefined;
  
  console.log(`${BLUE}=== GoWild Farm Validation Test ===${RESET}\n`);
  
  try {
    // Step 1: Create a farm for GoWild
    console.log(`${YELLOW}Step 1: Creating farm for GoWild session...${RESET}`);
    const farm = await farmManager.createFarm({
      name: 'GoWild Test Farm',
      description: 'Test GoWild session for validation - explore creative ways to optimize code',
      config: {
        maxAgents: 3,
        provider: 'claude',
        isGoWildMode: true,
        goWildMode: {
          enabled: true,
          creativityLevel: 0.7,
          safetyLevel: 0.8,
          explorationDepth: 5,
          allowBacktracking: true,
          maxDuration: 5 // 5 minutes for testing
        }
      }
    });
    
    farmId = farm.id;
    console.log(`  Farm created: ${farmId}`);
    
    // Step 2: Start GoWild exploration on the farm
    console.log(`${YELLOW}Step 2: Starting GoWild exploration...${RESET}`);
    const goWildConfig = {
      prompt: 'Test GoWild session for validation - explore creative ways to optimize code',
      maxDuration: 5, // 5 minutes
      agentCount: 3,
      provider: 'claude' as 'claude',
      creativityLevel: 0.7,
      safetyLevel: 0.8,
      explorationDepth: 5,
      allowBacktracking: true,
      boundaries: {
        maxContextUsage: 80,
        maxErrors: 5,
        restrictedDomains: []
      },
      focusAreas: []
    };
    
    const session = await goWildManager.startExploration(farmId, goWildConfig);
    sessionId = session.id;
    
    results.push({
      step: 'Start GoWild Session',
      success: true,
      message: `Session ${sessionId} created with farm ${farmId}`,
      details: { sessionId, farmId, status: session.status }
    });
    console.log(`${GREEN}✓ GoWild session started successfully${RESET}\n`);
    
    // Step 3: Wait for farm to be fully launched
    console.log(`${YELLOW}Step 3: Waiting for farm to be launched...${RESET}`);
    await delay(5000); // Give it 5 seconds to launch
    
    // Check farm status
    const farmStatus = await farmManager.getFarm(farmId);
    const farmActive = farmStatus && ['active', 'running', 'launching'].includes(farmStatus.status);
    
    results.push({
      step: 'Farm Launch',
      success: farmActive,
      message: farmActive ? 'Farm is active' : 'Farm failed to launch',
      details: { status: farmStatus?.status, name: farmStatus?.name }
    });
    
    if (farmActive) {
      console.log(`${GREEN}✓ Farm launched successfully (status: ${farmStatus.status})${RESET}\n`);
    } else {
      console.log(`${RED}✗ Farm failed to launch (status: ${farmStatus?.status})${RESET}\n`);
    }
    
    // Step 4: Verify tmux session exists
    console.log(`${YELLOW}Step 4: Verifying tmux session...${RESET}`);
    const sessionName = `farm-${farmId}`;
    const { stdout: tmuxCheck } = await execAsync(`tmux has-session -t ${sessionName} 2>&1; echo $?`);
    const tmuxExists = tmuxCheck.trim() === '0';
    
    results.push({
      step: 'Tmux Session',
      success: tmuxExists,
      message: tmuxExists ? 'Tmux session exists' : 'Tmux session not found',
      details: { sessionName }
    });
    
    if (tmuxExists) {
      console.log(`${GREEN}✓ Tmux session ${sessionName} exists${RESET}\n`);
      
      // Check number of panes
      const { stdout: paneCount } = await execAsync(`tmux list-panes -t ${sessionName}:0 2>/dev/null | wc -l`);
      const numPanes = parseInt(paneCount.trim());
      console.log(`  Found ${numPanes} agent panes\n`);
    } else {
      console.log(`${RED}✗ Tmux session not found${RESET}\n`);
    }
    
    // Step 5: Verify terminal streaming is active
    console.log(`${YELLOW}Step 5: Checking terminal streaming...${RESET}`);
    await delay(2000); // Give terminal streaming time to initialize
    
    // Check if terminal log files are being created
    const terminalDir = `/Users/rohnspringfield/maifarm/data/storage/maibarn/terminals/${sessionName}`;
    const { stdout: logFiles } = await execAsync(`ls -la ${terminalDir}/*.log 2>/dev/null | wc -l`).catch(() => ({ stdout: '0' }));
    const hasLogs = parseInt(logFiles.trim()) > 0;
    
    results.push({
      step: 'Terminal Streaming',
      success: hasLogs,
      message: hasLogs ? 'Terminal logs are being captured' : 'No terminal logs found',
      details: { terminalDir, logCount: parseInt(logFiles.trim()) }
    });
    
    if (hasLogs) {
      console.log(`${GREEN}✓ Terminal streaming is active (${logFiles.trim()} log files)${RESET}\n`);
      
      // Check if logs have content
      const { stdout: logContent } = await execAsync(`cat ${terminalDir}/agent-0.log 2>/dev/null | wc -l`).catch(() => ({ stdout: '0' }));
      const lines = parseInt(logContent.trim());
      console.log(`  Agent 0 log has ${lines} lines\n`);
    } else {
      console.log(`${RED}✗ Terminal streaming not working${RESET}\n`);
    }
    
    // Step 6: Monitor for 10 seconds
    console.log(`${YELLOW}Step 6: Monitoring farm for 10 seconds...${RESET}`);
    await delay(10000);
    
    // Check if farm is still active
    const farmStillActive = await farmManager.getFarm(farmId);
    const stillRunning = farmStillActive && ['active', 'running'].includes(farmStillActive.status);
    
    results.push({
      step: 'Farm Stability',
      success: stillRunning,
      message: stillRunning ? 'Farm is still running after 10s' : 'Farm stopped or failed',
      details: { finalStatus: farmStillActive?.status }
    });
    
    if (stillRunning) {
      console.log(`${GREEN}✓ Farm is stable and running${RESET}\n`);
    } else {
      console.log(`${RED}✗ Farm is no longer running (status: ${farmStillActive?.status})${RESET}\n`);
    }
    
    // Step 7: Test pause/resume
    console.log(`${YELLOW}Step 7: Testing pause/resume functionality...${RESET}`);
    if (sessionId && stillRunning) {
      await goWildManager.pauseExploration(sessionId);
      console.log('  Paused exploration');
      await delay(2000);
      
      await goWildManager.resumeExploration(sessionId);
      console.log('  Resumed exploration');
      
      results.push({
        step: 'Pause/Resume',
        success: true,
        message: 'Pause/resume worked successfully'
      });
      console.log(`${GREEN}✓ Pause/resume functionality working${RESET}\n`);
    }
    
  } catch (error) {
    console.error(`${RED}Error during validation:${RESET}`, error);
    results.push({
      step: 'Error',
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error
    });
  } finally {
    // Cleanup: Stop the session
    if (sessionId) {
      console.log(`${YELLOW}Cleaning up: Stopping GoWild session...${RESET}`);
      try {
        await goWildManager.stopExploration(sessionId);
        console.log(`${GREEN}✓ Session stopped successfully${RESET}\n`);
      } catch (error) {
        console.error(`${RED}Failed to stop session:${RESET}`, error);
      }
    }
  }
  
  // Print summary
  console.log(`${BLUE}=== Validation Summary ===${RESET}\n`);
  let successCount = 0;
  for (const result of results) {
    const icon = result.success ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`${icon} ${result.step}: ${result.message}`);
    if (result.details) {
      console.log(`   Details:`, result.details);
    }
    if (result.success) successCount++;
  }
  
  const totalTests = results.length;
  const successRate = Math.round((successCount / totalTests) * 100);
  const color = successRate === 100 ? GREEN : successRate >= 70 ? YELLOW : RED;
  
  console.log(`\n${color}Overall Success Rate: ${successCount}/${totalTests} (${successRate}%)${RESET}`);
  
  if (successRate === 100) {
    console.log(`\n${GREEN}🎉 All validation tests passed! GoWild farms are working correctly.${RESET}`);
  } else if (successRate >= 70) {
    console.log(`\n${YELLOW}⚠️ Most tests passed but some issues were found. Review the failures above.${RESET}`);
  } else {
    console.log(`\n${RED}❌ Significant issues found. GoWild farms need debugging.${RESET}`);
  }
  
  process.exit(successRate === 100 ? 0 : 1);
}

// Run the validation
console.log('Starting GoWild Farm validation...\n');
validateGoWildFarm().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});