import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// import confetti from 'canvas-confetti'; // Commented out - optional dependency
import { 
  Sparkles, 
  Trophy, 
  CheckCircle, 
  TrendingUp, 
  Package,
  Star,
  Zap
} from 'lucide-react';
import { Harvest } from '../../types/harvest';

interface HarvestCompletionAnimationProps {
  harvest: Harvest;
  onComplete: () => void;
}

export const HarvestCompletionAnimation: React.FC<HarvestCompletionAnimationProps> = ({
  harvest,
  onComplete
}) => {
  const [showStats, setShowStats] = useState(false);
  const [currentStat, setCurrentStat] = useState(0);

  useEffect(() => {
    // Trigger confetti animation (disabled - optional dependency)
    // const duration = 3 * 1000;
    // const animationEnd = Date.now() + duration;
    // const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    // function randomInRange(min: number, max: number) {
    //   return Math.random() * (max - min) + min;
    // }

    // const interval: any = setInterval(function() {
    //   const timeLeft = animationEnd - Date.now();

    //   if (timeLeft <= 0) {
    //     return clearInterval(interval);
    //   }

    //   const particleCount = 50 * (timeLeft / duration);
      
    //   // Golden confetti from the left
    //   confetti({
    //     ...defaults,
    //     particleCount,
    //     origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    //     colors: ['#FFD700', '#FFA500', '#FF8C00', '#FFB347', '#FFDB58']
    //   });
      
    //   // Silver confetti from the right
    //   confetti({
    //     ...defaults,
    //     particleCount,
    //     origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    //     colors: ['#C0C0C0', '#D3D3D3', '#E5E5E5', '#F0F0F0', '#FFFFFF']
    //   });
    // }, 250);

    // Show stats after initial animation
    setTimeout(() => setShowStats(true), 1000);

    // Cycle through stats
    const statInterval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % 4);
    }, 2000);

    // Complete animation after 8 seconds
    setTimeout(() => {
      // clearInterval(interval); // Commented out - confetti disabled
      clearInterval(statInterval);
      onComplete();
    }, 8000);

    return () => {
      // clearInterval(interval); // Commented out - confetti disabled
      clearInterval(statInterval);
    };
  }, [onComplete]);

  const stats = [
    {
      icon: CheckCircle,
      label: 'Tasks Completed',
      value: harvest.summary.completedTasks,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      icon: TrendingUp,
      label: 'Efficiency',
      value: `${harvest.summary.efficiency}%`,
      color: 'text-blue-600 dark:text-blue-400'
    },
    {
      icon: Package,
      label: 'Artifacts Created',
      value: harvest.artifacts.length,
      color: 'text-purple-600 dark:text-purple-400'
    },
    {
      icon: Star,
      label: 'Quality Score',
      value: `${harvest.quality.overallScore}%`,
      color: 'text-amber-600 dark:text-amber-400'
    }
  ];

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
            className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 rounded-apple-xl p-12 shadow-2xl relative overflow-hidden"
            animate={{
              boxShadow: [
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
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
                  <Sparkles className="w-4 h-4 text-amber-400 opacity-60" />
                </motion.div>
              ))}
            </div>

            {/* Trophy icon */}
            <motion.div
              className="flex justify-center mb-6"
              animate={{
                y: [0, -10, 0],
                rotate: [-5, 5, -5]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="relative">
                <Trophy className="w-24 h-24 text-amber-500" />
                <motion.div
                  className="absolute -top-2 -right-2"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Zap className="w-8 h-8 text-yellow-400" />
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
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-apple-lg p-6"
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
                      className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-transparent"
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
                      ? 'bg-amber-500' 
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
};