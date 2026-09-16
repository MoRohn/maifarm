import { Router, Request, Response } from 'express';
import { hardwareDetectionService } from '../services/HardwareDetectionService';
import { autoModelInstallationService } from '../services/AutoModelInstallationService';
import { logger, LogCategory } from '../services/ProductionLogger';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';

const router = Router();

/**
 * GET /api/auto-model-setup/hardware
 * Detect hardware capabilities
 */
router.get('/hardware', async (req: Request, res: Response) => {
  try {
    logger.info(LogCategory.API, 'Hardware detection requested');

    const capabilities = await hardwareDetectionService.detectHardware();

    res.json({
      success: true,
      capabilities,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Hardware detection failed', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/auto-model-setup/recommend
 * Get model recommendation based on hardware
 */
router.get('/recommend', async (req: Request, res: Response) => {
  try {
    logger.info(LogCategory.API, 'Model recommendation requested');

    const recommendation = await hardwareDetectionService.recommendModel();

    res.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Model recommendation failed', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/auto-model-setup/install
 * Start automatic model installation
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    logger.info(LogCategory.API, 'Automatic model installation requested');

    // Check if installation is already in progress
    if (autoModelInstallationService.isInProgress()) {
      return res.status(409).json({
        success: false,
        error: 'Installation already in progress',
      });
    }

    // Start installation in background
    autoModelInstallationService.autoInstall().catch((error) => {
      logger.error(LogCategory.SYSTEM, 'Background installation failed', { error });
    });

    // Return immediately with initial progress
    const progress = autoModelInstallationService.getProgress();

    res.json({
      success: true,
      message: 'Installation started',
      progress,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Failed to start installation', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/auto-model-setup/progress
 * Get current installation progress
 */
router.get('/progress', async (req: Request, res: Response) => {
  try {
    const progress = autoModelInstallationService.getProgress();

    res.json({
      success: true,
      progress,
      isInstalling: autoModelInstallationService.isInProgress(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Failed to get installation progress', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/auto-model-setup/status
 * Get installation status and installed model details
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isInstalled = await autoModelInstallationService.isInstalled();
    const installedModel = await autoModelInstallationService.getInstalledModel();
    const isInstalling = autoModelInstallationService.isInProgress();
    const progress = autoModelInstallationService.getProgress();

    res.json({
      success: true,
      isInstalled,
      isInstalling,
      installedModel,
      progress: isInstalling ? progress : null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Failed to get installation status', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/auto-model-setup/reinstall
 * Reinstall with different configuration
 */
router.post('/reinstall', async (req: Request, res: Response) => {
  try {
    logger.info(LogCategory.API, 'Model reinstallation requested');

    // Check if installation is already in progress
    if (autoModelInstallationService.isInProgress()) {
      return res.status(409).json({
        success: false,
        error: 'Installation already in progress',
      });
    }

    // Clear cache to force re-detection
    hardwareDetectionService.clearCache();

    // Start installation in background
    autoModelInstallationService.autoInstall().catch((error) => {
      logger.error(LogCategory.SYSTEM, 'Background reinstallation failed', { error });
    });

    // Return immediately with initial progress
    const progress = autoModelInstallationService.getProgress();

    res.json({
      success: true,
      message: 'Reinstallation started',
      progress,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(LogCategory.API, 'Failed to start reinstallation', { error: errorMessage });

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

// Set up WebSocket event forwarding for real-time progress updates
autoModelInstallationService.on('progress', (progress) => {
  unifiedWebSocketManager.broadcast('model:installation:progress', progress);
});

export default router;
