import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/utils/cn';
import { GlassPanel, GlassVariant } from './GlassPanel';
import { useScrollAnimation } from '@/hooks/useAnimations';

interface AnimatedCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  variant?: GlassVariant;
  animateOnScroll?: boolean;
  delay?: number;
  className?: string;
  children?: React.ReactNode;
}

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ 
    variant = 'card', 
    animateOnScroll = true, 
    delay = 0,
    className,
    children,
    ...props 
  }, forwardedRef) => {
    const { ref, controls } = useScrollAnimation({ triggerOnce: true });

    const cardVariants = {
      hidden: { 
        opacity: 0, 
        y: 30,
        scale: 0.95
      },
      visible: { 
        opacity: 1, 
        y: 0,
        scale: 1,
        transition: {
          duration: 0.5,
          delay,
          ease: [0.25, 0.1, 0.25, 1]
        }
      }
    };

    return (
      <motion.div
        ref={animateOnScroll ? ref as any : forwardedRef}
        animate={animateOnScroll ? controls : undefined}
        initial={animateOnScroll ? 'hidden' : undefined}
        variants={animateOnScroll ? cardVariants : undefined}
        {...props}
      >
        <GlassPanel
          ref={!animateOnScroll ? forwardedRef : undefined}
          variant={variant}
          className={cn('p-6', className)}
          hover
        >
          {children}
        </GlassPanel>
      </motion.div>
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard';