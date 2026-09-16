/**
 * ViralSeedsGenerator Component
 *
 * Generates Seeds from trending internet topics using an AI pipeline.
 * Searches the web for viral AI tasks, extracts intents, and creates
 * exactly 3 Seeds from the results.
 *
 * Feature B: Viral Seeds (Internet-sourced Seed generation)
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Globe,
  Search,
  Sparkles,
  AlertCircle,
  Check,
  RefreshCw,
  X,
  Clock,
  TrendingUp,
  Info,
  Sprout
} from 'lucide-react';
import { clsx } from 'clsx';
import { seedService } from '@/services/seedService';
import { Seed } from '@/types/seed';
import { toast } from 'react-hot-toast';

interface ViralSeedsGeneratorProps {
  onSeedsGenerated?: (seeds: Seed[]) => void;
  className?: string;
}

type PipelineStage = 'idle' | 'searching' | 'extracting' | 'generating' | 'validating' | 'complete' | 'error';

interface StageInfo {
  stage: PipelineStage;
  label: string;
  description: string;
  icon: React.ElementType;
}

const PIPELINE_STAGES: StageInfo[] = [
  { stage: 'searching', label: 'Searching', description: 'Scanning trending topics...', icon: Globe },
  { stage: 'extracting', label: 'Extracting', description: 'Identifying viral intents...', icon: Search },
  { stage: 'generating', label: 'Generating', description: 'Creating 3 unique Seeds...', icon: Sparkles },
  { stage: 'validating', label: 'Validating', description: 'Running safety checks...', icon: Check }
];

export const ViralSeedsGenerator: React.FC<ViralSeedsGeneratorProps> = ({
  onSeedsGenerated,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStage, setCurrentStage] = useState<PipelineStage>('idle');
  const [generatedSeeds, setGeneratedSeeds] = useState<Seed[]>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customQueries, setCustomQueries] = useState('');
  const [creativityLevel, setCreativityLevel] = useState(0.7);

  const startGeneration = useCallback(async () => {
    setCurrentStage('searching');
    setError(null);
    setGeneratedSeeds([]);

    // Simulate stage progression for UX (actual work happens in backend)
    const stageTimers = [
      setTimeout(() => setCurrentStage('extracting'), 2000),
      setTimeout(() => setCurrentStage('generating'), 5000),
      setTimeout(() => setCurrentStage('validating'), 8000)
    ];

    try {
      const queries = customQueries.trim()
        ? customQueries.split('\n').map(q => q.trim()).filter(Boolean)
        : undefined;

      const result = await seedService.generateViralSeeds({
        searchQueries: queries,
        creativityLevel
      });

      // Clear stage timers
      stageTimers.forEach(t => clearTimeout(t));

      if (result.success && result.seeds) {
        setGeneratedSeeds(result.seeds);
        setSnapshotId(result.snapshotId || null);
        setCurrentStage('complete');
        toast.success(`Generated ${result.seeds.length} viral Seeds!`);
        onSeedsGenerated?.(result.seeds);
      } else {
        throw new Error(result.error || 'Failed to generate Seeds');
      }
    } catch (err) {
      stageTimers.forEach(t => clearTimeout(t));
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      setCurrentStage('error');
      toast.error(message);
    }
  }, [customQueries, creativityLevel, onSeedsGenerated]);

  const regenerate = useCallback(async () => {
    if (!snapshotId) return;

    setCurrentStage('generating');
    setError(null);

    try {
      const result = await seedService.regenerateViralSeeds(snapshotId);

      if (result.success && result.seeds) {
        setGeneratedSeeds(result.seeds);
        setCurrentStage('complete');
        toast.success('Regenerated Seeds from snapshot!');
        onSeedsGenerated?.(result.seeds);
      } else {
        throw new Error(result.error || 'Failed to regenerate Seeds');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      setCurrentStage('error');
      toast.error(message);
    }
  }, [snapshotId, onSeedsGenerated]);

  const reset = useCallback(() => {
    setCurrentStage('idle');
    setGeneratedSeeds([]);
    setSnapshotId(null);
    setError(null);
  }, []);

  const getStageIndex = (stage: PipelineStage) => {
    return PIPELINE_STAGES.findIndex(s => s.stage === stage);
  };

  const isProcessing = ['searching', 'extracting', 'generating', 'validating'].includes(currentStage);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
          'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
          'hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl',
          className
        )}
      >
        <TrendingUp className="h-4 w-4" />
        <span className="font-medium">Viral Seeds</span>
        <Zap className="h-4 w-4" />
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isProcessing && setIsOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/10 bg-gradient-to-r from-purple-500/20 to-pink-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Viral Seeds Generator</h2>
                      <p className="text-sm text-gray-400">Create Seeds from trending AI topics</p>
                    </div>
                  </div>
                  <button
                    onClick={() => !isProcessing && setIsOpen(false)}
                    disabled={isProcessing}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Info Banner */}
                {currentStage === 'idle' && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-300 space-y-1">
                      <p>This feature searches the internet for trending AI tasks and creates 3 unique Seeds based on what's viral.</p>
                      <p className="text-blue-400/70">Seeds are saved for later use and can be applied to any farm.</p>
                    </div>
                  </div>
                )}

                {/* Configuration - only show when idle */}
                {currentStage === 'idle' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Custom Search Queries (optional)
                      </label>
                      <textarea
                        value={customQueries}
                        onChange={(e) => setCustomQueries(e.target.value)}
                        placeholder="Enter custom topics, one per line...&#10;e.g., AI coding assistants&#10;code review automation"
                        className="w-full h-24 px-4 py-3 rounded-xl bg-white/5 border border-white/10
                                 text-white placeholder-gray-500 text-sm
                                 focus:border-purple-500/50 focus:outline-none resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Creativity Level: {Math.round(creativityLevel * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0.3"
                        max="1"
                        step="0.1"
                        value={creativityLevel}
                        onChange={(e) => setCreativityLevel(parseFloat(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Conservative</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pipeline Progress */}
                {isProcessing && (
                  <div className="space-y-4">
                    {PIPELINE_STAGES.map((stageInfo, idx) => {
                      const currentIdx = getStageIndex(currentStage);
                      const isComplete = idx < currentIdx;
                      const isCurrent = stageInfo.stage === currentStage;

                      return (
                        <motion.div
                          key={stageInfo.stage}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={clsx(
                            'flex items-center gap-4 p-3 rounded-xl transition-all',
                            isCurrent && 'bg-purple-500/20 border border-purple-500/30',
                            isComplete && 'opacity-60'
                          )}
                        >
                          <div className={clsx(
                            'w-10 h-10 rounded-full flex items-center justify-center',
                            isCurrent && 'bg-purple-500 animate-pulse',
                            isComplete && 'bg-green-500',
                            !isCurrent && !isComplete && 'bg-white/10'
                          )}>
                            {isComplete ? (
                              <Check className="h-5 w-5 text-white" />
                            ) : (
                              <stageInfo.icon className={clsx(
                                'h-5 w-5',
                                isCurrent ? 'text-white' : 'text-gray-500'
                              )} />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={clsx(
                              'font-medium',
                              isCurrent ? 'text-purple-300' : isComplete ? 'text-gray-400' : 'text-gray-500'
                            )}>
                              {stageInfo.label}
                            </p>
                            {isCurrent && (
                              <p className="text-sm text-purple-400/70">{stageInfo.description}</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Error State */}
                {currentStage === 'error' && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-red-400">Generation Failed</p>
                        <p className="text-sm text-red-300/70 mt-1">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success - Generated Seeds */}
                {currentStage === 'complete' && generatedSeeds.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-400">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">Generated {generatedSeeds.length} Seeds!</span>
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {generatedSeeds.map((seed, idx) => (
                        <motion.div
                          key={seed.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="p-4 rounded-xl bg-white/5 border border-white/10"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-emerald-500/20 rounded-lg">
                              <Sprout className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-white truncate">{seed.name}</h4>
                              <p className="text-sm text-gray-400 line-clamp-2 mt-1">
                                {seed.description}
                              </p>
                              {seed.tags && seed.tags.length > 0 && (
                                <div className="flex gap-1 mt-2 flex-wrap">
                                  {seed.tags.slice(0, 3).map(tag => (
                                    <span
                                      key={tag}
                                      className="px-2 py-0.5 text-xs rounded bg-white/5 text-gray-400"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {snapshotId && (
                      <p className="text-xs text-gray-500 text-center">
                        Snapshot saved - you can regenerate these Seeds later
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/10 bg-white/5">
                <div className="flex items-center justify-between">
                  {currentStage === 'idle' && (
                    <>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={startGeneration}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl
                                 bg-gradient-to-r from-purple-500 to-pink-500
                                 text-white font-medium shadow-lg
                                 hover:from-purple-600 hover:to-pink-600 transition-all"
                      >
                        <Zap className="h-4 w-4" />
                        Generate Viral Seeds
                      </button>
                    </>
                  )}

                  {isProcessing && (
                    <div className="w-full text-center text-gray-400 text-sm">
                      <Clock className="h-4 w-4 inline-block mr-2 animate-spin" />
                      This may take 30-60 seconds...
                    </div>
                  )}

                  {(currentStage === 'complete' || currentStage === 'error') && (
                    <>
                      <button
                        onClick={reset}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                      >
                        Start Over
                      </button>
                      <div className="flex gap-2">
                        {snapshotId && currentStage === 'complete' && (
                          <button
                            onClick={regenerate}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg
                                     bg-white/10 text-white hover:bg-white/20 transition-colors"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                          </button>
                        )}
                        <button
                          onClick={() => setIsOpen(false)}
                          className="px-6 py-2 rounded-lg bg-emerald-500 text-white
                                   hover:bg-emerald-600 transition-colors font-medium"
                        >
                          Done
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ViralSeedsGenerator;
