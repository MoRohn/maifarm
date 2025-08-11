import { Server as SocketIOServer, Socket as ServerSocket } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server } from 'http';
import { EventEmitter } from 'events';

/**
 * WebSocket Test Helper
 * Provides utilities for reliable WebSocket testing with proper cleanup
 */
export class WebSocketTestHelper extends EventEmitter {
  private httpServer: Server | null = null;
  private ioServer: SocketIOServer | null = null;
  private clients: Map<string, ClientSocket> = new Map();
  private serverSockets: Map<string, ServerSocket> = new Map();
  private messageLog: Array<{ event: string; data: any; timestamp: number }> = [];
  private port: number = 0;

  constructor() {
    super();
    this.setMaxListeners(50); // Prevent memory leak warnings in tests
  }

  /**
   * Initialize WebSocket server for testing
   */
  async setupServer(options: {
    port?: number;
    namespace?: string;
    middlewares?: Array<(socket: ServerSocket, next: any) => void>;
  } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer();
        this.ioServer = new SocketIOServer(this.httpServer, {
          cors: { origin: '*' },
          transports: ['websocket'],
          pingTimeout: 60000,
          pingInterval: 25000
        });

        // Apply middlewares
        if (options.middlewares) {
          options.middlewares.forEach(middleware => {
            this.ioServer!.use(middleware);
          });
        }

        // Track server connections
        this.ioServer.on('connection', (socket: ServerSocket) => {
          this.serverSockets.set(socket.id, socket);
          
          socket.on('disconnect', () => {
            this.serverSockets.delete(socket.id);
          });

          // Log all messages for debugging
          socket.onAny((event, ...args) => {
            this.messageLog.push({
              event,
              data: args,
              timestamp: Date.now()
            });
          });
        });

        const port = options.port || 0; // 0 = random available port
        this.httpServer.listen(port, () => {
          this.port = (this.httpServer!.address() as any).port;
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create a test client with automatic cleanup
   */
  async createClient(id: string = 'test-client', options: {
    auth?: Record<string, any>;
    reconnection?: boolean;
    timeout?: number;
  } = {}): Promise<ClientSocket> {
    const client = ioClient(`http://localhost:${this.port}`, {
      transports: ['websocket'],
      reconnection: options.reconnection ?? false,
      timeout: options.timeout ?? 5000,
      auth: options.auth
    });

    this.clients.set(id, client);

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Client connection timeout'));
      }, options.timeout ?? 5000);

      client.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return client;
  }

  /**
   * Emit event from server to specific client
   */
  emitToClient(clientId: string, event: string, data?: any): void {
    const socket = Array.from(this.serverSockets.values())
      .find(s => s.id === clientId);
    
    if (socket) {
      socket.emit(event, data);
    } else {
      throw new Error(`Server socket ${clientId} not found`);
    }
  }

  /**
   * Broadcast event from server to all clients
   */
  broadcast(event: string, data?: any): void {
    if (this.ioServer) {
      this.ioServer.emit(event, data);
    }
  }

  /**
   * Wait for specific event with timeout
   */
  waitForEvent(
    target: ClientSocket | ServerSocket,
    event: string,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      target.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /**
   * Wait for multiple events in sequence
   */
  async waitForEvents(
    target: ClientSocket | ServerSocket,
    events: string[],
    timeout: number = 5000
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (const event of events) {
      const data = await this.waitForEvent(target, event, timeout);
      results.push(data);
    }
    
    return results;
  }

  /**
   * Simulate connection issues
   */
  async simulateDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Simulate reconnection
   */
  async simulateReconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      client.connect();
      await this.waitForEvent(client, 'connect', 5000);
    }
  }

  /**
   * Simulate network latency
   */
  addLatency(ms: number): void {
    if (this.ioServer) {
      this.ioServer.use((socket, next) => {
        setTimeout(() => next(), ms);
      });
    }
  }

  /**
   * Get message history for debugging
   */
  getMessageLog(filter?: { event?: string; since?: number }): any[] {
    let log = [...this.messageLog];
    
    if (filter?.event) {
      log = log.filter(m => m.event === filter.event);
    }
    
    if (filter?.since) {
      log = log.filter(m => m.timestamp >= filter.since);
    }
    
    return log;
  }

  /**
   * Clear message log
   */
  clearMessageLog(): void {
    this.messageLog = [];
  }

  /**
   * Mock server event handler
   */
  mockServerHandler(event: string, handler: (data: any) => any): void {
    if (this.ioServer) {
      this.ioServer.on('connection', (socket) => {
        socket.on(event, async (data, callback) => {
          try {
            const result = await handler(data);
            if (callback) callback(result);
          } catch (error) {
            if (callback) callback({ error: error.message });
          }
        });
      });
    }
  }

  /**
   * Test connection stability
   */
  async testConnectionStability(
    clientId: string,
    duration: number = 5000,
    expectedPings: number = 4
  ): Promise<{ stable: boolean; pings: number; disconnects: number }> {
    const client = this.clients.get(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    let pings = 0;
    let disconnects = 0;

    client.on('ping', () => pings++);
    client.on('disconnect', () => disconnects++);

    await new Promise(resolve => setTimeout(resolve, duration));

    client.off('ping');
    client.off('disconnect');

    return {
      stable: disconnects === 0 && pings >= expectedPings,
      pings,
      disconnects
    };
  }

  /**
   * Get server statistics
   */
  getServerStats(): {
    connectedClients: number;
    totalMessages: number;
    uptime: number;
  } {
    return {
      connectedClients: this.serverSockets.size,
      totalMessages: this.messageLog.length,
      uptime: process.uptime()
    };
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    // Disconnect all clients
    for (const [id, client] of this.clients) {
      if (client.connected) {
        client.removeAllListeners();
        client.disconnect();
      }
    }
    this.clients.clear();

    // Clear server sockets
    for (const [id, socket] of this.serverSockets) {
      socket.removeAllListeners();
      socket.disconnect(true);
    }
    this.serverSockets.clear();

    // Close server
    if (this.ioServer) {
      await new Promise<void>((resolve) => {
        this.ioServer!.close(() => resolve());
      });
      this.ioServer = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    // Clear message log
    this.messageLog = [];
    
    // Remove all event listeners
    this.removeAllListeners();
  }

  /**
   * Create a mock Socket.IO client for unit testing
   */
  createMockClient(): {
    socket: any;
    emit: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
  } {
    const handlers = new Map<string, Set<Function>>();
    
    const emit = jest.fn((event: string, ...args: any[]) => {
      const callbacks = handlers.get(event);
      if (callbacks) {
        callbacks.forEach(cb => cb(...args));
      }
    });

    const on = jest.fn((event: string, handler: Function) => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    });

    const off = jest.fn((event: string, handler?: Function) => {
      if (handler) {
        handlers.get(event)?.delete(handler);
      } else {
        handlers.delete(event);
      }
    });

    const connect = jest.fn(() => {
      emit('connect');
    });

    const disconnect = jest.fn(() => {
      emit('disconnect');
    });

    const socket = {
      id: 'mock-socket-' + Math.random().toString(36).substr(2, 9),
      connected: true,
      emit,
      on,
      off,
      once: on,
      connect,
      disconnect,
      removeAllListeners: () => handlers.clear()
    };

    return { socket, emit, on, off, connect, disconnect };
  }

  /**
   * Test helper for message ordering
   */
  async testMessageOrdering(
    client: ClientSocket,
    messages: Array<{ event: string; data: any }>,
    expectedOrder: string[]
  ): Promise<boolean> {
    const received: string[] = [];
    
    // Set up listeners
    messages.forEach(({ event }) => {
      client.on(event, () => {
        received.push(event);
      });
    });

    // Send messages
    messages.forEach(({ event, data }) => {
      this.broadcast(event, data);
    });

    // Wait for all messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clean up listeners
    messages.forEach(({ event }) => {
      client.off(event);
    });

    // Check order
    return JSON.stringify(received) === JSON.stringify(expectedOrder);
  }

  /**
   * Simulate packet loss
   */
  simulatePacketLoss(lossRate: number = 0.1): void {
    if (this.ioServer) {
      this.ioServer.use((socket, next) => {
        if (Math.random() > lossRate) {
          next();
        } else {
          // Silently drop the packet
          socket.disconnect(true);
        }
      });
    }
  }

  /**
   * Get connection quality metrics
   */
  async getConnectionQuality(clientId: string): Promise<{
    latency: number;
    jitter: number;
    packetLoss: number;
  }> {
    const client = this.clients.get(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    const measurements: number[] = [];
    const attempts = 10;
    let losses = 0;

    for (let i = 0; i < attempts; i++) {
      const start = Date.now();
      
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            client.emit('ping', { timestamp: start });
            client.once('pong', () => resolve());
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 1000);
          })
        ]);
        
        measurements.push(Date.now() - start);
      } catch {
        losses++;
      }
    }

    // Calculate metrics
    const latency = measurements.length > 0
      ? measurements.reduce((a, b) => a + b, 0) / measurements.length
      : Infinity;
    
    const jitter = measurements.length > 1
      ? Math.sqrt(
          measurements.reduce((sum, val) => sum + Math.pow(val - latency, 2), 0) /
          measurements.length
        )
      : 0;

    return {
      latency,
      jitter,
      packetLoss: losses / attempts
    };
  }
}

/**
 * Create a test helper instance with automatic cleanup
 */
export function createWebSocketTestHelper(): WebSocketTestHelper {
  const helper = new WebSocketTestHelper();
  
  // Ensure cleanup on test completion
  if (typeof afterEach !== 'undefined') {
    afterEach(async () => {
      await helper.cleanup();
    });
  }
  
  return helper;
}