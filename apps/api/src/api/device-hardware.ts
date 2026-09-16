/**
 * Device Hardware API
 * Records device capabilities and uses them to filter AI engine compatibility
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { hardwareDetectionService, HardwareCapabilities } from '../services/HardwareDetectionService';
import { logger, LogCategory } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as os from 'os';

const router = Router();

/**
 * Generate a unique device identifier
 */
function generateDeviceId(): string {
  // Create a hash based on platform characteristics
  const platform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'unknown';

  const identifier = `${platform}-${arch}-${hostname}-${cpuModel}`;
  return crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 32);
}

interface DeviceHardwareRecord {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_threads: number;
  cpu_frequency: number;
  cpu_vendor: string;
  is_apple_silicon: boolean;
  gpu_name: string | null;
  gpu_vram_gb: number | null;
  gpu_vendor: string | null;
  has_nvidia_gpu: boolean;
  has_amd_gpu: boolean;
  metal_support: boolean;
  memory_total_gb: number;
  memory_available_gb: number;
  swap_gb: number;
  platform: string;
  arch: string;
  compute_score: number;
  created_at: Date;
  updated_at: Date;
}

interface CompatibleEngine {
  provider: string;
  model_id: string;
  model_name: string;
  is_cloud_based: boolean;
  performance_tier: string;
  compatibility_level: 'full' | 'compatible' | 'partial' | 'incompatible';
  estimated_performance: 'optimal' | 'acceptable' | 'degraded';
}

/**
 * GET /api/device-hardware/detect
 * Detect current device hardware and optionally record it
 */
router.get('/detect', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    logger.info(LogCategory.API, 'Hardware detection requested', { userId });

    const capabilities = await hardwareDetectionService.detectHardware();
    const deviceId = generateDeviceId();

    res.json({
      success: true,
      deviceId,
      capabilities,
      recommendation: await hardwareDetectionService.recommendModel(capabilities),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Hardware detection failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/device-hardware/register
 * Register device hardware for the current user
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { deviceName } = req.body;
    const capabilities = await hardwareDetectionService.detectHardware();
    const deviceId = generateDeviceId();

    logger.info(LogCategory.API, 'Registering device hardware', {
      userId,
      deviceId,
      computeScore: capabilities.computeScore,
    });

    const result = await db.query(
      `INSERT INTO device_hardware (
        id, user_id, device_id, device_name,
        cpu_model, cpu_cores, cpu_threads, cpu_frequency, cpu_vendor, is_apple_silicon,
        gpu_name, gpu_vram_gb, gpu_vendor, has_nvidia_gpu, has_amd_gpu, metal_support,
        memory_total_gb, memory_available_gb, swap_gb,
        platform, arch, compute_score, last_detected_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21, $22, NOW()
      )
      ON CONFLICT (user_id, device_id) DO UPDATE SET
        device_name = EXCLUDED.device_name,
        cpu_model = EXCLUDED.cpu_model,
        cpu_cores = EXCLUDED.cpu_cores,
        cpu_threads = EXCLUDED.cpu_threads,
        cpu_frequency = EXCLUDED.cpu_frequency,
        cpu_vendor = EXCLUDED.cpu_vendor,
        is_apple_silicon = EXCLUDED.is_apple_silicon,
        gpu_name = EXCLUDED.gpu_name,
        gpu_vram_gb = EXCLUDED.gpu_vram_gb,
        gpu_vendor = EXCLUDED.gpu_vendor,
        has_nvidia_gpu = EXCLUDED.has_nvidia_gpu,
        has_amd_gpu = EXCLUDED.has_amd_gpu,
        metal_support = EXCLUDED.metal_support,
        memory_total_gb = EXCLUDED.memory_total_gb,
        memory_available_gb = EXCLUDED.memory_available_gb,
        swap_gb = EXCLUDED.swap_gb,
        platform = EXCLUDED.platform,
        arch = EXCLUDED.arch,
        compute_score = EXCLUDED.compute_score,
        last_detected_at = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        uuidv4(),
        userId,
        deviceId,
        deviceName || `${capabilities.platform}-${capabilities.arch}`,
        capabilities.cpu.model,
        capabilities.cpu.cores,
        capabilities.cpu.threads,
        capabilities.cpu.frequency,
        capabilities.cpu.vendor,
        capabilities.cpu.isAppleSilicon,
        capabilities.gpu?.name || null,
        capabilities.gpu?.vramGB || null,
        capabilities.gpu?.vendor || null,
        capabilities.hasNvidiaGPU,
        capabilities.hasAMDGPU,
        capabilities.gpu?.metalSupport || false,
        capabilities.memory.totalGB,
        capabilities.memory.availableGB,
        capabilities.memory.swapGB,
        capabilities.platform,
        capabilities.arch,
        capabilities.computeScore,
      ]
    );

    res.json({
      success: true,
      device: result.rows[0],
      capabilities,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Device registration failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/device-hardware/compatible-engines
 * Get AI engines compatible with the current device
 */
router.get('/compatible-engines', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const deviceId = generateDeviceId();

    logger.info(LogCategory.API, 'Fetching compatible engines', { userId, deviceId });

    // First, ensure hardware is registered
    if (userId) {
      const capabilities = await hardwareDetectionService.detectHardware();

      // Quick upsert of current hardware
      await db.query(
        `INSERT INTO device_hardware (
          id, user_id, device_id, device_name,
          cpu_model, cpu_cores, cpu_threads, cpu_frequency, cpu_vendor, is_apple_silicon,
          gpu_name, gpu_vram_gb, gpu_vendor, has_nvidia_gpu, has_amd_gpu, metal_support,
          memory_total_gb, memory_available_gb, swap_gb,
          platform, arch, compute_score, last_detected_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
        )
        ON CONFLICT (user_id, device_id) DO UPDATE SET
          last_detected_at = NOW()`,
        [
          uuidv4(),
          userId,
          deviceId,
          `${capabilities.platform}-${capabilities.arch}`,
          capabilities.cpu.model,
          capabilities.cpu.cores,
          capabilities.cpu.threads,
          capabilities.cpu.frequency,
          capabilities.cpu.vendor,
          capabilities.cpu.isAppleSilicon,
          capabilities.gpu?.name || null,
          capabilities.gpu?.vramGB || null,
          capabilities.gpu?.vendor || null,
          capabilities.hasNvidiaGPU,
          capabilities.hasAMDGPU,
          capabilities.gpu?.metalSupport || false,
          capabilities.memory.totalGB,
          capabilities.memory.availableGB,
          capabilities.memory.swapGB,
          capabilities.platform,
          capabilities.arch,
          capabilities.computeScore,
        ]
      );

      // Get compatible engines using the database function
      const result = await db.query(
        `SELECT * FROM get_compatible_engines($1, $2)`,
        [userId, deviceId]
      );

      const engines: CompatibleEngine[] = result.rows;

      // Group by compatibility level
      const grouped = {
        recommended: engines.filter(e => e.compatibility_level === 'full' || e.compatibility_level === 'compatible'),
        usable: engines.filter(e => e.compatibility_level === 'partial'),
        notRecommended: engines.filter(e => e.compatibility_level === 'incompatible'),
      };

      res.json({
        success: true,
        deviceId,
        computeScore: capabilities.computeScore,
        engines: grouped,
        totalEngines: engines.length,
        compatibleCount: grouped.recommended.length,
      });
    } else {
      // No auth - return cloud-based engines only
      const result = await db.query(
        `SELECT provider, model_id, model_name, is_cloud_based, performance_tier,
                'full' as compatibility_level, 'optimal' as estimated_performance
         FROM ai_engine_requirements
         WHERE is_cloud_based = TRUE
         ORDER BY provider, performance_tier DESC`
      );

      res.json({
        success: true,
        deviceId,
        message: 'Authentication required for local model compatibility check',
        engines: {
          recommended: result.rows,
          usable: [],
          notRecommended: [],
        },
        totalEngines: result.rows.length,
        compatibleCount: result.rows.length,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Compatible engines fetch failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * POST /api/device-hardware/check-compatibility
 * Check if a specific AI engine is compatible with the device
 */
router.post('/check-compatibility', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { provider, modelId } = req.body;

    if (!provider || !modelId) {
      return res.status(400).json({
        success: false,
        error: 'Provider and modelId are required',
      });
    }

    const deviceId = generateDeviceId();

    if (!userId) {
      // For unauthenticated users, check if it's a cloud model
      const cloudCheck = await db.query(
        `SELECT is_cloud_based FROM ai_engine_requirements WHERE provider = $1 AND model_id = $2`,
        [provider, modelId]
      );

      if (cloudCheck.rows.length > 0 && cloudCheck.rows[0].is_cloud_based) {
        return res.json({
          success: true,
          compatible: true,
          performance: 'optimal',
          reason: 'Cloud-based model - no local hardware requirements',
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Authentication required for local model compatibility check',
      });
    }

    // Use the database function to check compatibility
    const result = await db.query(
      `SELECT check_engine_compatibility($1, $2, $3, $4) as compatibility`,
      [userId, deviceId, provider, modelId]
    );

    const compatibility = result.rows[0]?.compatibility;

    res.json({
      success: true,
      ...compatibility,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Compatibility check failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/device-hardware/limits
 * Get recommended limits for the current device
 */
router.get('/limits', async (req: Request, res: Response) => {
  try {
    const capabilities = await hardwareDetectionService.detectHardware();

    // Calculate limits based on hardware
    const limits = {
      maxConcurrentAgents: Math.min(capabilities.cpu.cores, 10),
      maxContextWindow: capabilities.memory.totalGB >= 32 ? 128000 : capabilities.memory.totalGB >= 16 ? 64000 : 32000,
      maxTokensPerRequest: capabilities.memory.totalGB >= 16 ? 8192 : 4096,
      recommendedBatchSize: Math.min(Math.floor(capabilities.memory.availableGB / 4), 8),
      maxParallelRequests: Math.min(Math.floor(capabilities.cpu.cores / 2), 4),

      // Model size limits based on memory
      maxModelSizeGB: capabilities.gpu
        ? Math.floor(capabilities.gpu.vramGB * 0.8)
        : Math.floor(capabilities.memory.totalGB * 0.5),

      // Performance tiers available
      availableTiers: [] as string[],
    };

    // Determine available performance tiers
    if (capabilities.computeScore >= 80) {
      limits.availableTiers = ['minimal', 'standard', 'performance', 'premium'];
    } else if (capabilities.computeScore >= 55) {
      limits.availableTiers = ['minimal', 'standard', 'performance'];
    } else if (capabilities.computeScore >= 35) {
      limits.availableTiers = ['minimal', 'standard'];
    } else {
      limits.availableTiers = ['minimal'];
    }

    res.json({
      success: true,
      deviceId: generateDeviceId(),
      computeScore: capabilities.computeScore,
      limits,
      hardware: {
        cpu: capabilities.cpu,
        gpu: capabilities.gpu,
        memory: capabilities.memory,
        platform: capabilities.platform,
        arch: capabilities.arch,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Limits calculation failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/device-hardware/history
 * Get hardware detection history for the user
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await db.query(
      `SELECT * FROM device_hardware
       WHERE user_id = $1
       ORDER BY last_detected_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      devices: result.rows,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Hardware history fetch failed', { error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

export default router;
