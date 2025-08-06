import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sprout, Sun, CloudRain, TreePine } from 'lucide-react';
import CompactorAnimation from '../common/CompactorAnimation';
import { useWebSocketStore } from '../../store/websocketStore';
import { useFarmStore } from '../../store/farmStore';

const getProgressiveMessages = (farmAge: number) => {
  if (farmAge < 10000) { // First 10 seconds
    return [
      "Preparing AI agents... initializing digital neural networks!",
      "Setting up computational environment... almost ready!",
      "Loading agent personalities... each one is unique!",
      "Configuring collaborative protocols... teamwork incoming!"
    ];
  } else if (farmAge < 30000) { // 10-30 seconds
    return [
      "Starting CLI sessions... terminals are coming online!",
      "Agents are stretching their digital roots... growth in progress!",
      "Establishing communication channels... connection established!",
      "Your AI ecosystem is taking shape... patience pays off!"
    ];
  } else if (farmAge < 45000) { // 30-45 seconds
    return [
      "Agents coming online... they're almost ready to work!",
      "Fine-tuning collaborative algorithms... optimization in progress!",
      "Digital crops are photosynthesizing data... harvest approaching!",
      "The AI seeds are germinating... complexity takes time to cultivate!"
    ];
  } else { // 45+ seconds
    return [
      "Almost ready... your agents are finalizing preparations!",
      "The harvest moon is rising... your farm will be ready any moment!",
      "Final calibrations complete... excellence requires patience!",
      "Your digital farm is flourishing... great things are worth the wait!"
    ];
  }
};

export const GrowingPage: React.FC = () => {
  let farmId: string | undefined;
  let navigate: ReturnType<typeof useNavigate> | null = null;
  
  // Try to use React Router hooks, but handle cases where they might not be available
  try {
    const params = useParams<{ farmId: string }>();
    farmId = params.farmId;
    navigate = useNavigate();
  } catch (error) {
    console.warn('GrowingPage: Router hooks not available, using fallback navigation');
    // Extract farmId from URL path if Router context is not available
    const pathMatch = window.location.pathname.match(/\/farms\/(\w+)\/growing/);
    farmId = pathMatch?.[1];
  }
  const [currentMessage, setCurrentMessage] = useState(0);
  const [dots, setDots] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const hasNavigatedRef = useRef(false);
  const mountedRef = useRef(true);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { subscribe } = useWebSocketStore();
  const { farms } = useFarmStore();
  
  // Find the current farm
  const farm = farms.find(f => f.id === farmId);

  // Navigation helper function
  const navigateToHarvest = (forceNavigate = false) => {
    // Allow force navigation from manual button click
    if ((forceNavigate || !hasNavigatedRef.current) && mountedRef.current) {
      console.log('[GrowingPage] Navigating to harvest page' + (forceNavigate ? ' (forced)' : ''), 'farmId:', farmId);
      hasNavigatedRef.current = true;
      
      // Clear any pending timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      
      // Perform navigation
      setTimeout(() => {
        if (mountedRef.current) {
          // Navigate to general harvest page with farmId as a query param if specific route doesn't work
          const harvestUrl = farmId ? `/harvest?farmId=${farmId}` : '/harvest';
          
          if (navigate) {
            // Try specific harvest route first, fallback to general
            navigate(harvestUrl, { replace: true });
          } else {
            window.location.href = harvestUrl;
          }
        }
      }, 100);
    }
  };

  // Set up countdown timer on mount
  useEffect(() => {
    if (hasNavigatedRef.current) return;
    
    console.log('[GrowingPage] Starting countdown timer from 60 seconds');
    
    // Start countdown interval immediately
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        const newValue = prev - 1;
        console.log(`[GrowingPage] Countdown: ${newValue}s remaining`);
        
        if (newValue <= 0) {
          console.log('[GrowingPage] Countdown reached zero, triggering navigation');
          clearInterval(interval);
          navigateToHarvest();
          return 0;
        }
        return newValue;
      });
    }, 1000);
    
    countdownIntervalRef.current = interval;
    
    // Cleanup
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Enhanced farm status checking and navigation logic
  useEffect(() => {
    if (!farm || !farmId || hasNavigatedRef.current || !mountedRef.current) return;

    // Check if farm is already running
    if (farm.status === 'running') {
      console.log('[GrowingPage] Farm status is already running, navigating immediately');
      navigateToHarvest();
      return;
    }

    // Set up backup timeout (60 seconds)
    console.log('[GrowingPage] Setting up 60-second backup auto-redirect timer');
    navigationTimeoutRef.current = setTimeout(() => {
      console.log('[GrowingPage] 60-second backup timeout reached, navigating to harvest view');
      navigateToHarvest();
    }, 60000);

    // Cleanup
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [farm, farmId]);

  // Rotate through progressive messages based on farm age
  useEffect(() => {
    const messageInterval = setInterval(() => {
      if (farm) {
        const farmAge = Date.now() - new Date(farm.createdAt).getTime();
        const messages = getProgressiveMessages(farmAge);
        setCurrentMessage((prev) => (prev + 1) % messages.length);
      }
    }, 3000); // Slightly faster rotation for better engagement

    return () => clearInterval(messageInterval);
  }, [farm]);

  // Animate dots
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Listen for WebSocket events that indicate farm is ready
  useEffect(() => {
    if (!farmId || !mountedRef.current) return;

    const handleFarmStatus = (data: any) => {
      if (!mountedRef.current) return;
      console.log('[GrowingPage] Received farm status:', data);
      
      // Check both direct data and payload format
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventStatus = data.status || data.payload?.status;
      
      // Only navigate when status changes to running (CLI windows ready) - NOT launching
      if (eventFarmId === farmId && eventStatus === 'running') {
        console.log('[GrowingPage] Farm status changed to running, CLI windows are ready, navigating to harvest view');
        navigateToHarvest();
      }
      
      // Also navigate if we get a clear signal that agents are producing output
      if (eventFarmId === farmId && (data.hasAgentOutput || data.payload?.hasAgentOutput)) {
        console.log('[GrowingPage] Agent output detected, navigating to harvest view');
        navigateToHarvest();
      }
    };

    // Handle tmux session ready event - this is the key fix
    const handleTmuxReady = (data: any) => {
      if (!mountedRef.current) return;
      console.log('[GrowingPage] Received tmux ready event:', data);
      
      // Check both direct data and payload format
      const eventFarmId = data.farmId || data.payload?.farmId;
      
      if (eventFarmId === farmId) {
        console.log('[GrowingPage] CLI windows are prepared and ready, navigating to harvest view');
        // Small delay to ensure terminals are fully initialized
        setTimeout(() => {
          navigateToHarvest();
        }, 2000);
      }
    };

    // Enhanced terminal session detection
    const handleTerminalSession = (data: any) => {
      if (!mountedRef.current) return;
      console.log('Growing page received terminal session event:', data);
      
      if (data.action === 'created' && data.farmId === farmId) {
        console.log('Terminal session created for farm, navigating to harvest view');
        setTimeout(() => {
          navigateToHarvest();
        }, 1500);
      }
    };

    // Handle first agent output detection
    const handleFirstOutput = (data: any) => {
      if (!mountedRef.current) return;
      
      if (data.farmId === farmId || (data.sessionId && data.sessionId.includes(farmId))) {
        console.log('First agent output detected, navigating to harvest view');
        navigateToHarvest();
      }
    };

    const handleAgentOutput = (data: any) => {
      if (!mountedRef.current) return;
      console.log('Growing page received agent output:', data);
      
      // Navigate when we receive actual agent output
      if (data.farmId === farmId) {
        navigateToHarvest();
      }
    };

    const handleTaskProgress = (data: any) => {
      if (!mountedRef.current) return;
      console.log('Growing page received task progress:', data);
      
      // Navigate when we see task progress with actual output
      if (data.farmId === farmId && data.output) {
        navigateToHarvest();
      }
    };

    const handleHarvestReady = (data: any) => {
      if (!mountedRef.current) return;
      console.log('Growing page received harvest ready:', data);
      
      if (data.farmId === farmId) {
        // Special handling for Go Wild completion
        if (data.type === 'goWild') {
          console.log('Go Wild exploration completed, navigating to harvest');
        }
        navigateToHarvest();
      }
    };

    // Handle Go Wild specific events
    const handleGoWildStatus = (data: any) => {
      if (!mountedRef.current) return;
      console.log('Growing page received Go Wild status:', data);
      
      if (data.farmId === farmId && data.data?.status === 'completed') {
        console.log('Go Wild session completed, navigating to harvest');
        navigateToHarvest();
      }
    };

    // Subscribe to WebSocket events
    const unsubscribeFarmStatus = subscribe('farm:status', handleFarmStatus);
    const unsubscribeTmuxReady = subscribe('farm:tmux:ready', handleTmuxReady);
    const unsubscribeTerminalSession = subscribe('terminal:session', handleTerminalSession);
    const unsubscribeFirstOutput = subscribe('terminal:output', handleFirstOutput);
    const unsubscribeAgentOutput = subscribe('agent:output', handleAgentOutput);
    const unsubscribeTaskProgress = subscribe('task:progress', handleTaskProgress);
    const unsubscribeHarvestReady = subscribe('harvest:ready', handleHarvestReady);
    const unsubscribeGoWildStatus = subscribe('goWild:status-changed', handleGoWildStatus);

    // Cleanup
    return () => {
      unsubscribeFarmStatus();
      unsubscribeTmuxReady();
      unsubscribeTerminalSession();
      unsubscribeFirstOutput();
      unsubscribeAgentOutput();
      unsubscribeTaskProgress();
      unsubscribeHarvestReady();
      unsubscribeGoWildStatus();
    };
  }, [farmId, navigate, subscribe]);

  // Floating animation variants
  const floatAnimation = {
    initial: { y: 0 },
    animate: {
      y: [-10, 10, -10],
      transition: {
        duration: 4,
        ease: "easeInOut",
        repeat: Infinity,
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-8">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            variants={floatAnimation}
            initial="initial"
            animate="animate"
            className="absolute top-20 left-20 text-green-300 dark:text-green-700 opacity-50"
          >
            <Sprout size={48} />
          </motion.div>
        <motion.div
          variants={floatAnimation}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '1s' }}
          className="absolute top-40 right-32 text-yellow-300 dark:text-yellow-700 opacity-50"
        >
          <Sun size={56} />
        </motion.div>
        <motion.div
          variants={floatAnimation}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '2s' }}
          className="absolute bottom-32 left-40 text-blue-300 dark:text-blue-700 opacity-50"
        >
          <CloudRain size={52} />
        </motion.div>
        <motion.div
          variants={floatAnimation}
          initial="initial"
          animate="animate"
          style={{ animationDelay: '3s' }}
          className="absolute bottom-20 right-20 text-green-400 dark:text-green-700 opacity-50"
        >
          <TreePine size={64} />
        </motion.div>
      </div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 max-w-4xl w-full"
      >
        {/* Farm name */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-center mb-8 text-gray-800 dark:text-white"
        >
          {farm?.name || (farmId?.startsWith('quick-task-') ? 'Quick Task' : 'AI Farm')}
        </motion.h1>

        {/* Compactor Animation */}
        <div className="mb-12 rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-gray-800">
          <CompactorAnimation 
            className="h-96"
            targetColor="#10B981"
            newColor="#FFD700"
            forceAnimate={true}
          />
        </div>

        {/* Progressive growth message */}
        <motion.div
          key={currentMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {(() => {
            // Use default values if farm is not found (e.g., for Quick Tasks)
            const farmAge = farm ? Date.now() - new Date(farm.createdAt).getTime() : 0;
            const messages = getProgressiveMessages(farmAge);
            const progressPhase = farmAge < 10000 ? 'Preparing' :
                                 farmAge < 30000 ? 'Starting' :
                                 farmAge < 45000 ? 'Finalizing' : 'Ready';
            
            // Determine if this is a Quick Task
            const isQuickTask = farmId?.startsWith('quick-task-');
            const displayName = farm?.name || (isQuickTask ? 'Quick Task' : 'Your Farm');
            
            return (
              <>
                <p className="text-xl text-gray-700 dark:text-gray-300 font-medium mb-2">
                  {messages[currentMessage % messages.length]}
                </p>
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  {progressPhase} {displayName.toLowerCase()}{dots}
                </p>
                <div className="mt-6 flex flex-col items-center space-y-4">
                  {/* Manual redirect button - make it more prominent */}
                  <button
                    onClick={() => navigateToHarvest(true)}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-base font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 animate-pulse"
                  >
                    🌾 Skip to Harvest View →
                  </button>
                  
                  {/* Always show countdown timer */}
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 font-medium">
                      Auto-redirect in {secondsRemaining}s
                    </span>
                    {/* Show additional warning when time is running out */}
                    {secondsRemaining <= 10 && (
                      <span className="text-sm text-orange-600 dark:text-orange-400 animate-pulse">
                        Redirecting soon...
                      </span>
                    )}
                  </div>
                  
                  {/* Debug info for troubleshooting */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Farm ID: {farmId} | Status: {farm?.status || 'unknown'} | Type: {isQuickTask ? 'Quick Task' : 'Farm'}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </motion.div>

        {/* Progress indicators */}
        <div className="mt-12 flex justify-center space-x-8">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
              <Sprout className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Planting</span>
          </motion.div>

          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, delay: 0.5, repeat: Infinity }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
              <CloudRain className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Watering</span>
          </motion.div>

          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, delay: 1, repeat: Infinity }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-2">
              <Sun className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Growing</span>
          </motion.div>
        </div>

        {/* Removed duplicate skip button - already have "Go to Harvest Now" above */}
      </motion.div>
    </div>
  );
};