/**
 * ContinuezControls - Auto-continuation controls for farms
 *
 * Manages inference-continuez plugin settings including
 * confidence threshold adjustment.
 *
 * @author Blerbz
 * @license MIT
 */

import React, { useState, useCallback } from 'react';
import { PlayCircle, PauseCircle, Settings, AlertTriangle } from 'lucide-react';
import apiClient from '@/services/apiClient';

interface ContinuezControlsProps {
  farmId: string;
  threshold: number;
  shouldContinue: boolean;
  continuationCount: number;
  onThresholdChange?: (threshold: number) => void;
}

const ContinuezControls: React.FC<ContinuezControlsProps> = ({
  farmId,
  threshold: initialThreshold,
  shouldContinue,
  continuationCount,
  onThresholdChange,
}) => {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleThresholdChange = useCallback(async (newThreshold: number) => {
    setIsUpdating(true);
    setError(null);

    try {
      await apiClient.post(`/api/plugins/${farmId}/continuez/threshold`, {
        threshold: newThreshold,
      });
      setThreshold(newThreshold);
      onThresholdChange?.(newThreshold);
    } catch (err) {
      setError('Failed to update threshold');
      console.error('[ContinuezControls] Error updating threshold:', err);
    } finally {
      setIsUpdating(false);
    }
  }, [farmId, onThresholdChange]);

  const getThresholdLevel = (value: number): { label: string; color: string } => {
    if (value >= 80) return { label: 'Conservative', color: 'text-green-600' };
    if (value >= 60) return { label: 'Balanced', color: 'text-amber-600' };
    return { label: 'Aggressive', color: 'text-red-600' };
  };

  const thresholdLevel = getThresholdLevel(threshold);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Settings className="h-5 w-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Auto-Continue
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {shouldContinue ? (
            <span className="flex items-center text-green-500 text-sm">
              <PlayCircle className="h-4 w-4 mr-1" />
              Active
            </span>
          ) : (
            <span className="flex items-center text-amber-500 text-sm">
              <PauseCircle className="h-4 w-4 mr-1" />
              Paused
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      {!shouldContinue && (
        <div className="flex items-start space-x-2 p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Auto-continuation paused
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Confidence fell below threshold. Review agent progress before continuing.
            </p>
          </div>
        </div>
      )}

      {/* Threshold Control */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Confidence Threshold
          </label>
          <span className={`text-sm font-medium ${thresholdLevel.color}`}>
            {threshold}% ({thresholdLevel.label})
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="99"
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
          onMouseUp={() => handleThresholdChange(threshold)}
          onTouchEnd={() => handleThresholdChange(threshold)}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          disabled={isUpdating}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>99%</span>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => handleThresholdChange(85)}
          disabled={isUpdating}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded ${
            threshold === 85
              ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Quick Task (85%)
        </button>
        <button
          onClick={() => handleThresholdChange(80)}
          disabled={isUpdating}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded ${
            threshold === 80
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Harvest (80%)
        </button>
        <button
          onClick={() => handleThresholdChange(60)}
          disabled={isUpdating}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded ${
            threshold === 60
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          GoWild (60%)
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700">
        <span>Auto-continuations: {continuationCount}</span>
        {isUpdating && <span className="text-blue-500">Updating...</span>}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
};

export default ContinuezControls;
