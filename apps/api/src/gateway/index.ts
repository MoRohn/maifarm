import { Router } from 'express';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { requestValidator } from './middleware/validator.js';
import { responseFormatter } from './middleware/responseFormatter.js';
import { cacheMiddleware } from './middleware/cache.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestBatcher } from './middleware/batcher.js';

// Resource Controllers
import { farmsController } from './controllers/farms.js';
import { tasksController } from './controllers/tasks.js';
import { providersController } from './controllers/providers.js';
import { analyticsController } from './controllers/analytics.js';
import { systemController } from './controllers/system.js';
import { realtimeController } from './controllers/realtime.js';

const gatewayRouter = Router();

// Global middleware pipeline
gatewayRouter.use(createRateLimiter({ 
  windowMs: 60000, // 1 minute
  max: 100 // limit each IP to 100 requests per minute
}));
gatewayRouter.use(requestValidator());
gatewayRouter.use(requestBatcher());
gatewayRouter.use(cacheMiddleware());
gatewayRouter.use(responseFormatter());

// Resource routes - RESTful + custom actions
gatewayRouter.use('/farms', farmsController);
gatewayRouter.use('/tasks', tasksController);
gatewayRouter.use('/providers', providersController);
gatewayRouter.use('/analytics', analyticsController);
gatewayRouter.use('/system', systemController);
gatewayRouter.use('/realtime', realtimeController);

// Error handling
gatewayRouter.use(errorHandler);

// 404 handler
gatewayRouter.use('*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource ${req.originalUrl} not found`
    }
  });
});

export default gatewayRouter;