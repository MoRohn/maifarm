import { useEffect, useState } from 'react';
import { motion, useAnimation, AnimationControls } from 'framer-motion';

interface HarvestAnimationState {
  isAnimating: boolean;
  animationType: 'idle' | 'harvesting' | 'completed' | 'celebrating';
  progress: number;
}

export const useHarvestAnimations = () => {
  const [animationState, setAnimationState] = useState<HarvestAnimationState>({
    isAnimating: false,
    animationType: 'idle',
    progress: 0
  });

  const controls = useAnimation();

  // Apple-inspired animation variants
  const variants = {
    fadeInUp: {
      initial: { opacity: 0, y: 20 },
      animate: { 
        opacity: 1, 
        y: 0,
        transition: {
          duration: 0.6,
          ease: [0.25, 0.1, 0.25, 1] // Apple's custom easing
        }
      },
      exit: { opacity: 0, y: -20 }
    },
    
    scaleIn: {
      initial: { scale: 0, opacity: 0 },
      animate: { 
        scale: 1, 
        opacity: 1,
        transition: {
          type: "spring",
          stiffness: 300,
          damping: 20
        }
      },
      exit: { scale: 0, opacity: 0 }
    },

    slideInFromRight: {
      initial: { x: 100, opacity: 0 },
      animate: { 
        x: 0, 
        opacity: 1,
        transition: {
          duration: 0.5,
          ease: "easeOut"
        }
      },
      exit: { x: -100, opacity: 0 }
    },

    elasticScale: {
      initial: { scale: 0 },
      animate: { 
        scale: [0, 1.2, 0.9, 1.05, 1],
        transition: {
          duration: 0.8,
          times: [0, 0.3, 0.5, 0.7, 1],
          ease: "easeInOut"
        }
      }
    },

    shimmer: {
      animate: {
        backgroundPosition: ["200% 0", "-200% 0"],
        transition: {
          duration: 3,
          repeat: Infinity,
          ease: "linear"
        }
      }
    },

    pulse: {
      animate: {
        scale: [1, 1.05, 1],
        opacity: [1, 0.8, 1],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }
    },

    rotate360: {
      animate: {
        rotate: 360,
        transition: {
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }
      }
    },

    bounceIn: {
      initial: { scale: 0, y: -100 },
      animate: {
        scale: 1,
        y: 0,
        transition: {
          type: "spring",
          stiffness: 500,
          damping: 15,
          mass: 0.5
        }
      }
    },

    staggerChildren: {
      animate: {
        transition: {
          staggerChildren: 0.1,
          delayChildren: 0.2
        }
      }
    },

    glowPulse: {
      animate: {
        boxShadow: [
          "0 0 0 0 rgba(99, 102, 241, 0)",
          "0 0 20px 10px rgba(99, 102, 241, 0.3)",
          "0 0 0 0 rgba(99, 102, 241, 0)"
        ],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }
    }
  };

  // Harvest-specific animations
  const harvestAnimations = {
    seedPlanting: async () => {
      await controls.start({
        scale: [1, 0.9, 1.1, 1],
        rotate: [0, -5, 5, 0],
        transition: { duration: 0.5 }
      });
    },

    growth: async () => {
      await controls.start({
        scale: [0.5, 1],
        opacity: [0.5, 1],
        y: [20, 0],
        transition: { 
          duration: 1.5,
          ease: "easeOut"
        }
      });
    },

    harvest: async () => {
      await controls.start({
        scale: [1, 1.2, 0.9, 1],
        rotate: [0, 10, -10, 0],
        transition: { 
          duration: 0.8,
          times: [0, 0.3, 0.6, 1]
        }
      });
    },

    celebration: async () => {
      setAnimationState(prev => ({ ...prev, animationType: 'celebrating' }));
      
      await controls.start({
        scale: [1, 1.5, 1.2, 1.3, 1],
        rotate: [0, 180, 360],
        transition: {
          duration: 1.5,
          ease: "easeInOut"
        }
      });
      
      setAnimationState(prev => ({ ...prev, animationType: 'completed' }));
    },

    progressBar: (progress: number) => {
      return {
        animate: {
          width: `${progress}%`,
          transition: {
            duration: 0.5,
            ease: "easeInOut"
          }
        }
      };
    }
  };

  // Utility functions
  const startAnimation = (type: HarvestAnimationState['animationType']) => {
    setAnimationState(prev => ({
      ...prev,
      isAnimating: true,
      animationType: type
    }));
  };

  const stopAnimation = () => {
    setAnimationState(prev => ({
      ...prev,
      isAnimating: false,
      animationType: 'idle'
    }));
  };

  const updateProgress = (progress: number) => {
    setAnimationState(prev => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress))
    }));
  };

  // Auto-trigger celebration at 100% progress
  useEffect(() => {
    if (animationState.progress === 100 && animationState.animationType !== 'celebrating') {
      harvestAnimations.celebration();
    }
  }, [animationState.progress]);

  return {
    variants,
    harvestAnimations,
    animationState,
    controls,
    startAnimation,
    stopAnimation,
    updateProgress
  };
};