import React from 'react';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import type { EngineCostSummary } from '@/types/analytics';
import clsx from 'clsx';

interface CostBreakdownProps {
  summary?: EngineCostSummary | null;
  className?: string;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({ summary, className }) => {
  const providers = summary?.byProvider ?? [];
  const totalCost = summary?.totalCost ?? 0;
  const totalRequests = summary?.totalRequests ?? 0;
  const totalTokens = (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0);

  const providerCards = providers.map((provider) => {
    const costPerRequest = provider.totalRequests > 0 ? provider.totalCost / provider.totalRequests : 0;
    const costPer1kTokens = (provider.totalInputTokens + provider.totalOutputTokens) > 0
      ? (provider.totalCost / (provider.totalInputTokens + provider.totalOutputTokens)) * 1000
      : 0;

    // Safely access models array with bounds checking
    const models = provider.models ?? [];
    const previousEntry = models.length > 1 ? models[1] : undefined;
    const currentEntry = models.length > 0 ? models[0] : undefined;
    const trend = previousEntry && currentEntry
      ? currentEntry.cost >= previousEntry.cost
        ? 'up'
        : 'down'
      : 'stable';

    return {
      provider: provider.provider,
      totalCost: provider.totalCost,
      totalRequests: provider.totalRequests,
      costPerRequest,
      costPer1kTokens,
      trend,
      latestModel: currentEntry?.model,
      latestPeriod: currentEntry?.period
    };
  });

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cost Breakdown</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Aggregated spend across engines (USD)
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
          Total Cost: ${totalCost.toFixed(2)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Requests</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            {totalRequests.toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tokens Processed</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            {totalTokens.toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Average Cost / Request</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            ${totalRequests > 0 ? (totalCost / totalRequests).toFixed(4) : '0.0000'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {providerCards.map((provider) => (
          <div
            key={provider.provider}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {provider.provider.toUpperCase()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Latest model: {provider.latestModel || 'N/A'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Period: {provider.latestPeriod ? new Date(provider.latestPeriod).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Cost</p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  {provider.totalCost.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cost / Request</p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  ${provider.costPerRequest.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cost / 1K tokens</p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  ${provider.costPer1kTokens.toFixed(4)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {provider.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500" />}
                {provider.trend === 'down' && <TrendingDown className="w-4 h-4 text-green-500" />}
                {provider.trend === 'stable' && <span className="text-xs text-gray-400">Stable</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CostBreakdown;
