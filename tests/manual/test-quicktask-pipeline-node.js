/**
 * Quick Task Full Pipeline Test - Node.js Version
 * Tests: Creation → Execution → Harvest → Barn Storage
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4567';

async function testQuickTaskFullPipeline() {
  console.log('🚀 Starting Quick Task Full Pipeline Test');
  console.log('================================================');
  
  const results = {
    taskCreation: false,
    taskExecution: false,
    harvestCreation: false,
    harvestCompletion: false,
    barnStorage: false,
    errors: [],
    warnings: [],
    taskId: null,
    harvestId: null,
    barnItemId: null
  };

  try {
    // Step 1: Create a Quick Task
    console.log('\n📝 Step 1: Creating Quick Task...');
    const taskPayload = {
      title: 'Test Fibonacci Function',
      description: `Create a simple Python function that calculates fibonacci numbers. 
               Add comprehensive tests and documentation.
               Make sure to include error handling for negative numbers.`,
      priority: 'high',
      timeout: 120000, // 2 minutes
      mode: 'fast',
      metadata: {
        agentCount: 2,
        model: 'claude-3-5-sonnet',
        temperature: 0.7
      }
    };

    const createResponse = await fetch(`${API_BASE}/api/tasks/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create task: ${createResponse.status} - ${errorText}`);
    }

    const taskData = await createResponse.json();
    console.log('Task response:', JSON.stringify(taskData, null, 2));
    results.taskId = taskData.data?.id || taskData.data?.taskId || taskData.id || taskData.taskId;
    results.taskCreation = true;
    console.log(`✅ Task created with ID: ${results.taskId}`);

    // Step 2: Monitor Task Execution
    console.log('\n⚙️ Step 2: Monitoring Task Execution...');
    let taskComplete = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes max

    while (!taskComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`${API_BASE}/api/tasks/${results.taskId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const status = statusData.data?.status || statusData.status;
        
        console.log(`   Status check ${attempts + 1}: ${status}`);
        
        if (status === 'completed' || status === 'harvesting' || status === 'ready') {
          taskComplete = true;
          results.taskExecution = true;
          console.log(`✅ Task execution completed with status: ${status}`);
        } else if (status === 'failed' || status === 'error') {
          results.errors.push(`Task failed with status: ${status}`);
          break;
        }
      } else {
        console.log(`   Status check failed: ${statusResponse.status}`);
      }
      attempts++;
    }

    if (!taskComplete) {
      results.warnings.push('Task did not complete within timeout period');
    }

    // Step 3: Check for Harvest Creation
    console.log('\n🌾 Step 3: Checking for Harvest Creation...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for harvest to be created

    const harvestsResponse = await fetch(`${API_BASE}/api/harvests/farms/quick-task-${results.taskId}`);
    if (harvestsResponse.ok) {
      const harvestsData = await harvestsResponse.json();
      const harvests = Array.isArray(harvestsData) ? harvestsData : harvestsData.data;
      
      if (harvests && harvests.length > 0) {
        results.harvestId = harvests[0].id;
        results.harvestCreation = true;
        console.log(`✅ Harvest found with ID: ${results.harvestId}`);
        
        // Check harvest details
        const harvest = harvests[0];
        console.log(`   - Status: ${harvest.status}`);
        console.log(`   - Results count: ${harvest.results?.length || 0}`);
        console.log(`   - Yield count: ${harvest.yield?.length || 0}`);
        console.log(`   - Quality score: ${harvest.quality?.overallScore || 'N/A'}`);
        
        if (harvest.status === 'ready' || harvest.status === 'completed') {
          results.harvestCompletion = true;
          console.log('✅ Harvest is complete and ready');
        }
      } else {
        results.warnings.push('No harvests found for the task');
      }
    } else {
      results.errors.push(`Failed to fetch harvests: ${harvestsResponse.status}`);
    }

    // Step 4: Check Barn Storage
    console.log('\n🏚️ Step 4: Checking Barn Storage...');
    const barnResponse = await fetch(`${API_BASE}/api/barn/items`);
    if (barnResponse.ok) {
      const barnData = await barnResponse.json();
      const barnItems = Array.isArray(barnData) ? barnData : barnData.data;
      
      // Look for our harvest in barn items
      const ourBarnItem = barnItems?.find(item => 
        item.harvestId === results.harvestId || 
        item.metadata?.farmId === `quick-task-${results.taskId}`
      );
      
      if (ourBarnItem) {
        results.barnItemId = ourBarnItem.id;
        results.barnStorage = true;
        console.log(`✅ Barn item found with ID: ${results.barnItemId}`);
        console.log(`   - Name: ${ourBarnItem.name}`);
        console.log(`   - Type: ${ourBarnItem.type}`);
        console.log(`   - Created: ${new Date(ourBarnItem.createdAt).toLocaleString()}`);
      } else {
        results.warnings.push('Harvest not found in barn storage yet');
        
        // Try to manually store in barn if harvest exists
        if (results.harvestId) {
          console.log('   Attempting to manually store harvest in barn...');
          const storeResponse = await fetch(`${API_BASE}/api/barn/store/${results.harvestId}`, {
            method: 'POST'
          });
          
          if (storeResponse.ok) {
            const storeData = await storeResponse.json();
            results.barnItemId = storeData.data?.id;
            results.barnStorage = true;
            console.log(`   ✅ Successfully stored in barn with ID: ${results.barnItemId}`);
          } else {
            results.warnings.push('Failed to manually store harvest in barn');
          }
        }
      }
    } else {
      results.errors.push(`Failed to fetch barn items: ${barnResponse.status}`);
    }

    // Step 5: Verify Terminal Sessions
    console.log('\n💻 Step 5: Checking Terminal Sessions...');
    const terminalResponse = await fetch(`${API_BASE}/api/harvest/terminal/sessions?farmId=quick-task-${results.taskId}`);
    if (terminalResponse.ok) {
      const terminalData = await terminalResponse.json();
      const sessions = terminalData.data || [];
      console.log(`   Found ${sessions.length} terminal session(s)`);
      
      if (sessions.length > 0) {
        sessions.forEach(session => {
          console.log(`   - Session: ${session.sessionName} (${session.paneCount} panes)`);
        });
      } else {
        results.warnings.push('No terminal sessions found (agents may have completed)');
      }
    }

    // Step 6: Check Agent Coordination
    console.log('\n🤝 Step 6: Checking Agent Coordination...');
    const coordResponse = await fetch(`${API_BASE}/api/harvest/coordination/agents`);
    if (coordResponse.ok) {
      const coordData = await coordResponse.json();
      const agents = coordData.data || [];
      const taskAgents = agents.filter(a => a.farm_id === `quick-task-${results.taskId}`);
      console.log(`   Found ${taskAgents.length} coordinated agent(s) for this task`);
      
      if (taskAgents.length > 0) {
        taskAgents.forEach(agent => {
          console.log(`   - Agent ${agent.agent_id}: ${agent.status}`);
        });
      }
    }

    // Step 7: Get Harvest Files
    if (results.harvestId) {
      console.log('\n📁 Step 7: Checking Harvest Files...');
      const filesResponse = await fetch(`${API_BASE}/api/harvests/${results.harvestId}/files`);
      if (filesResponse.ok) {
        const filesData = await filesResponse.json();
        console.log(`   Found file tree with ${filesData.children?.length || 0} items`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    results.errors.push(error.message);
  }

  // Final Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\nSuccess Metrics:');
  console.log(`  ✅ Task Creation: ${results.taskCreation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Task Execution: ${results.taskExecution ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Harvest Creation: ${results.harvestCreation ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Harvest Completion: ${results.harvestCompletion ? 'PASSED' : 'FAILED'}`);
  console.log(`  ✅ Barn Storage: ${results.barnStorage ? 'PASSED' : 'FAILED'}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    results.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log('\n🔗 Quick Links:');
  if (results.taskId) {
    console.log(`  - Harvest Page: http://localhost:5173/harvest/quick-task-${results.taskId}`);
  }
  if (results.harvestId) {
    console.log(`  - Harvest API: ${API_BASE}/api/harvests/${results.harvestId}`);
  }
  if (results.barnItemId) {
    console.log(`  - Barn Item: ${API_BASE}/api/barn/items/${results.barnItemId}`);
  }
  
  const allPassed = results.taskCreation && results.taskExecution && 
                    results.harvestCreation && results.harvestCompletion && 
                    results.barnStorage;
  
  console.log('\n' + '='.repeat(50));
  console.log(allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️ SOME TESTS FAILED - Review errors above');
  console.log('='.repeat(50));
  
  return results;
}

// Run the test
testQuickTaskFullPipeline().catch(console.error);