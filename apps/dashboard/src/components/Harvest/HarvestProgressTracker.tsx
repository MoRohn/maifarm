/**
 * Harvest Progress Tracker
 *
 * Real-time progress visualization for harvest collection
 * Features:
 * - Live progress bar with phase indicators
 * - File count and size tracking
 * - Animated phase transitions
 * - Error handling with retry options
 */

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, AlertCircle, FileText, Package } from 'lucide-react';
import { socket } from '@/services/websocket';

interface HarvestProgressProps {
  harvestId: string;
  onComplete?: (harvest: any) => void;
  onError?: (error: string) => void;
}

interface HarvestProgressData {
  harvestId: string;
  phase: 'scanning' | 'collecting' | 'validating' | 'packaging' | 'finalizing';
  progress: number;
  filesScanned?: number;
  filesCollected?: number;
  totalBytes?: number;
  currentFile?: string;
  errors?: string[];
}

const PHASE_CONFIG = {
  scanning: {
    label: 'Scanning Workspace',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: 'Discovering files and artifacts'
  },
  collecting: {
    label: 'Collecting Files',
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    description: 'Gathering artifacts and outputs'
  },
  validating: {
    label: 'Validating',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    description: 'Verifying file integrity'
  },
  packaging: {
    label: 'Packaging',
    icon: Package,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    description: 'Creating harvest archive'
  },
  finalizing: {
    label: 'Finalizing',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    description: 'Completing harvest'
  }
};

export const HarvestProgressTracker: React.FC<HarvestProgressProps> = ({
  harvestId,
  onComplete,
  onError
}) => {
  const [progress, setProgress] = useState<HarvestProgressData>({
    harvestId,
    phase: 'scanning',
    progress: 0
  });

  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for progress updates
    const handleProgress = (data: HarvestProgressData) => {
      if (data.harvestId === harvestId) {
        setProgress(data);

        // Handle errors
        if (data.errors && data.errors.length > 0) {
          const errorMsg = data.errors.join(', ');
          setError(errorMsg);
          onError?.(errorMsg);
        }
      }
    };

    // Listen for completion
    const handleComplete = (data: any) => {
      if (data.harvestId === harvestId) {
        setIsComplete(true);
        setProgress(prev => ({ ...prev, progress: 100, phase: 'finalizing' }));
        onComplete?.(data);
      }
    };

    socket.on('harvest:progress', handleProgress);
    socket.on('harvest:completed', handleComplete);

    return () => {
      socket.off('harvest:progress', handleProgress);
      socket.off('harvest:completed', handleComplete);
    };
  }, [harvestId, onComplete, onError]);

  const phaseConfig = PHASE_CONFIG[progress.phase];
  const PhaseIcon = phaseConfig.icon;

  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl border border-green-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${phaseConfig.bgColor} animate-pulse`}>
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <PhaseIcon className={`w-5 h-5 ${phaseConfig.color}`} />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isComplete ? 'Harvest Complete!' : phaseConfig.label}
            </h3>
            <p className="text-xs text-gray-600">
              {isComplete ? 'All artifacts collected' : phaseConfig.description}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-700">
            {progress.progress}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <Progress
          value={progress.progress}
          className="h-3 bg-green-100"
          indicatorClassName={`${
            isComplete
              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
              : 'bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400'
          } transition-all duration-300 ease-out`}
        />

        {/* Phase Indicators */}
        <div className="flex justify-between text-xs text-gray-500">
          {Object.entries(PHASE_CONFIG).map(([phase, config]) => {
            const isPast = Object.keys(PHASE_CONFIG).indexOf(progress.phase) > Object.keys(PHASE_CONFIG).indexOf(phase);
            const isCurrent = progress.phase === phase;

            return (
              <div
                key={phase}
                className={`flex flex-col items-center transition-all duration-200 ${
                  isCurrent
                    ? 'scale-110 font-semibold ' + config.color
                    : isPast
                    ? 'text-green-600'
                    : 'text-gray-400'
                }`}
              >
                {isPast ? (
                  <CheckCircle2 className="w-3 h-3 mb-1" />
                ) : isCurrent ? (
                  <Loader2 className="w-3 h-3 mb-1 animate-spin" />
                ) : (
                  <div className="w-3 h-3 mb-1 rounded-full border-2 border-current" />
                )}
                <span className="text-[10px] leading-tight text-center whitespace-nowrap">
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistics */}
      {(progress.filesCollected !== undefined || progress.filesScanned !== undefined) && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-green-200">
          {progress.filesScanned !== undefined && (
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">
                {progress.filesScanned}
              </div>
              <div className="text-xs text-gray-600">Scanned</div>
            </div>
          )}

          {progress.filesCollected !== undefined && (
            <div className="text-center">
              <div className="text-lg font-bold text-green-700">
                {progress.filesCollected}
              </div>
              <div className="text-xs text-gray-600">Collected</div>
            </div>
          )}

          {progress.totalBytes !== undefined && (
            <div className="text-center">
              <div className="text-lg font-bold text-blue-700">
                {formatBytes(progress.totalBytes)}
              </div>
              <div className="text-xs text-gray-600">Size</div>
            </div>
          )}
        </div>
      )}

      {/* Current File */}
      {progress.currentFile && !isComplete && (
        <div className="text-xs text-gray-600 bg-white/50 rounded-lg px-3 py-2 border border-green-100">
          <span className="font-medium">Processing:</span>{' '}
          <span className="font-mono">{truncateFilename(progress.currentFile, 50)}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && !isComplete && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Completion Message */}
      {isComplete && (
        <div className="flex items-center justify-center space-x-2 text-green-700 font-medium py-2 bg-green-100 rounded-lg animate-fade-in">
          <CheckCircle2 className="w-5 h-5" />
          <span>Harvest collection completed successfully!</span>
        </div>
      )}
    </div>
  );
};

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Truncate filename to max length
 */
function truncateFilename(filename: string, maxLength: number): string {
  if (filename.length <= maxLength) return filename;

  const extension = filename.split('.').pop() || '';
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));

  const truncated = nameWithoutExt.substring(0, maxLength - extension.length - 4) + '...';
  return `${truncated}.${extension}`;
}
