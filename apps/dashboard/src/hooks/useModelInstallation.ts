import { useEffect, useRef } from 'react';
import { useHardwareStore, InstallationProgress } from '../store/hardwareStore';
import { websocketService } from '../services/websocket';

/**
 * Custom hook to listen for model installation progress via WebSocket
 * Automatically updates the hardware store when progress events are received
 */
export const useModelInstallation = () => {
  const updateProgress = useHardwareStore((state) => state.updateProgress);
  const isInstalling = useHardwareStore((state) => state.isInstalling);
  const checkInstallationStatus = useHardwareStore((state) => state.checkInstallationStatus);
  const listenerAttached = useRef(false);

  useEffect(() => {
    // Only attach listener once
    if (listenerAttached.current) {
      return;
    }

    console.log('[useModelInstallation] Attaching WebSocket listener for model installation');

    // Listen for installation progress events
    const handleInstallationProgress = (progress: InstallationProgress) => {
      console.log('[useModelInstallation] Received progress update:', {
        status: progress.status,
        phase: progress.phase,
        progress: progress.progress,
      });

      // Update the store
      updateProgress(progress);
    };

    // Attach the event listener
    websocketService.on('model:installation:progress', handleInstallationProgress);
    listenerAttached.current = true;

    // Check installation status on mount
    checkInstallationStatus();

    // Cleanup on unmount
    return () => {
      console.log('[useModelInstallation] Removing WebSocket listener');
      websocketService.off('model:installation:progress', handleInstallationProgress);
      listenerAttached.current = false;
    };
  }, [updateProgress, checkInstallationStatus]);

  // Periodically check status if installing (fallback for WebSocket issues)
  useEffect(() => {
    if (!isInstalling) {
      return;
    }

    console.log('[useModelInstallation] Installation in progress, setting up status polling');

    const interval = setInterval(() => {
      checkInstallationStatus();
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [isInstalling, checkInstallationStatus]);

  return {
    isInstalling,
  };
};
