import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { logger, LogCategory } from './ProductionLogger';

const execAsync = promisify(exec);

// Timeout wrapper for exec commands to prevent hanging
async function execWithTimeout(command: string, timeoutMs: number = 5000): Promise<{ stdout: string; stderr: string }> {
  return Promise.race([
    execAsync(command),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Command timeout after ${timeoutMs}ms: ${command}`)), timeoutMs)
    )
  ]);
}

export interface GPUInfo {
  name: string;
  vramGB: number;
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  computeCapability?: string;
  cudaCores?: number;
  metalSupport?: boolean;
}

export interface CPUInfo {
  model: string;
  cores: number;
  threads: number;
  architecture: string;
  frequency: number; // GHz
  vendor: 'intel' | 'amd' | 'apple' | 'unknown';
  isAppleSilicon: boolean;
}

export interface MemoryInfo {
  totalGB: number;
  availableGB: number;
  swapGB: number;
}

export interface HardwareCapabilities {
  cpu: CPUInfo;
  gpu: GPUInfo | null;
  memory: MemoryInfo;
  platform: NodeJS.Platform;
  arch: string;
  hasNvidiaGPU: boolean;
  hasAMDGPU: boolean;
  hasAppleSilicon: boolean;
  computeScore: number; // Overall compute capability score (0-100)
  timestamp: Date;
}

export interface ModelRecommendation {
  modelName: string;
  modelSize: string; // e.g., "7B", "13B", "70B"
  quantization: string; // e.g., "Q4_K_M", "Q5_K_M", "fp16"
  backend: 'vllm' | 'llama-cpp';
  estimatedVRAM: number; // GB
  estimatedRAM: number; // GB
  contextWindow: number;
  downloadURL?: string;
  downloadSizeGB: number;
  recommendationScore: number; // 0-100 (higher is better for this hardware)
  performanceCategory: 'optimal' | 'good' | 'acceptable' | 'minimal';
  reason: string;
}

class HardwareDetectionService {
  private cachedCapabilities: HardwareCapabilities | null = null;
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastCacheTime: number = 0;

  /**
   * Detect all hardware capabilities
   * Enhanced with robust error handling for cross-platform support (macOS/Windows/Linux/iOS)
   */
  async detectHardware(): Promise<HardwareCapabilities> {
    try {
      // Check cache
      if (
        this.cachedCapabilities &&
        Date.now() - this.lastCacheTime < this.cacheExpiry
      ) {
        logger.info(LogCategory.SYSTEM, 'Returning cached hardware capabilities');
        return this.cachedCapabilities;
      }

      logger.info(LogCategory.SYSTEM, 'Detecting hardware capabilities...', {
        platform: os.platform(),
        arch: os.arch(),
      });

      // Detect hardware with individual error handling and graceful degradation
      const cpu = await this.detectCPU().catch(error => {
        logger.warn(LogCategory.SYSTEM, 'CPU detection failed, using defaults', {
          error: error.message,
          stack: error.stack?.split('\n')[0]
        });
        return this.getDefaultCPU();
      });

      const gpu = await this.detectGPU().catch(error => {
        logger.warn(LogCategory.SYSTEM, 'GPU detection failed, will use CPU mode', {
          error: error.message,
          stack: error.stack?.split('\n')[0]
        });
        return null;
      });

      const memory = await this.detectMemory().catch(error => {
        logger.warn(LogCategory.SYSTEM, 'Memory detection failed, using OS defaults', {
          error: error.message,
          stack: error.stack?.split('\n')[0]
        });
        return this.getDefaultMemory();
      });

      const platform = os.platform();
      const arch = os.arch();
      const hasNvidiaGPU = gpu?.vendor === 'nvidia';
      const hasAMDGPU = gpu?.vendor === 'amd';
      const hasAppleSilicon = cpu.isAppleSilicon;

      const computeScore = this.calculateComputeScore(cpu, gpu, memory);

      const capabilities: HardwareCapabilities = {
        cpu,
        gpu,
        memory,
        platform,
        arch,
        hasNvidiaGPU,
        hasAMDGPU,
        hasAppleSilicon,
        computeScore,
        timestamp: new Date(),
      };

      // Update cache
      this.cachedCapabilities = capabilities;
      this.lastCacheTime = Date.now();

      logger.info(LogCategory.SYSTEM, 'Hardware detection complete', {
        platform,
        arch,
        computeScore,
        hasGPU: !!gpu,
        cpuCores: cpu.cores,
        totalMemoryGB: memory.totalGB,
      });

      return capabilities;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during hardware detection';
      logger.error(LogCategory.SYSTEM, 'Fatal error during hardware detection', { error: errorMessage });
      throw new Error(`Hardware detection failed: ${errorMessage}`);
    }
  }

  /**
   * Get default CPU info when detection fails
   */
  private getDefaultCPU(): CPUInfo {
    const cpus = os.cpus();
    return {
      model: cpus[0]?.model || 'Unknown CPU',
      cores: cpus.length || 2,
      threads: cpus.length || 2,
      architecture: os.arch(),
      frequency: cpus[0]?.speed ? cpus[0].speed / 1000 : 2.0,
      vendor: 'unknown',
      isAppleSilicon: os.platform() === 'darwin' && os.arch() === 'arm64',
    };
  }

  /**
   * Get default memory info when detection fails
   */
  private getDefaultMemory(): MemoryInfo {
    return {
      totalGB: Math.round(os.totalmem() / (1024 ** 3)),
      availableGB: Math.round(os.freemem() / (1024 ** 3)),
      swapGB: 0,
    };
  }

  /**
   * Detect CPU information
   */
  private async detectCPU(): Promise<CPUInfo> {
    const cpus = os.cpus();
    const platform = os.platform();
    const arch = os.arch();

    const model = cpus[0]?.model || 'Unknown';
    const cores = cpus.length;
    const threads = cpus.length; // Node.js os.cpus() returns logical cores
    const frequency = cpus[0]?.speed ? cpus[0].speed / 1000 : 0; // Convert MHz to GHz

    // Detect vendor
    let vendor: CPUInfo['vendor'] = 'unknown';
    const modelLower = model.toLowerCase();
    if (modelLower.includes('intel')) {
      vendor = 'intel';
    } else if (modelLower.includes('amd')) {
      vendor = 'amd';
    } else if (modelLower.includes('apple') || arch === 'arm64') {
      vendor = 'apple';
    }

    const isAppleSilicon = platform === 'darwin' && arch === 'arm64';

    // Get more detailed CPU info on macOS
    if (platform === 'darwin') {
      try {
        const { stdout } = await execWithTimeout('sysctl -n machdep.cpu.brand_string', 5000);
        const brandString = stdout.trim();
        if (brandString) {
          return {
            model: brandString,
            cores,
            threads,
            architecture: arch,
            frequency,
            vendor,
            isAppleSilicon,
          };
        }
      } catch (error) {
        // Fall through to default - not a critical failure
        logger.debug(LogCategory.SYSTEM, 'macOS CPU detection via sysctl failed, using OS defaults', { error });
      }
    }

    return {
      model,
      cores,
      threads,
      architecture: arch,
      frequency,
      vendor,
      isAppleSilicon,
    };
  }

  /**
   * Detect GPU information
   */
  private async detectGPU(): Promise<GPUInfo | null> {
    const platform = os.platform();
    const arch = os.arch();

    // Check for Apple Silicon GPU
    if (platform === 'darwin' && arch === 'arm64') {
      try {
        const { stdout } = await execWithTimeout('sysctl -n machdep.cpu.brand_string', 5000);
        const chipName = stdout.trim();

        // Estimate unified memory based on chip (shared between CPU/GPU)
        let vramGB = 8; // Default estimate
        if (chipName.includes('M1 Pro') || chipName.includes('M2 Pro') || chipName.includes('M3 Pro') || chipName.includes('M4 Pro')) {
          vramGB = 16;
        } else if (chipName.includes('M1 Max') || chipName.includes('M2 Max') || chipName.includes('M3 Max') || chipName.includes('M4 Max')) {
          vramGB = 32;
        } else if (chipName.includes('M1 Ultra') || chipName.includes('M2 Ultra') || chipName.includes('M3 Ultra') || chipName.includes('M4 Ultra')) {
          vramGB = 64;
        } else if (chipName.includes('M3') || chipName.includes('M4')) {
          vramGB = 8;
        }

        return {
          name: `Apple ${chipName} GPU`,
          vramGB,
          vendor: 'apple',
          metalSupport: true,
        };
      } catch (error) {
        logger.debug(LogCategory.SYSTEM, 'Failed to detect Apple Silicon GPU', { error });
      }
    }

    // Check for NVIDIA GPU
    try {
      const { stdout } = await execWithTimeout(
        'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
        3000
      );

      const lines = stdout.trim().split('\n');
      if (lines.length > 0) {
        const [name, vramMB] = lines[0].split(',').map((s) => s.trim());
        const vramGB = Math.round(parseInt(vramMB, 10) / 1024);

        // Try to get compute capability
        let computeCapability: string | undefined;
        try {
          const { stdout: capStdout } = await execWithTimeout(
            'nvidia-smi --query-gpu=compute_cap --format=csv,noheader,nounits',
            2000
          );
          computeCapability = capStdout.trim();
        } catch (error) {
          // Ignore compute capability fetch failure
          logger.debug(LogCategory.SYSTEM, 'Failed to get NVIDIA compute capability', { error });
        }

        return {
          name,
          vramGB,
          vendor: 'nvidia',
          computeCapability,
        };
      }
    } catch (error) {
      // NVIDIA GPU not found or nvidia-smi not available
      logger.debug(LogCategory.SYSTEM, 'NVIDIA GPU detection failed (normal if no NVIDIA GPU)', { error });
    }

    // Check for AMD GPU on Linux
    if (platform === 'linux') {
      try {
        const { stdout } = await execWithTimeout('rocm-smi --showproductname', 3000);
        if (stdout.includes('GPU')) {
          // Basic AMD GPU detection
          return {
            name: 'AMD GPU',
            vramGB: 8, // Default estimate
            vendor: 'amd',
          };
        }
      } catch (error) {
        // AMD GPU not found or rocm-smi not available
        logger.debug(LogCategory.SYSTEM, 'AMD GPU detection failed (normal if no AMD GPU)', { error });
      }
    }

    // Check for GPU on Windows using WMIC
    if (platform === 'win32') {
      try {
        const { stdout } = await execWithTimeout('wmic path win32_VideoController get name,AdapterRAM /format:csv', 3000);
        const lines = stdout.trim().split('\n').filter(line => line.trim() && !line.includes('Node'));

        if (lines.length > 0) {
          const [, name, ramBytes] = lines[0].split(',').map(s => s.trim());

          // Detect vendor from name
          let vendor: GPUInfo['vendor'] = 'unknown';
          const nameLower = name.toLowerCase();
          if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro')) {
            vendor = 'nvidia';
          } else if (nameLower.includes('amd') || nameLower.includes('radeon')) {
            vendor = 'amd';
          } else if (nameLower.includes('intel')) {
            vendor = 'intel';
          }

          const vramGB = ramBytes ? Math.round(parseInt(ramBytes, 10) / (1024 ** 3)) : 2;

          return {
            name,
            vramGB,
            vendor,
          };
        }
      } catch (error) {
        logger.debug(LogCategory.SYSTEM, 'Windows GPU detection via WMIC failed (normal if no GPU)', { error });
      }
    }

    // No discrete GPU detected
    logger.info(LogCategory.SYSTEM, 'No discrete GPU detected, will use CPU');
    return null;
  }

  /**
   * Detect memory information
   */
  private async detectMemory(): Promise<MemoryInfo> {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();

    const totalGB = Math.round(totalBytes / (1024 ** 3));
    const availableGB = Math.round(freeBytes / (1024 ** 3));

    // Estimate swap (simplified)
    let swapGB = 0;
    const platform = os.platform();

    if (platform === 'linux') {
      try {
        const { stdout } = await execWithTimeout('free -b | grep Swap', 5000);
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 2) {
          swapGB = Math.round(parseInt(parts[1], 10) / (1024 ** 3));
        }
      } catch (error) {
        logger.debug(LogCategory.SYSTEM, 'Failed to get swap info on Linux, using zero', { error });
      }
    } else if (platform === 'darwin') {
      try {
        const { stdout } = await execWithTimeout('sysctl -n vm.swapusage', 5000);
        const match = stdout.match(/total = ([\d.]+)G/);
        if (match) {
          swapGB = Math.round(parseFloat(match[1]));
        }
      } catch (error) {
        logger.debug(LogCategory.SYSTEM, 'Failed to get swap info on macOS, using zero', { error });
      }
    }

    return {
      totalGB,
      availableGB,
      swapGB,
    };
  }

  /**
   * Calculate overall compute score (0-100)
   */
  private calculateComputeScore(
    cpu: CPUInfo,
    gpu: GPUInfo | null,
    memory: MemoryInfo
  ): number {
    let score = 0;

    // CPU score (0-30 points)
    const cpuScore = Math.min(30, (cpu.cores / 16) * 15 + (cpu.frequency / 5) * 15);
    score += cpuScore;

    // GPU score (0-50 points)
    if (gpu) {
      if (gpu.vendor === 'nvidia') {
        // NVIDIA GPUs get higher scores
        const gpuScore = Math.min(50, (gpu.vramGB / 24) * 50);
        score += gpuScore;
      } else if (gpu.vendor === 'apple') {
        // Apple Silicon GPUs are efficient
        const gpuScore = Math.min(45, (gpu.vramGB / 64) * 45);
        score += gpuScore;
      } else {
        // Other GPUs
        const gpuScore = Math.min(40, (gpu.vramGB / 16) * 40);
        score += gpuScore;
      }
    }

    // Memory score (0-20 points)
    const memoryScore = Math.min(20, (memory.totalGB / 64) * 20);
    score += memoryScore;

    return Math.round(score);
  }

  /**
   * Recommend the best GPT-OSS model based on hardware
   *
   * NOTE: GPT-OSS is an OpenAI-compatible API server that runs open-source LLMs locally.
   * This method recommends which open-source model (Llama, Mistral, etc.) to run through
   * the GPT-OSS server based on your hardware capabilities.
   */
  async recommendModel(capabilities?: HardwareCapabilities): Promise<ModelRecommendation> {
    if (!capabilities) {
      capabilities = await this.detectHardware();
    }

    const { cpu, gpu, memory, hasNvidiaGPU, hasAppleSilicon, computeScore } = capabilities;

    logger.info(LogCategory.SYSTEM, 'Generating model recommendation', {
      computeScore,
      hasNvidiaGPU,
      hasAppleSilicon,
      memoryGB: memory.totalGB,
      gpuVRAM: gpu?.vramGB,
      cpuCores: cpu.cores,
      cpuVendor: cpu.vendor,
    });

    // High-end NVIDIA GPU (24GB+ VRAM)
    if (hasNvidiaGPU && gpu && gpu.vramGB >= 24) {
      return {
        modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        modelSize: '70B',
        quantization: 'fp16',
        backend: 'vllm',
        estimatedVRAM: 140,
        estimatedRAM: 8,
        contextWindow: 131072,
        downloadSizeGB: 140,
        recommendationScore: 100,
        performanceCategory: 'optimal',
        reason: 'High-end NVIDIA GPU detected (24GB+ VRAM) - can run largest models with best quality',
      };
    }

    // Mid-range NVIDIA GPU (12-24GB VRAM)
    if (hasNvidiaGPU && gpu && gpu.vramGB >= 12) {
      return {
        modelName: 'meta-llama/Meta-Llama-3.1-13B-Instruct',
        modelSize: '13B',
        quantization: 'fp16',
        backend: 'vllm',
        estimatedVRAM: 26,
        estimatedRAM: 8,
        contextWindow: 131072,
        downloadSizeGB: 26,
        recommendationScore: 90,
        performanceCategory: 'optimal',
        reason: 'Mid-range NVIDIA GPU detected (12-24GB VRAM) - excellent balance of performance and quality',
      };
    }

    // Entry-level NVIDIA GPU (8-12GB VRAM)
    if (hasNvidiaGPU && gpu && gpu.vramGB >= 8) {
      return {
        modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        modelSize: '8B',
        quantization: 'fp16',
        backend: 'vllm',
        estimatedVRAM: 16,
        estimatedRAM: 4,
        contextWindow: 131072,
        downloadSizeGB: 16,
        recommendationScore: 85,
        performanceCategory: 'good',
        reason: 'Entry-level NVIDIA GPU detected (8-12GB VRAM) - good performance with 8B model',
      };
    }

    // Apple Silicon M3/M2/M1 Max/Ultra (32GB+ unified memory)
    if (hasAppleSilicon && memory.totalGB >= 32) {
      return {
        modelName: 'TheBloke/Llama-2-13B-chat-GGUF',
        modelSize: '13B',
        quantization: 'Q5_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 12,
        contextWindow: 4096,
        downloadURL: 'https://huggingface.co/TheBloke/Llama-2-13B-chat-GGUF/resolve/main/llama-2-13b-chat.Q5_K_M.gguf',
        downloadSizeGB: 9.1,
        recommendationScore: 82,
        performanceCategory: 'good',
        reason: 'Apple Silicon with 32GB+ unified memory - can run 13B quantized models efficiently with Metal acceleration',
      };
    }

    // Apple Silicon M3/M2/M1 Pro (16-32GB unified memory)
    if (hasAppleSilicon && memory.totalGB >= 16) {
      return {
        modelName: 'TheBloke/Llama-2-7B-Chat-GGUF',
        modelSize: '7B',
        quantization: 'Q5_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 8,
        contextWindow: 4096,
        downloadURL: 'https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q5_K_M.gguf',
        downloadSizeGB: 5.1,
        recommendationScore: 78,
        performanceCategory: 'good',
        reason: 'Apple Silicon with 16GB+ unified memory - 7B model with high quality quantization and Metal acceleration',
      };
    }

    // Apple Silicon M3/M2/M1 Base (8-16GB unified memory)
    if (hasAppleSilicon && memory.totalGB >= 8) {
      return {
        modelName: 'TheBloke/Llama-2-7B-Chat-GGUF',
        modelSize: '7B',
        quantization: 'Q4_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 6,
        contextWindow: 4096,
        downloadURL: 'https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf',
        downloadSizeGB: 4.1,
        recommendationScore: 70,
        performanceCategory: 'acceptable',
        reason: 'Apple Silicon with 8GB+ unified memory - smaller model with efficient quantization and Metal acceleration',
      };
    }

    // High-end CPU system (32GB+ RAM, 16+ cores)
    if (memory.totalGB >= 32 && cpu.cores >= 16) {
      return {
        modelName: 'TheBloke/Llama-2-13B-chat-GGUF',
        modelSize: '13B',
        quantization: 'Q4_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 10,
        contextWindow: 4096,
        downloadURL: 'https://huggingface.co/TheBloke/Llama-2-13B-chat-GGUF/resolve/main/llama-2-13b-chat.Q4_K_M.gguf',
        downloadSizeGB: 7.9,
        recommendationScore: 65,
        performanceCategory: 'acceptable',
        reason: 'High-end CPU with 32GB+ RAM and 16+ cores - can run 13B model, but will be slower than GPU',
      };
    }

    // Mid-range CPU system (16-32GB RAM, 8+ cores)
    if (memory.totalGB >= 16 && cpu.cores >= 8) {
      return {
        modelName: 'TheBloke/Llama-2-7B-Chat-GGUF',
        modelSize: '7B',
        quantization: 'Q4_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 6,
        contextWindow: 4096,
        downloadURL: 'https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf',
        downloadSizeGB: 4.1,
        recommendationScore: 55,
        performanceCategory: 'acceptable',
        reason: 'Mid-range CPU with 16GB+ RAM and 8+ cores - 7B model will work but expect slower inference',
      };
    }

    // Entry-level system (8-16GB RAM)
    if (memory.totalGB >= 8) {
      return {
        modelName: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
        modelSize: '1.1B',
        quantization: 'Q4_K_M',
        backend: 'llama-cpp',
        estimatedVRAM: 0,
        estimatedRAM: 2,
        contextWindow: 2048,
        downloadURL: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        downloadSizeGB: 0.7,
        recommendationScore: 40,
        performanceCategory: 'minimal',
        reason: 'Entry-level system with 8GB+ RAM - small model for basic functionality',
      };
    }

    // Minimum viable system (<8GB RAM)
    return {
      modelName: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
      modelSize: '1.1B',
      quantization: 'Q4_K_M',
      backend: 'llama-cpp',
      estimatedVRAM: 0,
      estimatedRAM: 2,
      contextWindow: 2048,
      downloadURL: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
      downloadSizeGB: 0.7,
      recommendationScore: 30,
      performanceCategory: 'minimal',
      reason: 'Limited system resources - small model recommended for basic functionality',
    };
  }

  /**
   * Clear cached hardware detection
   */
  clearCache(): void {
    this.cachedCapabilities = null;
    this.lastCacheTime = 0;
    logger.info(LogCategory.SYSTEM, 'Hardware detection cache cleared');
  }
}

export const hardwareDetectionService = new HardwareDetectionService();
