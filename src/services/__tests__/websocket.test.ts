import { io, Socket } from 'socket.io-client';
import { websocketService } from '../websocket';
import { toast } from 'react-hot-toast';

// Mock dependencies
jest.mock('socket.io-client');
jest.mock('react-hot-toast');

const mockIo = io as jest.MockedFunction<typeof io>;
const mockToast = toast as jest.Mocked<typeof toast>;

describe('WebSocketService', () => {
  let mockSocket: Partial<Socket>;
  let eventHandlers: { [key: string]: Function } = {};

  beforeEach(() => {
    jest.clearAllMocks();
    eventHandlers = {};

    // Mock socket instance
    mockSocket = {
      connected: false,
      on: jest.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
        return mockSocket as Socket;
      }) as any,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    mockIo.mockReturnValue(mockSocket as Socket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should connect to the WebSocket server with default URL', () => {
      websocketService.connect();

      expect(mockIo).toHaveBeenCalledWith(
        'http://localhost:4567',
        expect.objectContaining({
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          path: '/socket.io/',
          timeout: 10000,
          autoConnect: true,
        })
      );
    });

    it('should not connect if already connected', () => {
      mockSocket.connected = true;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      websocketService.connect();

      expect(mockIo).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket already connected');

      consoleSpy.mockRestore();
    });

    it('should handle connection errors and trigger reconnect', () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Make io throw an error
      mockIo.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      websocketService.connect();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to WebSocket:',
        expect.any(Error)
      );

      // Verify reconnect is scheduled
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

      consoleErrorSpy.mockRestore();
    });

    it('should convert ws:// URLs to http://', () => {
      websocketService.connect('ws://localhost:8080');

      expect(mockIo).toHaveBeenCalledWith(
        'http://localhost:8080',
        expect.any(Object)
      );
    });

    it('should convert wss:// URLs to https://', () => {
      websocketService.connect('wss://secure.example.com');

      expect(mockIo).toHaveBeenCalledWith(
        'https://secure.example.com',
        expect.any(Object)
      );
    });
  });

  describe('event handlers', () => {
    beforeEach(() => {
      websocketService.connect();
    });

    it('should handle successful connection', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      eventHandlers['connect']();

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket connected');
      expect(mockToast.success).toHaveBeenCalledWith('Connected to MaiFarm server');

      consoleSpy.mockRestore();
    });

    it('should handle disconnection and attempt reconnect', () => {
      jest.useFakeTimers();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      eventHandlers['disconnect']('io server disconnect');

      expect(consoleSpy).toHaveBeenCalledWith(
        'WebSocket disconnected:',
        'io server disconnect'
      );
      expect(mockToast.error).toHaveBeenCalledWith('Disconnected from server');
      expect(setTimeout).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle WebSocket errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('WebSocket error');

      eventHandlers['error'](error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('WebSocket error:', error);
      expect(mockToast.error).toHaveBeenCalledWith('Connection error');

      consoleErrorSpy.mockRestore();
    });

    it('should handle incoming messages', () => {
      const messageHandler = jest.fn();
      websocketService.on('test_message', messageHandler);

      const testMessage = {
        type: 'test_message',
        payload: { data: 'test' },
        timestamp: new Date(),
      };

      eventHandlers['message'](testMessage);

      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should handle agent updates', () => {
      const agentHandler = jest.fn();
      websocketService.on('agent_update', agentHandler);

      const agentData = {
        id: 'agent-1',
        name: 'Test Agent',
        status: 'active',
      };

      eventHandlers['agent_update'](agentData);

      expect(agentHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_update',
          payload: agentData,
          timestamp: expect.any(Date),
        })
      );
    });

    it('should handle farm updates', () => {
      const farmHandler = jest.fn();
      websocketService.on('farm_update', farmHandler);

      const farmData = {
        id: 'farm-1',
        name: 'Test Farm',
        status: 'running',
      };

      eventHandlers['farm_update'](farmData);

      expect(farmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'farm_update',
          payload: farmData,
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('reconnection logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should implement exponential backoff for reconnection', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // First connection attempt fails
      mockIo.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      websocketService.connect();

      // First retry after 2 seconds
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
      jest.advanceTimersByTime(2000);

      // Second retry after 4 seconds
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
      jest.advanceTimersByTime(4000);

      // Third retry after 8 seconds
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 8000);

      expect(consoleLogSpy).toHaveBeenCalledWith('Attempting to reconnect (1/5)...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Attempting to reconnect (2/5)...');

      consoleLogSpy.mockRestore();
    });

    it('should stop reconnecting after max retries', () => {
      mockIo.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      // Simulate max retries
      for (let i = 0; i < 6; i++) {
        websocketService.connect();
        if (i < 5) {
          jest.advanceTimersByTime(30000);
        }
      }

      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to connect to server. Please refresh the page.'
      );
    });

    it('should reset retry count on successful connection', () => {
      websocketService.connect();
      
      // Simulate successful connection
      eventHandlers['connect']();

      // Force a disconnection
      eventHandlers['disconnect']('io server disconnect');

      // Should start from retry 1 again
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
    });
  });

  describe('emit', () => {
    beforeEach(() => {
      websocketService.connect();
    });

    it('should emit events when connected', () => {
      mockSocket.connected = true;

      websocketService.emit('test_event', { data: 'test' });

      expect(mockSocket.emit).toHaveBeenCalledWith('test_event', { data: 'test' });
    });

    it('should warn when trying to emit while disconnected', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockSocket.connected = false;

      websocketService.emit('test_event', { data: 'test' });

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'WebSocket not connected, cannot emit event:',
        'test_event'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('message handlers', () => {
    beforeEach(() => {
      websocketService.connect();
    });

    it('should register and trigger message handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      websocketService.on('custom_event', handler1);
      websocketService.on('custom_event', handler2);

      const message = {
        type: 'custom_event',
        payload: { data: 'test' },
        timestamp: new Date(),
      };

      eventHandlers['message'](message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should handle global message handlers', () => {
      const globalHandler = jest.fn();

      websocketService.on('*', globalHandler);

      const message = {
        type: 'any_event',
        payload: { data: 'test' },
        timestamp: new Date(),
      };

      eventHandlers['message'](message);

      expect(globalHandler).toHaveBeenCalledWith(message);
    });

    it('should remove message handlers', () => {
      const handler = jest.fn();

      websocketService.on('test_event', handler);
      websocketService.off('test_event', handler);

      const message = {
        type: 'test_event',
        payload: { data: 'test' },
        timestamp: new Date(),
      };

      eventHandlers['message'](message);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect socket and clear reconnect timeout', () => {
      jest.useFakeTimers();
      
      websocketService.connect();
      
      // Trigger a reconnect timeout
      eventHandlers['disconnect']('io server disconnect');
      
      websocketService.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(clearTimeout).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      websocketService.connect();
      mockSocket.connected = true;
    });

    it('should emit start_farm event', () => {
      const farmConfig = { name: 'Test Farm', agents: [] };
      websocketService.startFarm(farmConfig);

      expect(mockSocket.emit).toHaveBeenCalledWith('start_farm', farmConfig);
    });

    it('should emit pause_farm event', () => {
      websocketService.pauseFarm('farm-123');

      expect(mockSocket.emit).toHaveBeenCalledWith('pause_farm', { farmId: 'farm-123' });
    });

    it('should emit resume_farm event', () => {
      websocketService.resumeFarm('farm-123');

      expect(mockSocket.emit).toHaveBeenCalledWith('resume_farm', { farmId: 'farm-123' });
    });

    it('should emit stop_farm event', () => {
      websocketService.stopFarm('farm-123');

      expect(mockSocket.emit).toHaveBeenCalledWith('stop_farm', { farmId: 'farm-123' });
    });

    it('should emit restart_agent event', () => {
      websocketService.restartAgent('farm-123', 'agent-456');

      expect(mockSocket.emit).toHaveBeenCalledWith('restart_agent', {
        farmId: 'farm-123',
        agentId: 'agent-456',
      });
    });

    it('should return connection status', () => {
      mockSocket.connected = true;
      expect(websocketService.getStatus()).toBe('connected');

      mockSocket.connected = false;
      expect(websocketService.getStatus()).toBe('disconnected');
    });

    it('should broadcast messages', () => {
      websocketService.broadcast('test_broadcast', { data: 'test' });

      expect(mockSocket.emit).toHaveBeenCalledWith('broadcast', {
        type: 'test_broadcast',
        payload: { data: 'test' },
        timestamp: expect.any(Date),
      });
    });

    it('should send messages (alias for emit)', () => {
      websocketService.send('test_send', { data: 'test' });

      expect(mockSocket.emit).toHaveBeenCalledWith('test_send', { data: 'test' });
    });
  });
});