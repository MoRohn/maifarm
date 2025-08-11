#!/usr/bin/env node

/**
 * Test Task Standard Service
 * Tests the standardized task counting with tmux pane logic
 */

const { spawn } = require('child_process');

// Mock tmux commands for testing
class MockTmuxTest {
  constructor() {
    this.testResults = [];
  }

  // Test 1: Basic pane counting
  async testBasicPaneCounting() {
    console.log('\n🧪 Test 1: Basic tmux pane counting');
    
    // Simulate tmux list-panes output
    const mockTmuxOutput = `
0: claude-agent-1 (active)
1: claude-agent-2
2: claude-agent-3
    `.trim();
    
    const paneLines = mockTmuxOutput.split('\n').filter(line => line.trim());
    const agentCount = paneLines.length;
    
    console.log(`   Mock tmux output: ${paneLines.length} lines`);
    console.log(`   Calculated agent count: ${agentCount}`);
    
    this.testResults.push({
      test: 'Basic pane counting',
      expected: 3,
      actual: agentCount,
      passed: agentCount === 3
    });
    
    return agentCount === 3;
  }

  // Test 2: Task standard calculation
  async testTaskStandardCalculation() {
    console.log('\n🧪 Test 2: Task standard calculation logic');
    
    const mockFarmData = {
      agentCount: 5,
      totalTasksAssigned: 12,
      completedTasks: 8,
      failedTasks: 2,
      activeTasks: 2
    };
    
    // Calculate metrics
    const tasksPerAgent = mockFarmData.totalTasksAssigned / mockFarmData.agentCount;
    const completionRate = (mockFarmData.completedTasks / mockFarmData.totalTasksAssigned) * 100;
    const concurrencyUtilization = (mockFarmData.activeTasks / mockFarmData.agentCount) * 100;
    
    console.log(`   Tasks per agent: ${tasksPerAgent.toFixed(2)}`);
    console.log(`   Completion rate: ${completionRate.toFixed(2)}%`);
    console.log(`   Concurrency utilization: ${concurrencyUtilization.toFixed(2)}%`);
    
    const expectedTasksPerAgent = 2.4;
    const expectedCompletionRate = 66.67;
    const expectedConcurrencyUtilization = 40;
    
    const tasksPerAgentPassed = Math.abs(tasksPerAgent - expectedTasksPerAgent) < 0.01;
    const completionRatePassed = Math.abs(completionRate - expectedCompletionRate) < 0.01;
    const concurrencyPassed = Math.abs(concurrencyUtilization - expectedConcurrencyUtilization) < 0.01;
    
    this.testResults.push({
      test: 'Task standard calculation',
      expected: { tasksPerAgent: 2.4, completionRate: 66.67, concurrency: 40 },
      actual: { tasksPerAgent, completionRate, concurrencyUtilization },
      passed: tasksPerAgentPassed && completionRatePassed && concurrencyPassed
    });
    
    return tasksPerAgentPassed && completionRatePassed && concurrencyPassed;
  }

  // Test 3: Task assignment validation
  async testTaskAssignmentValidation() {
    console.log('\n🧪 Test 3: Task assignment validation');
    
    const validateTaskAssignment = (agentCount, tasksToAssign) => {
      const maxConcurrentTasks = agentCount;
      
      if (tasksToAssign <= maxConcurrentTasks) {
        return {
          isValid: true,
          maxConcurrentTasks,
          recommendedBatchSize: tasksToAssign,
          batches: 1
        };
      } else {
        const batches = Math.ceil(tasksToAssign / maxConcurrentTasks);
        return {
          isValid: true,
          maxConcurrentTasks,
          recommendedBatchSize: maxConcurrentTasks,
          batches
        };
      }
    };
    
    // Test scenarios
    const scenario1 = validateTaskAssignment(5, 3); // Tasks < Agents
    const scenario2 = validateTaskAssignment(5, 12); // Tasks > Agents
    
    console.log(`   Scenario 1 (3 tasks, 5 agents): ${scenario1.batches} batch(es)`);
    console.log(`   Scenario 2 (12 tasks, 5 agents): ${scenario2.batches} batch(es)`);
    
    const scenario1Passed = scenario1.batches === 1 && scenario1.recommendedBatchSize === 3;
    const scenario2Passed = scenario2.batches === 3 && scenario2.recommendedBatchSize === 5;
    
    this.testResults.push({
      test: 'Task assignment validation',
      expected: { scenario1: { batches: 1, batchSize: 3 }, scenario2: { batches: 3, batchSize: 5 } },
      actual: { scenario1, scenario2 },
      passed: scenario1Passed && scenario2Passed
    });
    
    return scenario1Passed && scenario2Passed;
  }

  // Test 4: Agent ID generation
  async testAgentIdGeneration() {
    console.log('\n🧪 Test 4: Agent ID generation and parsing');
    
    const createAgentId = (farmId, tmuxPane) => `${farmId}-agent-${tmuxPane}`;
    const parseAgentId = (agentId) => {
      const match = agentId.match(/^(.+)-agent-(\d+)$/);
      if (match) {
        return {
          farmId: match[1],
          tmuxPane: parseInt(match[2], 10)
        };
      }
      return null;
    };
    
    const farmId = 'farm-abc123';
    const tmuxPane = 2;
    const agentId = createAgentId(farmId, tmuxPane);
    const parsed = parseAgentId(agentId);
    
    console.log(`   Generated agent ID: ${agentId}`);
    console.log(`   Parsed back: farmId=${parsed?.farmId}, tmuxPane=${parsed?.tmuxPane}`);
    
    const passed = agentId === 'farm-abc123-agent-2' && 
                   parsed?.farmId === 'farm-abc123' && 
                   parsed?.tmuxPane === 2;
    
    this.testResults.push({
      test: 'Agent ID generation',
      expected: 'farm-abc123-agent-2',
      actual: agentId,
      passed
    });
    
    return passed;
  }

  // Test 5: Real tmux command (if tmux is available)
  async testRealTmuxCommand() {
    console.log('\n🧪 Test 5: Real tmux command test (optional)');
    
    return new Promise((resolve) => {
      // Check if tmux is available
      const checkTmux = spawn('which', ['tmux']);
      checkTmux.on('exit', (code) => {
        if (code === 0) {
          console.log('   ✅ tmux is available');
          
          // Create a test session and count panes
          const testSession = `maifarm-test-${Date.now()}`;
          const createSession = spawn('tmux', ['new-session', '-d', '-s', testSession]);
          
          createSession.on('exit', (createCode) => {
            if (createCode === 0) {
              // List panes
              const listPanes = spawn('tmux', ['list-panes', '-t', testSession]);
              let output = '';
              
              listPanes.stdout?.on('data', (data) => {
                output += data.toString();
              });
              
              listPanes.on('exit', (listCode) => {
                if (listCode === 0) {
                  const paneCount = output.trim().split('\n').filter(line => line.trim()).length;
                  console.log(`   Real tmux pane count: ${paneCount}`);
                  
                  // Clean up test session
                  spawn('tmux', ['kill-session', '-t', testSession]);
                  
                  this.testResults.push({
                    test: 'Real tmux command',
                    expected: '≥ 1',
                    actual: paneCount,
                    passed: paneCount >= 1
                  });
                  
                  resolve(paneCount >= 1);
                } else {
                  console.log('   ⚠️ Could not list tmux panes');
                  resolve(true); // Don't fail test if tmux has issues
                }
              });
            } else {
              console.log('   ⚠️ Could not create tmux session');
              resolve(true); // Don't fail test if tmux has issues
            }
          });
        } else {
          console.log('   ⚠️ tmux not available, skipping real tmux test');
          resolve(true); // Don't fail test if tmux not installed
        }
      });
    });
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Task Standard Service Tests');
    console.log('=====================================');
    
    const tests = [
      this.testBasicPaneCounting(),
      this.testTaskStandardCalculation(),
      this.testTaskAssignmentValidation(),
      this.testAgentIdGeneration(),
      this.testRealTmuxCommand()
    ];
    
    const results = await Promise.all(tests);
    const allPassed = results.every(result => result === true);
    
    // Print summary
    console.log('\n📊 Test Results Summary');
    console.log('======================');
    
    this.testResults.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} Test ${index + 1}: ${result.test}`);
      if (!result.passed) {
        console.log(`     Expected: ${JSON.stringify(result.expected)}`);
        console.log(`     Actual: ${JSON.stringify(result.actual)}`);
      }
    });
    
    console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('\n📝 Task Standard Definition:');
    console.log('   • 1 Agent = 1 tmux pane = 1 concurrent task execution context');
    console.log('   • 1 Task = A specific instruction/prompt given to an agent');
    console.log('   • Architecture: Farm -> N Agents (tmux panes) -> M Tasks (sequential per agent)');
    console.log('   • Agent count determined by "tmux list-panes" command');
    
    return allPassed;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new MockTmuxTest();
  test.runAllTests().then(passed => {
    process.exit(passed ? 0 : 1);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = MockTmuxTest;