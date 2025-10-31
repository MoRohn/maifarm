import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { farmCreationRateLimit } from '../middleware/rateLimiter';
import { getService } from '../services/unified/ServiceRegistry';
import { FarmMode, farmService, FarmConfig } from '../services/unified/farmService';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { ApiResponse } from '../types/api';
import { websocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';
import { fileManager } from '../services/fileManagerService';
import { pathConfig } from '../config/paths';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10
  }
});

const { TEMP_DIR } = pathConfig.getPaths();

const storeUploadedFiles = async (
  farmId: string,
  files: Express.Multer.File[]
): Promise<string[]> => {
  if (!files || files.length === 0) {
    return [];
  }

  const uploadDir = path.join(TEMP_DIR, 'quick-actions', farmId);
  await fileManager.ensureDirectory(uploadDir);

  const storedPaths: string[] = [];

  for (const file of files) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
    const result = await fileManager.writeFile(destPath, file.buffer);

    if (!result.success) {
      throw new Error(result.error || `Failed to persist uploaded file ${file.originalname}`);
    }

    storedPaths.push(destPath);
  }

  return storedPaths;
};

const router = Router();

router.use(authenticateToken);

function resolveProvider(requested?: string): AIProvider {
  const normalized = (requested || '').toLowerCase();
  if (normalized && aiProviderManager.isProviderEnabled(normalized as AIProvider)) {
    return normalized as AIProvider;
  }

  const defaultProvider = aiProviderManager.getDefaultProvider();
  return aiProviderManager.isProviderEnabled(defaultProvider) ? defaultProvider : AIProvider.CLAUDE;
}

function normalizeMode(mode: string): FarmMode {
  switch (mode) {
    case 'autonomous':
      return FarmMode.AUTONOMOUS;
    case 'quick':
    case 'quick-task':
    case 'quick_task':
    case 'quicktask':
      return FarmMode.QUICK_TASK;
    case 'harvest':
    case 'farm':
    case 'new-farm':
      return FarmMode.HARVEST;
    case 'gowild':
    case 'go_wild':
    case 'go-wild':
      return FarmMode.GO_WILD;
    case 'collaborative':
      return FarmMode.COLLABORATIVE;
    case 'sequential':
    default:
      // Default to HARVEST mode (the standard farm mode)
      return FarmMode.HARVEST;
  }
}

function normalizeAgentCount(mode: FarmMode, requested?: number): number {
  const safeNumber = typeof requested === 'number' && Number.isFinite(requested)
    ? Math.floor(requested)
    : undefined;

  const base = safeNumber ?? (mode === FarmMode.QUICK_TASK ? 2 : 3);

  if (mode === FarmMode.QUICK_TASK) {
    return 2;  // Quick Task requires 2 agents for XenoSync coordination
  }

  if (mode === FarmMode.GO_WILD) {
    return Math.max(2, Math.min(20, base));
  }

  return Math.max(1, Math.min(20, base));
}

router.post('/farm', farmCreationRateLimit.middleware(), upload.array('files', 10), async (req, res) => {
  // Dedicated entry point for dashboard quick actions so we can wire prompt → farm in one request
  const userId = (req as any).user?.userId || 'system';

  try {
    const files = (req.files as Express.Multer.File[]) || [];

    const prompt = req.body.prompt;
    const name = req.body.name;
    const description = req.body.description;
    const provider = resolveProvider(req.body.provider);
    const mode = (req.body.mode || 'collaborative').toLowerCase();
    const agentCount = Number(req.body.agentCount ?? 3);
    const timeoutSeconds = req.body.timeoutSeconds ? Number(req.body.timeoutSeconds) : undefined;
    const useXenoSync = req.body.useXenoSync !== undefined ? req.body.useXenoSync === 'true' || req.body.useXenoSync === true : true;
    const yamlContent = req.body.yamlContent;
    const barnReferences = req.body.barnReferences;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt is required to create a farm'
        }
      });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt must be at least 5 characters'
        }
      });
    }

    const resolvedName = (typeof name === 'string' && name.trim().length > 0)
      ? name.trim()
      : `Farm ${new Date().toISOString()}`;

    const resolvedDescription = (typeof description === 'string' && description.trim().length > 0)
      ? description.trim()
      : trimmedPrompt;

    let timeoutMs = typeof timeoutSeconds === 'number' && timeoutSeconds > 0
      ? timeoutSeconds * 1000
      : undefined;

    const orchestratorType: FarmConfig['orchestratorType'] = useXenoSync ? 'xenosync' : 'maifarm';
    let generatedYaml = typeof yamlContent === 'string' ? yamlContent : '';

    const normalizedMode = normalizeMode(mode);
    const normalizedAgentCount = normalizeAgentCount(normalizedMode, agentCount);

    if (!generatedYaml) {
      try {
        const yamlGenerator = getService('yaml');
        const yamlResponse = await yamlGenerator.generateYaml({
          prompt,
          mode: normalizedMode === FarmMode.COLLABORATIVE ? 'collaborative' : 'sequential',
          provider,
          constraints: {
            maxAgents: normalizedAgentCount,
            timeout: timeoutSeconds
          }
        });

        if (yamlResponse?.yaml) {
          generatedYaml = yamlResponse.yaml;
        }

        if (!timeoutMs && yamlResponse?.timeout) {
          timeoutMs = yamlResponse.timeout * 1000;
        }
      } catch (error) {
        logger.warn('[QuickActions] YAML generation failed, falling back to default template:', error);
        generatedYaml = `name: ${resolvedName}\nmode: ${mode}\nagents:\n  - name: Coordinator\n    role: Coordinate workstream\n  - name: Specialist\n    role: Execute focused tasks\n`;
      }
    }

    const farmId = uuidv4();

    const persistedAttachments = await storeUploadedFiles(farmId, files);

    const farmConfig: FarmConfig = {
      id: farmId,
      name: resolvedName,
      description: resolvedDescription,
      mode: normalizedMode,
      provider,
      numberOfAgents: normalizedAgentCount,
      prompt: trimmedPrompt,
      yamlContent: generatedYaml,
      timeout: timeoutMs,
      userId,
      contextFiles: persistedAttachments,
      barnReferences,
      orchestratorType,
      autoScale: req.body.autoScale === 'true' || req.body.autoScale === true || undefined,
      goWildMode: normalizedMode === FarmMode.GO_WILD ? {
        enabled: true,
        creativityLevel: req.body.creativityLevel ? Number(req.body.creativityLevel) : undefined,
        boundaries: Array.isArray(req.body.boundaries) ? req.body.boundaries : undefined
      } : undefined
    };

    farmService.createFarm(farmConfig)
      .then(async (result) => {
        if (!result.success) {
          logger.error('[QuickActions] farmService.createFarm failed', result.error);
          websocketManager.broadcast('quickaction:farm-error', {
            farmId,
            error: result.error,
            timestamp: new Date()
          });
          return;
        }

        const createdFarm = await farmService.getFarm(farmId, userId).catch(() => null);

        websocketManager.broadcast('quickaction:farm-created', {
          farmId,
          orchestrator: orchestratorType,
          farm: createdFarm,
          timestamp: new Date()
        });
      })
      .catch((error) => {
        logger.error('[QuickActions] Async farm launch failed', error);
        websocketManager.broadcast('quickaction:farm-error', {
          farmId,
          error: error?.message || 'Farm launch failed',
          timestamp: new Date()
        });
      });

    return res.status(202).json({
      success: true,
      data: {
        farmId,
        status: 'launching',
        attachmentCount: persistedAttachments.length
      }
    });

  } catch (error: any) {
    logger.error('[QuickActions] Failed to create farm:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to create farm'
      }
    });
  }
});

router.post('/go-wild', farmCreationRateLimit.middleware(), upload.array('files', 10), async (req, res) => {
  // Mirrors the dashboard Go Wild quick action while reusing the unified farm + harvest infrastructure
  const userId = (req as any).user?.userId || 'system';

  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const prompt = req.body.prompt;
    const agentCount = Number(req.body.agentCount ?? 5);
    const timeoutMinutes = req.body.timeoutMinutes ? Number(req.body.timeoutMinutes) : 45;
    const provider = resolveProvider(req.body.provider);
    const creativityLevel = req.body.creativityLevel ? Number(req.body.creativityLevel) : 80;
    const useXenoSync = req.body.useXenoSync !== undefined ? req.body.useXenoSync === 'true' || req.body.useXenoSync === true : true;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt is required to launch Go Wild mode'
        }
      });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt must be at least 5 characters'
        }
      });
    }

    const resolvedName = `Go Wild: ${trimmedPrompt.substring(0, 48)}`;
    const timeoutMs = Math.max(1, Number(timeoutMinutes)) * 60 * 1000;
    const farmId = uuidv4();
    const persistedAttachments = await storeUploadedFiles(farmId, files);

    const farmConfig: FarmConfig = {
      id: farmId,
      name: resolvedName,
      description: trimmedPrompt,
      mode: FarmMode.GO_WILD,
      provider,
      numberOfAgents: Math.max(2, Math.min(20, agentCount || 5)),
      prompt: trimmedPrompt,
      timeout: timeoutMs,
      userId,
      orchestratorType: useXenoSync ? 'xenosync' : 'maifarm',
      contextFiles: persistedAttachments,
      goWildMode: {
        enabled: true,
        creativityLevel,
        boundaries: []
      }
    };

    farmService.createFarm(farmConfig)
      .then(async (result) => {
        if (!result.success) {
          websocketManager.broadcast('quickaction:go-wild-error', {
            farmId,
            error: result.error,
            timestamp: new Date()
          });
          return;
        }

        const [{ goWildManager }, createdFarm] = await Promise.all([
          import('../services/goWildManager').then(mod => ({ goWildManager: mod.goWildManager })),
          farmService.getFarm(farmId, userId).catch(() => null)
        ]);

        try {
          await goWildManager.startExploration(farmId, {
            creativityLevel,
            explorationDepth: farmConfig.numberOfAgents,
            maxDuration: timeoutMinutes,
            boundaries: {
              allowExternalAPIs: false,
              allowFileSystem: true,
              allowNetworkRequests: false,
              restrictedDomains: []
            },
            focusAreas: [],
            prompt: trimmedPrompt
          });
        } catch (error) {
          logger.warn('[QuickActions] Go Wild exploration failed to start:', error);
        }

        websocketManager.broadcast('quickaction:go-wild-started', {
          farmId,
          orchestrator: farmConfig.orchestratorType,
          farm: createdFarm,
          timestamp: new Date()
        });
      })
      .catch((error) => {
        logger.error('[QuickActions] Async Go Wild launch failed', error);
        websocketManager.broadcast('quickaction:go-wild-error', {
          farmId,
          error: error?.message || 'Go Wild launch failed',
          timestamp: new Date()
        });
      });

    return res.status(202).json({
      success: true,
      data: {
        farmId,
        status: 'launching',
        attachmentCount: persistedAttachments.length
      }
    });

  } catch (error: any) {
    logger.error('[QuickActions] Failed to start Go Wild exploration:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Failed to start Go Wild exploration'
      }
    });
  }
});

export default router;
