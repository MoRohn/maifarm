import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Star, Heart, Zap } from 'lucide-react';

interface HarvestAnimationsProps {
  type: 'celebration' | 'loading' | 'success' | 'reveal';
  children?: React.ReactNode;
  className?: string;
}

export const HarvestAnimations: React.FC<HarvestAnimationsProps> = ({
  type,
  children,
  className
}) => {
  if (type === 'celebration') {
    return (
      <motion.div className={className}>
        {/* Starburst Animation */}
        <div className="absolute inset-0 flex items-center justify-center">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: 0 }}
              animate={{
                scale: [0, 1.5, 0],
                rotate: 360,
                x: Math.cos((i * 30 * Math.PI) / 180) * 200,
                y: Math.sin((i * 30 * Math.PI) / 180) * 200,
              }}
              transition={{
                duration: 2,
                delay: i * 0.05,
                ease: "easeOut"
              }}
              className="absolute"
            >
              <Star className="w-6 h-6 text-yellow-400" fill="currentColor" />
            </motion.div>
          ))}
        </div>
        
        {/* Central Icon Animation */}
        <motion.div
          initial={{ scale: 0, rotate: 0 }}
          animate={{ 
            scale: [0, 1.2, 1],
            rotate: [0, 360]
          }}
          transition={{ duration: 0.8, ease: "backOut" }}
          className="relative z-10"
        >
          <Sparkles className="w-24 h-24 text-primary-600 dark:text-primary-400" />
        </motion.div>
        
        {children}
      </motion.div>
    );
  }

  if (type === 'loading') {
    return (
      <motion.div className={className}>
        <div className="relative">
          {/* Orbiting Elements */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 3 + i,
                repeat: Infinity,
                ease: "linear"
              }}
              className="absolute inset-0"
            >
              <div
                className="absolute w-3 h-3 bg-primary-500 rounded-full"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: `translate(-50%, -50%) translateX(${30 + i * 10}px)`
                }}
              />
            </motion.div>
          ))}
          
          {/* Center Content */}
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative z-10"
          >
            {children || <Zap className="w-12 h-12 text-primary-600" />}
          </motion.div>
        </div>
      </motion.div>
    );
  }

  if (type === 'success') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className={className}
      >
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 10, -10, 0]
          }}
          transition={{ 
            duration: 0.5,
            times: [0, 0.5, 0.75, 1]
          }}
        >
          {children}
        </motion.div>
        
        {/* Particle Effects */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                opacity: 1,
                scale: 0,
                x: 0,
                y: 0
              }}
              animate={{ 
                opacity: 0,
                scale: 1,
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
              }}
              transition={{ 
                duration: 1,
                delay: i * 0.05
              }}
              className="absolute top-1/2 left-1/2"
            >
              <Heart className="w-4 h-4 text-pink-500" fill="currentColor" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (type === 'reveal') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ 
          type: "spring",
          stiffness: 100,
          damping: 15
        }}
        className={className}
      >
        <motion.div
          initial={{ filter: "blur(10px)" }}
          animate={{ filter: "blur(0px)" }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      </motion.div>
    );
  }

  return <>{children}</>;
};

export const useHarvestAnimations = () => {
  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  const scaleIn = {
    initial: { scale: 0 },
    animate: { scale: 1 },
    exit: { scale: 0 }
  };

  const slideInLeft = {
    initial: { x: -100, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 100, opacity: 0 }
  };

  const staggerChildren = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const springBounce = {
    type: "spring",
    stiffness: 300,
    damping: 20
  };

  const shimmer = {
    animate: {
      backgroundPosition: ["200% 0", "-200% 0"],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "linear"
      }
    }
  };

  return {
    fadeInUp,
    scaleIn,
    slideInLeft,
    staggerChildren,
    springBounce,
    shimmer
  };
};