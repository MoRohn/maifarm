#!/usr/bin/env node

/**
 * Test script to validate YAML generation and task distribution
 * Tests the full flow from prompt → YAML → agent task assignment
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(title, colors.bright + colors.cyan);
  log('='.repeat(60), colors.bright);
}

async function testYamlGeneration() {
  logSection('Testing YAML Generation from Prompt');
  
  const testPrompt = "Build a React dashboard with 3 agents to create components, write tests, and document the API";
  
  try {
    // Call the YAML generation API
    const response = await fetch('http://localhost:4567/api/yaml/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: testPrompt,
        mode: 'freestyle',
        constraints: {
          maxAgents: 3
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data && result.data.yaml) {
      log('✓ YAML generated successfully', colors.green);
      
      // Parse the YAML to check structure
      const config = yaml.load(result.data.yaml);
      
      log(`\nGenerated Configuration:`, colors.blue);
      log(`  Name: ${config.name}`);
      log(`  Agents: ${config.agents ? config.agents.length : 0}`);
      
      if (config.agents) {
        log('\nAgent Details:', colors.yellow);
        config.agents.forEach((agent, idx) => {
          log(`\n  Agent ${idx + 1}: ${agent.name}`);
          log(`    Role: ${agent.role || 'Not specified'}`);
          log(`    Type: ${agent.type || 'Not specified'}`);
          
          if (agent.tasks && agent.tasks.length > 0) {
            log(`    Tasks (${agent.tasks.length}):`, colors.cyan);
            agent.tasks.forEach((task, taskIdx) => {
              const taskText = typeof task === 'string' ? task : (task.description || task.title || 'Unknown task');
              log(`      ${taskIdx + 1}. ${taskText}`);
            });
          } else {
            log(`    Tasks: None specified`, colors.red);
          }
          
          if (agent.capabilities) {
            log(`    Capabilities: ${agent.capabilities.join(', ')}`);
          }
        });
      }
      
      // Save YAML for inspection
      const yamlPath = path.join(__dirname, 'test-generated.yaml');
      fs.writeFileSync(yamlPath, result.data.yaml);
      log(`\n✓ YAML saved to: ${yamlPath}`, colors.green);
      
      return { success: true, yaml: result.data.yaml, config };
    } else {
      log('✗ YAML generation failed', colors.red);
      console.error('Response:', result);
      return { success: false };
    }
  } catch (error) {
    log(`✗ Error during YAML generation: ${error.message}`, colors.red);
    
    // Check if server is running
    if (error.message.includes('fetch failed')) {
      log('\nMake sure the MaiFarm server is running on port 4567', colors.yellow);
      log('Run: npm run dev', colors.yellow);
    }
    
    return { success: false, error };
  }
}

async function testOrchestrator(yamlPath) {
  logSection('Testing Orchestrator Task Distribution');
  
  return new Promise((resolve) => {
    // Test the orchestrator with the generated YAML
    const orchestratorPath = path.join(__dirname, 'orchestrator.py');
    
    const args = [
      orchestratorPath,
      '--num-agents', '3',
      '--prompt-file', yamlPath,
      '--session', 'test-yaml-tasks',
      '--no-kill-on-exit',
      '--max-runtime', '10'  // Run for only 10 seconds for testing
    ];
    
    log(`Running: python3 ${args.join(' ')}`, colors.blue);
    
    const proc = spawn('python3', args, {
      cwd: __dirname,
      env: { ...process.env }
    });
    
    let output = '';
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // Look for task parsing messages
      if (text.includes('Parsed agent')) {
        log(text.trim(), colors.green);
      } else if (text.includes('tasks from YAML')) {
        log(text.trim(), colors.cyan);
      } else if (text.includes('Using agent config')) {
        log(text.trim(), colors.yellow);
      } else if (text.includes('Loaded') && text.includes('agent configurations')) {
        log(text.trim(), colors.green);
      }
    });
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ERROR')) {
        log(text.trim(), colors.red);
      } else if (text.includes('[INFO]')) {
        // Show info messages that contain task/agent info
        if (text.includes('agent') || text.includes('task')) {
          log(text.trim(), colors.blue);
        }
      }
    });
    
    proc.on('close', (code) => {
      log(`\nOrchestrator exited with code ${code}`, code === 0 ? colors.green : colors.red);
      
      // Check coordination files
      checkCoordinationFiles();
      
      resolve({ success: code === 0, output });
    });
    
    // Kill after timeout
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, 15000);
  });
}

function checkCoordinationFiles() {
  logSection('Checking Coordination Files');
  
  const coordDir = path.join(__dirname, 'maibarn', 'coordination');
  
  // Create coordination directory if it doesn't exist
  if (!fs.existsSync(coordDir)) {
    log(`Coordination directory not found at: ${coordDir}`, colors.yellow);
    return;
  }
  
  // Check for agent config files
  for (let i = 0; i < 3; i++) {
    const configFile = path.join(coordDir, `agent_${i}_config.json`);
    const promptFile = path.join(coordDir, `agent_${i}_prompt.txt`);
    
    if (fs.existsSync(configFile)) {
      log(`✓ Found agent ${i} config file`, colors.green);
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        log(`  Name: ${config.name}`);
        log(`  Role: ${config.role || 'Not specified'}`);
        if (config.tasks && config.tasks.length > 0) {
          log(`  Tasks: ${config.tasks.length} assigned`, colors.cyan);
          config.tasks.forEach((task, idx) => {
            const taskText = typeof task === 'string' ? task : (task.description || task.title || 'Unknown');
            log(`    ${idx + 1}. ${taskText.substring(0, 60)}...`);
          });
        }
      } catch (e) {
        log(`  Error reading config: ${e.message}`, colors.red);
      }
    } else {
      log(`✗ Agent ${i} config file not found`, colors.yellow);
    }
    
    if (fs.existsSync(promptFile)) {
      log(`✓ Found agent ${i} prompt file`, colors.green);
      const prompt = fs.readFileSync(promptFile, 'utf-8');
      const lines = prompt.split('\n');
      
      // Check if tasks are in the prompt
      const hasTaskSection = lines.some(line => line.includes('Your Assigned Tasks:'));
      if (hasTaskSection) {
        log(`  ✓ Tasks included in prompt`, colors.green);
        
        // Show task lines
        let inTaskSection = false;
        for (const line of lines) {
          if (line.includes('Your Assigned Tasks:')) {
            inTaskSection = true;
          } else if (inTaskSection && line.trim().match(/^\d+\./)) {
            log(`    ${line.trim()}`, colors.cyan);
          } else if (inTaskSection && !line.trim().match(/^\d+\./) && line.trim()) {
            inTaskSection = false;
          }
        }
      } else {
        log(`  ✗ No task section found in prompt`, colors.red);
      }
    }
  }
}

async function cleanup() {
  logSection('Cleanup');
  
  // Kill test tmux session if it exists
  try {
    const { execSync } = await import('child_process');
    execSync('tmux kill-session -t test-yaml-tasks 2>/dev/null', { stdio: 'ignore' });
    log('✓ Cleaned up tmux session', colors.green);
  } catch (e) {
    // Session might not exist
  }
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('YAML Generation and Task Distribution Test', colors.bright + colors.cyan);
  log('='.repeat(60), colors.bright);
  
  // Test 1: Generate YAML from prompt
  const yamlResult = await testYamlGeneration();
  
  if (!yamlResult.success) {
    log('\n✗ YAML generation failed, cannot continue', colors.red);
    log('Please ensure the MaiFarm server is running (npm run dev)', colors.yellow);
    process.exit(1);
  }
  
  // Test 2: Test orchestrator with generated YAML
  const yamlPath = path.join(__dirname, 'test-generated.yaml');
  if (fs.existsSync(yamlPath)) {
    await testOrchestrator(yamlPath);
  } else {
    log('✗ YAML file not found for orchestrator test', colors.red);
  }
  
  // Cleanup
  await cleanup();
  
  logSection('Test Complete');
  log('Check the generated files and logs for detailed results', colors.cyan);
}

// Run tests
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});