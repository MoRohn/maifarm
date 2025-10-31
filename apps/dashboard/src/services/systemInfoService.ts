import * as os from 'os';

export interface SystemInfo {
  cpu: {
    cores: number;
    model: string;
    usage: number;
    speed: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  gpu: {
    count: number;
    memory: number;
    usage: number;
    model?: string;
  };
}

class SystemInfoService {
  private systemInfo: SystemInfo | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.updateSystemInfo();
    // Update system info every 5 seconds
    this.updateInterval = setInterval(() => this.updateSystemInfo(), 5000);
  }

  private updateSystemInfo() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Calculate CPU usage
    const cpuUsage = this.calculateCPUUsage();
    
    this.systemInfo = {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        usage: cpuUsage,
        speed: cpus[0]?.speed || 0
      },
      memory: {
        total: Math.round(totalMem / (1024 * 1024 * 1024)), // Convert to GB
        used: Math.round(usedMem / (1024 * 1024 * 1024)),
        free: Math.round(freeMem / (1024 * 1024 * 1024)),
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      gpu: {
        count: this.detectGPUCount(),
        memory: this.estimateGPUMemory(),
        usage: Math.random() * 60 + 20, // Simulated for now
        model: this.getGPUModel()
      }
    };
  }

  private calculateCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return Math.max(0, Math.min(100, usage));
  }

  private detectGPUCount(): number {
    // On macOS, check for Metal GPUs
    if (process.platform === 'darwin') {
      // Apple Silicon Macs have integrated GPU
      const arch = os.arch();
      if (arch === 'arm64') {
        return 1; // Apple Silicon GPU
      }
      // Intel Macs might have discrete GPU
      return 1;
    }
    // For other platforms, default to 0 or 1
    return 0;
  }

  private estimateGPUMemory(): number {
    // Estimate based on platform
    if (process.platform === 'darwin') {
      const arch = os.arch();
      if (arch === 'arm64') {
        // Apple Silicon shares memory with system
        const totalMem = os.totalmem();
        // Estimate GPU can use up to 75% of system memory
        return Math.round((totalMem * 0.75) / (1024 * 1024 * 1024));
      }
      return 8; // Default for Intel Macs with discrete GPU
    }
    return 0;
  }

  private getGPUModel(): string {
    if (process.platform === 'darwin') {
      const arch = os.arch();
      if (arch === 'arm64') {
        const cpuModel = os.cpus()[0]?.model || '';
        if (cpuModel.includes('M1')) return 'Apple M1 GPU';
        if (cpuModel.includes('M2')) return 'Apple M2 GPU';
        if (cpuModel.includes('M3')) return 'Apple M3 GPU';
        return 'Apple Silicon GPU';
      }
      return 'Intel Integrated Graphics';
    }
    return 'Unknown GPU';
  }

  getSystemInfo(): SystemInfo {
    if (!this.systemInfo) {
      this.updateSystemInfo();
    }
    return this.systemInfo!;
  }

  async getSystemInfoAsync(): Promise<SystemInfo> {
    return new Promise((resolve) => {
      this.updateSystemInfo();
      resolve(this.systemInfo!);
    });
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

export const systemInfoService = new SystemInfoService();