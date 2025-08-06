import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { glassClasses } from '../../styles/glassmorphism';

export type GlassVariant = 'light' | 'dark' | 'subtle' | 'vibrant' | 'card';

interface GlassPanelProps extends HTMLMotionProps<'div'> {
  variant?: GlassVariant;
  hover?: boolean;
  glow?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ variant = 'light', hover = true, glow = false, className, children, ...props }, ref) => {
    const baseClasses = cn(
      'rounded-xl overflow-hidden',
      glassClasses[variant],
      'transition-all duration-300 ease-out',
      className
    );

    const hoverClasses = hover ? 'hover:-translate-y-0.5 hover:shadow-xl' : '';
    const glowClasses = glow ? 'shadow-[0_0_40px_rgba(59,130,246,0.15)]' : '';

    return (
      <motion.div
        ref={ref}
        className={cn(baseClasses, hoverClasses, glowClasses)}
        whileHover={hover ? { scale: 1.01 } : undefined}
        whileTap={hover ? { scale: 0.99 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';