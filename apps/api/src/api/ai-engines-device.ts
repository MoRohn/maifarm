/**
 * Device-Optimized AI Engine Endpoints
 *
 * Provides device-aware AI engine configuration and status endpoints
 * optimized for iOS devices with thermal, battery, and network awareness.
 *
 * Endpoints:
 * - GET /api/ai-engines/status/device - Device-optimized engine status
 * - POST /api/ai-engines/:provider/validate-lite - Lightweight format-only validation
 * - GET /api/ai-engines/device-preferences - Get device preferences
 * - PUT /api/ai-engines/device-preferences - Save device preferences
 * - POST /api/ai-engines/usage - Log engine usage metrics
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// Types
// ============================================================================

type DeviceTier = 'limited' | 'standard' | 'performance' | 'workstation';
type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';
type EngineId = 'claude' | 'openai' | 'grok' | 'ollama' | 'localcore' | 'gpt-oss';

interface DeviceContext {
    deviceId: string;
    deviceType: 'iphone' | 'ipad' | 'mac' | 'web';
    deviceTier: DeviceTier;
    thermalState: ThermalState;
    batteryLevel?: number;
    isLowPowerMode?: boolean;
    isOffline?: boolean;
}

interface EngineInfo {
    id: EngineId;
    name: string;
    displayName: string;
    description: string;
    icon: string;
    isLocal: boolean;
    requiresApiKey: boolean;
    configured: boolean;
    available: boolean;
    recommendedForTier: boolean;
    models: ModelInfo[];
}

interface ModelInfo {
    id: string;
    name: string;
    description: string;
    isDefault: boolean;
    contextWindow: number;
    features: string[];
    tier: 'basic' | 'standard' | 'premium';
    deviceRecommendation: Record<DeviceTier, boolean>;
}

// ============================================================================
// Engine Database
// ============================================================================

const ENGINES: Record<EngineId, Omit<EngineInfo, 'configured' | 'available' | 'recommendedForTier'>> = {
    claude: {
        id: 'claude',
        name: 'claude',
        displayName: 'Claude',
        description: 'Anthropic\'s Claude - excellent for coding and analysis',
        icon: 'brain.head.profile',
        isLocal: false,
        requiresApiKey: true,
        models: [
            {
                id: 'claude-3-5-sonnet-20241022',
                name: 'Claude 3.5 Sonnet',
                description: 'Best balance of speed and intelligence',
                isDefault: true,
                contextWindow: 200000,
                features: ['200K context', 'Vision', 'Fast', 'Coding'],
                tier: 'standard',
                deviceRecommendation: { limited: true, standard: true, performance: true, workstation: true }
            },
            {
                id: 'claude-3-5-haiku-20241022',
                name: 'Claude 3.5 Haiku',
                description: 'Fastest model, cost-effective',
                isDefault: false,
                contextWindow: 200000,
                features: ['200K context', 'Very fast', 'Budget'],
                tier: 'basic',
                deviceRecommendation: { limited: true, standard: true, performance: true, workstation: true }
            },
            {
                id: 'claude-3-opus-20240229',
                name: 'Claude 3 Opus',
                description: 'Most capable for complex tasks',
                isDefault: false,
                contextWindow: 200000,
                features: ['200K context', 'Best reasoning', 'Premium'],
                tier: 'premium',
                deviceRecommendation: { limited: false, standard: true, performance: true, workstation: true }
            }
        ]
    },
    openai: {
        id: 'openai',
        name: 'openai',
        displayName: 'OpenAI',
        description: 'OpenAI\'s GPT models - versatile and powerful',
        icon: 'sparkles',
        isLocal: false,
        requiresApiKey: true,
        models: [
            {
                id: 'gpt-4o-mini',
                name: 'GPT-4o Mini',
                description: 'Fast and cost-effective',
                isDefault: true,
                contextWindow: 128000,
                features: ['128K context', 'Very fast', 'Affordable'],
                tier: 'basic',
                deviceRecommendation: { limited: true, standard: true, performance: true, workstation: true }
            },
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                description: 'Advanced multimodal model',
                isDefault: false,
                contextWindow: 128000,
                features: ['128K context', 'Vision', 'Audio'],
                tier: 'standard',
                deviceRecommendation: { limited: false, standard: true, performance: true, workstation: true }
            },
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                description: 'Most capable GPT-4 variant',
                isDefault: false,
                contextWindow: 128000,
                features: ['128K context', 'JSON mode', 'Functions'],
                tier: 'premium',
                deviceRecommendation: { limited: false, standard: true, performance: true, workstation: true }
            }
        ]
    },
    grok: {
        id: 'grok',
        name: 'grok',
        displayName: 'Grok',
        description: 'xAI\'s Grok - fast with real-time knowledge',
        icon: 'bolt.horizontal.fill',
        isLocal: false,
        requiresApiKey: true,
        models: [
            {
                id: 'grok-2',
                name: 'Grok-2',
                description: 'Latest xAI model with real-time knowledge',
                isDefault: true,
                contextWindow: 128000,
                features: ['128K context', 'Real-time', 'Fast'],
                tier: 'standard',
                deviceRecommendation: { limited: true, standard: true, performance: true, workstation: true }
            },
            {
                id: 'grok-2-mini',
                name: 'Grok-2 Mini',
                description: 'Faster, lighter version',
                isDefault: false,
                contextWindow: 128000,
                features: ['128K context', 'Very fast', 'Budget'],
                tier: 'basic',
                deviceRecommendation: { limited: true, standard: true, performance: true, workstation: true }
            }
        ]
    },
    ollama: {
        id: 'ollama',
        name: 'ollama',
        displayName: 'Ollama',
        description: 'Run open-source models locally with full privacy',
        icon: 'desktopcomputer',
        isLocal: true,
        requiresApiKey: false,
        models: [
            {
                id: 'llama3.1:8b',
                name: 'Llama 3.1 8B',
                description: 'Balanced performance (4.7 GB)',
                isDefault: true,
                contextWindow: 128000,
                features: ['128K context', '8GB RAM', 'Apache 2.0'],
                tier: 'standard',
                deviceRecommendation: { limited: false, standard: false, performance: true, workstation: true }
            },
            {
                id: 'llama3.1:70b',
                name: 'Llama 3.1 70B',
                description: 'Most powerful (40 GB)',
                isDefault: false,
                contextWindow: 128000,
                features: ['128K context', '40GB+ RAM', 'Best quality'],
                tier: 'premium',
                deviceRecommendation: { limited: false, standard: false, performance: false, workstation: true }
            },
            {
                id: 'qwen2.5-coder:7b',
                name: 'Qwen 2.5 Coder 7B',
                description: 'Optimized for coding (4.4 GB)',
                isDefault: false,
                contextWindow: 32000,
                features: ['32K context', 'Coding', 'Fast'],
                tier: 'standard',
                deviceRecommendation: { limited: false, standard: false, performance: true, workstation: true }
            }
        ]
    },
    localcore: {
        id: 'localcore',
        name: 'localcore',
        displayName: 'LocalCore',
        description: 'On-device AI processing - maximum privacy, works offline',
        icon: 'lock.shield.fill',
        isLocal: true,
        requiresApiKey: false,
        models: [
            {
                id: 'localcore-base',
                name: 'LocalCore Base',
                description: 'On-device AI, works offline',
                isDefault: true,
                contextWindow: 8000,
                features: ['Offline', 'Private', 'Fast'],
                tier: 'standard',
                deviceRecommendation: { limited: false, standard: false, performance: false, workstation: true }
            }
        ]
    },
    'gpt-oss': {
        id: 'gpt-oss',
        name: 'gpt-oss',
        displayName: 'GPT-OSS',
        description: 'Open source models via Ollama - works offline',
        icon: 'cpu',
        isLocal: true,
        requiresApiKey: false,
        models: [
            {
                id: 'llama3.1:8b',
                name: 'Llama 3.1 8B',
                description: 'Default local model',
                isDefault: true,
                contextWindow: 128000,
                features: ['Offline', 'Private', 'Free'],
                tier: 'standard',
                deviceRecommendation: { limited: false, standard: false, performance: true, workstation: true }
            }
        ]
    }
};

// Tier-based restrictions
const TIER_RESTRICTIONS: Record<DeviceTier, {
    maxAgents: number;
    maxDurationMinutes: number;
    allowLocalModels: boolean;
    recommendedEngine: EngineId;
    maxConcurrentRequests: number;
}> = {
    limited: {
        maxAgents: 2,
        maxDurationMinutes: 60,
        allowLocalModels: false,
        recommendedEngine: 'claude',
        maxConcurrentRequests: 2
    },
    standard: {
        maxAgents: 3,
        maxDurationMinutes: 120,
        allowLocalModels: false,
        recommendedEngine: 'claude',
        maxConcurrentRequests: 3
    },
    performance: {
        maxAgents: 5,
        maxDurationMinutes: 240,
        allowLocalModels: true,
        recommendedEngine: 'claude',
        maxConcurrentRequests: 5
    },
    workstation: {
        maxAgents: 10,
        maxDurationMinutes: 480,
        allowLocalModels: true,
        recommendedEngine: 'ollama',
        maxConcurrentRequests: 10
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

function extractDeviceContext(req: Request): DeviceContext {
    return {
        deviceId: req.headers['x-device-id'] as string || 'unknown',
        deviceType: (req.headers['x-device-type'] as string || 'web') as DeviceContext['deviceType'],
        deviceTier: (req.headers['x-device-tier'] as string || 'standard') as DeviceTier,
        thermalState: (req.headers['x-thermal-state'] as string || 'nominal') as ThermalState,
        batteryLevel: req.headers['x-battery-level'] ? parseInt(req.headers['x-battery-level'] as string) : undefined,
        isLowPowerMode: req.headers['x-low-power-mode'] === 'true',
        isOffline: req.headers['x-offline'] === 'true'
    };
}

async function isEngineConfigured(engineId: EngineId): Promise<boolean> {
    const engine = ENGINES[engineId];
    if (!engine.requiresApiKey) return true;

    // Check environment
    const envVarMap: Record<string, string[]> = {
        claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
        openai: ['OPENAI_API_KEY'],
        grok: ['GROK_API_KEY', 'XAI_API_KEY']
    };

    const envVars = envVarMap[engineId] || [];
    if (envVars.some(v => !!process.env[v])) return true;

    // Check database
    try {
        const result = await db.query(
            'SELECT id FROM api_keys WHERE service = $1 AND is_active = true LIMIT 1',
            [engineId]
        );
        return result.rows.length > 0;
    } catch {
        return false;
    }
}

function getRecommendedModels(tier: DeviceTier, thermalState: ThermalState): string[] {
    const recommendations: string[] = [];

    // When thermal is critical, recommend budget models
    if (thermalState === 'critical' || thermalState === 'serious') {
        recommendations.push('claude-3-5-haiku-20241022', 'gpt-4o-mini', 'grok-2-mini');
    } else {
        recommendations.push('claude-3-5-sonnet-20241022', 'gpt-4o-mini');
    }

    return recommendations;
}

function validateKeyFormat(engine: EngineId, apiKey: string): { valid: boolean; message: string } {
    if (!apiKey || apiKey.length < 10) {
        return { valid: false, message: 'API key is too short' };
    }

    switch (engine) {
        case 'claude':
            if (!apiKey.startsWith('sk-') && !apiKey.startsWith('anthropic-')) {
                return { valid: false, message: 'Claude API keys start with "sk-" or "anthropic-"' };
            }
            break;
        case 'openai':
            if (!apiKey.startsWith('sk-')) {
                return { valid: false, message: 'OpenAI API keys start with "sk-"' };
            }
            break;
        case 'grok':
            if (!apiKey.startsWith('xai-') && !apiKey.startsWith('grok-')) {
                return { valid: false, message: 'Grok API keys start with "xai-" or "grok-"' };
            }
            break;
    }

    return { valid: true, message: 'API key format is valid' };
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * GET /api/ai-engines/status/device
 * Returns device-optimized engine status with tier-based filtering
 */
router.get('/ai-engines/status/device', async (req: Request, res: Response) => {
    try {
        const context = extractDeviceContext(req);

        logger.info(LogCategory.SYSTEM, `Device engine status request: ${context.deviceType}/${context.deviceTier}/${context.thermalState}`);

        const restrictions = TIER_RESTRICTIONS[context.deviceTier];
        const engines: EngineInfo[] = [];

        for (const [id, engine] of Object.entries(ENGINES)) {
            const engineId = id as EngineId;

            // Check if engine is available for this tier
            const isAvailable = engine.isLocal ? restrictions.allowLocalModels : true;

            // Filter models by device tier
            const filteredModels = engine.models.filter(m =>
                m.deviceRecommendation[context.deviceTier]
            );

            const configured = await isEngineConfigured(engineId);

            engines.push({
                ...engine,
                configured,
                available: isAvailable,
                recommendedForTier: restrictions.recommendedEngine === engineId,
                models: filteredModels
            });
        }

        // Filter out unavailable engines for limited/standard tiers
        const availableEngines = engines.filter(e => e.available);

        res.json({
            success: true,
            engines: availableEngines,
            recommendations: getRecommendedModels(context.deviceTier, context.thermalState),
            restrictions: {
                maxAgents: restrictions.maxAgents,
                maxDurationMinutes: restrictions.maxDurationMinutes,
                maxConcurrentRequests: restrictions.maxConcurrentRequests,
                allowLocalModels: restrictions.allowLocalModels
            },
            context: {
                deviceTier: context.deviceTier,
                thermalState: context.thermalState,
                isLowPowerMode: context.isLowPowerMode
            }
        });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Device engine status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get engine status'
        });
    }
});

/**
 * POST /api/ai-engines/:provider/validate-lite
 * Lightweight format-only validation (no network call)
 */
router.post('/ai-engines/:provider/validate-lite', async (req: Request, res: Response) => {
    try {
        const { provider } = req.params;
        const { apiKey } = req.body;
        const context = extractDeviceContext(req);

        // Defer full validation if thermal is critical
        if (context.thermalState === 'critical') {
            return res.status(202).json({
                valid: false,
                deferred: true,
                reason: 'Validation deferred due to thermal state',
                formatValid: validateKeyFormat(provider as EngineId, apiKey).valid
            });
        }

        const formatResult = validateKeyFormat(provider as EngineId, apiKey);

        return res.json({
            valid: formatResult.valid,
            message: formatResult.message,
            formatOnly: true,
            details: {
                format: formatResult.valid,
                connection: null, // Not tested in lite mode
                permissions: formatResult.valid ? ['read', 'write'] : []
            }
        });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Lite validation error:', error);
        return res.status(500).json({
            valid: false,
            message: 'Validation failed'
        });
    }
});

/**
 * GET /api/ai-engines/device-preferences
 * Get device-specific engine preferences
 */
router.get('/ai-engines/device-preferences', async (req: Request, res: Response) => {
    try {
        const context = extractDeviceContext(req);
        const userId = (req as any).userId || null;

        const result = await db.query(`
            SELECT *
            FROM device_engine_preferences
            WHERE device_id = $1
            ${userId ? 'AND user_id = $2' : ''}
            LIMIT 1
        `, userId ? [context.deviceId, userId] : [context.deviceId]);

        if (result.rows.length === 0) {
            // Return defaults based on tier
            const restrictions = TIER_RESTRICTIONS[context.deviceTier];
            return res.json({
                success: true,
                preferences: {
                    preferredEngine: restrictions.recommendedEngine,
                    preferredModel: null,
                    fallbackEngine: 'gpt-oss',
                    autoSwitchOnThermal: true,
                    autoSwitchOnBattery: true,
                    autoSwitchOnNetwork: true,
                    offlineEngine: 'gpt-oss',
                    maxConcurrentRequests: restrictions.maxConcurrentRequests
                },
                isDefault: true
            });
        }

        const row = result.rows[0];
        return res.json({
            success: true,
            preferences: {
                preferredEngine: row.preferred_engine,
                preferredModel: row.preferred_model,
                fallbackEngine: row.fallback_engine,
                autoSwitchOnThermal: row.auto_switch_on_thermal,
                autoSwitchOnBattery: row.auto_switch_on_battery,
                autoSwitchOnNetwork: row.auto_switch_on_network,
                offlineEngine: row.offline_engine,
                maxConcurrentRequests: row.max_concurrent_requests
            },
            isDefault: false
        });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Get device preferences error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get device preferences'
        });
    }
});

/**
 * PUT /api/ai-engines/device-preferences
 * Save device-specific engine preferences
 */
router.put('/ai-engines/device-preferences', async (req: Request, res: Response) => {
    try {
        const context = extractDeviceContext(req);
        const userId = (req as any).userId || null;
        const {
            preferredEngine,
            preferredModel,
            fallbackEngine,
            autoSwitchOnThermal,
            autoSwitchOnBattery,
            autoSwitchOnNetwork,
            offlineEngine,
            maxConcurrentRequests
        } = req.body;

        await db.query(`
            INSERT INTO device_engine_preferences (
                user_id, device_id, device_type, device_tier,
                preferred_engine, preferred_model, fallback_engine,
                auto_switch_on_thermal, auto_switch_on_battery, auto_switch_on_network,
                offline_engine, max_concurrent_requests
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (user_id, device_id)
            DO UPDATE SET
                preferred_engine = EXCLUDED.preferred_engine,
                preferred_model = EXCLUDED.preferred_model,
                fallback_engine = EXCLUDED.fallback_engine,
                auto_switch_on_thermal = EXCLUDED.auto_switch_on_thermal,
                auto_switch_on_battery = EXCLUDED.auto_switch_on_battery,
                auto_switch_on_network = EXCLUDED.auto_switch_on_network,
                offline_engine = EXCLUDED.offline_engine,
                max_concurrent_requests = EXCLUDED.max_concurrent_requests,
                updated_at = CURRENT_TIMESTAMP
        `, [
            userId,
            context.deviceId,
            context.deviceType,
            context.deviceTier,
            preferredEngine || 'claude',
            preferredModel,
            fallbackEngine,
            autoSwitchOnThermal ?? true,
            autoSwitchOnBattery ?? true,
            autoSwitchOnNetwork ?? true,
            offlineEngine || 'gpt-oss',
            maxConcurrentRequests || TIER_RESTRICTIONS[context.deviceTier].maxConcurrentRequests
        ]);

        // Log config change
        await db.query(`
            INSERT INTO engine_config_history (
                user_id, device_id, action, engine, new_model, new_config, trigger_source
            ) VALUES ($1, $2, 'configure', $3, $4, $5, 'user')
        `, [
            userId,
            context.deviceId,
            preferredEngine,
            preferredModel,
            JSON.stringify(req.body)
        ]);

        res.json({
            success: true,
            message: 'Device preferences saved'
        });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Save device preferences error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save device preferences'
        });
    }
});

/**
 * POST /api/ai-engines/usage
 * Log engine usage metrics from device
 */
router.post('/ai-engines/usage', async (req: Request, res: Response) => {
    try {
        const context = extractDeviceContext(req);
        const userId = (req as any).userId || null;
        const {
            engine,
            model,
            tokensUsed,
            cost,
            latencyMs,
            success,
            thermalThrottled,
            lowBattery,
            offlineFallback
        } = req.body;

        await db.query(`
            SELECT upsert_engine_usage($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            context.deviceId,
            context.deviceType,
            context.deviceTier,
            userId,
            engine,
            model,
            tokensUsed || 0,
            cost || 0,
            latencyMs,
            success ?? true,
            thermalThrottled ?? false,
            lowBattery ?? false,
            offlineFallback ?? false
        ]);

        res.json({ success: true });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Log engine usage error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to log usage'
        });
    }
});

/**
 * GET /api/ai-engines/device-analytics
 * Get aggregated device analytics (for dashboard)
 */
router.get('/ai-engines/device-analytics', async (req: Request, res: Response) => {
    try {
        const { days = 7 } = req.query;

        const result = await db.query(`
            SELECT
                device_type,
                device_tier,
                engine,
                SUM(requests_count) as total_requests,
                SUM(successful_requests) as successful_requests,
                AVG(average_latency_ms)::INTEGER as avg_latency_ms,
                SUM(tokens_used) as total_tokens,
                SUM(total_cost) as total_cost,
                SUM(thermal_throttle_count) as thermal_throttles,
                SUM(offline_fallback_count) as offline_fallbacks
            FROM engine_usage_by_device
            WHERE period_date >= CURRENT_DATE - $1::INTEGER
            GROUP BY device_type, device_tier, engine
            ORDER BY total_requests DESC
        `, [parseInt(days as string)]);

        res.json({
            success: true,
            analytics: result.rows,
            period: {
                startDate: new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000).toISOString(),
                endDate: new Date().toISOString(),
                days: parseInt(days as string)
            }
        });

    } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Device analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics'
        });
    }
});

export default router;
