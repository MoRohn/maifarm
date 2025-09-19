import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { 
  Warehouse, 
  Sparkles, 
  Package, 
  Star,
  Gift,
  ChevronDown,
  Eye,
  Zap
} from 'lucide-react';

interface BarnRevealAnimationProps {
  onComplete: () => void;
  newHarvestCount: number;
}

export const BarnRevealAnimation: React.FC<BarnRevealAnimationProps> = ({
  onComplete,
  newHarvestCount
}) => {
  const [phase, setPhase] = useState<'doors' | 'reveal' | 'complete'>('doors');
  const controls = useAnimation();
  const leftDoorControls = useAnimation();
  const rightDoorControls = useAnimation();

  useEffect(() => {
    const sequence = async () => {
      // Phase 1: Barn doors opening (2s)
      await Promise.all([
        leftDoorControls.start({
          rotateY: -90,
          x: -100,
          transition: { duration: 1.5, ease: "easeInOut" }
        }),
        rightDoorControls.start({
          rotateY: 90,
          x: 100,
          transition: { duration: 1.5, ease: "easeInOut" }
        })
      ]);
      
      // Phase 2: Reveal content (1s)
      setPhase('reveal');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Phase 3: Complete
      setPhase('complete');
      await new Promise(resolve => setTimeout(resolve, 500));
      onComplete();
    };
    
    sequence();
  }, [leftDoorControls, rightDoorControls, onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'complete' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-hidden bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-amber-900/20"
        >
          {/* Ambient particles */}
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 30 }, (_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-yellow-400/30 rounded-full"
                initial={{
                  x: Math.random() * window.innerWidth,
                  y: window.innerHeight + 50,
                }}
                animate={{
                  y: -50,
                  x: Math.random() * window.innerWidth,
                }}
                transition={{
                  duration: 10 + Math.random() * 10,
                  repeat: Infinity,
                  delay: Math.random() * 5,
                  ease: "linear"
                }}
              />
            ))}
          </div>

          {/* Main content */}
          <div className="relative h-full flex items-center justify-center">
            <div className="relative" style={{ perspective: '1000px' }}>
              
              {/* Barn structure */}
              <div className="relative w-[600px] h-[400px]">
                
                {/* Barn doors */}
                {phase === 'doors' && (
                  <>
                    {/* Left door */}
                    <motion.div
                      animate={leftDoorControls}
                      className="absolute left-0 top-0 w-1/2 h-full bg-gradient-to-br from-red-700 to-red-900 rounded-l-xl shadow-2xl"
                      style={{ 
                        transformOrigin: 'left center',
                        transformStyle: 'preserve-3d'
                      }}
                    >
                      <div className="h-full flex items-center justify-center">
                        <div className="text-white/20">
                          <div className="w-32 h-40 border-4 border-white/20 rounded" />
                          <div className="mt-4 w-8 h-8 rounded-full bg-white/20 mx-auto" />
                        </div>
                      </div>
                    </motion.div>

                    {/* Right door */}
                    <motion.div
                      animate={rightDoorControls}
                      className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-bl from-red-700 to-red-900 rounded-r-xl shadow-2xl"
                      style={{ 
                        transformOrigin: 'right center',
                        transformStyle: 'preserve-3d'
                      }}
                    >
                      <div className="h-full flex items-center justify-center">
                        <div className="text-white/20">
                          <div className="w-32 h-40 border-4 border-white/20 rounded" />
                          <div className="mt-4 w-8 h-8 rounded-full bg-white/20 mx-auto" />
                        </div>
                      </div>
                    </motion.div>

                    {/* Barn icon on doors */}
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      animate={{
                        scale: [1, 1.1, 1],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <Warehouse className="w-24 h-24 text-white/50" />
                    </motion.div>
                  </>
                )}

                {/* Reveal content */}
                {phase === 'reveal' && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ 
                      type: "spring", 
                      damping: 15, 
                      stiffness: 100 
                    }}
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    {/* Glowing orb */}
                    <motion.div
                      className="relative mb-8"
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full shadow-2xl flex items-center justify-center">
                        <Gift className="w-16 h-16 text-white" />
                      </div>
                      
                      {/* Glow effect */}
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        animate={{
                          scale: [1, 1.5, 1],
                          opacity: [0.5, 0, 0.5]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        style={{
                          background: 'radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)',
                        }}
                      />
                    </motion.div>

                    {/* Text reveal */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-center"
                    >
                      <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        Fresh from the Farm!
                      </h2>
                      <p className="text-xl text-gray-600 dark:text-gray-300">
                        {newHarvestCount} new {newHarvestCount === 1 ? 'harvest' : 'harvests'} ready to explore
                      </p>
                    </motion.div>

                    {/* Bouncing arrow */}
                    <motion.div
                      className="mt-8"
                      animate={{
                        y: [0, 10, 0]
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <ChevronDown className="w-8 h-8 text-gray-400" />
                    </motion.div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Corner decorations */}
          <div className="absolute top-4 left-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <Star className="w-8 h-8 text-yellow-400/30" />
            </motion.div>
          </div>
          <div className="absolute top-4 right-4">
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-8 h-8 text-blue-400/30" />
            </motion.div>
          </div>
          <div className="absolute bottom-4 left-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            >
              <Zap className="w-8 h-8 text-purple-400/30" />
            </motion.div>
          </div>
          <div className="absolute bottom-4 right-4">
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            >
              <Package className="w-8 h-8 text-green-400/30" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};