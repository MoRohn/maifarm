import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ErrorHandler, ErrorSeverity, ErrorCategory, ServiceError } from '../../services/errorHandling';
import { logger } from '../../utils/logger';
import { WebSocketManager } from '../../websocket/websocketManager';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../websocket/websocketManager');

describe('ErrorHandler', () => {
  let mockLogger: jest.Mocked<typeof logger>;
  let mockWebSocketManager: jest.Mocked<WebSocketManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLogger = logger as jest.Mocked<typeof logger>;
    // Clear error maps
    ErrorHandler['errors'].clear();
    ErrorHandler['recoveryCallbacks'].clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle error with appropriate severity logging', async () => {
      const error = new Error('Test error');
      
      await ErrorHandler.handle(
        'TestService',
        error,
        ErrorCategory.DATABASE,
        ErrorSeverity.HIGH
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorHandler]'),
        expect.objectContaining({
          service: 'TestService',
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          message: 'Test error'
        })
      );
    });

    it('should store error in internal map', async () => {
      const error = new Error('Database connection failed');
      
      await ErrorHandler.handle(
        'DatabaseService',
        error,
        ErrorCategory.DATABASE,
        ErrorSeverity.CRITICAL
      );

      const errors = ErrorHandler.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        service: 'DatabaseService',
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        message: 'Database connection failed',
        recovered: false,
        recoveryAttempts: 0
      });
    });

    it('should emit error event via WebSocket', async () => {
      const error = new Error('Network timeout');
      
      await ErrorHandler.handle(
        'APIService',
        error,
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM
      );

      expect(mockWebSocketManager.broadcast).toHaveBeenCalledWith(
        'error:occurred',
        expect.objectContaining({
          service: 'APIService',
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.MEDIUM
        })
      );
    });
  });

  describe('Error Recovery', () => {
    it('should attempt recovery with callback', async () => {
      const error = new Error('Temporary failure');
      const recoveryCallback = jest.fn().mockResolvedValue(undefined);
      
      const recovered = await ErrorHandler.handle(
        'TempService',
        error,
        ErrorCategory.EXECUTION,
        ErrorSeverity.LOW,
        recoveryCallback
      );

      expect(recoveryCallback).toHaveBeenCalled();
      expect(recovered).toBe(true);
    });

    it('should retry recovery up to max attempts', async () => {
      const error = new Error('Persistent failure');
      let attemptCount = 0;
      const recoveryCallback = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Still failing');
        }
      });
      
      const recovered = await ErrorHandler.handle(
        'RetryService',
        error,
        ErrorCategory.EXECUTION,
        ErrorSeverity.MEDIUM,
        recoveryCallback
      );

      expect(recoveryCallback).toHaveBeenCalledTimes(3);
      expect(recovered).toBe(true);
    });

    it('should stop recovery after max attempts', async () => {
      const error = new Error('Unrecoverable failure');
      const recoveryCallback = jest.fn().mockRejectedValue(new Error('Cannot recover'));
      
      const recovered = await ErrorHandler.handle(
        'FailService',
        error,
        ErrorCategory.EXECUTION,
        ErrorSeverity.HIGH,
        recoveryCallback
      );

      expect(recoveryCallback).toHaveBeenCalledTimes(3);
      expect(recovered).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max recovery attempts reached')
      );
    });

    it('should escalate critical errors after failed recovery', async () => {
      const error = new Error('Critical system failure');
      const recoveryCallback = jest.fn().mockRejectedValue(new Error('Recovery failed'));
      
      await ErrorHandler.handle(
        'CriticalService',
        error,
        ErrorCategory.RESOURCE,
        ErrorSeverity.CRITICAL,
        recoveryCallback
      );

      expect(mockWebSocketManager.broadcast).toHaveBeenCalledWith(
        'error:escalated',
        expect.objectContaining({
          severity: ErrorSeverity.CRITICAL
        })
      );
    });
  });

  describe('Error Categories', () => {
    const testCases = [
      { category: ErrorCategory.DATABASE, message: 'Connection pool exhausted' },
      { category: ErrorCategory.REDIS, message: 'Redis connection timeout' },
      { category: ErrorCategory.TMUX, message: 'TMUX session not found' },
      { category: ErrorCategory.NETWORK, message: 'API request failed' },
      { category: ErrorCategory.VALIDATION, message: 'Invalid input data' },
      { category: ErrorCategory.TIMEOUT, message: 'Operation timed out' },
      { category: ErrorCategory.RESOURCE, message: 'Memory limit exceeded' }
    ];

    testCases.forEach(({ category, message }) => {
      it(`should handle ${category} errors correctly`, async () => {
        const error = new Error(message);
        
        await ErrorHandler.handle(
          'TestService',
          error,
          category,
          ErrorSeverity.MEDIUM
        );

        const errors = ErrorHandler.getErrors();
        expect(errors[0].category).toBe(category);
      });
    });
  });

  describe('Error Severity Levels', () => {
    it('should log LOW severity as info', async () => {
      await ErrorHandler.handle(
        'Service',
        new Error('Minor issue'),
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW
      );

      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log MEDIUM severity as warning', async () => {
      await ErrorHandler.handle(
        'Service',
        new Error('Warning condition'),
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM
      );

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log HIGH severity as error', async () => {
      await ErrorHandler.handle(
        'Service',
        new Error('Serious error'),
        ErrorCategory.DATABASE,
        ErrorSeverity.HIGH
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log CRITICAL severity with additional alerts', async () => {
      await ErrorHandler.handle(
        'Service',
        new Error('System critical'),
        ErrorCategory.RESOURCE,
        ErrorSeverity.CRITICAL
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockWebSocketManager.broadcast).toHaveBeenCalledWith(
        'error:critical',
        expect.any(Object)
      );
    });
  });

  describe('Error Management', () => {
    beforeEach(async () => {
      // Add some test errors
      await ErrorHandler.handle('Service1', new Error('Error 1'), ErrorCategory.DATABASE);
      await ErrorHandler.handle('Service2', new Error('Error 2'), ErrorCategory.NETWORK);
      await ErrorHandler.handle('Service3', new Error('Error 3'), ErrorCategory.VALIDATION);
    });

    it('should get all errors', () => {
      const errors = ErrorHandler.getErrors();
      expect(errors).toHaveLength(3);
    });

    it('should get errors by service', () => {
      const errors = ErrorHandler.getErrorsByService('Service1');
      expect(errors).toHaveLength(1);
      expect(errors[0].service).toBe('Service1');
    });

    it('should get errors by category', () => {
      const errors = ErrorHandler.getErrorsByCategory(ErrorCategory.NETWORK);
      expect(errors).toHaveLength(1);
      expect(errors[0].category).toBe(ErrorCategory.NETWORK);
    });

    it('should get errors by severity', () => {
      const errors = ErrorHandler.getErrorsBySeverity(ErrorSeverity.MEDIUM);
      expect(errors).toHaveLength(3); // Default severity is MEDIUM
    });

    it('should clear old errors', () => {
      // Advance time by 1 hour
      jest.advanceTimersByTime(3600000);
      
      ErrorHandler.clearOldErrors(3600); // Clear errors older than 1 hour
      const errors = ErrorHandler.getErrors();
      expect(errors).toHaveLength(0);
    });

    it('should clear recovered errors', async () => {
      const recoveryCallback = jest.fn().mockResolvedValue(undefined);
      await ErrorHandler.handle(
        'RecoveredService',
        new Error('Recoverable'),
        ErrorCategory.EXECUTION,
        ErrorSeverity.LOW,
        recoveryCallback
      );

      ErrorHandler.clearRecoveredErrors();
      const errors = ErrorHandler.getErrors();
      expect(errors).toHaveLength(3); // Original 3 errors remain
    });
  });

  describe('Error Statistics', () => {
    it('should provide error statistics', async () => {
      await ErrorHandler.handle('Service1', new Error('E1'), ErrorCategory.DATABASE, ErrorSeverity.LOW);
      await ErrorHandler.handle('Service2', new Error('E2'), ErrorCategory.DATABASE, ErrorSeverity.HIGH);
      await ErrorHandler.handle('Service3', new Error('E3'), ErrorCategory.NETWORK, ErrorSeverity.CRITICAL);
      
      const stats = ErrorHandler.getStatistics();
      
      expect(stats).toMatchObject({
        total: 3,
        byCategory: {
          [ErrorCategory.DATABASE]: 2,
          [ErrorCategory.NETWORK]: 1
        },
        bySeverity: {
          [ErrorSeverity.LOW]: 1,
          [ErrorSeverity.HIGH]: 1,
          [ErrorSeverity.CRITICAL]: 1
        },
        byService: {
          'Service1': 1,
          'Service2': 1,
          'Service3': 1
        },
        recovered: 0,
        pending: 3
      });
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should implement circuit breaker for repeated failures', async () => {
      const service = 'UnstableService';
      
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        await ErrorHandler.handle(
          service,
          new Error(`Failure ${i}`),
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH
        );
      }

      const isOpen = ErrorHandler.isCircuitOpen(service);
      expect(isOpen).toBe(true);
    });

    it('should auto-close circuit after timeout', () => {
      const service = 'RecoveringService';
      ErrorHandler.openCircuit(service);
      
      expect(ErrorHandler.isCircuitOpen(service)).toBe(true);
      
      // Advance time past circuit timeout
      jest.advanceTimersByTime(60000); // 1 minute
      
      expect(ErrorHandler.isCircuitOpen(service)).toBe(false);
    });
  });

  describe('Error Notifications', () => {
    it('should batch error notifications', async () => {
      // Generate multiple errors quickly
      for (let i = 0; i < 10; i++) {
        await ErrorHandler.handle(
          'BatchService',
          new Error(`Error ${i}`),
          ErrorCategory.VALIDATION,
          ErrorSeverity.LOW
        );
      }

      // Should batch notifications instead of sending 10 individual ones
      expect(mockWebSocketManager.broadcast).toHaveBeenCalledTimes(1);
      expect(mockWebSocketManager.broadcast).toHaveBeenCalledWith(
        'error:batch',
        expect.objectContaining({
          count: 10
        })
      );
    });
  });
});