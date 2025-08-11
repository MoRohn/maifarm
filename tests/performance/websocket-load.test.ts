import { performance } from 'perf_hooks';
import { io, Socket } from 'socket.io-client';

// Performance test configuration
const TEST_CONFIG = {
  wsUrl: process.env.WS_URL || 'http://localhost:4567',
  numClients: parseInt(process.env.PERF_CLIENTS || '100'),
  testDuration: parseInt(process.env.PERF_DURATION || '60000'), // 60 seconds
  messageInterval: parseInt(process.env.PERF_MSG_INTERVAL || '1000'), // 1 second
  connectionDelay: parseInt(process.env.PERF_CONN_DELAY || '50'), // 50ms between connections
};

interface PerformanceMetrics {
  connectionTime: number[];
  messageLatency: number[];
  messagesReceived: number;
  messagesSent: number;
  errors: number;
  reconnections: number;
  memoryUsage: NodeJS.MemoryUsage[];
}

class WebSocketLoadTest {
  private clients: Socket[] = [];
  private metrics: PerformanceMetrics = {
    connectionTime: [],
    messageLatency: [],
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    reconnections: 0,
    memoryUsage: [],
  };
  private messageTimestamps: Map<string, number> = new Map();

  async runTest(): Promise<void> {
    console.log('🚀 Starting WebSocket Load Test');
    console.log(`Configuration:`, TEST_CONFIG);
    
    try {
      // Start memory monitoring
      this.startMemoryMonitoring();
      
      // Create and connect clients
      await this.createClients();
      
      // Run message load test
      await this.runMessageLoadTest();
      
      // Wait for test duration
      await this.wait(TEST_CONFIG.testDuration);
      
      // Cleanup
      await this.cleanup();
      
      // Report results
      this.reportResults();
    } catch (error) {
      console.error('Test failed:', error);
      throw error;
    }
  }

  private async createClients(): Promise<void> {
    console.log(`Creating ${TEST_CONFIG.numClients} WebSocket clients...`);
    
    for (let i = 0; i < TEST_CONFIG.numClients; i++) {
      await this.createClient(i);
      await this.wait(TEST_CONFIG.connectionDelay);
    }
    
    console.log(`✅ All ${TEST_CONFIG.numClients} clients connected`);
  }

  private async createClient(index: number): Promise<void> {
    const startTime = performance.now();
    
    return new Promise((resolve, reject) => {
      const client = io(TEST_CONFIG.wsUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      });
      
      client.on('connect', () => {
        const connectionTime = performance.now() - startTime;
        this.metrics.connectionTime.push(connectionTime);
        
        // Set up event handlers
        this.setupClientHandlers(client, index);
        
        this.clients.push(client);
        resolve();
      });
      
      client.on('connect_error', (error) => {
        this.metrics.errors++;
        console.error(`Client ${index} connection error:`, error.message);
        reject(error);
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!client.connected) {
          reject(new Error(`Client ${index} connection timeout`));
        }
      }, 10000);
    });
  }

  private setupClientHandlers(client: Socket, index: number): void {
    // Handle incoming messages
    client.on('message', (data: any) => {
      this.metrics.messagesReceived++;
      
      // Calculate latency if this is a response to our message
      if (data.id && this.messageTimestamps.has(data.id)) {
        const latency = performance.now() - this.messageTimestamps.get(data.id)!;
        this.metrics.messageLatency.push(latency);
        this.messageTimestamps.delete(data.id);
      }
    });
    
    // Handle farm status updates
    client.on('farm:status', () => {
      this.metrics.messagesReceived++;
    });
    
    // Handle agent updates
    client.on('agent:updated', () => {
      this.metrics.messagesReceived++;
    });
    
    // Handle reconnections
    client.on('reconnect', () => {
      this.metrics.reconnections++;
      console.log(`Client ${index} reconnected`);
    });
    
    // Handle errors
    client.on('error', (error) => {
      this.metrics.errors++;
      console.error(`Client ${index} error:`, error);
    });
  }

  private async runMessageLoadTest(): Promise<void> {
    console.log('📤 Starting message load test...');
    
    const messageInterval = setInterval(() => {
      this.clients.forEach((client, index) => {
        if (client.connected) {
          const messageId = `msg-${index}-${Date.now()}`;
          this.messageTimestamps.set(messageId, performance.now());
          
          client.emit('test:message', {
            id: messageId,
            timestamp: Date.now(),
            data: this.generateTestData(),
          });
          
          this.metrics.messagesSent++;
        }
      });
    }, TEST_CONFIG.messageInterval);
    
    // Stop sending messages after test duration
    setTimeout(() => {
      clearInterval(messageInterval);
      console.log('📤 Message load test completed');
    }, TEST_CONFIG.testDuration);
  }

  private generateTestData(): any {
    return {
      farmId: `farm-${Math.random().toString(36).substr(2, 9)}`,
      agents: Array.from({ length: 5 }, (_, i) => ({
        id: `agent-${i}`,
        status: ['active', 'idle', 'processing'][Math.floor(Math.random() * 3)],
        tasksCompleted: Math.floor(Math.random() * 100),
      })),
      metrics: {
        cpu: Math.random() * 100,
        memory: Math.random() * 8192,
        throughput: Math.floor(Math.random() * 1000),
      },
      timestamp: Date.now(),
    };
  }

  private startMemoryMonitoring(): void {
    const memoryInterval = setInterval(() => {
      this.metrics.memoryUsage.push(process.memoryUsage());
    }, 5000); // Check every 5 seconds
    
    // Stop monitoring after test
    setTimeout(() => {
      clearInterval(memoryInterval);
    }, TEST_CONFIG.testDuration + 5000);
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up connections...');
    
    for (const client of this.clients) {
      client.disconnect();
    }
    
    this.clients = [];
    this.messageTimestamps.clear();
    
    // Wait for connections to close
    await this.wait(1000);
    
    console.log('✅ Cleanup completed');
  }

  private reportResults(): void {
    console.log('\n📊 PERFORMANCE TEST RESULTS');
    console.log('=' .repeat(50));
    
    // Connection metrics
    const avgConnectionTime = this.average(this.metrics.connectionTime);
    const p95ConnectionTime = this.percentile(this.metrics.connectionTime, 95);
    const p99ConnectionTime = this.percentile(this.metrics.connectionTime, 99);
    
    console.log('\n🔌 Connection Metrics:');
    console.log(`  Total Clients: ${TEST_CONFIG.numClients}`);
    console.log(`  Successful Connections: ${this.metrics.connectionTime.length}`);
    console.log(`  Average Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
    console.log(`  P95 Connection Time: ${p95ConnectionTime.toFixed(2)}ms`);
    console.log(`  P99 Connection Time: ${p99ConnectionTime.toFixed(2)}ms`);
    console.log(`  Reconnections: ${this.metrics.reconnections}`);
    
    // Message metrics
    const avgLatency = this.average(this.metrics.messageLatency);
    const p95Latency = this.percentile(this.metrics.messageLatency, 95);
    const p99Latency = this.percentile(this.metrics.messageLatency, 99);
    const messageRate = this.metrics.messagesSent / (TEST_CONFIG.testDuration / 1000);
    
    console.log('\n📨 Message Metrics:');
    console.log(`  Messages Sent: ${this.metrics.messagesSent}`);
    console.log(`  Messages Received: ${this.metrics.messagesReceived}`);
    console.log(`  Message Rate: ${messageRate.toFixed(2)} msg/s`);
    console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`  P95 Latency: ${p95Latency.toFixed(2)}ms`);
    console.log(`  P99 Latency: ${p99Latency.toFixed(2)}ms`);
    
    // Error metrics
    const errorRate = (this.metrics.errors / this.metrics.messagesSent) * 100;
    
    console.log('\n❌ Error Metrics:');
    console.log(`  Total Errors: ${this.metrics.errors}`);
    console.log(`  Error Rate: ${errorRate.toFixed(2)}%`);
    
    // Memory metrics
    if (this.metrics.memoryUsage.length > 0) {
      const avgMemory = this.metrics.memoryUsage.reduce((sum, mem) => 
        sum + mem.heapUsed, 0) / this.metrics.memoryUsage.length;
      const maxMemory = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed));
      
      console.log('\n💾 Memory Metrics:');
      console.log(`  Average Heap Used: ${(avgMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Max Heap Used: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Performance assessment
    console.log('\n✅ Performance Assessment:');
    this.assessPerformance(avgLatency, p99Latency, errorRate);
    
    console.log('\n' + '='.repeat(50));
  }

  private assessPerformance(avgLatency: number, p99Latency: number, errorRate: number): void {
    const assessments: string[] = [];
    
    // Latency assessment
    if (avgLatency < 50) {
      assessments.push('✅ Excellent average latency (<50ms)');
    } else if (avgLatency < 100) {
      assessments.push('✅ Good average latency (<100ms)');
    } else if (avgLatency < 200) {
      assessments.push('⚠️  Acceptable average latency (<200ms)');
    } else {
      assessments.push('❌ Poor average latency (>200ms)');
    }
    
    // P99 latency assessment
    if (p99Latency < 200) {
      assessments.push('✅ Excellent P99 latency (<200ms)');
    } else if (p99Latency < 500) {
      assessments.push('✅ Good P99 latency (<500ms)');
    } else if (p99Latency < 1000) {
      assessments.push('⚠️  Acceptable P99 latency (<1000ms)');
    } else {
      assessments.push('❌ Poor P99 latency (>1000ms)');
    }
    
    // Error rate assessment
    if (errorRate < 0.1) {
      assessments.push('✅ Excellent error rate (<0.1%)');
    } else if (errorRate < 1) {
      assessments.push('✅ Good error rate (<1%)');
    } else if (errorRate < 5) {
      assessments.push('⚠️  Acceptable error rate (<5%)');
    } else {
      assessments.push('❌ Poor error rate (>5%)');
    }
    
    assessments.forEach(assessment => console.log(`  ${assessment}`));
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new WebSocketLoadTest();
  test.runTest()
    .then(() => {
      console.log('✅ WebSocket load test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ WebSocket load test failed:', error);
      process.exit(1);
    });
}

export { WebSocketLoadTest, PerformanceMetrics };