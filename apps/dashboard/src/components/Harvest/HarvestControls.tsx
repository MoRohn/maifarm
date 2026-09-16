/**
 * HarvestControls - Dual early-stop controls for farming sessions
 *
 * Provides two actions:
 * 1. "Harvest Now" - Capture a snapshot of current work without stopping the farm
 * 2. "Stop & Harvest" - Full graceful shutdown with yield collection
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, StopCircle, Loader2, Check, AlertCircle } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import { cn } from '@/styles/premium-design-system';
import { farmService } from '@/services/farmService';

interface HarvestControlsProps {
  farmId: string;
  farmName?: string;
  isRunning: boolean;
  onHarvestSnapshot?: (snapshotId: string) => void;
  onStopAndHarvest?: () => void;
  className?: string;
  compact?: boolean; // For smaller display in headers
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

export const HarvestControls: React.FC<HarvestControlsProps> = ({
  farmId,
  farmName = 'Farm',
  isRunning,
  onHarvestSnapshot,
  onStopAndHarvest,
  className,
  compact = false
}) => {
  const [harvestNowState, setHarvestNowState] = useState<ActionState>('idle');
  const [stopHarvestState, setStopHarvestState] = useState<ActionState>('idle');
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Harvest Now - Capture snapshot without stopping
  const handleHarvestNow = useCallback(async () => {
    if (harvestNowState === 'loading' || !isRunning) return;

    setHarvestNowState('loading');
    setErrorMessage(null);

    try {
      const response = await farmService.harvestNow(farmId);

      if (response.success && response.data?.snapshotId) {
        setLastSnapshotId(response.data.snapshotId);
        setHarvestNowState('success');
        onHarvestSnapshot?.(response.data.snapshotId);

        // Reset to idle after showing success
        setTimeout(() => setHarvestNowState('idle'), 2000);
      } else {
        throw new Error(response.error?.message || 'Failed to capture snapshot');
      }
    } catch (error: any) {
      console.error('[HarvestControls] Harvest now failed:', error);
      setErrorMessage(error.message || 'Failed to capture snapshot');
      setHarvestNowState('error');

      // Reset to idle after showing error
      setTimeout(() => {
        setHarvestNowState('idle');
        setErrorMessage(null);
      }, 3000);
    }
  }, [farmId, harvestNowState, isRunning, onHarvestSnapshot]);

  // Stop & Harvest - Full graceful shutdown
  const handleStopAndHarvest = useCallback(async () => {
    if (stopHarvestState === 'loading' || !isRunning) return;

    setStopHarvestState('loading');
    setErrorMessage(null);

    try {
      const response = await farmService.gracefulShutdown(farmId, 'user_request');

      if (response.success) {
        setStopHarvestState('success');
        onStopAndHarvest?.();
      } else {
        throw new Error(response.error?.message || 'Failed to stop farm');
      }
    } catch (error: any) {
      console.error('[HarvestControls] Stop and harvest failed:', error);
      setErrorMessage(error.message || 'Failed to stop farm');
      setStopHarvestState('error');

      // Reset to idle after showing error
      setTimeout(() => {
        setStopHarvestState('idle');
        setErrorMessage(null);
      }, 3000);
    }
  }, [farmId, stopHarvestState, isRunning, onStopAndHarvest]);

  // Button state icon helper
  const getStateIcon = (state: ActionState, defaultIcon: React.ReactNode, size: string) => {
    switch (state) {
      case 'loading':
        return <Loader2 className={`${size} animate-spin`} />;
      case 'success':
        return <Check className={size} />;
      case 'error':
        return <AlertCircle className={size} />;
      default:
        return defaultIcon;
    }
  };

  // Get button style based on state
  const getButtonStyle = (state: ActionState, baseStyle: string) => {
    switch (state) {
      case 'loading':
        return 'opacity-75 cursor-wait';
      case 'success':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'error':
        return 'bg-red-600 hover:bg-red-700 text-white';
      default:
        return baseStyle;
    }
  };

  if (!isRunning) {
    return null; // Don't show controls if farm is not running
  }

  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5';
  const buttonPadding = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  const textSize = compact ? 'text-sm' : 'text-base';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Harvest Now Button - Amber/Camera */}
      <Tooltip
        content={
          <div className="text-center">
            <div className="font-semibold">Harvest Now</div>
            <div className="text-xs text-gray-400 mt-1">
              Capture current work snapshot.
              <br />Farm continues running.
            </div>
          </div>
        }
        position="bottom"
      >
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleHarvestNow}
          disabled={harvestNowState === 'loading'}
          className={cn(
            buttonPadding,
            textSize,
            'flex items-center gap-2 rounded-xl font-medium transition-all duration-200',
            'backdrop-blur-xl border shadow-lg',
            getButtonStyle(
              harvestNowState,
              'bg-amber-500/90 hover:bg-amber-500 text-white border-amber-400/50'
            )
          )}
          aria-label="Harvest Now - Capture snapshot"
        >
          {getStateIcon(harvestNowState, <Camera className={iconSize} />, iconSize)}
          {!compact && (
            <span>
              {harvestNowState === 'loading' ? 'Capturing...' :
               harvestNowState === 'success' ? 'Captured!' :
               harvestNowState === 'error' ? 'Failed' :
               'Harvest Now'}
            </span>
          )}
        </motion.button>
      </Tooltip>

      {/* Stop & Harvest Button - Red/StopCircle */}
      <Tooltip
        content={
          <div className="text-center">
            <div className="font-semibold">Stop & Harvest</div>
            <div className="text-xs text-gray-400 mt-1">
              Gracefully stop farm and collect all yields.
            </div>
          </div>
        }
        position="bottom"
      >
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStopAndHarvest}
          disabled={stopHarvestState === 'loading'}
          className={cn(
            buttonPadding,
            textSize,
            'flex items-center gap-2 rounded-xl font-medium transition-all duration-200',
            'backdrop-blur-xl border shadow-lg',
            getButtonStyle(
              stopHarvestState,
              'bg-red-500/90 hover:bg-red-500 text-white border-red-400/50'
            )
          )}
          aria-label="Stop and Harvest - Graceful shutdown"
        >
          {getStateIcon(stopHarvestState, <StopCircle className={iconSize} />, iconSize)}
          {!compact && (
            <span>
              {stopHarvestState === 'loading' ? 'Stopping...' :
               stopHarvestState === 'success' ? 'Stopped!' :
               stopHarvestState === 'error' ? 'Failed' :
               'Stop & Harvest'}
            </span>
          )}
        </motion.button>
      </Tooltip>

      {/* Error message toast */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-0 top-full mt-2 px-3 py-2 bg-red-500/90 text-white text-sm rounded-lg shadow-lg backdrop-blur-xl"
          >
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success indicator for snapshot */}
      <AnimatePresence>
        {harvestNowState === 'success' && lastSnapshotId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"
          >
            <Check className="w-4 h-4" />
            <span className="hidden sm:inline">Snapshot saved</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HarvestControls;
