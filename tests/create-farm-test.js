/**
 * Create Farm Mode QA Testing Script
 * Tests 5-minute interval Create Farm with image generation task
 */

const API_BASE = 'http://localhost:4567';

// Test configuration
const TEST_CONFIG = {
  farmName: 'Image Generation Test Farm - 5 Minutes',
  description: 'Generate marketing images for product launch using AI',
  duration: 5, // 5 minutes
  numberOfAgents: 3,
  taskType: 'image-generation',
  imageConfig: {
    prompt: 'Create a modern tech product hero image with abstract geometric shapes',
    style: 'minimalist, professional, vibrant colors',
    format: 'png',
    resolution: '1920x1080'
  }
};

// Utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

const checkAPI = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/farms`);
    if (!response.ok && response.status !== 404) {
      throw new Error(`API not responding: ${response.status}`);
    }
    log('✅ API is healthy');
    return true;
  } catch (error) {
    log('❌ API health check failed:', error.message);
    return false;
  }
};

// Generate YAML with image generation task
function generateImageTaskYAML() {
  const yaml = `name: ${TEST_CONFIG.farmName}
description: ${TEST_CONFIG.description}
type: collaborative
agents:
  - name: Creative Director
    type: designer
    capabilities: [Design, UX/UI, Brand Strategy]
    tasks:
      - Define visual concept and brand guidelines
      - Create mood board and color palette
      - Review and approve final designs
  - name: Image Generator
    type: creator
    capabilities: [DALL-E, Stable Diffusion, Midjourney]
    tasks:
      - Generate hero image: "${TEST_CONFIG.imageConfig.prompt}"
      - Apply style: "${TEST_CONFIG.imageConfig.style}"
      - Create variations with different color schemes
      - Export in ${TEST_CONFIG.imageConfig.format} format at ${TEST_CONFIG.imageConfig.resolution}
  - name: Quality Reviewer
    type: reviewer
    capabilities: [Quality Assurance, Brand Compliance]
    tasks:
      - Review generated images for brand alignment
      - Check technical specifications
      - Provide feedback and request iterations
config:
  maxAgents: ${TEST_CONFIG.numberOfAgents}
  timeout: ${TEST_CONFIG.duration * 60}
  autoScale: true
  retryPolicy:
    enabled: true
    maxRetries: 3
  imageGeneration:
    enabled: true
    provider: dalle-3
    maxIterations: 5
    saveArtifacts: true`;

  return yaml;
}

// Test Steps
async function createFarmWithImage() {
  log('📦 Creating farm with image generation task...');
  
  const yamlContent = generateImageTaskYAML();
  
  const farmData = {
    name: TEST_CONFIG.farmName,
    description: TEST_CONFIG.description,
    type: 'collaborative',
    config: {
      autoScale: true,
      maxAgents: TEST_CONFIG.numberOfAgents,
      timeout: TEST_CONFIG.duration * 60,
      yaml: yamlContent,
      imageGeneration: TEST_CONFIG.imageConfig,
      retryPolicy: {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2
      }
    },
    tags: ['image-generation', 'test', 'marketing']
  };

  try {
    const response = await fetch(`${API_BASE}/api/farms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create farm: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const farm = result.data || result;
    log('✅ Farm created:', { 
      id: farm.id, 
      name: farm.name,
      type: farm.type,
      timeout: `${TEST_CONFIG.duration} minutes`
    });
    return farm;
  } catch (error) {
    log('❌ Failed to create farm:', error.message);
    throw error;
  }
}

async function launchFarm(farmId) {
  log('🚀 Launching farm with multi-agent setup...');
  
  try {
    const response = await fetch(`${API_BASE}/api/farms/${farmId}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numberOfAgents: TEST_CONFIG.numberOfAgents,
        collaborative: true,
        bundleSteps: 2,
        prompt: `Execute the image generation task: ${TEST_CONFIG.imageConfig.prompt}`
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to launch farm: ${response.status}`);
    }

    const result = await response.json();
    log('✅ Farm launched:', { 
      processId: result.data.processId,
      numberOfAgents: result.data.numberOfAgents,
      status: result.data.status
    });
    return result.data;
  } catch (error) {
    log('❌ Failed to launch farm:', error.message);
    throw error;
  }
}

async function monitorFarmProgress(farmId) {
  log('👀 Monitoring farm progress...');
  
  const startTime = Date.now();
  const maxDuration = (TEST_CONFIG.duration * 60 * 1000) + 30000; // Add 30s buffer
  let lastStatus = null;
  let agentCount = 0;
  let imageTaskStarted = false;
  let imageTaskCompleted = false;

  while (Date.now() - startTime < maxDuration) {
    try {
      // Check farm status
      const response = await fetch(`${API_BASE}/api/farms/${farmId}`);
      if (!response.ok) {
        log(`⚠️ Failed to fetch farm: ${response.status}`);
        await delay(5000);
        continue;
      }

      const result = await response.json();
      const farm = result.data || result;
      
      if (farm.status !== lastStatus) {
        log(`📊 Status changed: ${lastStatus || 'initial'} → ${farm.status}`);
        lastStatus = farm.status;
      }

      // Check for agents
      if (farm.agents && farm.agents.length > agentCount) {
        agentCount = farm.agents.length;
        log(`🤖 Agents active: ${agentCount}`);
        
        // Check if any agent is working on image task
        const imageAgent = farm.agents.find(a => 
          a.name?.includes('Image') || a.currentTask?.includes('image')
        );
        
        if (imageAgent && !imageTaskStarted) {
          imageTaskStarted = true;
          log('🎨 Image generation task started!');
        }
      }

      // Check metrics for task completion
      if (farm.metrics) {
        const { totalTasks, completedTasks } = farm.metrics;
        
        if (completedTasks > 0) {
          log(`📈 Progress: ${completedTasks}/${totalTasks} tasks completed`);
          
          // Check if image task is among completed
          if (completedTasks >= 2 && !imageTaskCompleted) {
            imageTaskCompleted = true;
            log('✨ Image generation task likely completed!');
          }
        }
      }

      // Check if farm completed
      if (farm.status === 'completed' || farm.status === 'harvesting') {
        log('✅ Farm reached completion status!');
        return farm;
      }

      // Check if farm failed
      if (farm.status === 'failed' || farm.status === 'error') {
        log('❌ Farm failed:', farm.error);
        throw new Error(`Farm failed: ${farm.error || 'Unknown error'}`);
      }

      // Check progress every 10 seconds
      await delay(10000);
    } catch (error) {
      log('❌ Error monitoring farm:', error.message);
      await delay(5000);
    }
  }

  log('⏱️ Farm monitoring timeout reached');
  return null;
}

async function checkTmuxSessions(farmId) {
  log('🖥️ Checking tmux sessions...');
  
  try {
    const response = await fetch(`${API_BASE}/api/harvest/terminal/sessions`);
    if (!response.ok) {
      log('⚠️ No terminal sessions found');
      return [];
    }

    const result = await response.json();
    const sessions = result.data || [];
    
    const farmSessions = sessions.filter(s => 
      s.sessionName.includes(farmId.substring(0, 8))
    );
    
    if (farmSessions.length > 0) {
      log(`✅ Found ${farmSessions.length} tmux session(s):`, farmSessions);
      
      // Check for image generation output
      for (const session of farmSessions) {
        if (session.windowName?.includes('agents')) {
          log(`📺 Agent window found: ${session.windowName}`);
        }
      }
    } else {
      log('⚠️ No tmux sessions for this farm');
    }
    
    return farmSessions;
  } catch (error) {
    log('❌ Error checking tmux sessions:', error.message);
    return [];
  }
}

async function checkHarvest(farmId) {
  log('🌾 Checking harvest data...');
  
  try {
    const response = await fetch(`${API_BASE}/api/harvests/farm/${farmId}`);
    if (!response.ok) {
      log('⚠️ No harvest data yet');
      return null;
    }

    const result = await response.json();
    const harvests = result.data || [];
    
    if (harvests.length > 0) {
      const harvest = harvests[0];
      log('✅ Harvest found:', {
        id: harvest.id,
        status: harvest.status,
        artifactCount: harvest.artifacts?.length || 0
      });
      
      // Check for image artifacts
      if (harvest.artifacts) {
        const imageArtifacts = harvest.artifacts.filter(a => 
          a.type === 'image' || a.mimeType?.startsWith('image/')
        );
        
        if (imageArtifacts.length > 0) {
          log(`🖼️ Found ${imageArtifacts.length} image artifact(s)!`);
        }
      }
      
      return harvest;
    }
    
    return null;
  } catch (error) {
    log('❌ Error checking harvest:', error.message);
    return null;
  }
}

async function createHarvest(farmId) {
  log('📦 Creating harvest from completed farm...');
  
  try {
    const response = await fetch(`${API_BASE}/api/farms/${farmId}/harvest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeArtifacts: true,
        includeImages: true
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create harvest: ${response.status}`);
    }

    const result = await response.json();
    log('✅ Harvest created:', result.data);
    return result.data;
  } catch (error) {
    log('❌ Failed to create harvest:', error.message);
    return null;
  }
}

async function stopFarm(farmId) {
  log('🛑 Stopping farm...');
  
  try {
    const response = await fetch(`${API_BASE}/api/farms/${farmId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Failed to stop: ${response.status}`);
    }

    const result = await response.json();
    log('✅ Farm stopped:', result.data);
    return result.data;
  } catch (error) {
    log('❌ Failed to stop farm:', error.message);
    return null;
  }
}

// Main test runner
async function runCreateFarmTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   Create Farm Mode QA Test - 5 Minute Image Generation');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Check API health
    const apiHealthy = await checkAPI();
    if (!apiHealthy) {
      throw new Error('API is not healthy. Please start the server first.');
    }

    // Step 2: Create farm with image generation task
    const farm = await createFarmWithImage();
    await delay(2000);

    // Step 3: Launch farm with multi-agent setup
    const launchResult = await launchFarm(farm.id);
    await delay(5000); // Give agents time to initialize

    // Step 4: Check tmux sessions
    const sessions = await checkTmuxSessions(farm.id);

    // Step 5: Monitor farm progress for 5 minutes
    log(`⏳ Monitoring for ${TEST_CONFIG.duration} minutes...`);
    const completedFarm = await monitorFarmProgress(farm.id);

    // Step 6: Check/create harvest
    let harvest = await checkHarvest(farm.id);
    if (!harvest && completedFarm) {
      harvest = await createHarvest(farm.id);
      await delay(3000);
    }

    // Step 7: Check tmux sessions again
    await checkTmuxSessions(farm.id);

    // Step 8: Generate test report
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   Test Results');
    console.log('═══════════════════════════════════════════════════════════\n');

    const testResults = {
      success: true,
      farmId: farm.id,
      processId: launchResult.processId,
      duration: `${TEST_CONFIG.duration} minutes`,
      farmCompleted: !!completedFarm,
      harvestCreated: !!harvest,
      tmuxSessionsFound: sessions.length > 0,
      imageGeneration: {
        taskIncluded: true,
        prompt: TEST_CONFIG.imageConfig.prompt,
        artifactsFound: harvest?.artifacts?.some(a => a.type === 'image') || false
      },
      finalStatus: completedFarm?.status || 'unknown'
    };

    if (completedFarm && harvest) {
      log('✅ TEST PASSED - Create Farm with image generation completed successfully!', testResults);
    } else if (completedFarm) {
      log('⚠️ TEST PARTIALLY PASSED - Farm completed but harvest issues', testResults);
    } else {
      log('❌ TEST FAILED - Farm did not complete', testResults);
    }

    // Optional: Stop farm if still running
    if (!completedFarm || completedFarm.status === 'running') {
      await stopFarm(farm.id);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

// Run the test
runCreateFarmTest().then(() => {
  console.log('\n✨ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});