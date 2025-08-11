import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Trophy, 
  CheckCircle, 
  TrendingUp, 
  Package,
  Star,
  Zap,
  X
} from 'lucide-react';
import { Harvest } from '../../types/harvest';

interface HarvestCompletionAnimationProps {
  harvest: Harvest;
  onComplete: () => void;
  inline?: boolean; // New prop for inline vs popup mode
}

export const HarvestCompletionAnimation: React.FC<HarvestCompletionAnimationProps> = memo(({
  harvest,
  onComplete,
  inline = true // Default to inline mode
}) => {
  const [showStats, setShowStats] = useState(false);
  const [currentStat, setCurrentStat] = useState(0);
  const [showConfetti, setShowConfetti] = useState(true);

  // Apple-like easing curve - memoized constant
  const APPLE_EASING = useMemo(() => [0.25, 0.1, 0.25, 1] as const, []);

  // Memoize stats array to prevent recreation on every render
  const stats = useMemo(() => [
    {
      icon: CheckCircle,
      label: 'Tasks Completed',
      value: harvest.summary.completedTasks,
      color: 'text-apple-green-DEFAULT dark:text-apple-green-light'
    },
    {
      icon: TrendingUp,
      label: 'Efficiency',
      value: `${harvest.summary.efficiency}%`,
      color: 'text-apple-blue-DEFAULT dark:text-apple-blue-light'
    },
    {
      icon: Package,
      label: 'Yield Created',
      value: harvest.yield.length,
      color: 'text-apple-purple-DEFAULT dark:text-apple-purple-light'
    },
    {
      icon: Star,
      label: 'Quality Score',
      value: `${harvest.quality.overallScore}%`,
      color: 'text-apple-yellow-DEFAULT dark:text-apple-yellow-light'
    }
  ], [harvest.summary.completedTasks, harvest.summary.efficiency, harvest.yield.length, harvest.quality.overallScore]);

  // Memoize confetti particles array
  const confettiParticles = useMemo(() => Array.from({ length: 12 }, (_, i) => (
    <motion.div
      key={i}
      className={`absolute w-2 h-2 ${
        i % 4 === 0 ? 'bg-apple-blue-light' :
        i % 4 === 1 ? 'bg-apple-green-light' :
        i % 4 === 2 ? 'bg-apple-purple-light' :
        'bg-apple-yellow-DEFAULT'
      }`}
      style={{
        left: '50%',
        top: '50%',
        borderRadius: i % 2 === 0 ? '50%' : '2px',
      }}
      initial={{ 
        scale: 0,
        x: 0,
        y: 0,
        rotate: 0
      }}
      animate={showConfetti ? { 
        scale: [0, 1, 0],
        x: Math.random() * 400 - 200,
        y: Math.random() * 300 - 150,
        rotate: Math.random() * 720,
      } : {}}
      transition={{ 
        duration: 2.5,
        delay: i * 0.1,
        ease: APPLE_EASING
      }}
    />
  )), [showConfetti, APPLE_EASING]);

  // Memoize callback to prevent recreating on every render
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // Show stats after initial animation
    const showStatsTimeout = setTimeout(() => setShowStats(true), 800);

    // Cycle through stats
    const statInterval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % 4);
    }, 1500);

    // Hide confetti after initial celebration
    const confettiTimeout = setTimeout(() => setShowConfetti(false), 3000);

    // Auto-complete after shorter duration for inline mode
    const completeTimeout = setTimeout(() => {
      clearInterval(statInterval);
      handleComplete();
    }, inline ? 6000 : 8000);

    return () => {
      clearTimeout(showStatsTimeout);
      clearTimeout(confettiTimeout);
      clearTimeout(completeTimeout);
      clearInterval(statInterval);
    };
  }, [handleComplete, inline]);

  if (inline) {
    // Inline success panel - slides in from top
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-apple-lg shadow-apple-lg m-4 overflow-hidden"
        >
          {/* Confetti particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confettiParticles}
          </div>

          {/* Success banner */}
          <div className="relative p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                {/* Trophy with subtle glow */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.2 }}
                  className="relative"
                >
                  <div className="p-3 bg-gradient-to-br from-apple-yellow-light to-apple-yellow-DEFAULT rounded-apple-lg shadow-glow-sm">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <motion.div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-apple-green-light rounded-full"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>

                <div>
                  <motion.h3
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, ease: APPLE_EASING }}
                    className="text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Harvest Complete! 🎉
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, ease: APPLE_EASING }}
                    className="text-sm text-gray-600 dark:text-gray-400 mt-1"
                  >
                    {harvest.farmName} has successfully finished its journey
                  </motion.p>
                </div>
              </div>

              <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleComplete}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-apple"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Quick stats preview */}
            {showStats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, ease: APPLE_EASING }}
                className="mt-4 flex items-center space-x-6"
              >
                {stats.slice(0, 3).map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 + index * 0.1, ease: APPLE_EASING }}
                    className="flex items-center space-x-2"
                  >
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {stat.label}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Subtle background animation */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute opacity-10"
                  initial={{
                    x: Math.random() * 100 + '%',
                    y: Math.random() * 100 + '%',
                    scale: 0
                  }}
                  animate={{
                    scale: [0, 1, 0],
                    rotate: [0, 360]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                    ease: "easeInOut"
                  }}
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`
                  }}
                >
                  <Sparkles className="w-3 h-3 text-apple-blue-light" />
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Legacy popup mode for backward compatibility
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="relative max-w-2xl mx-auto p-8"
        >
          {/* Main celebration card */}
          <motion.div
            className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-apple-xl p-12 shadow-apple-lg relative overflow-hidden border border-gray-200 dark:border-gray-800"
            animate={{
              boxShadow: [
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* Confetti particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {confettiParticles}
            </div>

            {/* Animated background sparkles */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  initial={{
                    x: Math.random() * 100 + '%',
                    y: Math.random() * 100 + '%',
                    scale: 0
                  }}
                  animate={{
                    scale: [0, 1, 0],
                    rotate: [0, 180, 360]
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                    ease: "easeInOut"
                  }}
                >
                  <Sparkles className="w-4 h-4 text-apple-yellow-light opacity-60" />
                </motion.div>
              ))}
            </div>

            {/* Trophy icon */}
            <motion.div
              className="flex justify-center mb-6"
              animate={{
                y: [0, -10, 0],
                rotate: [-2, 2, -2]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="relative">
                <Trophy className="w-24 h-24 text-apple-yellow-DEFAULT" />
                <motion.div
                  className="absolute -top-2 -right-2"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Zap className="w-8 h-8 text-apple-yellow-light" />
                </motion.div>
              </div>
            </motion.div>

            {/* Success message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-center mb-8"
            >
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                Harvest Complete! 🎉
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                {harvest.farmName} has finished its journey
              </p>
            </motion.div>

            {/* Animated stats */}
            <AnimatePresence mode="wait">
              {showStats && (
                <motion.div
                  key={currentStat}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-apple-lg p-6 border border-gray-200/50 dark:border-gray-700/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {React.createElement(stats[currentStat].icon, {
                        className: `w-8 h-8 ${stats[currentStat].color}`
                      })}
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {stats[currentStat].label}
                        </p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                          {stats[currentStat].value}
                        </p>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-apple-blue-light"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress indicator */}
            <div className="mt-8 flex justify-center space-x-2">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i === currentStat 
                      ? 'bg-apple-yellow-DEFAULT' 
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  animate={{ scale: i === currentStat ? 1.5 : 1 }}
                  transition={{ duration: 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

HarvestCompletionAnimation.displayName = 'HarvestCompletionAnimation';