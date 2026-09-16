import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Simple test endpoint that always works
router.post('/test', async (req, res) => {
  try {
    const { description } = req.body;
    
    if (!description) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Description is required'
        }
      });
    }
    
    // Return a simple successful response
    const farmId = uuidv4();
    const taskId = uuidv4();
    
    console.log('[QuickTest] Created IDs:', { farmId, taskId, description });
    
    res.status(201).json({
      success: true,
      data: {
        taskId,
        farmId,
        status: 'active',
        message: 'Quick task created successfully'
      },
      farmId // For backwards compatibility
    });
  } catch (error: any) {
    console.error('[QuickTest] Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create task'
      }
    });
  }
});

export default router;