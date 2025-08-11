import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { coordinationService } from '../services/coordinationService';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';

const router = Router();

// Apply authentication to coordination routes
router.use(authenticateToken);

// GET /api/coordination/agents - Get coordination agents data
router.get('/agents', apiRateLimits.read, async (req, res) => {
  try {
    // Get agents from coordination service
    let agents = [];
    try {
      agents = await coordinationService.getActiveAgents() || [];
    } catch (coordError) {
      console.debug('Coordination service method not available, fetching from database');
      // Fallback to database query for coordination-synced agents
      const result = await db.query(
        'SELECT * FROM agents WHERE type = $1 ORDER BY created_at DESC', 
        ['coordination-synced']
      );
      agents = result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        status: row.status,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
        lastHeartbeat: row.last_heartbeat,
        createdAt: row.created_at
      }));
    }
    
    const response: ApiResponse<any[]> = {
      success: true,
      data: agents,
      meta: {
        total: agents.length,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching coordination agents:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch coordination agents'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/coordination/status - Get overall coordination status
router.get('/status', apiRateLimits.read, async (req, res) => {
  try {
    const status = {
      active: coordinationService.isActive(),
      agentCount: (await coordinationService.getActiveAgents())?.length || 0,
      lastUpdate: new Date()
    };
    
    const response: ApiResponse = {
      success: true,
      data: status
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching coordination status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch coordination status'
      }
    };
    res.status(500).json(response);
  }
});

export default router;