// Mock implementation of CloudflareTunnelManager for testing
import { EventEmitter } from 'events';

export class CloudflareTunnelManager extends EventEmitter {
  private tunnelUrl: string | null = null;
  private isRunning: boolean = false;
  private authTokens: Map<string, boolean> = new Map();
  private rateLimitMap: Map<string, number[]> = new Map();
  private ipWhitelist: string[] = [];
  private autoReconnectEnabled: boolean = false;
  private circuitBreakerOpen: boolean = false;
  private failureCount: number = 0;
  
  constructor() {
    super();
  }
  
  // Tunnel setup and management
  async isCloudflaredInstalled(): Promise<boolean> {
    return Promise.resolve(true);
  }
  
  async ensureCloudflaredInstalled(): Promise<boolean> {
    return Promise.resolve(true);
  }
  
  async setupTunnel(port: number, options?: { timeout?: number }): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.circuitBreakerOpen) {
        reject(new Error('Circuit breaker is open'));
        return;
      }
      
      if (options?.timeout && options.timeout < 500) {
        setTimeout(() => {
          reject(new Error('Tunnel URL detection timeout'));
        }, options.timeout);
        return;
      }
      
      setTimeout(() => {
        this.isRunning = true;
        this.tunnelUrl = `https://harvest-terminal-${Math.random().toString(36).substr(2, 9)}.trycloudflare.com`;
        resolve(this.tunnelUrl);
      }, 100);
    });
  }
  
  async stopTunnel(): Promise<void> {
    this.isRunning = false;
    this.tunnelUrl = null;
    return Promise.resolve();
  }
  
  isRunning(): boolean {
    return this.isRunning;
  }
  
  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }
  
  // QR Code generation
  async generateQRCode(url: string): Promise<string> {
    return Promise.resolve(`data:image/png;base64,mockQRCode${url}`);
  }
  
  // Auto-reconnection
  enableAutoReconnect(): void {
    this.autoReconnectEnabled = true;
  }
  
  disableAutoReconnect(): void {
    this.autoReconnectEnabled = false;
  }
  
  // Authentication
  async generateAuthToken(): Promise<string> {
    const token = `auth-token-${Math.random().toString(36).substr(2, 20)}`;
    this.authTokens.set(token, true);
    return token;
  }
  
  async validateAuthToken(token: string): Promise<boolean> {
    return Promise.resolve(this.authTokens.has(token));
  }
  
  // Rate limiting
  async checkRateLimit(clientIP: string): Promise<boolean> {
    const now = Date.now();
    const attempts = this.rateLimitMap.get(clientIP) || [];
    
    // Remove attempts older than 1 minute
    const recentAttempts = attempts.filter(time => now - time < 60000);
    
    if (recentAttempts.length >= 10) {
      return Promise.resolve(false);
    }
    
    recentAttempts.push(now);
    this.rateLimitMap.set(clientIP, recentAttempts);
    return Promise.resolve(true);
  }
  
  // IP whitelisting
  async setIPWhitelist(whitelist: string[]): Promise<void> {
    this.ipWhitelist = whitelist;
    return Promise.resolve();
  }
  
  async isIPAllowed(ip: string): Promise<boolean> {
    if (this.ipWhitelist.length === 0) {
      return Promise.resolve(true);
    }
    
    // Simple check for testing - in real implementation would check CIDR ranges
    return Promise.resolve(
      this.ipWhitelist.some(range => {
        if (range.includes('/')) {
          const [subnet] = range.split('/');
          return ip.startsWith(subnet.split('.').slice(0, -1).join('.'));
        }
        return range === ip;
      })
    );
  }
  
  // Encryption
  async encryptData(data: any): Promise<string> {
    return Promise.resolve(Buffer.from(JSON.stringify(data)).toString('base64'));
  }
  
  async decryptData(encrypted: string): Promise<any> {
    return Promise.resolve(JSON.parse(Buffer.from(encrypted, 'base64').toString()));
  }
  
  // Health monitoring
  async getHealthStatus(): Promise<any> {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      uptime: this.isRunning ? 3600000 : 0,
      tunnelUrl: this.tunnelUrl,
      connectedClients: Math.floor(Math.random() * 10),
      bandwidth: {
        upload: Math.random() * 1024 * 1024,
        download: Math.random() * 2048 * 1024
      }
    };
  }
  
  // Bandwidth tracking
  async recordDataTransfer(type: 'upload' | 'download', bytes: number): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }
  
  async getBandwidthStats(): Promise<any> {
    return {
      totalUpload: 1024 * 1024,
      totalDownload: 2 * 1024 * 1024,
      totalBandwidth: 3 * 1024 * 1024
    };
  }
  
  // Mobile optimization
  async getMobileOptimizedConfig(): Promise<any> {
    return {
      compression: true,
      lowBandwidthMode: true,
      adaptiveQuality: true,
      maxPayloadSize: 512 * 1024,
      reconnectStrategy: 'aggressive',
      keepAliveInterval: 30000
    };
  }
  
  async getCurrentConfig(): Promise<any> {
    return {
      compression: false,
      lowBandwidthMode: false
    };
  }
  
  async handleNetworkChange(from: string, to: string): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }
  
  // Push notifications
  async registerDeviceForNotifications(deviceToken: string): Promise<void> {
    return Promise.resolve();
  }
  
  async sendNotification(deviceToken: string, notification: any): Promise<any> {
    return {
      success: true,
      messageId: `msg-${Math.random().toString(36).substr(2, 9)}`
    };
  }
  
  // Circuit breaker
  isCircuitOpen(): boolean {
    return this.circuitBreakerOpen;
  }
  
  openCircuit(): void {
    this.circuitBreakerOpen = true;
  }
  
  closeCircuit(): void {
    this.circuitBreakerOpen = false;
    this.failureCount = 0;
  }
  
  // Mock helper methods for testing
  simulateFailure(): void {
    this.failureCount++;
    if (this.failureCount >= 5) {
      this.openCircuit();
    }
  }
  
  reset(): void {
    this.tunnelUrl = null;
    this.isRunning = false;
    this.authTokens.clear();
    this.rateLimitMap.clear();
    this.ipWhitelist = [];
    this.autoReconnectEnabled = false;
    this.circuitBreakerOpen = false;
    this.failureCount = 0;
  }
}

// Export as default for jest mocking
export default CloudflareTunnelManager;