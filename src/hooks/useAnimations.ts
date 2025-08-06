import { useEffect, useRef } from 'react';
import { useAnimation, AnimationControls, useInView } from 'framer-motion';
import { useMediaQuery } from './useResponsive';

interface UseAnimationOptions {
  threshold?: number;
  triggerOnce?: boolean;
  rootMargin?: string;
  disabled?: boolean;
}

export const useScrollAnimation = (options: UseAnimationOptions = {}) => {
  const { 
    threshold = 0.1, 
    triggerOnce = true, 
    rootMargin = '0px',
    disabled = false 
  } = options;
  
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const inView = useInView(ref, { 
    once: triggerOnce, 
    margin: rootMargin,
    amount: threshold 
  });

  useEffect(() => {
    if (disabled) return;
    
    if (inView) {
      controls.start('visible');
    } else if (!triggerOnce) {
      controls.start('hidden');
    }
  }, [inView, controls, triggerOnce, disabled]);

  return { ref, controls, inView };
};

export const useReducedMotion = () => {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
};

export const useParallax = (offset = 50) => {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || !ref.current) return;

    const element = ref.current;
    let animationFrameId: number;

    const handleScroll = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const speed = offset / 100;
        const yPos = rect.top * speed;
        
        element.style.transform = `translateY(${yPos}px)`;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [offset, reducedMotion]);

  return ref;
};

export const useHoverAnimation = () => {
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();

  const handleHoverStart = () => {
    if (!reducedMotion) {
      controls.start('hover');
    }
  };

  const handleHoverEnd = () => {
    if (!reducedMotion) {
      controls.start('initial');
    }
  };

  return {
    controls,
    onHoverStart: handleHoverStart,
    onHoverEnd: handleHoverEnd,
  };
};

export const useStaggerAnimation = (
  itemCount: number,
  staggerDelay = 0.1,
  options: UseAnimationOptions = {}
) => {
  const { ref, controls, inView } = useScrollAnimation(options);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
  };

  return {
    ref,
    controls,
    inView,
    containerVariants,
    itemVariants,
  };
};

export const useGestureAnimation = () => {
  const controls = useAnimation();

  const animateTap = () => {
    controls.start({
      scale: [1, 0.95, 1],
      transition: { duration: 0.2 },
    });
  };

  const animateSwipe = (direction: 'left' | 'right') => {
    controls.start({
      x: direction === 'left' ? -100 : 100,
      opacity: 0,
      transition: { duration: 0.3 },
    });
  };

  return {
    controls,
    animateTap,
    animateSwipe,
  };
};