import { Router } from 'express';
import { validate, commonSchemas } from '../middleware/validator.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AnalyticsService } from '../services/AnalyticsService.js';

const router = Router();
const analytics = new AnalyticsService();

// Consolidated analytics and metrics
router.get('/overview', asyncHandler(async (req, res) => {
  const overview = await analytics.getOverview();
  res.json(overview);
}));

router.get('/metrics',
  validate({ query: commonSchemas.dateRange }),
  asyncHandler(async (req, res) => {
    const metrics = await analytics.getMetrics(req.query);
    res.json(metrics);
  })
);

router.get('/costs', asyncHandler(async (req, res) => {
  const costs = await analytics.getCostAnalysis(req.query);
  res.json(costs);
}));

router.get('/performance', asyncHandler(async (req, res) => {
  const performance = await analytics.getPerformanceMetrics();
  res.json(performance);
}));

export const analyticsController = router;