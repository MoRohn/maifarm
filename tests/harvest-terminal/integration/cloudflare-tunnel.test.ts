import { CloudflareTunnelManager } from '../../../server/services/cloudflareTunnel';
import { EnhancedWebSocketService } from '../../../src/services/websocket/EnhancedWebSocketService';
import { spawn } from 'child_process';
import * as QRCode from 'qrcode';
import fetch from 'node-fetch';

jest.mock('child_process');
jest.mock('qrcode');
jest.mock('node-fetch');

describe('Cloudflare Tunnel Integration Tests', () => {
  let tunnelManager: CloudflareTunnelManager;
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  
  beforeEach(() => {
    tunnelManager = new CloudflareTunnelManager();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });
  
  afterEach(async () => {
    await tunnelManager.stopTunnel();
  });

  describe('Tunnel Setup and Configuration', () => {
    it('should check if cloudflared is installed', async () => {
      mockSpawn.mockReturnValue({
        stdout: { on: jest.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from('cloudflared version 2023.8.0'));
        })},
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'exit') cb(0);
        }),
        kill: jest.fn()
      } as any);
      
      const isInstalled = await tunnelManager.isCloudflaredInstalled();
      
      expect(isInstalled).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('cloudflared', ['--version']);
    });

    it('should install cloudflared if not present', async () => {
      // First check returns not found
      mockSpawn.mockReturnValueOnce({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from('command not found'));
        })},
        on: jest.fn((event, cb) => {
          if (event === 'exit') cb(127);
        }),
        kill: jest.fn()
      } as any);
      
      // Installation command
      mockSpawn.mockReturnValueOnce({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'exit') cb(0);
        }),
        kill: jest.fn()
      } as any);
      
      const result = await tunnelManager.ensureCloudflaredInstalled();
      
      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('brew', ['install', 'cloudflare/cloudflare/cloudflared']);
    });

    it('should establish tunnel connection successfully', async () => {
      const mockTunnelProcess = {
        stdout: { 
          on: jest.fn((event, cb) => {
            if (event === 'data') {
              setTimeout(() => {
                cb(Buffer.from('https://harvest-terminal-abc123.trycloudflare.com'));
              }, 100);
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };
      
      mockSpawn.mockReturnValue(mockTunnelProcess as any);
      
      const url = await tunnelManager.setupTunnel(4567);
      
      expect(url).toBe('https://harvest-terminal-abc123.trycloudflare.com');
      expect(mockSpawn).toHaveBeenCalledWith('cloudflared', [
        'tunnel',
        '--url',
        'http://localhost:4567',
        '--no-autoupdate'
      ]);
    });

    it('should handle tunnel connection failures gracefully', async () => {
      mockSpawn.mockReturnValue({
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, cb) => {
            if (event === 'data') {
              cb(Buffer.from('Error: Unable to establish tunnel connection'));
            }
          })
        },
        on: jest.fn((event, cb) => {
          if (event === 'exit') cb(1);
        }),
        kill: jest.fn()
      } as any);
      
      await expect(tunnelManager.setupTunnel(4567)).rejects.toThrow('Failed to establish tunnel');
    });

    it('should generate QR code for mobile access', async () => {
      const mockUrl = 'https://harvest-terminal-abc123.trycloudflare.com';
      const mockQRCode = 'data:image/png;base64,iVBORw0KGgoAAAANS...';
      
      (QRCode.toDataURL as jest.Mock).mockResolvedValue(mockQRCode);
      
      const qrCode = await tunnelManager.generateQRCode(mockUrl);
      
      expect(qrCode).toBe(mockQRCode);
      expect(QRCode.toDataURL).toHaveBeenCalledWith(mockUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    });

    it('should implement automatic reconnection on failure', async () => {
      const mockTunnelProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'exit') {
            setTimeout(() => cb(1), 100); // Simulate crash
          }
        }),
        kill: jest.fn(),
        pid: 12345
      };
      
      mockSpawn.mockReturnValue(mockTunnelProcess as any);
      
      // Setup auto-reconnect
      tunnelManager.enableAutoReconnect();
      
      try {
        await tunnelManager.setupTunnel(4567);
      } catch (error) {
        // Expected to fail first time
      }
      
      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify reconnection was attempted
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Security and Authentication', () => {
    it('should implement authentication layer for tunnel access', async () => {
      const authToken = await tunnelManager.generateAuthToken();
      
      expect(authToken).toBeDefined();
      expect(authToken.length).toBeGreaterThan(32);
      
      // Verify token validation
      const isValid = await tunnelManager.validateAuthToken(authToken);
      expect(isValid).toBe(true);
      
      // Verify invalid token rejection
      const isInvalid = await tunnelManager.validateAuthToken('invalid-token');
      expect(isInvalid).toBe(false);
    });

    it('should implement rate limiting for tunnel connections', async () => {
      const clientIP = '192.168.1.100';
      
      // Simulate multiple connection attempts
      const attempts = [];
      for (let i = 0; i < 15; i++) {
        attempts.push(tunnelManager.checkRateLimit(clientIP));
      }
      
      const results = await Promise.all(attempts);
      
      // First 10 should succeed
      expect(results.slice(0, 10).every(r => r === true)).toBe(true);
      
      // Remaining should be rate limited
      expect(results.slice(10).every(r => r === false)).toBe(true);
    });

    it('should support IP whitelisting', async () => {
      // Configure whitelist
      await tunnelManager.setIPWhitelist(['192.168.1.0/24', '10.0.0.0/8']);
      
      // Test allowed IPs
      expect(await tunnelManager.isIPAllowed('192.168.1.50')).toBe(true);
      expect(await tunnelManager.isIPAllowed('10.0.0.1')).toBe(true);
      
      // Test blocked IPs
      expect(await tunnelManager.isIPAllowed('172.16.0.1')).toBe(false);
      expect(await tunnelManager.isIPAllowed('8.8.8.8')).toBe(false);
    });

    it('should encrypt sensitive data in tunnel communication', async () => {
      const sensitiveData = { apiKey: 'secret-key', password: 'secret-pass' };
      
      const encrypted = await tunnelManager.encryptData(sensitiveData);
      expect(encrypted).not.toContain('secret-key');
      expect(encrypted).not.toContain('secret-pass');
      
      const decrypted = await tunnelManager.decryptData(encrypted);
      expect(decrypted).toEqual(sensitiveData);
    });
  });

  describe('Monitoring and Health Checks', () => {
    it('should monitor tunnel health status', async () => {
      // Setup mock tunnel
      mockSpawn.mockReturnValue({
        stdout: { 
          on: jest.fn((event, cb) => {
            if (event === 'data') {
              cb(Buffer.from('https://harvest-terminal-abc123.trycloudflare.com'));
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      } as any);
      
      await tunnelManager.setupTunnel(4567);
      
      const health = await tunnelManager.getHealthStatus();
      
      expect(health).toEqual({
        status: 'healthy',
        uptime: expect.any(Number),
        tunnelUrl: 'https://harvest-terminal-abc123.trycloudflare.com',
        connectedClients: expect.any(Number),
        bandwidth: {
          upload: expect.any(Number),
          download: expect.any(Number)
        }
      });
    });

    it('should track bandwidth usage', async () => {
      await tunnelManager.setupTunnel(4567);
      
      // Simulate data transfer
      await tunnelManager.recordDataTransfer('upload', 1024 * 1024); // 1MB
      await tunnelManager.recordDataTransfer('download', 2 * 1024 * 1024); // 2MB
      
      const stats = await tunnelManager.getBandwidthStats();
      
      expect(stats.totalUpload).toBe(1024 * 1024);
      expect(stats.totalDownload).toBe(2 * 1024 * 1024);
      expect(stats.totalBandwidth).toBe(3 * 1024 * 1024);
    });

    it('should detect and report tunnel disconnections', async () => {
      const onDisconnect = jest.fn();
      tunnelManager.on('disconnect', onDisconnect);
      
      // Setup tunnel
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'exit') {
            setTimeout(() => cb(1), 100);
          }
        }),
        kill: jest.fn(),
        pid: 12345
      };
      
      mockSpawn.mockReturnValue(mockProcess as any);
      
      try {
        await tunnelManager.setupTunnel(4567);
      } catch (error) {
        // Expected
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(onDisconnect).toHaveBeenCalledWith({
        reason: 'Process exited',
        code: 1,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('Mobile-Specific Features', () => {
    it('should optimize tunnel for mobile connections', async () => {
      const mobileConfig = await tunnelManager.getMobileOptimizedConfig();
      
      expect(mobileConfig).toEqual({
        compression: true,
        lowBandwidthMode: true,
        adaptiveQuality: true,
        maxPayloadSize: 512 * 1024, // 512KB max
        reconnectStrategy: 'aggressive',
        keepAliveInterval: 30000 // 30 seconds
      });
    });

    it('should handle mobile network transitions', async () => {
      // Simulate WiFi to Cellular transition
      await tunnelManager.handleNetworkChange('wifi', 'cellular');
      
      const config = await tunnelManager.getCurrentConfig();
      expect(config.lowBandwidthMode).toBe(true);
      expect(config.compression).toBe(true);
      
      // Simulate Cellular to WiFi transition
      await tunnelManager.handleNetworkChange('cellular', 'wifi');
      
      const updatedConfig = await tunnelManager.getCurrentConfig();
      expect(updatedConfig.lowBandwidthMode).toBe(false);
      expect(updatedConfig.compression).toBe(false);
    });

    it('should implement push notification support', async () => {
      const deviceToken = 'mobile-device-token-123';
      
      await tunnelManager.registerDeviceForNotifications(deviceToken);
      
      // Send test notification
      const result = await tunnelManager.sendNotification(deviceToken, {
        title: 'Agent Completed',
        body: 'Agent 1 has finished processing',
        data: { agentId: 1, status: 'completed' }
      });
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle tunnel URL detection timeout', async () => {
      mockSpawn.mockReturnValue({
        stdout: { 
          on: jest.fn() // Never sends URL
        },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      } as any);
      
      await expect(
        tunnelManager.setupTunnel(4567, { timeout: 1000 })
      ).rejects.toThrow('Tunnel URL detection timeout');
    });

    it('should clean up resources on failure', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        pid: 12345
      };
      
      mockSpawn.mockReturnValue(mockProcess as any);
      
      try {
        await tunnelManager.setupTunnel(4567, { timeout: 100 });
      } catch (error) {
        // Expected timeout
      }
      
      // Verify cleanup
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(tunnelManager.isRunning()).toBe(false);
    });

    it('should implement circuit breaker for failed connections', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 5; i++) {
        mockSpawn.mockReturnValueOnce({
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event, cb) => {
            if (event === 'exit') cb(1);
          }),
          kill: jest.fn()
        } as any);
        
        try {
          await tunnelManager.setupTunnel(4567);
        } catch (error) {
          // Expected
        }
      }
      
      // Circuit should be open
      expect(tunnelManager.isCircuitOpen()).toBe(true);
      
      // Should reject immediately without trying
      await expect(tunnelManager.setupTunnel(4567)).rejects.toThrow('Circuit breaker is open');
      
      // Verify spawn wasn't called again
      expect(mockSpawn).toHaveBeenCalledTimes(5);
    });
  });
});