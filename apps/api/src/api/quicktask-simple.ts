import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Ultra-simple Quick Task endpoint
router.post('/quick', async (req, res) => {
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
  
  const taskId = uuidv4();
  const farmId = uuidv4();
  
  console.log('[QuickTask-Simple] Created:', { taskId, farmId, description });
  
  // Return success immediately - no database, no complex logic
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
});

export default router;