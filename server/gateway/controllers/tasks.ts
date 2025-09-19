import { Router } from 'express';
import { validate, commonSchemas, resourceSchemas } from '../middleware/validator.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { TaskOrchestrator } from '../services/TaskOrchestrator.js';

const router = Router();
const orchestrator = new TaskOrchestrator();

// Consolidated task endpoints (harvest, barn, coordination)
router.get('/', asyncHandler(async (req, res) => {
  const tasks = await orchestrator.listTasks(req.query);
  res.json(tasks);
}));

router.post('/', 
  validate({ body: resourceSchemas.createTask }),
  asyncHandler(async (req, res) => {
    const task = await orchestrator.createTask(req.body);
    res.status(201).json(task);
  })
);

router.get('/:id', asyncHandler(async (req, res) => {
  const task = await orchestrator.getTask(req.params.id);
  res.json(task);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await orchestrator.cancelTask(req.params.id);
  res.status(204).send();
}));

export const tasksController = router;