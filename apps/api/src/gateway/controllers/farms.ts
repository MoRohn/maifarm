import { Router } from 'express';
import { validate, commonSchemas, resourceSchemas } from '../middleware/validator.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiErrors } from '../middleware/errorHandler.js';
import { invalidateCache } from '../middleware/cache.js';
import { FarmOrchestrator } from '../services/FarmOrchestrator.js';
import { z } from 'zod';

const router = Router();
const orchestrator = new FarmOrchestrator();

// GET /farms - List all farms with pagination and filtering
router.get('/', 
  validate({ query: commonSchemas.pagination }),
  asyncHandler(async (req, res) => {
    const { page, limit, sortBy, sortOrder } = req.query as any;
    
    const farms = await orchestrator.listFarms({
      page,
      limit,
      sortBy,
      sortOrder,
      filters: req.query
    });
    
    res.locals.pagination = {
      page,
      limit,
      total: farms.total,
      hasMore: farms.hasMore
    };
    
    res.json(farms.data);
  })
);

// GET /farms/:id - Get farm details including agents and metrics
router.get('/:id',
  validate({ params: commonSchemas.idParam }),
  asyncHandler(async (req, res) => {
    const farm = await orchestrator.getFarmDetails(req.params.id);
    
    if (!farm) {
      throw ApiErrors.NotFound('Farm');
    }
    
    res.json(farm);
  })
);

// POST /farms - Create a new farm
router.post('/',
  validate({ body: resourceSchemas.createFarm }),
  asyncHandler(async (req, res) => {
    const farm = await orchestrator.createFarm(req.body);
    
    // Invalidate farms list cache
    await invalidateCache('api:cache:*farms*');
    
    res.status(201).json(farm);
  })
);

// PUT /farms/:id - Update farm configuration
router.put('/:id',
  validate({ 
    params: commonSchemas.idParam,
    body: resourceSchemas.createFarm.partial()
  }),
  asyncHandler(async (req, res) => {
    const farm = await orchestrator.updateFarm(req.params.id, req.body);
    
    if (!farm) {
      throw ApiErrors.NotFound('Farm');
    }
    
    // Invalidate specific farm cache
    await invalidateCache(`api:cache:*farms/${req.params.id}*`);
    
    res.json(farm);
  })
);

// DELETE /farms/:id - Terminate and delete farm
router.delete('/:id',
  validate({ params: commonSchemas.idParam }),
  asyncHandler(async (req, res) => {
    const result = await orchestrator.deleteFarm(req.params.id);
    
    if (!result) {
      throw ApiErrors.NotFound('Farm');
    }
    
    // Invalidate all farm-related caches
    await invalidateCache('api:cache:*farms*');
    
    res.status(204).send();
  })
);

// POST /farms/:id/agents - Add agents to farm
router.post('/:id/agents',
  validate({ 
    params: commonSchemas.idParam,
    body: z.object({
      count: z.number().min(1).max(20),
      type: z.enum(['primary', 'secondary', 'specialized']).optional()
    })
  }),
  asyncHandler(async (req, res) => {
    const agents = await orchestrator.addAgents(req.params.id, req.body);
    
    // Invalidate farm cache
    await invalidateCache(`api:cache:*farms/${req.params.id}*`);
    
    res.status(201).json(agents);
  })
);

// GET /farms/:id/agents - List farm agents
router.get('/:id/agents',
  validate({ params: commonSchemas.idParam }),
  asyncHandler(async (req, res) => {
    const agents = await orchestrator.getFarmAgents(req.params.id);
    
    res.json(agents);
  })
);

// DELETE /farms/:id/agents/:agentId - Remove agent from farm
router.delete('/:id/agents/:agentId',
  validate({ 
    params: z.object({
      id: z.string().uuid(),
      agentId: z.string().uuid()
    })
  }),
  asyncHandler(async (req, res) => {
    const result = await orchestrator.removeAgent(req.params.id, req.params.agentId);
    
    if (!result) {
      throw ApiErrors.NotFound('Agent');
    }
    
    res.status(204).send();
  })
);

// GET /farms/:id/metrics - Get farm metrics
router.get('/:id/metrics',
  validate({ 
    params: commonSchemas.idParam,
    query: commonSchemas.dateRange
  }),
  asyncHandler(async (req, res) => {
    const metrics = await orchestrator.getFarmMetrics(
      req.params.id, 
      req.query as any
    );
    
    res.json(metrics);
  })
);

// POST /farms/:id/tasks - Submit task to farm
router.post('/:id/tasks',
  validate({ 
    params: commonSchemas.idParam,
    body: resourceSchemas.createTask
  }),
  asyncHandler(async (req, res) => {
    const task = await orchestrator.submitTask(req.params.id, req.body);
    
    res.status(201).json(task);
  })
);

// GET /farms/:id/tasks - List farm tasks
router.get('/:id/tasks',
  validate({ 
    params: commonSchemas.idParam,
    query: commonSchemas.pagination
  }),
  asyncHandler(async (req, res) => {
    const tasks = await orchestrator.getFarmTasks(
      req.params.id,
      req.query as any
    );
    
    res.locals.pagination = {
      page: req.query.page as any,
      limit: req.query.limit as any,
      total: tasks.total,
      hasMore: tasks.hasMore
    };
    
    res.json(tasks.data);
  })
);

// POST /farms/:id/lifecycle/:action - Farm lifecycle actions
router.post('/:id/lifecycle/:action',
  validate({ 
    params: z.object({
      id: z.string().uuid(),
      action: z.enum(['start', 'pause', 'resume', 'stop', 'restart'])
    })
  }),
  asyncHandler(async (req, res) => {
    const result = await orchestrator.performLifecycleAction(
      req.params.id,
      req.params.action as any
    );
    
    // Invalidate farm cache
    await invalidateCache(`api:cache:*farms/${req.params.id}*`);
    
    res.json(result);
  })
);

// GET /farms/:id/harvests - Get farm harvests
router.get('/:id/harvests',
  validate({ 
    params: commonSchemas.idParam,
    query: commonSchemas.pagination
  }),
  asyncHandler(async (req, res) => {
    const harvests = await orchestrator.getFarmHarvests(
      req.params.id,
      req.query as any
    );
    
    res.locals.pagination = {
      page: req.query.page as any,
      limit: req.query.limit as any,
      total: harvests.total,
      hasMore: harvests.hasMore
    };
    
    res.json(harvests.data);
  })
);

export const farmsController = router;