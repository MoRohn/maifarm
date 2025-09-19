import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SystemService } from '../services/SystemService.js';

const router = Router();
const system = new SystemService();

// System health and administration
router.get('/health', asyncHandler(async (req, res) => {
  const health = await system.getHealth();
  res.json(health);
}));

router.get('/status', asyncHandler(async (req, res) => {
  const status = await system.getStatus();
  res.json(status);
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const token = await system.authenticate(req.body);
  res.json({ token });
}));

router.post('/auth/refresh', asyncHandler(async (req, res) => {
  const token = await system.refreshToken(req.headers.authorization);
  res.json({ token });
}));

router.get('/admin/stats', asyncHandler(async (req, res) => {
  const stats = await system.getAdminStats();
  res.json(stats);
}));

export const systemController = router;