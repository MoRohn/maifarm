#!/usr/bin/env node

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);
const API_BASE = 'http://localhost:4567';

// Validation steps tracker
const validationSteps = {
  serverHealth: false,
  yamlGeneration: false,
  farmCreation: false,
  farmLaunch: false,
  tmuxSession: false,
  agentPanes: false,
  farmStatus: false,
  harvestCreation: false
};

// Helper function to print status
function printStatus(step, success, message) {
  const icon = success ? '✅' : '❌';
  const color = success ? chalk.green : chalk.red;
  console.log(color(`${icon} ${step}: ${message}`));
  validationSteps[step] = success;
}

// Step 1: Check server health
async function checkServerHealth() {
  try {
    const response = await axios.get(`${API_BASE}/health`);
    if (response.status === 200) {
      printStatus('serverHealth', true, 'Server is healthy');
      return true;
    }
  } catch (error) {
    printStatus('serverHealth', false, `Server not responding: ${error.message}`);
    return false;
  }
}

// Step 2: Generate YAML configuration
async function generateYAML() {
  try {
    console.log(chalk.blue('\n📝 Generating YAML configuration...'));
    const response = await axios.post(`${API_BASE}/api/yaml/generate`, {
      prompt: 'Create a REST API for managing a todo list with CRUD operations',
      num_agents: 3,
      complexity: 'moderate',
      farm_type: 'development',
      include_estimates: true,
      enhance_prompt: false
    });
    
    if (response.data?.data?.yaml) {
      printStatus('yamlGeneration', true, 'YAML generated successfully');
      console.log(chalk.gray(`   Length: ${response.data.data.yaml.length} characters`));
      return response.data.data.yaml;
    } else {
      printStatus('yamlGeneration', false, 'Invalid YAML response');
      return null;
    }
  } catch (error) {
    printStatus('yamlGeneration', false, `YAML generation failed: ${error.message}`);
    return null;
  }
}

// Step 3: Create farm
async function createFarm(yamlContent) {
  try {
    console.log(chalk.blue('\n🚜 Creating farm...'));
    const response = await axios.post(`${API_BASE}/api/farms`, {
      name: 'XenoSync Validation Test',
      description: 'Testing multi-agent orchestration with XenoSync',
      config: yamlContent,
      type: 'collaborative',
      status: 'launching',
      orchestratorType: 'xenosync',
      timeout: 300, // 5 minutes
      autoScale: false
    });
    
    const farmData = response.data.data || response.data;
    if (farmData.id) {
      printStatus('farmCreation', true, `Farm created with ID: ${farmData.id}`);
      return farmData.id;
    } else {
      printStatus('farmCreation', false, 'No farm ID returned');
      return null;
    }
  } catch (error) {
    printStatus('farmCreation', false, `Farm creation failed: ${error.message}`);
    if (error.response?.data) {
      console.log(chalk.red('   Error details:', JSON.stringify(error.response.data, null, 2)));
    }
    return null;
  }
}

// Step 4: Launch farm with orchestrator
async function launchFarm(farmId) {
  try {
    console.log(chalk.blue('\n🚀 Launching farm with XenoSync...'));
    const response = await axios.post(`${API_BASE}/api/farms/${farmId}/launch`, {
      numberOfAgents: 3,
      prompt: 'Create a REST API for managing a todo list',
      collaborative: true,
      staggerDelay: 2,
      debug: false
    });
    
    if (response.data.success) {
      const processId = response.data.data?.processId || 'unknown';
      printStatus('farmLaunch', true, `Farm launched with process: ${processId}`);
      return true;
    } else {
      printStatus('farmLaunch', false, 'Launch reported failure');
      return false;
    }
  } catch (error) {
    printStatus('farmLaunch', false, `Farm launch failed: ${error.message}`);
    if (error.response?.data) {
      console.log(chalk.red('   Error details:', JSON.stringify(error.response.data, null, 2)));
    }
    return false;
  }
}

// Step 5: Verify tmux session
async function verifyTmuxSession(farmId) {
  try {
    console.log(chalk.blue('\n📺 Verifying tmux session...'));
    
    // Wait a bit for session creation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    const { stdout } = await execAsync(`tmux list-sessions 2>/dev/null | grep ${sessionName} || echo "NOT_FOUND"`);
    
    if (stdout.includes('NOT_FOUND')) {
      // Try XenoSync default session
      const { stdout: xenosyncCheck } = await execAsync(`tmux list-sessions 2>/dev/null | grep xenosync-hive || echo "NOT_FOUND"`);
      if (!xenosyncCheck.includes('NOT_FOUND')) {
        printStatus('tmuxSession', true, 'Using XenoSync default session (xenosync-hive)');
        return 'xenosync-hive';
      } else {
        printStatus('tmuxSession', false, 'No tmux session found');
        return null;
      }
    } else {
      printStatus('tmuxSession', true, `Tmux session created: ${sessionName}`);
      return sessionName;
    }
  } catch (error) {
    printStatus('tmuxSession', false, `Tmux verification failed: ${error.message}`);
    return null;
  }
}

// Step 6: Verify agent panes
async function verifyAgentPanes(sessionName) {
  try {
    console.log(chalk.blue('\n👥 Verifying agent panes...'));
    
    const { stdout } = await execAsync(`tmux list-panes -t ${sessionName}:agents -F "#{pane_index}:#{pane_title}" 2>/dev/null || echo "NO_PANES"`);
    
    if (stdout.includes('NO_PANES')) {
      // Try window 0 instead of "agents"
      const { stdout: altCheck } = await execAsync(`tmux list-panes -t ${sessionName}:0 -F "#{pane_index}:#{pane_title}" 2>/dev/null || echo "NO_PANES"`);
      if (!altCheck.includes('NO_PANES')) {
        const panes = altCheck.trim().split('\n').filter(p => p);
        printStatus('agentPanes', true, `Found ${panes.length} agent panes`);
        panes.forEach(pane => {
          console.log(chalk.gray(`   Pane: ${pane}`));
        });
        return panes.length;
      } else {
        printStatus('agentPanes', false, 'No agent panes found');
        return 0;
      }
    } else {
      const panes = stdout.trim().split('\n').filter(p => p);
      printStatus('agentPanes', true, `Found ${panes.length} agent panes`);
      panes.forEach(pane => {
        console.log(chalk.gray(`   Pane: ${pane}`));
      });
      return panes.length;
    }
  } catch (error) {
    printStatus('agentPanes', false, `Pane verification failed: ${error.message}`);
    return 0;
  }
}

// Step 7: Check farm status
async function checkFarmStatus(farmId) {
  try {
    console.log(chalk.blue('\n📊 Checking farm status...'));
    
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const response = await axios.get(`${API_BASE}/api/farms/${farmId}`);
      const farm = response.data.data || response.data;
      
      console.log(chalk.gray(`   Attempt ${attempts + 1}: Status = ${farm.status}`));
      
      if (farm.status === 'active' || farm.status === 'running' || farm.status === 'launching') {
        printStatus('farmStatus', true, `Farm is ${farm.status}`);
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    
    printStatus('farmStatus', false, 'Farm not in expected state');
    return false;
  } catch (error) {
    printStatus('farmStatus', false, `Status check failed: ${error.message}`);
    return false;
  }
}

// Step 8: Verify harvest creation
async function verifyHarvest(farmId) {
  try {
    console.log(chalk.blue('\n🌾 Verifying harvest...'));
    
    const response = await axios.get(`${API_BASE}/api/harvests/farm/${farmId}`);
    const harvests = response.data.data || response.data;
    
    if (harvests && harvests.length > 0) {
      printStatus('harvestCreation', true, `Found ${harvests.length} harvest(s)`);
      return true;
    } else {
      printStatus('harvestCreation', false, 'No harvests found');
      return false;
    }
  } catch (error) {
    // Harvest might not exist yet, which is okay
    printStatus('harvestCreation', false, `Harvest check: ${error.message}`);
    return false;
  }
}

// Main validation function
async function validate() {
  console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.cyan('   MaiFarm XenoSync Integration Validation'));
  console.log(chalk.bold.cyan('='.repeat(60)));
  
  // Check server health first
  const serverHealthy = await checkServerHealth();
  if (!serverHealthy) {
    console.log(chalk.red('\n❌ Server is not running. Please start with: npm run dev'));
    process.exit(1);
  }
  
  // Generate YAML
  const yamlContent = await generateYAML();
  if (!yamlContent) {
    console.log(chalk.red('\n❌ Cannot proceed without YAML'));
    process.exit(1);
  }
  
  // Create farm
  const farmId = await createFarm(yamlContent);
  if (!farmId) {
    console.log(chalk.red('\n❌ Cannot proceed without farm'));
    process.exit(1);
  }
  
  // Launch farm
  const launched = await launchFarm(farmId);
  
  // Verify tmux session
  const sessionName = await verifyTmuxSession(farmId);
  
  // Verify agent panes
  if (sessionName) {
    await verifyAgentPanes(sessionName);
  }
  
  // Check farm status
  await checkFarmStatus(farmId);
  
  // Verify harvest
  await verifyHarvest(farmId);
  
  // Print summary
  console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.cyan('   Validation Summary'));
  console.log(chalk.bold.cyan('='.repeat(60)));
  
  const passedSteps = Object.values(validationSteps).filter(v => v).length;
  const totalSteps = Object.keys(validationSteps).length;
  const allPassed = passedSteps === totalSteps;
  
  Object.entries(validationSteps).forEach(([step, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(color(`${icon} ${step}: ${passed ? 'PASSED' : 'FAILED'}`));
  });
  
  console.log(chalk.bold(`\n📊 Result: ${passedSteps}/${totalSteps} tests passed`));
  
  if (allPassed) {
    console.log(chalk.bold.green('\n🎉 All validation tests PASSED!'));
    console.log(chalk.cyan(`\n📍 View the farm at: http://localhost:3000/harvest/${farmId}`));
    if (sessionName) {
      console.log(chalk.cyan(`📺 Attach to tmux: tmux attach -t ${sessionName}`));
    }
  } else {
    console.log(chalk.bold.yellow('\n⚠️  Some tests failed. Please check the details above.'));
  }
  
  // Cleanup instructions
  if (sessionName) {
    console.log(chalk.gray(`\n🧹 To clean up: tmux kill-session -t ${sessionName}`));
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run validation
validate().catch(error => {
  console.error(chalk.red('\n❌ Validation script error:'), error);
  process.exit(1);
});