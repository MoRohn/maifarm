import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';
import { logger, LogCategory } from './ProductionLogger';
import { hardwareDetectionService, ModelRecommendation, HardwareCapabilities } from './HardwareDetectionService';
import { EventEmitter } from 'events';
import { db } from '../database/connection';

const execAsync = promisify(exec);

export interface InstallationProgress {
  status: 'detecting' | 'downloading' | 'installing' | 'configuring' | 'complete' | 'error';
  phase: string;
  progress: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
  error?: string;
  recommendation?: ModelRecommendation;
  capabilities?: HardwareCapabilities;
  installPath?: string;
  estimatedTimeRemaining?: number; // seconds
}

export interface InstallationResult {
  success: boolean;
  recommendation: ModelRecommendation;
  capabilities: HardwareCapabilities;
  installPath: string;
  backend: 'vllm' | 'llama-cpp';
  modelPath?: string;
  error?: string;
  configUpdated: boolean;
}

class AutoModelInstallationService extends EventEmitter {
  private isInstalling = false;
  private installationProgress: InstallationProgress = {
    status: 'detecting',
    phase: 'Initializing',
    progress: 0,
  };

  private modelsDir = path.join(process.env.HOME || '/tmp', '.maifarm', 'gpt-oss', 'models');
  private venvDir = path.join(process.env.HOME || '/tmp', '.maifarm', 'gpt-oss-venv');

  constructor() {
    super();
  }

  /**
   * Automatically detect hardware, recommend model, and install in background
   */
  async autoInstall(): Promise<InstallationResult> {
    if (this.isInstalling) {
      throw new Error('Installation already in progress');
    }

    this.isInstalling = true;
    logger.info(LogCategory.SYSTEM, 'Starting automatic model installation');

    try {
      // Phase 1: Detect hardware (0-10%)
      this.updateProgress({
        status: 'detecting',
        phase: 'Detecting hardware capabilities',
        progress: 0,
      });

      const capabilities = await hardwareDetectionService.detectHardware();

      this.updateProgress({
        status: 'detecting',
        phase: 'Hardware detection complete',
        progress: 10,
        capabilities,
      });

      // Phase 2: Get recommendation (10-20%)
      this.updateProgress({
        status: 'detecting',
        phase: 'Analyzing optimal model configuration',
        progress: 15,
        capabilities,
      });

      const recommendation = await hardwareDetectionService.recommendModel(capabilities);

      logger.info(LogCategory.SYSTEM, 'Model recommended', {
        model: recommendation.modelName,
        backend: recommendation.backend,
        sizeGB: recommendation.downloadSizeGB,
        performanceCategory: recommendation.performanceCategory,
      });

      this.updateProgress({
        status: 'downloading',
        phase: 'Model recommendation generated',
        progress: 20,
        capabilities,
        recommendation,
      });

      // Phase 3: Create directories (20-25%)
      await this.ensureDirectories();

      this.updateProgress({
        status: 'installing',
        phase: 'Preparing installation environment',
        progress: 25,
        capabilities,
        recommendation,
      });

      // Phase 4: Install Python dependencies (25-50%)
      await this.installPythonDependencies(recommendation.backend);

      this.updateProgress({
        status: 'installing',
        phase: 'Python dependencies installed',
        progress: 50,
        capabilities,
        recommendation,
      });

      // Phase 5: Download model if needed (50-90%)
      let modelPath: string | undefined;
      if (recommendation.backend === 'llama-cpp' && recommendation.downloadURL) {
        modelPath = await this.downloadModel(recommendation);
      }

      this.updateProgress({
        status: 'configuring',
        phase: 'Configuring environment',
        progress: 90,
        capabilities,
        recommendation,
        installPath: modelPath || 'Model will be downloaded on first use',
      });

      // Phase 6: Update configuration (90-100%)
      await this.updateEnvironmentConfig(recommendation, modelPath);

      this.updateProgress({
        status: 'complete',
        phase: 'Installation complete',
        progress: 100,
        capabilities,
        recommendation,
        installPath: modelPath || 'Model will be downloaded on first use',
      });

      logger.info(LogCategory.SYSTEM, 'Automatic model installation complete', {
        model: recommendation.modelName,
        backend: recommendation.backend,
        installPath: modelPath || 'auto-download',
      });

      return {
        success: true,
        recommendation,
        capabilities,
        installPath: this.modelsDir,
        backend: recommendation.backend,
        modelPath,
        configUpdated: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(LogCategory.SYSTEM, 'Automatic model installation failed', { error: errorMessage });

      this.updateProgress({
        status: 'error',
        phase: 'Installation failed',
        progress: 0,
        error: errorMessage,
      });

      throw error;
    } finally {
      this.isInstalling = false;
    }
  }

  /**
   * Get current installation progress
   */
  getProgress(): InstallationProgress {
    return { ...this.installationProgress };
  }

  /**
   * Check if installation is in progress
   */
  isInProgress(): boolean {
    return this.isInstalling;
  }

  /**
   * Update installation progress and emit event
   */
  private updateProgress(progress: Partial<InstallationProgress>): void {
    this.installationProgress = {
      ...this.installationProgress,
      ...progress,
    };
    this.emit('progress', this.installationProgress);
    logger.info(LogCategory.SYSTEM, 'Installation progress', {
      status: this.installationProgress.status,
      phase: this.installationProgress.phase,
      progress: this.installationProgress.progress,
    });
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.modelsDir,
      path.join(process.env.HOME || '/tmp', '.maifarm', 'gpt-oss', 'logs'),
      path.join(process.env.HOME || '/tmp', '.maifarm', 'gpt-oss', 'cache'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    logger.info(LogCategory.SYSTEM, 'Installation directories created');
  }

  /**
   * Install Python dependencies based on backend
   */
  private async installPythonDependencies(backend: 'vllm' | 'llama-cpp'): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Installing Python dependencies', { backend });

    // Create virtual environment if it doesn't exist
    try {
      await fs.access(this.venvDir);
    } catch {
      logger.info(LogCategory.SYSTEM, 'Creating Python virtual environment');
      await execAsync(`python3 -m venv "${this.venvDir}"`);
    }

    const pipPath = path.join(this.venvDir, 'bin', 'pip');

    // Upgrade pip
    await execAsync(`"${pipPath}" install --quiet --upgrade pip`);

    // Install base dependencies
    await execAsync(
      `"${pipPath}" install --quiet fastapi==0.104.1 uvicorn==0.24.0 pydantic==2.5.0 httpx==0.25.1`
    );

    this.updateProgress({
      status: 'installing',
      phase: 'Installing AI backend',
      progress: 35,
    });

    // Install backend-specific dependencies
    if (backend === 'vllm') {
      const platform = process.platform;
      const arch = process.arch;

      // Check for NVIDIA GPU
      let hasNvidia = false;
      try {
        await execAsync('nvidia-smi');
        hasNvidia = true;
      } catch {
        // No NVIDIA GPU
      }

      if (hasNvidia) {
        logger.info(LogCategory.SYSTEM, 'Installing vLLM with CUDA support');
        await execAsync(`"${pipPath}" install --quiet vllm`);
      } else {
        logger.warn(LogCategory.SYSTEM, 'vLLM requires NVIDIA GPU, falling back to llama-cpp');
        await this.installLlamaCpp(pipPath);
      }
    } else {
      await this.installLlamaCpp(pipPath);
    }

    logger.info(LogCategory.SYSTEM, 'Python dependencies installed');
  }

  /**
   * Install llama-cpp-python with appropriate acceleration
   */
  private async installLlamaCpp(pipPath: string): Promise<void> {
    const platform = process.platform;
    const arch = process.arch;

    let cmakeArgs = '';

    if (platform === 'darwin' && arch === 'arm64') {
      logger.info(LogCategory.SYSTEM, 'Installing llama-cpp with Metal support (Apple Silicon)');
      cmakeArgs = 'CMAKE_ARGS="-DLLAMA_METAL=on"';
    } else {
      // Check for NVIDIA GPU
      try {
        await execAsync('nvidia-smi');
        logger.info(LogCategory.SYSTEM, 'Installing llama-cpp with CUDA support');
        cmakeArgs = 'CMAKE_ARGS="-DLLAMA_CUDA=on"';
      } catch {
        logger.info(LogCategory.SYSTEM, 'Installing llama-cpp CPU-only');
      }
    }

    await execAsync(`${cmakeArgs} "${pipPath}" install --quiet llama-cpp-python[server]`);
  }

  /**
   * Download model file with progress tracking
   */
  private async downloadModel(recommendation: ModelRecommendation): Promise<string> {
    if (!recommendation.downloadURL) {
      throw new Error('No download URL provided for model');
    }

    const fileName = path.basename(recommendation.downloadURL);
    const filePath = path.join(this.modelsDir, fileName);

    // Check if file already exists
    try {
      await fs.access(filePath);
      logger.info(LogCategory.SYSTEM, 'Model already downloaded', { path: filePath });
      return filePath;
    } catch {
      // File doesn't exist, proceed with download
    }

    logger.info(LogCategory.SYSTEM, 'Downloading model', {
      url: recommendation.downloadURL,
      sizeGB: recommendation.downloadSizeGB,
    });

    return new Promise((resolve, reject) => {
      const file = require('fs').createWriteStream(filePath);
      const startTime = Date.now();

      const client = recommendation.downloadURL!.startsWith('https:') ? https : http;

      const request = client.get(recommendation.downloadURL!, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }

          const redirectClient = redirectUrl.startsWith('https:') ? https : http;
          redirectClient.get(redirectUrl, (redirectResponse) => {
            this.handleDownloadResponse(redirectResponse, file, startTime, filePath, resolve, reject);
          });
          return;
        }

        this.handleDownloadResponse(response, file, startTime, filePath, resolve, reject);
      });

      request.on('error', (error) => {
        fs.unlink(filePath).catch(() => {});
        reject(error);
      });
    });
  }

  /**
   * Handle download response with progress tracking
   */
  private handleDownloadResponse(
    response: http.IncomingMessage,
    file: any,
    startTime: number,
    filePath: string,
    resolve: (path: string) => void,
    reject: (error: Error) => void
  ): void {
    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedBytes = 0;
    let lastProgressUpdate = Date.now();

    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;

      // Update progress every second
      const now = Date.now();
      if (now - lastProgressUpdate > 1000) {
        const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 40 + 50 : 50;
        const elapsed = (now - startTime) / 1000;
        const rate = downloadedBytes / elapsed;
        const remaining = totalBytes > 0 ? (totalBytes - downloadedBytes) / rate : 0;

        this.updateProgress({
          status: 'downloading',
          phase: 'Downloading model',
          progress: Math.min(90, progress),
          downloadedBytes,
          totalBytes,
          estimatedTimeRemaining: Math.round(remaining),
        });

        lastProgressUpdate = now;
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      file.close();
      logger.info(LogCategory.SYSTEM, 'Model download complete', {
        path: filePath,
        sizeBytes: downloadedBytes,
      });
      resolve(filePath);
    });

    file.on('error', (error: Error) => {
      fs.unlink(filePath).catch(() => {});
      reject(error);
    });
  }

  /**
   * Update environment configuration with recommended model
   */
  private async updateEnvironmentConfig(
    recommendation: ModelRecommendation,
    modelPath?: string
  ): Promise<void> {
    const envPath = path.join(process.cwd(), '.env.development');

    logger.info(LogCategory.SYSTEM, 'Updating environment configuration', {
      model: recommendation.modelName,
      backend: recommendation.backend,
    });

    // Read existing .env.development or create new one
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // File doesn't exist, create default
      envContent = `# MaiFarm Development Environment\nNODE_ENV=development\nPORT=4567\n\n`;
    }

    // Update or add GPT-OSS configuration
    const updates: Record<string, string> = {
      AI_PROVIDER: 'gpt-oss',
      GPT_OSS_ENABLED: 'true',
      GPT_OSS_BACKEND: recommendation.backend,
      GPT_OSS_HOST: 'http://localhost:8000/v1',
      GPT_OSS_CONTEXT_WINDOW: recommendation.contextWindow.toString(),
    };

    if (recommendation.backend === 'vllm') {
      updates.GPT_OSS_MODEL = recommendation.modelName;
    } else if (modelPath) {
      updates.GPT_OSS_MODEL_PATH = modelPath;
      updates.GPT_OSS_MODEL = recommendation.modelName;
    }

    // Update environment file
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    await fs.writeFile(envPath, envContent, 'utf-8');

    // Also save to database for persistence
    await this.saveToDatabase(recommendation, modelPath);

    logger.info(LogCategory.SYSTEM, 'Environment configuration updated');
  }

  /**
   * Save installation details to database
   */
  private async saveToDatabase(
    recommendation: ModelRecommendation,
    modelPath?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO system_config (key, value, category, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()`,
        ['gpt_oss_auto_install', JSON.stringify({
          recommendation,
          modelPath,
          installedAt: new Date().toISOString(),
        }), 'ai_engine']
      );

      logger.info(LogCategory.SYSTEM, 'Installation details saved to database');
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to save installation details to database', { error });
      // Non-critical error, continue
    }
  }

  /**
   * Check if auto-installation has been completed
   */
  async isInstalled(): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT value FROM system_config WHERE key = $1 AND category = $2`,
        ['gpt_oss_auto_install', 'ai_engine']
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to check installation status', { error });
      return false;
    }
  }

  /**
   * Get installed model details
   */
  async getInstalledModel(): Promise<{
    recommendation: ModelRecommendation;
    modelPath?: string;
    installedAt: string;
  } | null> {
    try {
      const result = await db.query(
        `SELECT value FROM system_config WHERE key = $1 AND category = $2`,
        ['gpt_oss_auto_install', 'ai_engine']
      );

      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].value);
      }

      return null;
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to get installed model details', { error });
      return null;
    }
  }
}

export const autoModelInstallationService = new AutoModelInstallationService();
