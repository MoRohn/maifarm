/**
 * Terminal Animations - Smooth, professional animations for the terminal UI
 * Using Framer Motion for beautiful, performant animations
 */

import { Variants, Transition, TargetAndTransition } from 'framer-motion';

// Window entry animations
export const windowEntry: Variants = {
  initial: {
    scale: 0.8,
    opacity: 0,
    y: 20,
    rotateX: -15,
  },
  animate: {
    scale: 1,
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
      mass: 0.8,
    },
  },
  exit: {
    scale: 0.9,
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// Typewriter effect for terminal output
export const typewriterEffect: Variants = {
  hidden: {
    opacity: 0,
    display: 'none',
  },
  visible: (custom: { delay: number; duration: number }) => ({
    opacity: 1,
    display: 'block',
    transition: {
      delay: custom?.delay || 0,
      duration: custom?.duration || 0.05,
    },
  }),
};

// Glow pulse for active agents
export const glowPulse: Variants = {
  initial: {
    boxShadow: '0 0 0 0 rgba(0, 255, 0, 0)',
  },
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(0, 255, 0, 0)',
      '0 0 20px 10px rgba(0, 255, 0, 0.3)',
      '0 0 30px 15px rgba(0, 255, 0, 0.2)',
      '0 0 0 0 rgba(0, 255, 0, 0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// Agent card animations
export const agentCardAnimation: Variants = {
  hidden: {
    opacity: 0,
    x: -50,
  },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.1,
      type: 'spring',
      stiffness: 200,
      damping: 15,
    },
  }),
  hover: {
    scale: 1.02,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 10,
    },
  },
};

// Terminal line animation
export const terminalLineAnimation: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};

// Cursor blink animation
export const cursorBlink: TargetAndTransition = {
  opacity: [1, 1, 0, 0],
  transition: {
    duration: 1,
    repeat: Infinity,
    ease: 'steps(2)',
  },
};

// Tab switch animation
export const tabSwitch: Variants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// Status indicator pulse
export const statusPulse: Variants = {
  active: {
    scale: [1, 1.2, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  idle: {
    scale: 1,
    opacity: 0.5,
  },
  working: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Particle animation for background effects
export const particleAnimation: Variants = {
  initial: {
    opacity: 0,
    scale: 0,
  },
  animate: (custom: { x: number; y: number; duration: number }) => ({
    opacity: [0, 1, 1, 0],
    scale: [0, 1, 1, 0],
    x: custom?.x || 0,
    y: custom?.y || -100,
    transition: {
      duration: custom?.duration || 3,
      repeat: Infinity,
      ease: 'linear',
      delay: Math.random() * 2,
    },
  }),
};

// Glitch effect animation
export const glitchEffect: Variants = {
  normal: {
    skew: 0,
    scaleX: 1,
    filter: 'hue-rotate(0deg)',
  },
  glitch: {
    skew: [0, 2, -2, 0],
    scaleX: [1, 1.01, 0.99, 1],
    filter: [
      'hue-rotate(0deg)',
      'hue-rotate(90deg)',
      'hue-rotate(-90deg)',
      'hue-rotate(0deg)',
    ],
    transition: {
      duration: 0.3,
      times: [0, 0.33, 0.66, 1],
    },
  },
};

// Holographic shimmer effect
export const holographicShimmer: Variants = {
  initial: {
    backgroundPosition: '0% 50%',
  },
  animate: {
    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    transition: {
      duration: 5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Matrix rain effect for individual characters
export const matrixRainChar: Variants = {
  initial: {
    y: -20,
    opacity: 0,
  },
  animate: (custom: { delay: number; speed: number }) => ({
    y: window.innerHeight + 20,
    opacity: [0, 1, 1, 0],
    transition: {
      duration: custom?.speed || 8,
      delay: custom?.delay || 0,
      repeat: Infinity,
      ease: 'linear',
    },
  }),
};

// Neon text glow animation
export const neonTextGlow: TargetAndTransition = {
  textShadow: [
    '0 0 10px currentColor',
    '0 0 20px currentColor, 0 0 30px currentColor',
    '0 0 10px currentColor',
  ],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

// Wave animation for loading states
export const waveAnimation: Variants = {
  initial: {
    y: 0,
  },
  animate: (i: number) => ({
    y: [-5, 5, -5],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: i * 0.1,
    },
  }),
};

// Scanlines effect
export const scanlinesAnimation: TargetAndTransition = {
  backgroundPosition: ['0 0', '0 10px'],
  transition: {
    duration: 0.5,
    repeat: Infinity,
    ease: 'linear',
  },
};

// Command palette slide animation
export const commandPaletteAnimation: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

// Smooth scroll animation
export const smoothScroll: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 30,
  mass: 0.5,
};

// Loading dots animation
export const loadingDots: Variants = {
  initial: {
    opacity: 0.3,
  },
  animate: (i: number) => ({
    opacity: [0.3, 1, 0.3],
    scale: [1, 1.2, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: i * 0.2,
    },
  }),
};

// Success checkmark animation
export const successCheckmark: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: {
        type: 'spring',
        stiffness: 200,
        damping: 20,
      },
      opacity: {
        duration: 0.1,
      },
    },
  },
};

// Error shake animation
export const errorShake: TargetAndTransition = {
  x: [0, -10, 10, -10, 10, 0],
  transition: {
    duration: 0.5,
    ease: 'easeInOut',
  },
};

// Fade in/out animation
export const fadeInOut: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.3,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Scale bounce animation
export const scaleBounce: Variants = {
  initial: {
    scale: 0,
  },
  animate: {
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 15,
    },
  },
  tap: {
    scale: 0.95,
  },
};

// Rotate animation for loading spinners
export const rotateAnimation: TargetAndTransition = {
  rotate: 360,
  transition: {
    duration: 1,
    repeat: Infinity,
    ease: 'linear',
  },
};

// Stagger children animation
export const staggerChildren: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Terminal boot sequence animation
export const bootSequence: Variants = {
  initial: {
    opacity: 0,
  },
  boot: {
    opacity: [0, 1, 1, 0.3, 1],
    transition: {
      duration: 2,
      times: [0, 0.2, 0.5, 0.6, 1],
      ease: 'easeInOut',
    },
  },
};