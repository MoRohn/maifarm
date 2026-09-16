import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Pause,
  Play,
  StopCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { useWebSocket } from '@/hooks/useWebSocket';

interface IncubationSession {
  id: string;
  farmId: string;
  harvestId: string;
  status: 'pending' | 'incubating' | 'paused' | 'stopped' | 'completed' | 'failed';
  currentStage: number;
  totalStages: number;
  controlState: 'running' | 'paused' | 'stopped';
  progress: number;
  userContext?: string;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
}

interface IncubationControlsProps {
  farmId: string;
  className?: string;
  onComplete?: (sessionId: string) => void;
}

const STAGE_NAMES = [
  'Contextual Grounding',
  'Gap & Potential Scan',
  'Evolutionary Leap',
  'Validation Simulation',
  'Deliverable Format'
];

const STAGE_ICONS = [
  '🧭', // Contextual Grounding
  '🔍', // Gap & Potential Scan
  '🚀', // Evolutionary Leap
  '✅', // Validation Simulation
  '📦'  // Deliverable Format
];

export const IncubationControls: React.FC<IncubationControlsProps> = ({
  farmId,
  className,
  onComplete
}) => {
  const [session, setSession] = useState<IncubationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const socket = useWebSocket();

  useEffect(() => {
    loadSession();
  }, [farmId]);

  useEffect(() => {
    if (!socket) return;

    // Subscribe to incubation events
    const handleStageProgress = (data: any) => {
      if (data.sessionId === session?.id) {
        setSession(prev => prev ? {
          ...prev,
          progress: data.progress,
          currentStage: data.stage
        } : null);
      }
    };

    const handleCompleted = (data: any) => {
      if (data.sessionId === session?.id) {
        setSession(prev => prev ? {
          ...prev,
          status: 'completed',
          completedAt: new Date().toISOString()
        } : null);
        toast.success('🎉 Incubation completed successfully!');
        onComplete?.(data.sessionId);
      }
    };

    const handleFailed = (data: any) => {
      if (data.sessionId === session?.id) {
        setSession(prev => prev ? {
          ...prev,
          status: 'failed',
          failedAt: new Date().toISOString(),
          error: data.error
        } : null);
        toast.error(`Incubation failed: ${data.error || 'Unknown error'}`);
      }
    };

    const handlePaused = (data: any) => {
      if (data.sessionId === session?.id) {
        setSession(prev => prev ? {
          ...prev,
          controlState: 'paused'
        } : null);
      }
    };

    const handleResumed = (data: any) => {
      if (data.sessionId === session?.id) {
        setSession(prev => prev ? {
          ...prev,
          controlState: 'running'
        } : null);
      }
    };

    socket.on('incubation:stage-progress', handleStageProgress);
    socket.on('incubation:completed', handleCompleted);
    socket.on('incubation:failed', handleFailed);
    socket.on('incubation:paused', handlePaused);
    socket.on('incubation:resumed', handleResumed);

    return () => {
      socket.off('incubation:stage-progress', handleStageProgress);
      socket.off('incubation:completed', handleCompleted);
      socket.off('incubation:failed', handleFailed);
      socket.off('incubation:paused', handlePaused);
      socket.off('incubation:resumed', handleResumed);
    };
  }, [socket, session?.id, onComplete]);

  const loadSession = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/farms/${farmId}/incubation`);
      if (response.data?.data) {
        setSession(response.data.data);
      }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error('Failed to load incubation session:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!session) return;
    setActionLoading('pause');
    try {
      await api.post(`/api/incubations/${session.id}/pause`);
      toast.success('Incubation paused');
    } catch (error) {
      toast.error('Failed to pause incubation');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!session) return;
    setActionLoading('resume');
    try {
      await api.post(`/api/incubations/${session.id}/resume`);
      toast.success('Incubation resumed');
    } catch (error) {
      toast.error('Failed to resume incubation');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!session) return;

    const confirmed = window.confirm(
      'Are you sure you want to stop this incubation? This action cannot be undone.'
    );

    if (!confirmed) return;

    setActionLoading('stop');
    try {
      await api.post(`/api/incubations/${session.id}/stop`);
      toast.success('Incubation stopped');
      await loadSession();
    } catch (error) {
      toast.error('Failed to stop incubation');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'paused':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      case 'incubating':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
    }
  };

  if (loading) {
    return (
      <div className={clsx('animate-pulse bg-gray-100 dark:bg-gray-800 rounded-lg h-48', className)} />
    );
  }

  if (!session) {
    return null; // No active incubation session
  }

  const progressPercentage = (session.currentStage / session.totalStages) * 100;
  const stageProgress = session.progress || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20',
        'border-2 border-yellow-200 dark:border-yellow-800',
        'rounded-xl p-4 sm:p-6 shadow-lg',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="p-1.5 sm:p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              Incubation in Progress
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
              Evolving farm outputs through AI enhancement
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className={clsx(
          'self-start sm:self-auto px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0',
          getStatusColor(session.status)
        )}>
          {session.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          {session.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          {session.status === 'incubating' && <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />}
          {session.status === 'paused' && <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          <span className="capitalize">{session.status}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 mb-2">
          <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
            Stage {session.currentStage}/{session.totalStages}: {STAGE_NAMES[session.currentStage - 1]}
          </span>
          <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
            {stageProgress.toFixed(0)}%
          </span>
        </div>

        <div className="relative w-full h-2.5 sm:h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stageProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full"
          >
            <div className="absolute inset-0 bg-white/20 animate-shimmer" />
          </motion.div>
        </div>
      </div>

      {/* Stage Indicators - MOBILE FIX: Responsive grid that wraps on small screens */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {STAGE_NAMES.map((name, index) => {
          const stageNumber = index + 1;
          const isComplete = stageNumber < session.currentStage;
          const isCurrent = stageNumber === session.currentStage;
          const isPending = stageNumber > session.currentStage;

          return (
            <div
              key={name}
              className={clsx(
                'text-center p-1.5 sm:p-2 rounded-lg transition-all',
                isComplete && 'bg-green-100 dark:bg-green-900/30',
                isCurrent && 'bg-yellow-100 dark:bg-yellow-900/30 ring-2 ring-yellow-500',
                isPending && 'bg-gray-100 dark:bg-gray-800'
              )}
              aria-label={`Stage ${stageNumber}: ${name} - ${isComplete ? 'Complete' : isCurrent ? 'In Progress' : 'Pending'}`}
            >
              <div className="text-lg sm:text-2xl mb-0.5 sm:mb-1">{STAGE_ICONS[index]}</div>
              <div className={clsx(
                'text-[10px] sm:text-xs font-medium',
                isComplete && 'text-green-700 dark:text-green-300',
                isCurrent && 'text-yellow-700 dark:text-yellow-300',
                isPending && 'text-gray-500 dark:text-gray-400'
              )}>
                {isComplete && '✓'} Stage {stageNumber}
              </div>
            </div>
          );
        })}
      </div>

      {/* User Context */}
      {session.userContext && (
        <div className="mb-4 sm:mb-6 p-2.5 sm:p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
            <span className="font-medium">Context: </span>
            {session.userContext}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span>Duration: {formatDuration(session.startedAt)}</span>
        </div>
        <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span>Overall: {progressPercentage.toFixed(0)}%</span>
        </div>
      </div>

      {/* Control Buttons - MOBILE FIX: Stack vertically on small screens */}
      {session.status === 'incubating' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:space-x-3 sm:gap-0">
          {session.controlState === 'running' ? (
            <button
              onClick={handlePause}
              disabled={actionLoading === 'pause'}
              aria-label="Pause incubation"
              className="w-full sm:flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {actionLoading === 'pause' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" aria-hidden="true" />
              ) : (
                <>
                  <Pause className="w-4 h-4" aria-hidden="true" />
                  <span>Pause</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleResume}
              disabled={actionLoading === 'resume'}
              aria-label="Resume incubation"
              className="w-full sm:flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {actionLoading === 'resume' ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" aria-hidden="true" />
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Resume</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleStop}
            disabled={actionLoading === 'stop'}
            aria-label="Stop incubation (cannot be undone)"
            className="w-full sm:flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {actionLoading === 'stop' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" aria-hidden="true" />
            ) : (
              <>
                <StopCircle className="w-4 h-4" aria-hidden="true" />
                <span>Stop</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Message */}
      {session.status === 'failed' && session.error && (
        <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-300">
                Incubation Failed
              </p>
              <p className="text-xs sm:text-sm text-red-700 dark:text-red-400 mt-1 break-words">
                {session.error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Completion Message */}
      {session.status === 'completed' && (
        <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <p className="text-xs sm:text-sm font-medium text-green-800 dark:text-green-300">
              Incubation completed! New generation is ready.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};
