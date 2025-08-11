import { useEffect, useState, useRef } from 'react';

interface TabVisibilityOptions {
  onVisible?: () => void;
  onHidden?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  throttleMs?: number;
}

export const useTabVisibility = (options: TabVisibilityOptions = {}) => {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [tabHiddenAt, setTabHiddenAt] = useState<Date | null>(null);
  const [backgroundDuration, setBackgroundDuration] = useState(0);
  const lastChangeRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now();
      const isCurrentlyVisible = !document.hidden;
      
      // Throttle rapid changes
      if (options.throttleMs && now - lastChangeRef.current < options.throttleMs) {
        return;
      }
      
      lastChangeRef.current = now;
      setIsVisible(isCurrentlyVisible);

      if (isCurrentlyVisible) {
        // Tab became visible
        if (tabHiddenAt) {
          const duration = Date.now() - tabHiddenAt.getTime();
          setBackgroundDuration(duration);
          console.log(`[TabVisibility] Tab was in background for ${Math.round(duration / 1000)}s`);
        }
        setTabHiddenAt(null);
        
        // Clear background timer
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        options.onVisible?.();
      } else {
        // Tab became hidden
        setTabHiddenAt(new Date());
        setBackgroundDuration(0);
        
        // Start tracking background duration
        intervalRef.current = setInterval(() => {
          if (tabHiddenAt) {
            setBackgroundDuration(Date.now() - tabHiddenAt.getTime());
          }
        }, 1000);
        
        options.onHidden?.();
      }

      options.onVisibilityChange?.(isCurrentlyVisible);
    };

    // Check initial state
    handleVisibilityChange();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for focus/blur as backup
    const handleFocus = () => {
      if (document.hidden) return;
      handleVisibilityChange();
    };
    
    const handleBlur = () => {
      // Only treat as hidden if document is actually hidden
      setTimeout(() => {
        if (document.hidden) {
          handleVisibilityChange();
        }
      }, 100);
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [options.throttleMs]);

  const getBackgroundDurationFormatted = () => {
    const seconds = Math.floor(backgroundDuration / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return {
    isVisible,
    tabHiddenAt,
    backgroundDuration,
    backgroundDurationFormatted: getBackgroundDurationFormatted(),
    wasInBackground: backgroundDuration > 0
  };
};

export default useTabVisibility;