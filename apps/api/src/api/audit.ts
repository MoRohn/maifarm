import { Router } from 'express';
import { auditLogger, AuditEventType, AuditSeverity } from '../services/auditLogger';
import { logger, LogCategory } from '../services/ProductionLogger';

const router = Router();

/**
 * POST /api/audit
 * Log a single audit event from the frontend
 */
router.post('/', async (req, res) => {
  try {
    const { type, userId, details, severity, timestamp, action, event } = req.body;

    // Map frontend event types to backend AuditEventType
    const eventTypeMap: Record<string, AuditEventType> = {
      LOGIN_SUCCESS: AuditEventType.LOGIN_SUCCESS,
      LOGIN_FAILURE: AuditEventType.LOGIN_FAILURE,
      LOGOUT: AuditEventType.LOGOUT,
      REGISTER: AuditEventType.DATA_CREATE,
      PASSWORD_CHANGE: AuditEventType.PASSWORD_RESET,
    };

    const auditEventType = eventTypeMap[type || action || event] || AuditEventType.SECURITY_ALERT;

    // Map severity
    const severityMap: Record<string, AuditSeverity> = {
      low: AuditSeverity.INFO,
      medium: AuditSeverity.WARNING,
      high: AuditSeverity.ERROR,
      critical: AuditSeverity.CRITICAL,
    };

    const auditSeverity = severityMap[severity] || AuditSeverity.INFO;

    // Determine success/failure
    const result = details?.error ? 'FAILURE' : 'SUCCESS';

    // Log the audit event (non-blocking - don't await)
    auditLogger.log({
      eventType: auditEventType,
      severity: auditSeverity,
      userId: userId || undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      result,
      message: details?.error || `${type || action || event} event logged from frontend`,
      metadata: details,
    }).catch(err => {
      // Silently log error but don't fail the request
      logger.error(LogCategory.SECURITY, 'Audit logging failed:', err);
    });

    // Return success immediately
    res.json({ success: true });
  } catch (error) {
    logger.error(LogCategory.SECURITY, 'Failed to process audit event:', error);

    // Don't fail the request - audit logging is not critical
    res.json({ success: true, warning: 'Audit logging failed' });
  }
});

/**
 * POST /api/audit/batch
 * Log multiple audit events from the frontend
 */
router.post('/batch', async (req, res) => {
  try {
    const logs = Array.isArray(req.body) ? req.body : [req.body];

    // Process all logs in parallel (non-blocking)
    logs.forEach(log => {
      const { type, userId, details, severity, action, event } = log;

      const eventTypeMap: Record<string, AuditEventType> = {
        LOGIN_SUCCESS: AuditEventType.LOGIN_SUCCESS,
        LOGIN_FAILURE: AuditEventType.LOGIN_FAILURE,
        LOGOUT: AuditEventType.LOGOUT,
        REGISTER: AuditEventType.DATA_CREATE,
        PASSWORD_CHANGE: AuditEventType.PASSWORD_RESET,
      };

      const auditEventType = eventTypeMap[type || action || event] || AuditEventType.SECURITY_ALERT;

      const severityMap: Record<string, AuditSeverity> = {
        low: AuditSeverity.INFO,
        medium: AuditSeverity.WARNING,
        high: AuditSeverity.ERROR,
        critical: AuditSeverity.CRITICAL,
      };

      const auditSeverity = severityMap[severity] || AuditSeverity.INFO;
      const result = details?.error ? 'FAILURE' : 'SUCCESS';

      // Log asynchronously (fire and forget)
      auditLogger.log({
        eventType: auditEventType,
        severity: auditSeverity,
        userId: userId || undefined,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result,
        message: details?.error || `${type || action || event} event logged from frontend`,
        metadata: details,
      }).catch(err => {
        logger.error(LogCategory.SECURITY, 'Batch audit logging failed for entry:', err);
      });
    });

    // Return success immediately
    res.json({ success: true, processed: logs.length });
  } catch (error) {
    logger.error(LogCategory.SECURITY, 'Failed to process batch audit events:', error);

    // Don't fail the request
    res.json({ success: true, warning: 'Batch audit logging failed' });
  }
});

/**
 * GET /api/audit/logs
 * Query audit logs (protected endpoint - requires admin role)
 */
router.get('/logs', async (req, res) => {
  try {
    const { startDate, endDate, eventType, severity, userId, limit, offset } = req.query;

    const filters: any = {};

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (eventType) filters.eventType = eventType as AuditEventType;
    if (severity) filters.severity = severity as AuditSeverity;
    if (userId) filters.userId = userId as string;
    if (limit) filters.limit = parseInt(limit as string);
    if (offset) filters.offset = parseInt(offset as string);

    const logs = await auditLogger.query(filters);

    res.json({ success: true, logs });
  } catch (error) {
    logger.error(LogCategory.SECURITY, 'Failed to query audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs',
    });
  }
});

export default router;
