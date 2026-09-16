import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// In-memory storage for testing
const testFarms = new Map();

// Test endpoint for creating farms without auth/database
router.post('/test-create', async (req, res) => {
  try {
    const { name, description, seedId, configuration } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm name is required'
        }
      });
    }

    const farmId = uuidv4();
    const farm = {
      id: farmId,
      name,
      description,
      seedId,
      configuration,
      status: 'running',
      agents: [
        { id: uuidv4(), name: 'agent-1', type: 'worker', status: 'active' },
        { id: uuidv4(), name: 'agent-2', type: 'worker', status: 'active' },
        { id: uuidv4(), name: 'agent-3', type: 'coordinator', status: 'active' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    testFarms.set(farmId, farm);

    res.json({
      success: true,
      data: farm
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create test farm'
      }
    });
  }
});

// Get test farm
router.get('/test/:id', async (req, res) => {
  const farm = testFarms.get(req.params.id);
  
  if (!farm) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Test farm not found'
      }
    });
  }

  res.json({
    success: true,
    data: farm
  });
});

// List all test farms
router.get('/test-list', async (req, res) => {
  const farms = Array.from(testFarms.values());
  
  res.json({
    success: true,
    data: farms,
    pagination: {
      total: farms.length,
      page: 1,
      limit: 100
    }
  });
});

export default router;
export { router };