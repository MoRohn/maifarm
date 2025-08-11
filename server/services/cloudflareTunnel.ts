import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as QRCode from 'qrcode';
import winston from 'winston';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TunnelConfig {
  tunnelName?: string;
  hostname?: string;
  port: number;
  protocol?: 'http' | 'https';
  credentials?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  retryDelay?: number;
  maxRetries?: number;
}

interface TunnelStatus {
  isRunning: boolean;
  url: string | null;
  connectedAt: Date | null;
  metrics: {
    requestsPerMinute: number;
    bytesTransferred: number;
    activeConnections: number;
    uptime: number;
  };
  devices: Array<{
    id: string;
    ip: string;
    userAgent: string;
    lastSeen: Date;
  }>;
}

interface CloudflareMetrics {
  timestamp: Date;
  requests: number;
  bandwidth: number;
  errors: number;
  latency: number;
}

export class CloudflareTunnelManager extends EventEmitter {
  private tunnelProcess: ChildProcess | null = null;
  private tunnelUrl: string = '';
  private config: TunnelConfig;
  private status: TunnelStatus;
  private logger: winston.Logger;
  private retryCount: number = 0;
  private metricsInterval: NodeJS.Timeout | null = null;
  private qrCodeCache: Map<string, string> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private metricsHistory: CloudflareMetrics[] = [];
  private maxMetricsHistory: number = 100;

  constructor(config: TunnelConfig) {
    super();
    
    this.config = {
      protocol: 'http',
      logLevel: 'info',
      retryDelay: 5000,
      maxRetries: 10,
      ...config
    };
    
    this.status = {
      isRunning: false,
      url: null,
      connectedAt: null,
      metrics: {
        requestsPerMinute: 0,
        bytesTransferred: 0,
        activeConnections: 0,
        uptime: 0
      },
      devices: []
    };
    
    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[CloudflareTunnel] ${timestamp} ${level}: ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
          filename: 'logs/cloudflare-tunnel.log',
          maxsize: 5242880, // 5MB
          maxFiles: 3
        })
      ]
    });
  }

  /**
   * Setup and start the Cloudflare tunnel
   */
  async setupTunnel(): Promise<string> {
    try {
      this.logger.info('Setting up Cloudflare tunnel...');
      
      // Check if cloudflared is installed
      const isInstalled = await this.checkCloudflaredInstalled();
      if (!isInstalled) {
        await this.installCloudflared();
      }
      
      // Generate tunnel configuration
      const configPath = await this.generateTunnelConfig();
      
      // Start the tunnel
      const url = await this.startTunnel(configPath);
      
      // Start monitoring
      this.startMetricsCollection();
      
      // Generate QR code for mobile access
      await this.generateQRCode(url);
      
      this.logger.info(`Tunnel successfully established at: ${url}`);
      this.emit('tunnel:ready', { url, qrCode: this.qrCodeCache.get(url) });
      
      return url;
      
    } catch (error) {
      this.logger.error(`Failed to setup tunnel: ${error}`);
      this.emit('tunnel:error', error);
      
      // Retry logic
      if (this.retryCount < (this.config.maxRetries || 10)) {
        this.retryCount++;
        this.logger.info(`Retrying tunnel setup (${this.retryCount}/${this.config.maxRetries})...`);
        
        this.reconnectTimeout = setTimeout(() => {
          this.setupTunnel();
        }, this.config.retryDelay);
      }
      
      throw error;
    }
  }

  /**
   * Check if cloudflared is installed
   */
  private async checkCloudflaredInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('cloudflared --version');
      this.logger.debug(`Cloudflared version: ${stdout.trim()}`);
      return true;
    } catch {
      this.logger.warn('Cloudflared not found');
      return false;
    }
  }

  /**
   * Install cloudflared if not present
   */
  private async installCloudflared(): Promise<void> {
    this.logger.info('Installing cloudflared...');
    
    const platform = process.platform;
    let installCommand = '';
    
    switch (platform) {
      case 'darwin':
        // macOS installation
        installCommand = 'brew install cloudflared';
        break;
      case 'linux':
        // Linux installation
        const arch = process.arch;
        const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
        installCommand = `wget -q ${downloadUrl} -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared`;
        break;
      case 'win32':
        // Windows installation
        this.logger.error('Automated Windows installation not supported. Please install cloudflared manually.');
        throw new Error('Please install cloudflared manually on Windows');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    try {
      await execAsync(installCommand);
      this.logger.info('Cloudflared installed successfully');
    } catch (error) {
      this.logger.error(`Failed to install cloudflared: ${error}`);
      throw new Error('Failed to install cloudflared. Please install it manually.');
    }
  }

  /**
   * Generate tunnel configuration
   */
  private async generateTunnelConfig(): Promise<string> {
    const configDir = path.join(process.cwd(), '.cloudflare');
    const configPath = path.join(configDir, 'config.yml');
    
    // Ensure config directory exists
    await fs.mkdir(configDir, { recursive: true });
    
    const config = {
      tunnel: this.config.tunnelName || `maifarm-${Date.now()}`,
      credentials_file: this.config.credentials || path.join(configDir, 'credentials.json'),
      ingress: [
        {
          hostname: this.config.hostname || '',
          service: `${this.config.protocol}://localhost:${this.config.port}`,
          originRequest: {
            noTLSVerify: true,
            connectTimeout: '30s',
            tcpKeepAlive: '30s',
            keepAliveConnections: 100,
            keepAliveTimeout: '90s',
            httpHostHeader: 'localhost',
            http2Origin: true
          }
        },
        {
          service: 'http_status:404'
        }
      ],
      metrics: 'localhost:2000',
      loglevel: this.config.logLevel
    };
    
    const yamlContent = this.objectToYaml(config);
    await fs.writeFile(configPath, yamlContent);
    
    this.logger.debug(`Tunnel config generated at: ${configPath}`);
    return configPath;
  }

  /**
   * Start the tunnel process
   */
  private async startTunnel(configPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        'tunnel',
        '--no-autoupdate',
        '--url', `http://localhost:${this.config.port}`,
        '--metrics', 'localhost:2000'
      ];
      
      if (this.config.tunnelName) {
        args.push('--name', this.config.tunnelName);
      }
      
      if (this.config.hostname) {
        args.push('--hostname', this.config.hostname);
      }
      
      this.tunnelProcess = spawn('cloudflared', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      let urlDetected = false;
      
      // Listen for stdout to capture the tunnel URL
      this.tunnelProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.logger.debug(`Cloudflared stdout: ${output}`);
        
        // Look for the tunnel URL in the output
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !urlDetected) {
          urlDetected = true;
          this.tunnelUrl = urlMatch[0];
          this.status.url = this.tunnelUrl;
          this.status.isRunning = true;
          this.status.connectedAt = new Date();
          this.retryCount = 0;
          
          this.logger.info(`Tunnel URL detected: ${this.tunnelUrl}`);
          resolve(this.tunnelUrl);
        }
      });
      
      // Listen for stderr
      this.tunnelProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        this.logger.error(`Cloudflared stderr: ${error}`);
        
        if (!urlDetected) {
          // Check for common error patterns
          if (error.includes('failed to authenticate')) {
            reject(new Error('Authentication failed. Please check your Cloudflare credentials.'));
          } else if (error.includes('port is already allocated')) {
            reject(new Error('Port already in use. Please choose a different port.'));
          }
        }
      });
      
      // Handle process exit
      this.tunnelProcess.on('exit', (code, signal) => {
        this.logger.info(`Cloudflared process exited with code ${code}, signal ${signal}`);
        this.status.isRunning = false;
        this.status.url = null;
        this.tunnelProcess = null;
        
        if (!urlDetected) {
          reject(new Error(`Tunnel process exited without establishing connection (code: ${code})`));
        }
        
        // Auto-reconnect if not shutting down
        if (!this.isShuttingDown && this.retryCount < (this.config.maxRetries || 10)) {
          this.handleReconnect();
        }
      });
      
      // Handle process errors
      this.tunnelProcess.on('error', (error) => {
        this.logger.error(`Cloudflared process error: ${error}`);
        reject(error);
      });
      
      // Timeout if URL not detected
      setTimeout(() => {
        if (!urlDetected) {
          this.killTunnel();
          reject(new Error('Timeout: Failed to detect tunnel URL after 30 seconds'));
        }
      }, 30000);
    });
  }

  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    if (this.isShuttingDown) return;
    
    this.retryCount++;
    this.logger.info(`Attempting to reconnect tunnel (${this.retryCount}/${this.config.maxRetries})...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.setupTunnel();
      } catch (error) {
        this.logger.error(`Reconnection failed: ${error}`);
      }
    }, this.config.retryDelay);
  }

  /**
   * Generate QR code for easy mobile access
   */
  async generateQRCode(url: string): Promise<string> {
    try {
      // Check cache first
      if (this.qrCodeCache.has(url)) {
        return this.qrCodeCache.get(url)!;
      }
      
      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });
      
      // Also save as file
      const qrCodePath = path.join(process.cwd(), '.cloudflare', 'tunnel-qr.png');
      await QRCode.toFile(qrCodePath, url, {
        width: 512,
        margin: 2
      });
      
      // Cache the result
      this.qrCodeCache.set(url, qrCodeDataUrl);
      
      this.logger.info(`QR code generated for URL: ${url}`);
      this.logger.info(`QR code saved to: ${qrCodePath}`);
      
      return qrCodeDataUrl;
      
    } catch (error) {
      this.logger.error(`Failed to generate QR code: ${error}`);
      throw error;
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.fetchMetrics();
        this.updateStatus(metrics);
        this.emit('tunnel:metrics', metrics);
        
        // Store metrics history
        this.metricsHistory.push({
          timestamp: new Date(),
          requests: metrics.requestsPerMinute,
          bandwidth: metrics.bytesTransferred,
          errors: 0,
          latency: 0
        });
        
        // Trim history if needed
        if (this.metricsHistory.length > this.maxMetricsHistory) {
          this.metricsHistory.shift();
        }
        
      } catch (error) {
        this.logger.debug(`Failed to fetch metrics: ${error}`);
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Fetch metrics from cloudflared
   */
  private async fetchMetrics(): Promise<any> {
    try {
      // Cloudflared exposes metrics on localhost:2000 by default
      const response = await fetch('http://localhost:2000/metrics');
      const text = await response.text();
      
      // Parse Prometheus-style metrics
      const metrics = this.parsePrometheusMetrics(text);
      
      return {
        requestsPerMinute: metrics['cloudflared_tunnel_requests_total'] || 0,
        bytesTransferred: metrics['cloudflared_tunnel_bytes_transferred'] || 0,
        activeConnections: metrics['cloudflared_tunnel_active_connections'] || 0,
        uptime: this.status.connectedAt 
          ? Math.floor((Date.now() - this.status.connectedAt.getTime()) / 1000)
          : 0
      };
      
    } catch (error) {
      // Return default metrics if fetch fails
      return {
        requestsPerMinute: 0,
        bytesTransferred: 0,
        activeConnections: 0,
        uptime: this.status.connectedAt 
          ? Math.floor((Date.now() - this.status.connectedAt.getTime()) / 1000)
          : 0
      };
    }
  }

  /**
   * Parse Prometheus metrics format
   */
  private parsePrometheusMetrics(text: string): Record<string, number> {
    const metrics: Record<string, number> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+([0-9.]+)/);
      if (match) {
        metrics[match[1]] = parseFloat(match[2]);
      }
    }
    
    return metrics;
  }

  /**
   * Update status with metrics
   */
  private updateStatus(metrics: any): void {
    this.status.metrics = {
      ...this.status.metrics,
      ...metrics
    };
  }

  /**
   * Get current tunnel status
   */
  getStatus(): TunnelStatus {
    return { ...this.status };
  }

  /**
   * Get tunnel URL
   */
  getTunnelUrl(): string {
    return this.tunnelUrl;
  }

  /**
   * Get QR code for current tunnel
   */
  async getQRCode(): Promise<string | null> {
    if (!this.tunnelUrl) return null;
    
    if (this.qrCodeCache.has(this.tunnelUrl)) {
      return this.qrCodeCache.get(this.tunnelUrl)!;
    }
    
    return await this.generateQRCode(this.tunnelUrl);
  }

  /**
   * Track device connection
   */
  trackDevice(deviceInfo: { id: string; ip: string; userAgent: string }): void {
    const existingIndex = this.status.devices.findIndex(d => d.id === deviceInfo.id);
    
    if (existingIndex >= 0) {
      this.status.devices[existingIndex].lastSeen = new Date();
    } else {
      this.status.devices.push({
        ...deviceInfo,
        lastSeen: new Date()
      });
    }
    
    // Clean up old devices (not seen in last hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    this.status.devices = this.status.devices.filter(d => d.lastSeen > oneHourAgo);
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): CloudflareMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Kill the tunnel process
   */
  private killTunnel(): void {
    if (this.tunnelProcess) {
      this.tunnelProcess.kill('SIGTERM');
      this.tunnelProcess = null;
    }
  }

  /**
   * Shutdown the tunnel
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Cloudflare tunnel...');
    this.isShuttingDown = true;
    
    // Clear intervals and timeouts
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Kill tunnel process
    this.killTunnel();
    
    // Update status
    this.status.isRunning = false;
    this.status.url = null;
    
    this.emit('tunnel:shutdown');
    this.logger.info('Cloudflare tunnel shutdown complete');
  }

  /**
   * Convert object to YAML format
   */
  private objectToYaml(obj: any, indent: number = 0): string {
    let yaml = '';
    const spaces = ' '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      
      yaml += `${spaces}${key}:`;
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += '\n' + this.objectToYaml(value, indent + 2);
      } else if (Array.isArray(value)) {
        yaml += '\n';
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}- \n${this.objectToYaml(item, indent + 4)}`;
          } else {
            yaml += `${spaces}- ${item}\n`;
          }
        }
      } else {
        yaml += ` ${value}\n`;
      }
    }
    
    return yaml;
  }
}