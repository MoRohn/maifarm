import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, ActivitySquare } from 'lucide-react';
import { useEngineMetrics } from './context';
import { useAnalyticsStore } from '@/store/analyticsStore';
import type { EngineMetricsEntry } from '@/services/engineCatalogService';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const trendIcon = (value: number, goodIsUp = true) => {
  if (value > 0) {
    return goodIsUp ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingUp className="w-4 h-4 text-red-500" />;
  }
  if (value < 0) {
    return goodIsUp ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingDown className="w-4 h-4 text-green-500" />;
  }
  return <ActivitySquare className="w-4 h-4 text-gray-400" />;
};

const formatLatency = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${value.toFixed(0)} ms`;
};

const summarizeEngine = (entry: EngineMetricsEntry) => {
  const successRate = entry.totalRequests > 0 ? (entry.successfulRequests / entry.totalRequests) * 100 : 0;
  const failureRate = entry.totalRequests > 0 ? (entry.failedRequests / entry.totalRequests) * 100 : 0;
  const avgPromptTokens = entry.totalRequests > 0 ? entry.totalPromptTokens / entry.totalRequests : 0;
  const avgCompletionTokens = entry.totalRequests > 0 ? entry.totalCompletionTokens / entry.totalRequests : 0;

  return {
    successRate,
    failureRate,
    avgPromptTokens,
    avgCompletionTokens
  };
};

interface EngineComparativeMetricsProps {
  className?: string;
}

export const EngineComparativeMetrics: React.FC<EngineComparativeMetricsProps> = ({ className }) => {
  const { metrics, catalog, isLoading, refresh } = useEngineMetrics();
  const engineCostSummary = useAnalyticsStore((state) => state.engineCostSummary);

  const costByProvider = useMemo(() => {
    const map = new Map<string, { totalCost: number; totalRequests: number; totalTokens: number }>();
    if (!engineCostSummary) {
      return map;
    }
    engineCostSummary.byProvider.forEach(provider => {
      const key = provider.provider.toLowerCase();
      map.set(key, {
        totalCost: provider.totalCost,
        totalRequests: provider.totalRequests,
        totalTokens: provider.totalInputTokens + provider.totalOutputTokens
      });
    });
    return map;
  }, [engineCostSummary]);

  const enrichedMetrics = useMemo(() => {
    return metrics.map(entry => {
      const catalogEntry = catalog.find(engine => engine.key === entry.key);
      const providerKey = (catalogEntry?.provider ?? entry.provider).toLowerCase();
      const costInfo = costByProvider.get(providerKey);
      return {
        ...entry,
        label: catalogEntry?.label ?? entry.key,
        providerLabel: catalogEntry?.provider ?? entry.provider,
        maxContext: catalogEntry?.maxContext,
        hasApiKey: catalogEntry?.hasApiKey,
        features: catalogEntry?.features,
        summary: summarizeEngine(entry),
        totalCostNormalized: costInfo?.totalCost ?? entry.totalCostUsd,
        costPerRequest: costInfo && costInfo.totalRequests > 0 ? costInfo.totalCost / costInfo.totalRequests : null,
        costPer1kTokens: costInfo && costInfo.totalTokens > 0 ? (costInfo.totalCost / costInfo.totalTokens) * 1000 : null
      };
    });
  }, [metrics, catalog, costByProvider]);

  const totals = useMemo(() => {
    return enrichedMetrics.reduce(
      (acc, entry) => {
        acc.totalRequests += entry.totalRequests;
        acc.totalCost += entry.totalCostNormalized ?? entry.totalCostUsd;
        acc.totalPromptTokens += entry.totalPromptTokens;
        acc.totalCompletionTokens += entry.totalCompletionTokens;
        return acc;
      },
      { totalRequests: 0, totalCost: 0, totalPromptTokens: 0, totalCompletionTokens: 0 }
    );
  }, [enrichedMetrics]);

  if (isLoading) {
    return (
      <div className={clsx('p-4 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading engine metrics…</p>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Engine Performance</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Comparing latency, reliability, and token usage across configured engines.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div
          layout
          className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total Requests
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {totals.totalRequests.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Across all engines
          </p>
        </motion.div>
        <motion.div
          layout
          className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total Cost (USD)
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            ${totals.totalCost.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Including local engines (estimated)
          </p>
        </motion.div>
        <motion.div
          layout
          className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Prompt Tokens
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {totals.totalPromptTokens.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Aggregate usage
          </p>
        </motion.div>
        <motion.div
          layout
          className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Completion Tokens
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {totals.totalCompletionTokens.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Aggregate usage
          </p>
        </motion.div>
      </div>

      <div className="space-y-4">
        {enrichedMetrics.map(entry => (
          <motion.div
            key={entry.key}
            layout
            className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {entry.label}
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {entry.providerLabel} • Updated {formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className={clsx('px-3 py-1 rounded-full text-xs font-medium',
                  entry.circuitState === 'closed' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                    : entry.circuitState === 'half-open' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                )}>
                  Circuit: {entry.circuitState}
                </div>

                {!entry.hasApiKey && (
                  <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="w-4 h-4" />
                    Missing API key
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">P50 Latency</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {formatLatency(entry.p50LatencyMs)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">P95 Latency</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {formatLatency(entry.p95LatencyMs)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Success Rate</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {entry.summary.successRate.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Failure Rate</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {entry.summary.failureRate.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Tokens / Request</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Prompt: {entry.summary.avgPromptTokens.toFixed(0)} • Completion: {entry.summary.avgCompletionTokens.toFixed(0)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Cost (USD)</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                  ${(entry.totalCostNormalized ?? entry.totalCostUsd).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Cost / Request</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                  {entry.costPerRequest !== null ? `$${entry.costPerRequest.toFixed(4)}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Cost / 1K Tokens</p>
                <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                  {entry.costPer1kTokens !== null ? `$${entry.costPer1kTokens.toFixed(4)}` : '—'}
                </p>
              </div>
              {entry.lastError && (
                <div className="md:col-span-2">
                  <p className="text-gray-500 dark:text-gray-400">Last Error</p>
                  <p className="text-xs text-red-600 dark:text-red-400 break-words">
                    {entry.lastError}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default EngineComparativeMetrics;
