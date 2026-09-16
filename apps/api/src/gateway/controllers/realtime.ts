import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { RealtimeManager } from '../services/RealtimeManager.js';

const router = Router();
const realtime = new RealtimeManager();

// WebSocket connection management
router.get('/status', asyncHandler(async (req, res) => {
  const status = await realtime.getConnectionStatus();
  res.json(status);
}));

router.post('/subscribe', asyncHandler(async (req, res) => {
  const subscription = await realtime.subscribe(req.body);
  res.json(subscription);
}));

router.post('/unsubscribe', asyncHandler(async (req, res) => {
  await realtime.unsubscribe(req.body);
  res.status(204).send();
}));

router.get('/channels', asyncHandler(async (req, res) => {
  const channels = await realtime.getAvailableChannels();
  res.json(channels);
}));

export const realtimeController = router;