#!/usr/bin/env node

/**
 * Test script for 5-minute timeout enforcement
 * Tests QuickTask, Farm, and GoWild modes to ensure they properly timeout after 5 minutes
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const API_BASE = 'http://localhost:4567/api';
const TEST_TIMEOUT_MS = 330000; // 5.5 minutes to allow for 5-minute timeout + cleanup

// Create axios instance with default headers
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'X-Bypass-Auth': 'true', // Bypass authentication for testing
    'X-Test-Mode': 'true'
  }
});

class TimeoutTester {
  constructor() {
    this.results = {
      quickTask: { passed: false, details: null },
      farm: { passed: false, details: null },
      goWild: { passed: false, details: null },
      cleanup: { passed: false, details: null }
    };
    this.startTime = Date.now();
  }

  log(message, level = 'INFO') {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${elapsed}s] [${level}]`;
    console.log(`${prefix} ${message}`);
  }

  async checkServerHealth() {
    try {
      const response = await api.get('/health');
      // Accept both 200 (healthy) and 503 (degraded - usually Redis missing)
      return response.status === 200 || response.status === 503;
    } catch (error) {
      // Also check if we got a 503 in the error response
      if (error.response?.status === 503) {
        return true;
      }
      return false;
    }
  }

  async testQuickTaskTimeout() {
    this.log('Testing QuickTask 5-minute timeout...', 'TEST');
    const taskStart = Date.now();
    
    try {
      // Create a long-running quick task
      const createResponse = await api.post('/tasks/quick', {
        description: `Create a test task that will take more than 5 minutes:
          1. Analyze every file in the codebase
          2. Generate comprehensive documentation for each file
          3. Create unit tests for every function
          4. Run performance analysis on all components
          5. Generate detailed reports for everything
          This is an intentionally long task to test timeout behavior.`,
        title: 'Timeout Test Task',
        priority: 'high',
        timeout: 300000, // 5 minutes
        metadata: {
          testType: 'timeout-enforcement',
          expectedTimeout: 300000
        }
      });

      const taskId = createResponse.data.data?.id || createResponse.data.id || createResponse.data.taskId;
      this.log(`QuickTask created with ID: ${taskId}`);

      // Monitor the task
      let lastStatus = null;
      let timedOut = false;
      let elapsedAtTimeout = 0;

      while (true) {
        const elapsed = Math.floor((Date.now() - taskStart) / 1000);
        
        try {
          const statusResponse = await api.get(`/tasks/${taskId}/status`);
          const status = statusResponse.data.status;
          
          if (status !== lastStatus) {
            this.log(`QuickTask status changed: ${lastStatus} -> ${status} at ${elapsed}s`);
            lastStatus = status;
          }

          // Check if task was terminated due to timeout
          if (status === 'timeout' || status === 'failed' || status === 'terminated') {
            elapsedAtTimeout = elapsed;
            timedOut = true;
            
            // Verify it happened around 5 minutes (300 seconds)
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            
            this.results.quickTask = {
              passed: timeoutOccurredCorrectly,
              details: {
                taskId,
                finalStatus: status,
                timeoutAfter: elapsed,
                expectedRange: '295-310 seconds',
                message: statusResponse.data.message || 'No message'
              }
            };

            this.log(`QuickTask timeout test ${timeoutOccurredCorrectly ? 'PASSED' : 'FAILED'}: Timed out after ${elapsed}s`, 
                    timeoutOccurredCorrectly ? 'SUCCESS' : 'ERROR');
            break;
          }

          // Safety check - fail if task runs longer than expected
          if (elapsed > 320) {
            this.results.quickTask = {
              passed: false,
              details: {
                taskId,
                error: 'Task did not timeout within expected timeframe',
                elapsedTime: elapsed
              }
            };
            this.log('QuickTask timeout test FAILED: Task exceeded maximum wait time', 'ERROR');
            break;
          }

        } catch (statusError) {
          // Task might have been cleaned up
          if (statusError.response?.status === 404) {
            this.log(`QuickTask ${taskId} no longer exists (cleaned up) at ${elapsed}s`);
            timedOut = true;
            elapsedAtTimeout = elapsed;
            
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            this.results.quickTask = {
              passed: timeoutOccurredCorrectly,
              details: {
                taskId,
                cleanedUp: true,
                timeoutAfter: elapsed
              }
            };
            break;
          }
          throw statusError;
        }

        // Wait 5 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      this.results.quickTask = {
        passed: false,
        details: {
          error: error.message,
          stack: error.stack
        }
      };
      this.log(`QuickTask timeout test error: ${error.message}`, 'ERROR');
    }
  }

  async testFarmTimeout() {
    this.log('Testing Farm 5-minute timeout...', 'TEST');
    const farmStart = Date.now();
    
    try {
      // Create a farm with long-running task
      const createResponse = await api.post('/farms`, {
        name: `timeout-test-farm-${Date.now()}`,
        agents: [
          {
            name: 'LongRunner1',
            prompt: 'Analyze and document every single file in the entire codebase in extreme detail'
          },
          {
            name: 'LongRunner2', 
            prompt: 'Create comprehensive test suites for every module in the system'
          }
        ],
        coordinationType: 'sequential',
        timeoutMinutes: 5 // Explicitly set 5-minute timeout
      });

      const farmId = createResponse.data.data?.id || createResponse.data.id || createResponse.data.farmId;
      this.log(`Farm created with ID: ${farmId}`);

      // Start the farm
      await api.post('/farms/${farmId}/start`);
      this.log('Farm started');

      // Monitor farm status
      let lastStatus = null;
      let timedOut = false;

      while (true) {
        const elapsed = Math.floor((Date.now() - farmStart) / 1000);
        
        try {
          const statusResponse = await api.get('/farms/${farmId}/status`);
          const status = statusResponse.data.status;
          
          if (status !== lastStatus) {
            this.log(`Farm status changed: ${lastStatus} -> ${status} at ${elapsed}s`);
            lastStatus = status;
          }

          // Check for timeout
          if (status === 'timeout' || status === 'failed' || status === 'terminated') {
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            
            this.results.farm = {
              passed: timeoutOccurredCorrectly,
              details: {
                farmId,
                finalStatus: status,
                timeoutAfter: elapsed,
                agents: statusResponse.data.agents
              }
            };

            this.log(`Farm timeout test ${timeoutOccurredCorrectly ? 'PASSED' : 'FAILED'}: Timed out after ${elapsed}s`,
                    timeoutOccurredCorrectly ? 'SUCCESS' : 'ERROR');
            break;
          }

          if (elapsed > 320) {
            this.results.farm = {
              passed: false,
              details: {
                farmId,
                error: 'Farm did not timeout within expected timeframe',
                elapsedTime: elapsed
              }
            };
            this.log('Farm timeout test FAILED: Exceeded maximum wait time', 'ERROR');
            break;
          }

        } catch (statusError) {
          if (statusError.response?.status === 404) {
            this.log(`Farm ${farmId} cleaned up at ${elapsed}s`);
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            this.results.farm = {
              passed: timeoutOccurredCorrectly,
              details: { farmId, cleanedUp: true, timeoutAfter: elapsed }
            };
            break;
          }
          throw statusError;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      this.results.farm = {
        passed: false,
        details: { error: error.message }
      };
      this.log(`Farm timeout test error: ${error.message}`, 'ERROR');
    }
  }

  async testGoWildTimeout() {
    this.log('Testing GoWild 5-minute timeout...', 'TEST');
    const goWildStart = Date.now();
    
    try {
      // Start GoWild session
      const startResponse = await api.post('/gowild/start`, {
        context: 'Test GoWild timeout enforcement after 5 minutes',
        constraints: {
          maxIterations: 1000, // High number to ensure it would run long
          timeoutMinutes: 5
        }
      });

      const sessionId = startResponse.data.data?.id || startResponse.data.id || startResponse.data.sessionId;
      this.log(`GoWild session started with ID: ${sessionId}`);

      // Monitor GoWild status
      let lastStatus = null;
      let timedOut = false;

      while (true) {
        const elapsed = Math.floor((Date.now() - goWildStart) / 1000);
        
        try {
          const statusResponse = await api.get('/gowild/${sessionId}/status`);
          const status = statusResponse.data.status;
          
          if (status !== lastStatus) {
            this.log(`GoWild status changed: ${lastStatus} -> ${status} at ${elapsed}s`);
            lastStatus = status;
          }

          // Check for timeout
          if (status === 'timeout' || status === 'stopped' || status === 'failed') {
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            
            this.results.goWild = {
              passed: timeoutOccurredCorrectly,
              details: {
                sessionId,
                finalStatus: status,
                timeoutAfter: elapsed,
                iterations: statusResponse.data.iterations
              }
            };

            this.log(`GoWild timeout test ${timeoutOccurredCorrectly ? 'PASSED' : 'FAILED'}: Timed out after ${elapsed}s`,
                    timeoutOccurredCorrectly ? 'SUCCESS' : 'ERROR');
            break;
          }

          if (elapsed > 320) {
            this.results.goWild = {
              passed: false,
              details: {
                sessionId,
                error: 'GoWild did not timeout within expected timeframe',
                elapsedTime: elapsed
              }
            };
            this.log('GoWild timeout test FAILED: Exceeded maximum wait time', 'ERROR');
            break;
          }

        } catch (statusError) {
          if (statusError.response?.status === 404) {
            this.log(`GoWild session ${sessionId} cleaned up at ${elapsed}s`);
            const timeoutOccurredCorrectly = elapsed >= 295 && elapsed <= 310;
            this.results.goWild = {
              passed: timeoutOccurredCorrectly,
              details: { sessionId, cleanedUp: true, timeoutAfter: elapsed }
            };
            break;
          }
          throw statusError;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (error) {
      this.results.goWild = {
        passed: false,
        details: { error: error.message }
      };
      this.log(`GoWild timeout test error: ${error.message}`, 'ERROR');
    }
  }

  async testCleanupAfterTimeout() {
    this.log('Testing cleanup after timeout...', 'TEST');
    
    try {
      // Check tmux sessions
      const { stdout: tmuxList } = await execAsync('tmux list-sessions 2>/dev/null || echo "No sessions"');
      const activeTmuxSessions = tmuxList.split('\n').filter(line => 
        line.includes('claude_') || line.includes('agent_')
      );

      // Check process cleanup
      const { stdout: processList } = await execAsync('ps aux | grep -E "(claude|python.*xenosync)" | grep -v grep || echo "No processes"');
      const activeProcesses = processList.split('\n').filter(line => line.trim());

      // Check coordination files
      const { stdout: coordFiles } = await execAsync('ls -la /tmp/claude_coordination/ 2>/dev/null || echo "No coordination directory"');
      
      const cleanupSuccessful = 
        activeTmuxSessions.length === 0 && 
        activeProcesses.length === 0;

      this.results.cleanup = {
        passed: cleanupSuccessful,
        details: {
          tmuxSessions: activeTmuxSessions.length,
          processes: activeProcesses.length,
          tmuxDetails: activeTmuxSessions.slice(0, 3),
          processDetails: activeProcesses.slice(0, 3)
        }
      };

      this.log(`Cleanup test ${cleanupSuccessful ? 'PASSED' : 'FAILED'}`, 
              cleanupSuccessful ? 'SUCCESS' : 'WARNING');

    } catch (error) {
      this.results.cleanup = {
        passed: false,
        details: { error: error.message }
      };
      this.log(`Cleanup test error: ${error.message}`, 'ERROR');
    }
  }

  async runAllTests() {
    this.log('Starting 5-minute timeout enforcement tests', 'START');
    this.log('This test will take approximately 5-6 minutes per test mode');
    
    // Check server health first
    const serverHealthy = await this.checkServerHealth();
    if (!serverHealthy) {
      this.log('Server is not responding. Please start the server first.', 'ERROR');
      process.exit(1);
    }

    // Run tests sequentially to avoid interference
    await this.testQuickTaskTimeout();
    await this.testFarmTimeout();
    await this.testGoWildTimeout();
    await this.testCleanupAfterTimeout();

    // Print results
    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('5-MINUTE TIMEOUT ENFORCEMENT TEST RESULTS');
    console.log('='.repeat(80));

    const allPassed = Object.values(this.results).every(r => r.passed);
    
    for (const [testName, result] of Object.entries(this.results)) {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`\n${testName.toUpperCase()}: ${status}`);
      if (result.details) {
        console.log('Details:', JSON.stringify(result.details, null, 2));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`OVERALL: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('='.repeat(80));

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
  }
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  process.exit(1);
});

// Run the tests
const tester = new TimeoutTester();
tester.runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
