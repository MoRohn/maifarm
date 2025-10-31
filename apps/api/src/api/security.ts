import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { securityAuditService } from '../services/securityAuditService.js';
import { ApiResponse } from '../types/api.js';
import { logger } from '../utils/logger.js';
import path from 'path';

const router = Router();

// Start a security audit
router.post('/audit', authenticateToken, requirePermission(['security:audit', 'admin']), async (req: Request, res: Response) => {
  try {
    const { targetPath, scanType = 'full', farmId } = req.body;

    if (!targetPath) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Target path is required'
        }
      };
      return res.status(400).json(response);
    }

    // Resolve and validate target path
    const resolvedPath = path.resolve(targetPath);
    
    // Start the audit
    const report = await securityAuditService.performSecurityAudit(resolvedPath, scanType);
    
    if (farmId) {
      report.farmId = farmId;
    }

    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error starting security audit:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'AUDIT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start security audit'
      }
    };
    res.status(500).json(response);
  }
});

// Get audit report by ID
router.get('/audit/:auditId', authenticateToken, requirePermission(['security:view', 'admin']), async (req: Request, res: Response) => {
  try {
    const { auditId } = req.params;
    
    const report = await securityAuditService.getAuditReport(auditId);
    
    if (!report) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Audit report not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error retrieving audit report:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RETRIEVAL_ERROR',
        message: 'Failed to retrieve audit report'
      }
    };
    res.status(500).json(response);
  }
});

// Get all audit reports
router.get('/audits', authenticateToken, requirePermission(['security:view', 'admin']), async (req: Request, res: Response) => {
  try {
    const reports = await securityAuditService.getAllAuditReports();
    
    const response: ApiResponse = {
      success: true,
      data: reports
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error retrieving audit reports:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RETRIEVAL_ERROR',
        message: 'Failed to retrieve audit reports'
      }
    };
    res.status(500).json(response);
  }
});

// Fix a vulnerability
router.post('/vulnerability/:vulnerabilityId/fix', authenticateToken, requirePermission(['security:fix', 'admin']), async (req: Request, res: Response) => {
  try {
    const { vulnerabilityId } = req.params;
    const { auditId } = req.body;

    if (!auditId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Audit ID is required'
        }
      };
      return res.status(400).json(response);
    }

    const fixed = await securityAuditService.fixVulnerability(vulnerabilityId, auditId);
    
    const response: ApiResponse = {
      success: true,
      data: { fixed }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error fixing vulnerability:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FIX_ERROR',
        message: 'Failed to fix vulnerability'
      }
    };
    res.status(500).json(response);
  }
});

// Update security configuration
router.put('/configuration', authenticateToken, requirePermission(['security:configure', 'admin']), async (req: Request, res: Response) => {
  try {
    const configuration = req.body;
    
    securityAuditService.updateConfiguration(configuration);
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'Configuration updated successfully' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error updating security configuration:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Failed to update configuration'
      }
    };
    res.status(500).json(response);
  }
});

// Schedule automatic scans
router.post('/schedule', authenticateToken, requirePermission(['security:configure', 'admin']), async (req: Request, res: Response) => {
  try {
    await securityAuditService.scheduleAutomaticScans();
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'Automatic scans scheduled successfully' }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error scheduling automatic scans:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'SCHEDULE_ERROR',
        message: 'Failed to schedule automatic scans'
      }
    };
    res.status(500).json(response);
  }
});

// Quick scan current project
router.post('/quick-scan', authenticateToken, requirePermission(['security:audit', 'admin']), async (req: Request, res: Response) => {
  try {
    const { scanType = 'code' } = req.body;
    
    // Scan the current working directory
    const report = await securityAuditService.performSecurityAudit(process.cwd(), scanType);
    
    const response: ApiResponse = {
      success: true,
      data: report
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error performing quick scan:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'SCAN_ERROR',
        message: 'Failed to perform quick scan'
      }
    };
    res.status(500).json(response);
  }
});

export default router;