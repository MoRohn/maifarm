// Mock implementation of EnhancedWebSocketService for testing
export class EnhancedWebSocketService {
  private listeners: Map<string, Function[]> = new Map();
  private connected: boolean = false;
  private connectionId: string = 'mock-connection-id';
  private messageQueue: any[] = [];
  private retryAttempts: number = 0;
  private maxRetries: number = 5;
  
  constructor() {
    this.connected = true;
  }
  
  // Connection management
  connect(url?: string): Promise<void> {
    return new Promise((resolve) => {
      this.connected = true;
      setTimeout(() => {
        this.emit('connect', { connectionId: this.connectionId });
        resolve();
      }, 100);
    });
  }
  
  disconnect(): void {
    this.connected = false;
    this.emit('disconnect', { reason: 'Manual disconnect' });
  }
  
  reconnect(): Promise<void> {
    this.retryAttempts++;
    if (this.retryAttempts > this.maxRetries) {
      return Promise.reject(new Error('Max retries exceeded'));
    }
    return this.connect();
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  getConnectionId(): string {
    return this.connectionId;
  }
  
  // Event handling
  on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }
  
  off(event: string, handler?: Function): void {
    if (!handler) {
      this.listeners.delete(event);
    } else {
      const handlers = this.listeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }
  
  emit(event: string, data?: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
  
  // Message handling
  send(event: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        this.messageQueue.push({ event, data });
        reject(new Error('Not connected'));
      } else {
        // Simulate successful send
        setTimeout(() => {
          this.emit('message-sent', { event, data });
          resolve();
        }, 10);
      }
    });
  }
  
  // Batch operations
  sendBatch(messages: Array<{ event: string; data: any }>): Promise<void> {
    return Promise.all(messages.map(msg => this.send(msg.event, msg.data)))
      .then(() => undefined);
  }
  
  // Performance metrics
  getMetrics() {
    return {
      latency: 10,
      throughput: 1000,
      messagesQueued: this.messageQueue.length,
      connectionUptime: 3600000,
      reconnectAttempts: this.retryAttempts,
      packetsLost: 0,
      bandwidth: {
        upload: 1024,
        download: 2048
      }
    };
  }
  
  // Health monitoring
  startHealthCheck(interval: number = 30000): void {
    // Mock implementation
  }
  
  stopHealthCheck(): void {
    // Mock implementation
  }
  
  getHealthStatus() {
    return {
      status: this.connected ? 'healthy' : 'unhealthy',
      lastPing: Date.now(),
      responseTime: 10
    };
  }
  
  // Message queue management
  flushMessageQueue(): Promise<void> {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return this.sendBatch(messages);
  }
  
  getQueuedMessages(): any[] {
    return [...this.messageQueue];
  }
  
  clearMessageQueue(): void {
    this.messageQueue = [];
  }
  
  // Rate limiting
  setRateLimit(messagesPerSecond: number): void {
    // Mock implementation
  }
  
  // Compression
  enableCompression(enabled: boolean): void {
    // Mock implementation
  }
  
  // Priority messaging
  sendPriority(event: string, data: any, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    return this.send(event, data);
  }
  
  // Room/Channel support
  join(room: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emit('room-joined', { room });
        resolve();
      }, 10);
    });
  }
  
  leave(room: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emit('room-left', { room });
        resolve();
      }, 10);
    });
  }
  
  // Binary data support
  sendBinary(data: ArrayBuffer): Promise<void> {
    return this.send('binary', data);
  }
  
  // Mock helper methods for testing
  simulateDisconnect(): void {
    this.connected = false;
    this.emit('disconnect', { reason: 'Network error' });
  }
  
  simulateReconnect(): void {
    this.connected = true;
    this.emit('reconnect', { connectionId: this.connectionId });
  }
  
  simulateMessage(event: string, data: any): void {
    this.emit(event, data);
  }
  
  simulateError(error: Error): void {
    this.emit('error', error);
  }
  
  reset(): void {
    this.listeners.clear();
    this.messageQueue = [];
    this.connected = false;
    this.retryAttempts = 0;
  }
}

// Export as default for jest mocking
export default EnhancedWebSocketService;