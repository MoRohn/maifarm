import { WebSocketConnectionManager, ConnectionState } from '../connectionManager';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('WebSocketConnectionManager', () => {
  let manager: WebSocketConnectionManager;
  let mockSocket: jest.Mocked<Socket>;
  let onStateChange: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Create mock socket
    mockSocket = {
      connected: false,
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      io: {
        engine: {
          lastPing: Date.now()
        }
      }
    } as any;

    // Mock io function
    (io as jest.Mock).mockReturnValue(mockSocket);

    onStateChange = jest.fn();
    
    manager = new WebSocketConnectionManager({
      url: 'http://localhost:4567',
      onStateChange,
      silent: true
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Connection Management', () => {
    test('should initialize with disconnected state', () => {
      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(manager.isConnected()).toBe(false);
    });

    test('should create socket connection with correct options', () => {
      manager.connect();

      expect(io).toHaveBeenCalledWith('http://localhost:4567', expect.objectContaining({
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 20000,
        path: '/socket.io/',
        autoConnect: true,
        forceNew: false,
        multiplex: true,
        perMessageDeflate: true,
        closeOnBeforeunload: false,
        withCredentials: true,
        query: {
          clientVersion: '2.0.0',
          enableMetrics: 'true'
        }
      }));
    });

    test('should setup event handlers on connect', () => {
      manager.connect();

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('ping', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connection:warning', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connection:latency', expect.any(Function));
    });

    test('should handle successful connection', () => {
      manager.connect();
      
      // Get the connect handler
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      
      mockSocket.connected = true;
      connectHandler?.();

      expect(manager.getState()).toBe(ConnectionState.CONNECTED);
      expect(manager.isConnected()).toBe(true);
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.CONNECTED);
    });

    test('should handle disconnection', () => {
      manager.connect();
      
      // First connect
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      mockSocket.connected = true;
      connectHandler?.();

      // Then disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      mockSocket.connected = false;
      disconnectHandler?.('io server disconnect');

      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(manager.isConnected()).toBe(false);
    });

    test('should handle connection errors', () => {
      manager.connect();
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      errorHandler?.(new Error('Connection failed'));

      expect(manager.getState()).toBe(ConnectionState.ERROR);
      expect(onStateChange).toHaveBeenCalledWith(ConnectionState.ERROR);
    });

    test('should return existing socket if already connected', () => {
      manager.connect();
      mockSocket.connected = true;
      
      const socket1 = manager.getSocket();
      const socket2 = manager.connect();
      
      expect(socket1).toBe(socket2);
      expect(io).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reconnection Logic', () => {
    test('should attempt reconnection on disconnect', () => {
      manager.connect();
      
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      
      disconnectHandler?.('transport close');
      
      expect(manager.getState()).toBe(ConnectionState.RECONNECTING);
      
      // Fast-forward timer
      jest.advanceTimersByTime(1000);
      
      expect(io).toHaveBeenCalledTimes(2);
    });

    test('should not reconnect on explicit disconnect', () => {
      manager.connect();
      
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      
      disconnectHandler?.('io client disconnect');
      
      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
      
      // Fast-forward timer
      jest.advanceTimersByTime(5000);
      
      expect(io).toHaveBeenCalledTimes(1); // No reconnection attempt
    });

    test('should implement exponential backoff for reconnection', () => {
      const ioMock = io as jest.Mock;
      
      manager.connect();
      expect(ioMock).toHaveBeenCalledTimes(1);
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      // First retry - 1s + jitter
      errorHandler?.(new Error('Connection failed'));
      jest.advanceTimersByTime(1500);
      expect(ioMock).toHaveBeenCalledTimes(2);
      
      // Second retry - 2s + jitter
      errorHandler?.(new Error('Connection failed'));
      jest.advanceTimersByTime(3000);
      expect(ioMock).toHaveBeenCalledTimes(3);
      
      // Third retry - 4s + jitter
      errorHandler?.(new Error('Connection failed'));
      jest.advanceTimersByTime(6000);
      expect(ioMock).toHaveBeenCalledTimes(4);
    });

    test('should stop reconnecting after max retries', () => {
      const maxRetries = 3;
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        maxRetries,
        onStateChange,
        silent: true
      });
      
      manager.connect();
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      // Exceed max retries
      for (let i = 0; i <= maxRetries; i++) {
        errorHandler?.(new Error('Connection failed'));
        jest.advanceTimersByTime(30000);
      }
      
      expect(manager.getState()).toBe(ConnectionState.ERROR);
      expect(io).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
    });
  });

  describe('Message Queueing', () => {
    test('should queue messages when offline', () => {
      const queued = manager.queueMessage('test:event', { data: 'test' });
      
      expect(queued).toBe(true);
      expect(manager.getMetrics().queuedMessages).toBe(1);
    });

    test('should not queue messages when online', () => {
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      const queued = manager.queueMessage('test:event', { data: 'test' });
      
      expect(queued).toBe(false);
      expect(manager.getMetrics().queuedMessages).toBe(0);
    });

    test('should flush queued messages on reconnect', () => {
      // Queue messages while offline
      manager.queueMessage('event1', { data: 1 });
      manager.queueMessage('event2', { data: 2 });
      
      // Connect
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      // Check messages were sent
      expect(mockSocket.emit).toHaveBeenCalledWith('event1', { data: 1 });
      expect(mockSocket.emit).toHaveBeenCalledWith('event2', { data: 2 });
      expect(manager.getMetrics().queuedMessages).toBe(0);
    });

    test('should handle queueing disabled', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        queueOfflineMessages: false,
        silent: true
      });
      
      const queued = manager.queueMessage('test:event', { data: 'test' });
      
      expect(queued).toBe(false);
      expect(manager.getMetrics().queuedMessages).toBe(0);
    });
  });

  describe('Latency and Quality Tracking', () => {
    test('should handle ping/pong for latency tracking', () => {
      manager.connect();
      
      const pingHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'ping'
      )?.[1];
      
      const timestamp = Date.now();
      pingHandler?.({ timestamp });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('pong', { timestamp });
    });

    test('should update connection quality based on latency', () => {
      manager.connect();
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      // Excellent quality (< 50ms)
      latencyHandler?.({ latency: 30 });
      expect(manager.getMetrics().quality).toBe(100);
      
      // Good quality (< 150ms)
      latencyHandler?.({ latency: 100 });
      expect(manager.getMetrics().quality).toBe(80);
      
      // Fair quality (< 300ms)
      latencyHandler?.({ latency: 200 });
      expect(manager.getMetrics().quality).toBe(60);
      
      // Poor quality (>= 300ms)
      latencyHandler?.({ latency: 400 });
      expect(manager.getMetrics().quality).toBe(40);
    });

    test('should set degraded state on poor connection quality', () => {
      manager.connect();
      mockSocket.connected = true;
      
      // Connect first
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      // Simulate high latency
      latencyHandler?.({ latency: 500 });
      
      expect(manager.getState()).toBe(ConnectionState.DEGRADED);
    });

    test('should handle connection warnings', () => {
      manager.connect();
      
      const warningHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:warning'
      )?.[1];
      
      warningHandler?.({ reason: 'High packet loss', missedPings: 5 });
      
      expect(manager.getState()).toBe(ConnectionState.DEGRADED);
      expect(manager.getMetrics().quality).toBe(20);
    });
  });

  describe('Disconnect and Reset', () => {
    test('should properly disconnect', () => {
      manager.connect();
      manager.disconnect();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(manager.getSocket()).toBeNull();
      expect(manager.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    test('should reset connection state', () => {
      // Queue some messages
      manager.queueMessage('test', {});
      
      // Connect and add some latency history
      manager.connect();
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      latencyHandler?.({ latency: 100 });
      
      // Reset
      manager.resetConnection();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(manager.getMetrics()).toEqual({
        state: ConnectionState.CONNECTING,
        quality: 100,
        latency: null,
        queuedMessages: 0,
        retryCount: 0,
        uptime: 0
      });
      expect(io).toHaveBeenCalledTimes(2); // Initial + reset
    });

    test('should clear retry timer on disconnect', () => {
      manager.connect();
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      errorHandler?.(new Error('Connection failed'));
      expect(manager.getState()).toBe(ConnectionState.RECONNECTING);
      
      manager.disconnect();
      
      // Advance time to check timer was cleared
      jest.advanceTimersByTime(10000);
      expect(io).toHaveBeenCalledTimes(1); // No reconnection
    });
  });

  describe('Metrics', () => {
    test('should provide comprehensive metrics', () => {
      manager.connect();
      mockSocket.connected = true;
      
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
      
      const metrics = manager.getMetrics();
      
      expect(metrics).toHaveProperty('state', ConnectionState.CONNECTED);
      expect(metrics).toHaveProperty('quality', 100);
      expect(metrics).toHaveProperty('latency');
      expect(metrics).toHaveProperty('queuedMessages', 0);
      expect(metrics).toHaveProperty('retryCount', 0);
      expect(metrics).toHaveProperty('uptime');
    });

    test('should calculate average latency correctly', () => {
      manager.connect();
      
      const latencyHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connection:latency'
      )?.[1];
      
      // Add multiple latency measurements
      latencyHandler?.({ latency: 50 });
      latencyHandler?.({ latency: 100 });
      latencyHandler?.({ latency: 150 });
      
      const metrics = manager.getMetrics();
      expect(metrics.latency).toBe(100); // Average of 50, 100, 150
    });

    test('should track retry count in metrics', () => {
      manager.connect();
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      errorHandler?.(new Error('Connection failed'));
      jest.advanceTimersByTime(2000);
      
      const metrics = manager.getMetrics();
      expect(metrics.retryCount).toBe(1);
    });
  });

  describe('Fallback Transport', () => {
    test('should use websocket transport only when fallback disabled', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        enableFallback: false,
        silent: true
      });
      
      manager.connect();
      
      expect(io).toHaveBeenCalledWith('http://localhost:4567', expect.objectContaining({
        transports: ['websocket']
      }));
    });

    test('should use both transports when fallback enabled', () => {
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        enableFallback: true,
        silent: true
      });
      
      manager.connect();
      
      expect(io).toHaveBeenCalledWith('http://localhost:4567', expect.objectContaining({
        transports: ['websocket', 'polling']
      }));
    });
  });

  describe('Error Handling', () => {
    test('should handle socket creation errors', () => {
      (io as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to create socket');
      });
      
      expect(() => manager.connect()).toThrow('Failed to create socket');
      expect(manager.getState()).toBe(ConnectionState.ERROR);
    });

    test('should handle message acknowledgment', () => {
      manager.connect();
      
      const wildcardHandler = mockSocket.on.mock.calls.find(
        call => call[0] === '*'
      )?.[1];
      
      wildcardHandler?.('test:event', { messageId: '123', data: 'test' });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('message:ack', '123');
    });

    test('should suppress initial connection errors when silent', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      manager = new WebSocketConnectionManager({
        url: 'http://localhost:4567',
        silent: true
      });
      
      manager.connect();
      
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      
      errorHandler?.(new Error('Initial connection failed'));
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});