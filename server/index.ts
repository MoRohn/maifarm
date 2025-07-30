import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// Integration with Builder coordination directory
const COORDINATION_DIR = '/tmp/claude_coordination';
const ACTIVE_AGENTS_FILE = path.join(COORDINATION_DIR, 'active_agents.json');

// In-memory store for farms and agents
const farms = new Map();
const agents = new Map();

// Watch coordination directory for changes
async function watchCoordinationDirectory() {
  try {
    const watcher = fs.watch(COORDINATION_DIR, { recursive: true });
    
    for await (const event of watcher) {
      if (event.filename === 'active_agents.json') {
        await updateActiveAgents();
      }
    }
  } catch (error) {
    console.error('Error watching coordination directory:', error);
  }
}

// Update active agents from coordination file
async function updateActiveAgents() {
  try {
    const data = await fs.readFile(ACTIVE_AGENTS_FILE, 'utf-8');
    const activeAgents = JSON.parse(data);
    
    // Update our in-memory store and notify clients
    for (const [agentId, agentData] of Object.entries(activeAgents)) {
      const existingAgent = agents.get(agentId);
      if (!existingAgent || existingAgent.status !== agentData.status) {
        agents.set(agentId, {
          id: agentId,
          ...agentData,
          lastUpdate: new Date()
        });
        
        io.emit('agent:updated', {
          id: agentId,
          ...agentData
        });
      }
    }
  } catch (error) {
    console.error('Error reading active agents:', error);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial state
  socket.emit('initial:state', {
    farms: Array.from(farms.values()),
    agents: Array.from(agents.values())
  });
  
  // Farm management
  socket.on('farm:create', async (farmData) => {
    const farmId = `farm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const farm = {
      id: farmId,
      ...farmData,
      status: 'preparing',
      agents: [],
      createdAt: new Date(),
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        efficiency: 0
      }
    };
    
    farms.set(farmId, farm);
    io.emit('farm:created', farm);
    
    // Start agents for the farm
    if (farmData.config?.yaml) {
      await startAgentsForFarm(farmId, farmData.config.yaml);
    }
  });
  
  socket.on('farm:update', ({ farmId, updates }) => {
    const farm = farms.get(farmId);
    if (farm) {
      Object.assign(farm, updates);
      farms.set(farmId, farm);
      io.emit('farm:updated', farm);
    }
  });
  
  socket.on('farm:delete', ({ farmId }) => {
    // Stop all agents in the farm
    const farm = farms.get(farmId);
    if (farm) {
      farm.agents.forEach(agentId => {
        stopAgent(agentId);
      });
      farms.delete(farmId);
      io.emit('farm:deleted', { farmId });
    }
  });
  
  socket.on('farm:pause', ({ farmId }) => {
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'paused';
      farms.set(farmId, farm);
      io.emit('farm:status', { farmId, status: 'paused' });
    }
  });
  
  socket.on('farm:resume', ({ farmId }) => {
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'running';
      farms.set(farmId, farm);
      io.emit('farm:status', { farmId, status: 'running' });
    }
  });
  
  // Agent management
  socket.on('agent:command', ({ agentId, command }) => {
    console.log(`Command for agent ${agentId}:`, command);
    // Forward command to the agent through Builder
  });
  
  // Subscription management
  socket.on('farm:subscribe', ({ farmId }) => {
    socket.join(`farm:${farmId}`);
  });
  
  socket.on('farm:unsubscribe', ({ farmId }) => {
    socket.leave(`farm:${farmId}`);
  });
  
  socket.on('agent:subscribe', ({ agentId }) => {
    socket.join(`agent:${agentId}`);
  });
  
  socket.on('agent:unsubscribe', ({ agentId }) => {
    socket.leave(`agent:${agentId}`);
  });
  
  // Request-response patterns
  socket.on('agent:status:request', ({ agentId }, callback) => {
    const agent = agents.get(agentId);
    if (agent) {
      callback({ data: agent });
    } else {
      callback({ error: 'Agent not found' });
    }
  });
  
  socket.on('farm:status:request', ({ farmId }, callback) => {
    const farm = farms.get(farmId);
    if (farm) {
      callback({ data: farm });
    } else {
      callback({ error: 'Farm not found' });
    }
  });
  
  socket.on('metrics:request', async ({ timeRange }, callback) => {
    // Aggregate metrics from all farms and agents
    const metrics = {
      farms: Array.from(farms.values()).map(f => ({
        id: f.id,
        name: f.name,
        metrics: f.metrics
      })),
      agents: Array.from(agents.values()).map(a => ({
        id: a.id,
        name: a.name,
        metrics: a.metrics || {}
      })),
      timestamp: new Date()
    };
    callback({ data: metrics });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Helper functions
async function startAgentsForFarm(farmId: string, yamlConfig: string) {
  try {
    // Save YAML config to temporary file
    const configFile = path.join('/tmp', `${farmId}_config.yaml`);
    await fs.writeFile(configFile, yamlConfig);
    
    // Start Builder with the config
    const builderProcess = spawn('builder', ['start', configFile], {
      detached: true,
      stdio: 'ignore'
    });
    
    builderProcess.unref();
    
    // Update farm status
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'running';
      farms.set(farmId, farm);
      io.emit('farm:status', { farmId, status: 'running' });
    }
  } catch (error) {
    console.error('Error starting agents:', error);
    const farm = farms.get(farmId);
    if (farm) {
      farm.status = 'failed';
      farms.set(farmId, farm);
      io.emit('farm:status', { farmId, status: 'failed' });
    }
  }
}

function stopAgent(agentId: string) {
  // Implementation to stop a specific agent
  const agent = agents.get(agentId);
  if (agent) {
    agent.status = 'terminated';
    agents.set(agentId, agent);
    io.emit('agent:status', { agentId, status: 'terminated' });
  }
}

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

app.get('/api/farms', (req, res) => {
  res.json(Array.from(farms.values()));
});

app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

app.get('/api/config', (req, res) => {
  res.json({
    maxAgents: 10,
    maxFarms: 5,
    features: {
      goWildMode: true,
      yamlGeneration: true,
      analytics: true
    }
  });
});

// Start server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`MaiFarm V2 server running on port ${PORT}`);
  watchCoordinationDirectory();
  updateActiveAgents();
});

// Periodic updates
setInterval(() => {
  updateActiveAgents();
  
  // Send metrics updates
  io.emit('metrics:update', {
    timestamp: new Date(),
    farms: farms.size,
    agents: agents.size,
    activeAgents: Array.from(agents.values()).filter(a => a.status === 'active').length
  });
}, 5000);

export default app;