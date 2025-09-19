import express from 'express';
import { json, urlencoded } from 'express';

// Import only the barn routes for testing
import { router as barnRoutes } from '../api/barn';

// Create Express app for testing
const app = express();

// Body parsing
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// API Routes - only barn for now
app.use('/api/barn', barnRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: 'test' });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

export default app;