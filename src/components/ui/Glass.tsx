import { forwardRef, HTMLAttributes } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import clsx from 'clsx'

type GlassVariant = 'default' | 'heavy' | 'subtle' | 'card' | 'panel' | 'modal' | 'button'
type GlassColor = 'none' | 'primary' | 'success' | 'error' | 'warning'

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant
  color?: GlassColor
  blur?: 'light' | 'medium' | 'heavy' | 'ultra'
  animated?: boolean
  hover?: boolean
  glow?: boolean
  noise?: boolean
  gradient?: boolean
  className?: string
}

interface GlassMotionProps extends Omit<HTMLMotionProps<'div'>, 'className'> {
  variant?: GlassVariant
  color?: GlassColor
  blur?: 'light' | 'medium' | 'heavy' | 'ultra'
  animated?: boolean
  hover?: boolean
  glow?: boolean
  noise?: boolean
  gradient?: boolean
  className?: string
}

// Utility to generate glass classes
const getGlassClasses = ({
  variant = 'default',
  color = 'none',
  blur = 'medium',
  hover = true,
  glow = false,
  noise = true,
  gradient = true,
  className
}: Omit<GlassProps, 'animated'>) => {
  const variantClasses = {
    default: 'glass',
    heavy: 'glass-heavy',
    subtle: 'glass-subtle',
    card: 'glass-card',
    panel: 'glass-panel',
    modal: 'glass-modal',
    button: 'glass-button'
  }

  const blurClasses = {
    light: 'backdrop-blur-sm',
    medium: 'backdrop-blur-md',
    heavy: 'backdrop-blur-lg',
    ultra: 'backdrop-blur-2xl'
  }

  const colorClasses = {
    none: '',
    primary: 'glass-primary',
    success: 'glass-success',
    error: 'glass-error',
    warning: 'glass-warning'
  }

  return clsx(
    variantClasses[variant],
    blurClasses[blur],
    colorClasses[color],
    {
      'hover:scale-[1.02] hover:shadow-xl transition-all duration-300': hover && variant !== 'button',
      'ring-2 ring-white/20 dark:ring-white/10': glow,
      'after:opacity-0': !noise,
      'before:opacity-0': !gradient
    },
    className
  )
}

// Static Glass component
export const Glass = forwardRef<HTMLDivElement, GlassProps>(
  ({ variant, color, blur, hover, glow, noise, gradient, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={getGlassClasses({ variant, color, blur, hover, glow, noise, gradient, className })}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Glass.displayName = 'Glass'

// Animated Glass component with Framer Motion
export const GlassMotion = forwardRef<HTMLDivElement, GlassMotionProps>(
  (
    { 
      variant = 'default', 
      color, 
      blur, 
      animated = true, 
      hover, 
      glow, 
      noise, 
      gradient, 
      className, 
      children, 
      ...motionProps 
    }, 
    ref
  ) => {
    const animationVariants = {
      initial: { opacity: 0, scale: 0.95, y: 20 },
      animate: { 
        opacity: 1, 
        scale: 1, 
        y: 0,
        transition: {
          duration: 0.4,
          ease: [0.4, 0, 0.2, 1]
        }
      },
      hover: hover ? {
        scale: 1.02,
        transition: {
          duration: 0.2,
          ease: 'easeOut'
        }
      } : undefined,
      tap: variant === 'button' ? {
        scale: 0.98,
        transition: {
          duration: 0.1,
          ease: 'easeOut'
        }
      } : undefined
    }

    return (
      <motion.div
        ref={ref}
        className={getGlassClasses({ variant, color, blur, hover, glow, noise, gradient, className })}
        variants={animated ? animationVariants as any : undefined}
        initial={animated ? 'initial' : undefined}
        animate={animated ? 'animate' : undefined}
        whileHover={hover ? 'hover' : undefined}
        whileTap={variant === 'button' ? 'tap' : undefined}
        {...motionProps}
      >
        {children}
      </motion.div>
    )
  }
)

GlassMotion.displayName = 'GlassMotion'

// Glass Card component with predefined styles
export const GlassCard = forwardRef<HTMLDivElement, Omit<GlassProps, 'variant'>>(
  ({ className, children, ...props }, ref) => {
    return (
      <Glass
        ref={ref}
        variant="card"
        className={clsx('rounded-2xl p-6', className)}
        {...props}
      >
        {children}
      </Glass>
    )
  }
)

GlassCard.displayName = 'GlassCard'

// Glass Panel component
export const GlassPanel = forwardRef<HTMLDivElement, Omit<GlassProps, 'variant'>>(
  ({ className, children, ...props }, ref) => {
    return (
      <Glass
        ref={ref}
        variant="panel"
        className={clsx('rounded-xl p-4', className)}
        {...props}
      >
        {children}
      </Glass>
    )
  }
)

GlassPanel.displayName = 'GlassPanel'

// Glass Modal component
export const GlassModal = forwardRef<HTMLDivElement, Omit<GlassMotionProps, 'variant'>>(
  ({ className, children, ...props }, ref) => {
    return (
      <GlassMotion
        ref={ref}
        variant="modal"
        className={clsx('rounded-3xl p-8 max-w-2xl mx-auto', className)}
        {...props}
      >
        {children}
      </GlassMotion>
    )
  }
)

GlassModal.displayName = 'GlassModal'

// Glass Button component
export const GlassButton = forwardRef<HTMLButtonElement, HTMLAttributes<HTMLButtonElement> & Omit<GlassProps, 'variant'>>(
  ({ className, children, color, blur, hover = true, glow, noise, gradient, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={getGlassClasses({ 
          variant: 'button', 
          color, 
          blur, 
          hover, 
          glow, 
          noise, 
          gradient, 
          className: clsx('px-4 py-2 rounded-lg font-medium', className)
        })}
        {...props}
      >
        {children}
      </button>
    )
  }
)

GlassButton.displayName = 'GlassButton'

// Floating glass orb animation component
export function GlassOrb({ 
  size = 100, 
  color = 'primary',
  className 
}: { 
  size?: number
  color?: GlassColor
  className?: string 
}) {
  return (
    <motion.div
      className={clsx(
        'absolute rounded-full',
        color === 'primary' && 'bg-blue-400/20',
        color === 'success' && 'bg-green-400/20',
        color === 'error' && 'bg-red-400/20',
        color === 'warning' && 'bg-yellow-400/20',
        'backdrop-blur-xl',
        className
      )}
      style={{ width: size, height: size }}
      animate={{
        y: [0, -30, 0],
        x: [0, 20, 0],
        scale: [1, 1.1, 1]
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
    />
  )
}

// Glass surface with animated gradient
export function GlassSurface({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <div className={clsx('relative overflow-hidden', className)}>
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 opacity-50"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))'
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%']
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'linear'
        }}
      />
      
      {/* Glass layer */}
      <Glass variant="subtle" className="relative z-10 h-full">
        {children}
      </Glass>
      
      {/* Floating orbs for depth */}
      <GlassOrb size={80} color="primary" className="top-10 left-10" />
      <GlassOrb size={120} color="success" className="bottom-20 right-20" />
      <GlassOrb size={60} color="warning" className="top-1/2 left-1/3" />
    </div>
  )
}