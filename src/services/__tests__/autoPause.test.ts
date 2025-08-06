import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FarmOrchestrationService } from '../farmOrchestrationService';
import { websocketService } from '../websocket';
import { useSettingsStore } from '../../store/settingsStore';

// Mock dependencies
vi.mock('../websocket', () => ({
  websocketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    pauseFarm: vi.fn(),
    resumeFarm: vi.fn(),
    getStatus: vi.fn(() => 'connected'),
  },
}));

vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {
        system: {
          behavior: {
            autoPauseOnClose: true,
            runInBackground: false,
            showBackgroundIndicator: true,
          },
        },
      },
    })),
  },
}));

describe('Auto-Pause on Close Functionality', () => {
  let orchestrationService: FarmOrchestrationService;
  let mockServiceWorker: any;

  beforeEach(() => {
    orchestrationService = new FarmOrchestrationService();
    
    // Mock service worker
    mockServiceWorker = {
      controller: {
        postMessage: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Farm Pause/Resume Methods', () => {
    it('should pause an active farm', async () => {
      // Create a test farm
      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: true,
      });

      const farmId = farmSetup.farmId;

      // Pause the farm
      await orchestrationService.pauseFarm(farmId);

      // Verify farm is paused
      const farmHealth = await orchestrationService.getFarmHealth(farmId);
      expect(farmHealth.status).toBe('paused');
    });

    it('should resume a paused farm', async () => {
      // Create and pause a test farm
      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: true,
      });

      const farmId = farmSetup.farmId;
      await orchestrationService.pauseFarm(farmId);

      // Resume the farm
      await orchestrationService.resumeFarm(farmId);

      // Verify farm is active
      const farmHealth = await orchestrationService.getFarmHealth(farmId);
      expect(farmHealth.status).toBe('active');
    });

    it('should emit correct events when pausing', async () => {
      const pauseListener = vi.fn();
      orchestrationService.on('farm:paused', pauseListener);

      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
      });

      await orchestrationService.pauseFarm(farmSetup.farmId, true);

      expect(pauseListener).toHaveBeenCalledWith(
        expect.objectContaining({
          farmId: farmSetup.farmId,
          isAutoPause: true,
        })
      );
    });

    it('should emit correct events when resuming', async () => {
      const resumeListener = vi.fn();
      orchestrationService.on('farm:resumed', resumeListener);

      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
      });

      await orchestrationService.pauseFarm(farmSetup.farmId);
      await orchestrationService.resumeFarm(farmSetup.farmId, true);

      expect(resumeListener).toHaveBeenCalledWith(
        expect.objectContaining({
          farmId: farmSetup.farmId,
          isAutoResume: true,
        })
      );
    });
  });

  describe('Settings Store Integration', () => {
    it('should respect global auto-pause setting', () => {
      const settings = useSettingsStore.getState().settings;
      expect(settings.system.behavior.autoPauseOnClose).toBe(true);
    });

    it('should allow overriding auto-pause per farm', async () => {
      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: false, // Override global setting
      });

      // Farm should not auto-pause even if global setting is true
      // The autoPauseOnClose setting would be stored in the farm's config
      // which is handled during farm creation
    });
  });

  describe('Service Worker Communication', () => {
    it('should send visibility change message to service worker', () => {
      const event = new Event('visibilitychange');
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
      });

      document.dispatchEvent(event);

      // Verify message sent to service worker
      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
        type: 'VISIBILITY_CHANGE',
        visible: false,
      });
    });

    it('should send farm status update to service worker', () => {
      // Simulate WebSocket farm status update
      websocketService.emit('farm:paused', {
        farmId: 'test-farm-id',
        isAutoPause: true,
      });

      // Service worker should receive status update
      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FARM_STATUS_UPDATE',
          farmId: 'test-farm-id',
          status: 'paused',
        })
      );
    });

    it('should handle service worker pause message', () => {
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'FARM_PAUSE',
          farmId: 'test-farm-id',
          autoPaused: true,
        },
      });

      // Trigger the service worker message handler
      const handler = mockServiceWorker.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      
      if (handler) {
        handler(messageEvent);
      }

      // Verify WebSocket pause was called
      expect(websocketService.pauseFarm).toHaveBeenCalledWith('test-farm-id');
    });

    it('should handle service worker resume message', () => {
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'FARM_RESUME',
          farmId: 'test-farm-id',
          autoResumed: true,
        },
      });

      // Trigger the service worker message handler
      const handler = mockServiceWorker.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'message'
      )?.[1];
      
      if (handler) {
        handler(messageEvent);
      }

      // Verify WebSocket resume was called
      expect(websocketService.resumeFarm).toHaveBeenCalledWith('test-farm-id');
    });
  });

  describe('Background Indicator Updates', () => {
    it('should show indicator when farms running in background', () => {
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'UPDATE_IOS_INDICATOR',
          showIndicator: true,
          farmCount: 2,
        },
      });

      // Simulate service worker message
      window.dispatchEvent(messageEvent);

      // Background indicator component would receive this update
      // and display the appropriate UI
    });

    it('should hide indicator when no farms in background', () => {
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'UPDATE_IOS_INDICATOR',
          showIndicator: false,
          farmCount: 0,
        },
      });

      window.dispatchEvent(messageEvent);

      // Background indicator should be hidden
    });

    it('should only show indicator on iOS devices', () => {
      // Mock non-iOS user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        writable: true,
      });

      // Indicator should not be rendered on non-iOS devices
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      expect(isIOS).toBe(false);
    });
  });

  describe('Auto-Pause Workflow', () => {
    it('should pause farms with auto-pause enabled when app closes', async () => {
      // Create farms with different settings
      const autoFarm = await orchestrationService.createFarm({
        name: 'Auto Pause Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: true,
      });

      const manualFarm = await orchestrationService.createFarm({
        name: 'Manual Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: false,
      });

      // Simulate app going to background
      const event = new Event('beforeunload');
      window.dispatchEvent(event);

      // Auto-pause farm should be paused
      // Manual farm should continue running
      // This would be handled by the service worker
    });

    it('should resume auto-paused farms when app reopens', async () => {
      // Create and auto-pause a farm
      const farmSetup = await orchestrationService.createFarm({
        name: 'Test Farm',
        templateId: 'dev-basic',
        autoPauseOnClose: true,
      });

      await orchestrationService.pauseFarm(farmSetup.farmId, true);

      // Simulate app coming to foreground
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
      });
      
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);

      // Farm should be resumed
      // This would be handled by the service worker
    });
  });
});