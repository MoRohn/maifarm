import { useState, useEffect } from 'react';

export interface TimeElapsedConfig {
  startTime?: Date | string;
  updateInterval?: number; // in milliseconds
  format?: 'short' | 'long' | 'compact';
  stopOnStatus?: string[]; // Stop timer when these statuses are detected
  currentStatus?: string; // Current status to check against stopOnStatus
}

export interface TimeElapsedResult {
  timeElapsed: string;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  isRunning: boolean;
}

/**
 * Hook to track and format elapsed time from a start time
 * @param config Configuration for time tracking
 * @returns Formatted time elapsed and raw values
 */
export const useTimeElapsed = (config: TimeElapsedConfig = {}): TimeElapsedResult => {
  const {
    startTime,
    updateInterval = 1000,
    format = 'long',
    stopOnStatus = ['completed', 'stopped', 'failed', 'deleted'],
    currentStatus
  } = config;

  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [finalTime, setFinalTime] = useState<number | null>(null);

  // Check if timer should stop based on status
  const shouldStop = currentStatus && stopOnStatus.includes(currentStatus);

  useEffect(() => {
    if (!startTime) {
      setIsRunning(false);
      return;
    }

    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime())) {
      setIsRunning(false);
      return;
    }

    // If status indicates stop, don't run timer
    if (shouldStop) {
      setIsRunning(false);
      // Keep the last elapsed time
      if (finalTime === null) {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startDate.getTime()) / 1000);
        setFinalTime(elapsed);
        setElapsedTime(elapsed);
      }
      return;
    }

    setIsRunning(true);
    setFinalTime(null);
    
    const updateElapsed = () => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startDate.getTime()) / 1000);
      setElapsedTime(Math.max(0, elapsed));
    };

    // Initial update
    updateElapsed();

    // Set up interval
    const interval = setInterval(updateElapsed, updateInterval);

    return () => clearInterval(interval);
  }, [startTime, updateInterval, shouldStop, finalTime]);

  const formatTime = (totalSeconds: number, format: string): string => {
    if (totalSeconds < 0) return '0s';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    switch (format) {
      case 'compact':
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
        
      case 'short':
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
      case 'long':
      default:
        const parts = [];
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        
        if (parts.length === 1) return parts[0];
        if (parts.length === 2) return parts.join(' and ');
        return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
    }
  };

  const totalMinutes = Math.floor(elapsedTime / 60);
  const totalHours = Math.floor(elapsedTime / 3600);

  return {
    timeElapsed: formatTime(elapsedTime, format),
    totalSeconds: elapsedTime,
    totalMinutes,
    totalHours,
    isRunning
  };
};

/**
 * Hook specifically for tracking harvest duration
 */
export const useHarvestElapsed = (harvest: any) => {
  const startTime = harvest?.started_at || harvest?.createdAt || harvest?.timestamp;
  const status = harvest?.status;
  
  return useTimeElapsed({
    startTime,
    format: 'short',
    updateInterval: 1000,
    currentStatus: status,
    stopOnStatus: ['completed', 'stopped', 'failed', 'deleted', 'harvested']
  });
};

/**
 * Hook for tracking farm uptime
 */
export const useFarmUptime = (farm: any) => {
  const startTime = farm?.createdAt || farm?.started_at;
  const status = farm?.status;
  
  return useTimeElapsed({
    startTime,
    format: 'compact',
    updateInterval: 30000, // Update every 30 seconds for uptime
    currentStatus: status,
    stopOnStatus: ['completed', 'stopped', 'failed', 'deleted', 'harvesting', 'harvested']
  });
};