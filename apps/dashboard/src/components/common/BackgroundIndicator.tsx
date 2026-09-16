import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayIcon } from '@heroicons/react/24/solid';

interface BackgroundIndicatorProps {
  className?: string;
}

const BackgroundIndicator: React.FC<BackgroundIndicatorProps> = ({ className = '' }) => {
  const [showIndicator, setShowIndicator] = useState(false);
  const [farmCount, setFarmCount] = useState(0);

  useEffect(() => {
    // Listen for service worker messages
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'UPDATE_IOS_INDICATOR') {
        setShowIndicator(event.data.showIndicator);
        setFarmCount(event.data.farmCount || 0);
      }
    };

    // Register service worker message listener
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // Listen for visibility change
    const handleVisibilityChange = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'VISIBILITY_CHANGE',
          visible: !document.hidden,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for beforeunload to handle app closing
    const handleBeforeUnload = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'VISIBILITY_CHANGE',
          visible: false,
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Clean up
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Only show on iOS devices
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  if (!isIOS || !showIndicator) {
    return null;
  }

  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-0 left-1/2 transform -translate-x-1/2 z-[9999] ${className}`}
          style={{
            // Position in iOS safe area
            paddingTop: 'env(safe-area-inset-top, 20px)',
          }}
        >
          <div className="bg-blue-600 text-white px-3 py-1 rounded-b-lg shadow-lg flex items-center space-x-2">
            <PlayIcon className="w-4 h-4 animate-pulse" />
            <span className="text-xs font-medium">
              {farmCount} {farmCount === 1 ? 'farm' : 'farms'} running
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BackgroundIndicator;