import { Router } from 'express';
import { engineGateway } from '../services/engineGateway';
import { loadEnginesConfig } from '../engines/config';
import { logger } from '../utils/logger';

const router = Router();

router.get('/catalog', (_req, res) => {
  try {
    const config = loadEnginesConfig();
    const summaries = engineGateway.getEngineSummaries();

    const payload = summaries.map(summary => {
      const engine = config.engines.find(entry => entry.key === summary.key);
      return {
        key: summary.key,
        provider: summary.provider,
        label: summary.label ?? summary.key,
        models: engine?.models ?? [{ name: engine?.model ?? summary.defaultModel, default: true }],
        defaultModel: summary.defaultModel,
        supportsTools: summary.supportsTools,
        stream: summary.stream,
        fallback: summary.fallback,
        hasApiKey: summary.hasApiKey,
        maxContext: engine?.max_context,
        metadata: engine?.metadata,
        cost: engine?.cost,
        rateLimit: engine?.rate_limit,
        features: engine?.features
      };
    });

    res.json({ success: true, engines: payload });
  } catch (error) {
    logger.error('[Engines API] Failed to load catalog', error);
    res.status(500).json({ success: false, error: 'Failed to load engine catalog' });
  }
});

router.get('/metrics', (_req, res) => {
  try {
    const metrics = engineGateway.getMetrics();
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('[Engines API] Failed to load metrics', error);
    res.status(500).json({ success: false, error: 'Failed to load engine metrics' });
  }
});

export default router;
