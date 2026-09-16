import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Sparkles,
  Database,
  FolderTree,
  Terminal,
  Users,
  Radio,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '@/hooks/useWebSocket';

type LaunchPhase = 'preflight' | 'workspace' | 'harvest' | 'tmux' | 'agents' | 'streaming' | 'finalize';
type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface LaunchProgressEvent {
  farmId: string;
  sessionName: string;
  phase: LaunchPhase;
  status: 'in_progress' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  error?: string;
}

interface FarmLaunchProgressProps {
  farmId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  compact?: boolean;
}

const PHASE_CONFIG = {
  preflight: {
    label: 'Preflight Checks',
    icon: Sparkles,
    color: 'blue',
    description: 'Validating configuration and requirements'
  },
  workspace: {
    label: 'Workspace Setup',
    icon: FolderTree,
    color: 'purple',
    description: 'Creating isolated workspace'
  },
  harvest: {
    label: 'Harvest Init',
    icon: Database,
    color: 'green',
    description: 'Initializing harvest tracking'
  },
  tmux: {
    label: 'Session Creation',
    icon: Terminal,
    color: 'cyan',
    description: 'Creating tmux session'
  },
  agents: {
    label: 'Agent Launch',
    icon: Users,
    color: 'orange',
    description: 'Starting AI agents'
  },
  streaming: {
    label: 'Terminal Streaming',
    icon: Radio,
    color: 'pink',
    description: 'Connecting terminal streams'
  },
  finalize: {
    label: 'Finalization',
    icon: Zap,
    color: 'yellow',
    description: 'Completing setup'
  }
};

export const FarmLaunchProgress: React.FC<FarmLaunchProgressProps> = ({
  farmId,
  onComplete,
  onError,
  compact = false
}) => {
  const { subscribe } = useWebSocket();
  const [phases, setPhases] = useState<Record<LaunchPhase, PhaseStatus>>({
    preflight: 'pending',
    workspace: 'pending',
    harvest: 'pending',
    tmux: 'pending',
    agents: 'pending',
    streaming: 'pending',
    finalize: 'pending'
  });
  const [currentMessage, setCurrentMessage] = useState<string>('Preparing launch...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribe('farm:launch-progress', (event: LaunchProgressEvent) => {
      if (event.farmId !== farmId) return;

      setCurrentMessage(event.message);

      setPhases(prev => ({
        ...prev,
        [event.phase]: event.status === 'in_progress' ? 'in_progress' :
                       event.status === 'completed' ? 'completed' :
                       'failed'
      }));

      if (event.status === 'failed') {
        const errorMsg = event.error || event.message;
        setError(errorMsg);
        onError?.(errorMsg);
      }

      if (event.phase === 'finalize' && event.status === 'completed') {
        onComplete?.();
      }
    });

    return unsubscribe;
  }, [farmId, subscribe, onComplete, onError]);

  const getPhaseIcon = (phase: LaunchPhase, status: PhaseStatus) => {
    const config = PHASE_CONFIG[phase];
    const Icon = config.icon;

    if (status === 'completed') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else if (status === 'failed') {
      return <XCircle className="w-5 h-5 text-red-500" />;
    } else if (status === 'in_progress') {
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    }
    return <Circle className="w-5 h-5 text-gray-400" />;
  };

  const getPhaseColor = (phase: LaunchPhase, status: PhaseStatus) => {
    if (status === 'completed') return 'text-green-600 dark:text-green-400';
    if (status === 'failed') return 'text-red-600 dark:text-red-400';
    if (status === 'in_progress') return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-400 dark:text-gray-600';
  };

  if (compact) {
    // Compact horizontal progress bar
    return (
      <div className="w-full">
        <div className="flex items-center justify-between gap-2 mb-2">
          {Object.entries(PHASE_CONFIG).map(([phase, config], index) => {
            const status = phases[phase as LaunchPhase];
            const isActive = status === 'in_progress';
            const isComplete = status === 'completed';
            const isFailed = status === 'failed';

            return (
              <React.Fragment key={phase}>
                <motion.div
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1 rounded-lg transition-all',
                    isActive && 'bg-blue-500/10 ring-1 ring-blue-500/30',
                    isComplete && 'bg-green-500/10',
                    isFailed && 'bg-red-500/10'
                  )}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  {getPhaseIcon(phase as LaunchPhase, status)}
                  <span className={clsx('text-xs font-medium', getPhaseColor(phase as LaunchPhase, status))}>
                    {config.label}
                  </span>
                </motion.div>
                {index < Object.keys(PHASE_CONFIG).length - 1 && (
                  <div className={clsx(
                    'h-0.5 flex-1 rounded-full transition-colors',
                    isComplete ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">{currentMessage}</p>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Error: {error}</p>
        )}
      </div>
    );
  }

  // Full detailed view
  return (
    <div className="space-y-3">
      <AnimatePresence>
        {Object.entries(PHASE_CONFIG).map(([phase, config]) => {
          const status = phases[phase as LaunchPhase];
          const Icon = config.icon;

          return (
            <motion.div
              key={phase}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={clsx(
                'flex items-start gap-3 p-3 rounded-lg border transition-all',
                status === 'in_progress' && 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
                status === 'completed' && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
                status === 'failed' && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
                status === 'pending' && 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getPhaseIcon(phase as LaunchPhase, status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className={clsx('w-4 h-4', getPhaseColor(phase as LaunchPhase, status))} />
                  <h4 className={clsx('text-sm font-medium', getPhaseColor(phase as LaunchPhase, status))}>
                    {config.label}
                  </h4>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {status === 'in_progress' ? currentMessage : config.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">Launch Failed</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">{error}</p>
        </motion.div>
      )}
    </div>
  );
};

export default FarmLaunchProgress;
