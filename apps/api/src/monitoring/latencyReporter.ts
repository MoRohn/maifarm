import { getLatencySnapshot } from './metricsCollector';
import { logger, LogCategory } from '../services/ProductionLogger';

const REPORT_INTERVAL_MS = Number(process.env.LATENCY_REPORT_INTERVAL_MS || 60000);

interface QuantileBuckets {
  endpoint: string;
  status: string;
  quantiles: Record<string, number>;
}

function formatQuantiles(values: QuantileBuckets[]): any[] {
  return values.map(({ endpoint, status, quantiles }) => ({
    endpoint,
    status,
    p50: quantiles['0.5'],
    p95: quantiles['0.95'],
  })).filter((entry) => typeof entry.p50 === 'number' && typeof entry.p95 === 'number');
}

function parseEndpointQuantiles(snapshot: Awaited<ReturnType<typeof getLatencySnapshot>>): QuantileBuckets[] {
  const result = new Map<string, QuantileBuckets>();

  for (const value of snapshot.endpoints || []) {
    const labels = value.labels as Record<string, string | undefined>;
    if (!labels) continue;

    const quantile = labels.quantile;
    if (!quantile) continue;

    const endpoint = labels.endpoint || 'unknown';
    const status = labels.status_code || 'unknown';
    const key = `${endpoint}|${status}`;
    if (!result.has(key)) {
      result.set(key, { endpoint, status, quantiles: {} });
    }

    result.get(key)!.quantiles[quantile] = value.value;
  }

  return Array.from(result.values());
}

function parseHandshakeQuantiles(snapshot: Awaited<ReturnType<typeof getLatencySnapshot>>): QuantileBuckets[] {
  const result = new Map<string, QuantileBuckets>();

  for (const value of snapshot.websockets || []) {
    const labels = value.labels as Record<string, string | undefined>;
    if (!labels) continue;

    const quantile = labels.quantile;
    if (!quantile) continue;

    const endpoint = labels.namespace || 'default';
    const key = `${endpoint}|handshake`;
    if (!result.has(key)) {
      result.set(key, { endpoint, status: 'handshake', quantiles: {} });
    }

    result.get(key)!.quantiles[quantile] = value.value;
  }

  return Array.from(result.values());
}

export function startLatencyReporter(): void {
  if (process.env.DISABLE_LATENCY_REPORTER === 'true') {
    return;
  }

  setInterval(async () => {
    try {
      const snapshot = await getLatencySnapshot();
      const endpointQuantiles = parseEndpointQuantiles(snapshot);
      const handshakeQuantiles = parseHandshakeQuantiles(snapshot);
      const payload = {
        endpoints: formatQuantiles(endpointQuantiles),
        websockets: formatQuantiles(handshakeQuantiles),
      };

      if (payload.endpoints.length || payload.websockets.length) {
        logger.info(LogCategory.PERFORMANCE, 'Latency snapshot', payload);
      }
    } catch (error) {
      logger.warn(LogCategory.PERFORMANCE, 'Failed to collect latency snapshot', { error });
    }
  }, REPORT_INTERVAL_MS).unref();
}
