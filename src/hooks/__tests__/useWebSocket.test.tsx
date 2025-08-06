import { renderHook, act, waitFor } from '@testing-library/react';
import { io, Socket } from 'socket.io-client';
import { useWebSocket } from '../useWebSocket';
import { WebSocketMessage } from '@/types';

// Mock socket.io-client
jest.mock('socket.io-client');

const mockIo = io as jest.MockedFunction<typeof io>;

describe('useWebSocket Hook', () => {
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

  describe('Connection Management', () => {
    it('should establish connection on mount', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      expect(mockIo).toHaveBeenCalledWith('http://localhost:4567', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      expect(result.current.connected).toBe(false);
      expect(result.current.isConnected).toBe(false);
    });

    it('should update connection state on connect', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      act(() => {
        mockSocket.connected = true;
        eventHandlers['connect']();
      });

      expect(result.current.connected).toBe(true);
      expect(result.current.isConnected).toBe(true);
    });

    it('should update connection state on disconnect', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      // First connect
      act(() => {
        mockSocket.connected = true;
        eventHandlers['connect']();
      });

      expect(result.current.connected).toBe(true);

      // Then disconnect
      act(() => {
        mockSocket.connected = false;
        eventHandlers['disconnect']();
      });

      expect(result.current.connected).toBe(false);
    });

    it('should disconnect on unmount', () => {
      const { unmount } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle manual reconnect', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      // Clear initial call
      mockIo.mockClear();

      act(() => {
        result.current.reconnect();
      });

      expect(mockIo).toHaveBeenCalledWith('http://localhost:4567', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    });

    it('should handle manual disconnect', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should update lastMessage on message event', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const testMessage: WebSocketMessage = {
        type: 'notification',
        payload: { text: 'Test notification' },
        timestamp: new Date(),
      };

      act(() => {
        eventHandlers['message'](testMessage);
      });

      expect(result.current.lastMessage).toEqual(testMessage);
    });

    it('should handle agent_update events', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const agentData = {
        id: 'agent-123',
        name: 'Test Agent',
        status: 'active',
      };

      act(() => {
        eventHandlers['agent_update'](agentData);
      });

      expect(result.current.lastMessage).toEqual({
        type: 'agent_update',
        payload: agentData,
        timestamp: expect.any(Date),
      });
    });

    it('should handle farm_update events', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const farmData = {
        id: 'farm-123',
        name: 'Test Farm',
        status: 'running',
      };

      act(() => {
        eventHandlers['farm_update'](farmData);
      });

      expect(result.current.lastMessage).toEqual({
        type: 'farm_update',
        payload: farmData,
        timestamp: expect.any(Date),
      });
    });

    it('should handle metrics:update events', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const metricsData = {
        dashboard: {
          activeFarms: 3,
          totalAgents: 10,
          tasksCompleted: 45,
          successRate: 92,
        },
        timestamp: new Date(),
      };

      act(() => {
        eventHandlers['metrics:update'](metricsData);
      });

      expect(result.current.lastMessage).toEqual({
        type: 'metrics:update',
        event: 'metrics:update',
        ...metricsData,
        timestamp: metricsData.timestamp,
      });
    });

    it('should handle farm lifecycle events', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const farmData = {
        id: 'farm-456',
        name: 'Lifecycle Farm',
        status: 'running',
      };

      // Test farm:created
      act(() => {
        eventHandlers['farm:created'](farmData);
      });

      expect(result.current.lastMessage?.type).toBe('farm_update');
      expect(result.current.lastMessage?.payload).toEqual({
        event: 'created',
        farm: farmData,
      });

      // Test farm:updated
      act(() => {
        eventHandlers['farm:updated'](farmData);
      });

      expect(result.current.lastMessage?.payload).toEqual({
        event: 'updated',
        farm: farmData,
      });

      // Test farm:deleted
      act(() => {
        eventHandlers['farm:deleted']({ id: farmData.id });
      });

      expect(result.current.lastMessage?.payload).toEqual({
        event: 'deleted',
        farmId: farmData.id,
      });
    });

    it('should handle GoWild events', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const goWildEvents = [
        { event: 'goWild:started', data: { sessionId: 'session-123' } },
        { event: 'goWild:node-added', data: { nodeId: 'node-456' } },
        { event: 'goWild:discovery-made', data: { discovery: 'New pattern' } },
        { event: 'goWild:status-changed', data: { status: 'exploring' } },
        { event: 'goWild:path-changed', data: { path: ['node1', 'node2'] } },
        { event: 'goWild:boundary-reached', data: { boundary: 'creativity' } },
      ];

      goWildEvents.forEach(({ event, data }) => {
        act(() => {
          eventHandlers[event](data);
        });

        expect(result.current.lastMessage).toEqual({
          type: event,
          payload: data,
          timestamp: expect.any(Date),
        });
      });
    });
  });

  describe('Message Sending', () => {
    it('should send messages when connected', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      // Connect first
      act(() => {
        mockSocket.connected = true;
        eventHandlers['connect']();
      });

      const message: WebSocketMessage = {
        type: 'notification',
        payload: { text: 'Test' },
        timestamp: new Date(),
      };

      act(() => {
        result.current.sendMessage(message);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('message', message);
    });

    it('should warn when sending message while disconnected', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const message: WebSocketMessage = {
        type: 'notification',
        payload: { text: 'Test' },
        timestamp: new Date(),
      };

      act(() => {
        result.current.sendMessage(message);
      });

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot send message: WebSocket is not connected'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Configuration Options', () => {
    it('should use custom reconnection settings', () => {
      renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
          reconnect: true,
          reconnectAttempts: 10,
          reconnectDelay: 2000,
        })
      );

      expect(mockIo).toHaveBeenCalledWith('http://localhost:4567', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });
    });

    it('should disable reconnection when specified', () => {
      renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
          reconnect: false,
        })
      );

      expect(mockIo).toHaveBeenCalledWith('http://localhost:4567', {
        transports: ['websocket'],
        reconnection: false,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const error = new Error('Connection failed');

      act(() => {
        eventHandlers['error'](error);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('WebSocket error:', error);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Socket Instance Access', () => {
    it('should provide access to socket instance', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      expect(result.current.socket).toBe(mockSocket);
    });

    it('should update socket instance on reconnect', () => {
      const { result } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      const firstSocket = result.current.socket;

      // Create new mock socket for reconnection
      const newMockSocket = {
        ...mockSocket,
        id: 'new-socket',
      };
      mockIo.mockReturnValue(newMockSocket as Socket);

      act(() => {
        result.current.reconnect();
      });

      expect(result.current.socket).toBe(newMockSocket);
      expect(result.current.socket).not.toBe(firstSocket);
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks on rapid reconnections', () => {
      const { result, rerender } = renderHook(() =>
        useWebSocket({
          url: 'http://localhost:4567',
        })
      );

      // Simulate rapid reconnections
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.disconnect();
          result.current.reconnect();
        });
        rerender();
      }

      // Should only have one socket instance
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(10);
    });
  });
});