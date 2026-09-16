import { authService } from '../../services/authService.js';
import { healthService } from '../../services/healthService.js';
import { adminService } from '../../services/adminService.js';

export class SystemService {
  async getHealth() {
    return healthService.checkHealth();
  }
  
  async getStatus() {
    return {
      health: await this.getHealth(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };
  }
  
  async authenticate(credentials: any) {
    return authService.login(credentials);
  }
  
  async refreshToken(token: string) {
    return authService.refresh(token);
  }
  
  async getAdminStats() {
    return adminService.getStats();
  }
}