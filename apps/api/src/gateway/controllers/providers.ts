import { Router } from 'express';
import { validate, resourceSchemas } from '../middleware/validator.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ProviderManager } from '../services/ProviderManager.js';

const router = Router();
const manager = new ProviderManager();

// Unified provider management (claude, openai, llama, ollama)
router.get('/', asyncHandler(async (req, res) => {
  const providers = await manager.listProviders();
  res.json(providers);
}));

router.post('/configure',
  validate({ body: resourceSchemas.configureProvider }),
  asyncHandler(async (req, res) => {
    const result = await manager.configureProvider(req.body);
    res.json(result);
  })
);

router.get('/:provider/status', asyncHandler(async (req, res) => {
  const status = await manager.getProviderStatus(req.params.provider);
  res.json(status);
}));

router.post('/:provider/test', asyncHandler(async (req, res) => {
  const result = await manager.testProvider(req.params.provider);
  res.json(result);
}));

export const providersController = router;