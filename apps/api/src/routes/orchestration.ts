import { Router, Request, Response } from 'express';
import { FarmOrchestrationService } from '../../src/services/farmOrchestrationService';
import { WorkflowEngine } from '../../src/services/workflowEngine';
import { FailoverService } from '../../src/services/failoverService';
import { 
  FarmSetupRequest, 
  Farm, 
  FarmTemplate,
  Agent 
} from '../../src/types/orchestration';
import { Workflow } from '../../src/types/workflow';

const router = Router();
const orchestrationService = new FarmOrchestrationService();
const workflowEngine = new WorkflowEngine();

// Initialize failover service
const failoverService = new FailoverService({
  enabled: true,
  strategy: 'least-loaded',
  healthCheckInterval: 30000,
  failureThreshold: 3,
  cooldownPeriod: 60000,
  maxFailovers: 5
});

// Farm Templates
router.get('/templates', (req: Request, res: Response) => {
  try {
    const templates = orchestrationService.getTemplates();
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create Farm
router.post('/farms/create', async (req: Request, res: Response) => {
  try {
    const request: FarmSetupRequest = req.body;
    const progress = await orchestrationService.createFarm(request);
    res.json({ progress });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create farm',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all farms
router.get('/farms', (req: Request, res: Response) => {
  try {
    const farms = orchestrationService.getAllFarms();
    res.json({ farms });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch farms',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific farm
router.get('/farms/:id', (req: Request, res: Response) => {
  try {
    const farm = orchestrationService.getFarm(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    res.json({ farm });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch farm',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get farm setup progress
router.get('/farms/:id/progress', (req: Request, res: Response) => {
  try {
    const progress = orchestrationService.getSetupProgress(req.params.id);
    if (!progress) {
      return res.status(404).json({ error: 'Setup progress not found' });
    }
    res.json({ progress });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch setup progress',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Provision agents
router.post('/farms/:id/agents/provision', async (req: Request, res: Response) => {
  try {
    const { agentType, count } = req.body;
    await orchestrationService.scaleAgents(req.params.id, agentType, count);
    res.json({ success: true, message: `Provisioned ${count} ${agentType} agents` });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to provision agents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Scale agents
router.put('/farms/:id/agents/:agentId/scale', async (req: Request, res: Response) => {
  try {
    const { delta } = req.body;
    const farm = orchestrationService.getFarm(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    
    const agent = farm.agents.find(a => a.id === req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    await orchestrationService.scaleAgents(req.params.id, agent.type, delta);
    res.json({ success: true, message: `Scaled ${agent.type} agents by ${delta}` });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to scale agents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Terminate agent
router.delete('/farms/:id/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const farm = orchestrationService.getFarm(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    
    const agent = farm.agents.find(a => a.id === req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    await orchestrationService.scaleAgents(req.params.id, agent.type, -1);
    res.json({ success: true, message: `Terminated agent ${req.params.agentId}` });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to terminate agent',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create workflow
router.post('/workflows/create', async (req: Request, res: Response) => {
  try {
    const workflow: Workflow = req.body;
    // In production, save workflow to database
    res.json({ success: true, workflow });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Execute workflow
router.post('/workflows/:id/execute', async (req: Request, res: Response) => {
  try {
    const { farmId, inputs } = req.body;
    
    // In production, fetch workflow from database
    const workflow: Workflow = {
      id: req.params.id,
      name: 'Sample Workflow',
      description: 'Sample workflow for testing',
      version: '1.0.0',
      status: 'active',
      nodes: [],
      edges: [],
      variables: [],
      triggers: [],
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const execution = await workflowEngine.executeWorkflow(workflow, farmId, inputs);
    res.json({ execution });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to execute workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get workflow execution status
router.get('/workflows/:id/status', (req: Request, res: Response) => {
  try {
    const execution = workflowEngine.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    res.json({ execution });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch execution status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Retry workflow
router.post('/workflows/:id/retry', async (req: Request, res: Response) => {
  try {
    // In production, implement retry logic
    res.json({ success: true, message: 'Workflow retry initiated' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retry workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Trigger failover
router.put('/farms/:id/failover', async (req: Request, res: Response) => {
  try {
    const farm = orchestrationService.getFarm(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    
    failoverService.startMonitoring(farm);
    res.json({ success: true, message: 'Failover monitoring started' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to trigger failover',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// WebSocket events setup
export const setupOrchestrationWebSocket = (io: any) => {
  // Listen to orchestration service events
  orchestrationService.on('farm:creating', (data) => {
    io.emit('farm:creating', data);
  });

  orchestrationService.on('farm:created', (data) => {
    io.emit('farm:created', data);
  });

  orchestrationService.on('farm:failed', (data) => {
    io.emit('farm:failed', data);
  });

  orchestrationService.on('agent:provisioned', (data) => {
    io.emit('agent:provisioned', data);
  });

  orchestrationService.on('agent:terminated', (data) => {
    io.emit('agent:terminated', data);
  });

  orchestrationService.on('farm:scaled', (data) => {
    io.emit('farm:scaled', data);
  });

  orchestrationService.on('metrics:updated', (data) => {
    io.emit('metrics:updated', data);
  });

  // Listen to workflow engine events
  workflowEngine.on('workflow:started', (data) => {
    io.emit('workflow:started', data);
  });

  workflowEngine.on('workflow:completed', (data) => {
    io.emit('workflow:completed', data);
  });

  workflowEngine.on('workflow:failed', (data) => {
    io.emit('workflow:failed', data);
  });

  workflowEngine.on('node:started', (data) => {
    io.emit('node:started', data);
  });

  workflowEngine.on('node:completed', (data) => {
    io.emit('node:completed', data);
  });

  workflowEngine.on('node:failed', (data) => {
    io.emit('node:failed', data);
  });

  // Listen to failover service events
  failoverService.on('failover:monitoring:started', (data) => {
    io.emit('failover:monitoring:started', data);
  });

  failoverService.on('failover:started', (data) => {
    io.emit('failover:started', data);
  });

  failoverService.on('failover:completed', (data) => {
    io.emit('failover:completed', data);
  });

  failoverService.on('failover:failed', (data) => {
    io.emit('failover:failed', data);
  });
};

export default router;