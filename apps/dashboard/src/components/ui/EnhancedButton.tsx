import { forwardRef, ButtonHTMLAttributes } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'glass'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  motionProps?: HTMLMotionProps<'button'>
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: clsx(
    'bg-primary-600 text-white',
    'hover:bg-primary-700 active:bg-primary-800',
    'dark:bg-primary-500 dark:hover:bg-primary-600 dark:active:bg-primary-700',
    'shadow-sm hover:shadow-md',
    'border border-transparent'
  ),
  secondary: clsx(
    'bg-gray-100 text-gray-900',
    'hover:bg-gray-200 active:bg-gray-300',
    'dark:bg-gray-800 dark:text-gray-100',
    'dark:hover:bg-gray-700 dark:active:bg-gray-600',
    'border border-gray-300 dark:border-gray-600'
  ),
  ghost: clsx(
    'bg-transparent text-gray-700',
    'hover:bg-gray-100 active:bg-gray-200',
    'dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700',
    'border border-transparent'
  ),
  danger: clsx(
    'bg-red-600 text-white',
    'hover:bg-red-700 active:bg-red-800',
    'dark:bg-red-600 dark:hover:bg-red-700 dark:active:bg-red-800',
    'shadow-sm hover:shadow-md',
    'border border-transparent'
  ),
  success: clsx(
    'bg-green-600 text-white',
    'hover:bg-green-700 active:bg-green-800',
    'dark:bg-green-600 dark:hover:bg-green-700 dark:active:bg-green-800',
    'shadow-sm hover:shadow-md',
    'border border-transparent'
  ),
  glass: clsx(
    'bg-white/10 backdrop-blur-md text-gray-900',
    'hover:bg-white/20 active:bg-white/30',
    'dark:bg-gray-900/10 dark:text-gray-100',
    'dark:hover:bg-gray-900/20 dark:active:bg-gray-900/30',
    'border border-white/20 dark:border-gray-700/50',
    'shadow-sm hover:shadow-md'
  )
}

// Size classes with minimum touch target sizes
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] px-3 py-2 text-sm gap-1.5', // Meets 44px minimum
  md: 'min-h-[48px] px-4 py-2.5 text-base gap-2', // Recommended size
  lg: 'min-h-[56px] px-6 py-3 text-lg gap-2.5', // Comfortable size
  xl: 'min-h-[64px] px-8 py-4 text-xl gap-3' // Extra large
}

// Focus styles for accessibility
const focusClasses = clsx(
  'focus:outline-none focus:ring-2 focus:ring-offset-2',
  'focus:ring-primary-500 dark:focus:ring-primary-400',
  'dark:focus:ring-offset-gray-900'
)

// Disabled styles
const disabledClasses = clsx(
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'disabled:hover:bg-current disabled:active:bg-current'
)

export const EnhancedButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      icon,
      iconPosition = 'left',
      disabled,
      children,
      motionProps,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    const buttonContent = (
      <>
        {loading ? (
          <>
            <Loader2 className="animate-spin h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
          </>
        ) : icon && iconPosition === 'left' ? (
          icon
        ) : null}
        
        {children && <span>{children}</span>}
        
        {!loading && icon && iconPosition === 'right' && icon}
      </>
    )

    const buttonClasses = clsx(
      // Base styles
      'inline-flex items-center justify-center',
      'font-medium rounded-lg',
      'transition-all duration-200',
      'transform-gpu', // GPU acceleration for animations
      
      // Variant styles
      buttonVariants[variant],
      
      // Size styles with touch targets
      sizeClasses[size],
      
      // Focus styles
      focusClasses,
      
      // Disabled styles
      disabledClasses,
      
      // Full width
      fullWidth && 'w-full',
      
      // Custom classes
      className
    )

    // Motion variants for micro-interactions
    const motionVariants = {
      tap: { scale: 0.97 },
      hover: { scale: 1.02 },
      initial: { scale: 1 }
    }

    if (motionProps !== undefined) {
      return (
        <motion.button
          ref={ref}
          className={buttonClasses}
          disabled={isDisabled}
          variants={motionVariants}
          whileTap={!isDisabled ? 'tap' : undefined}
          whileHover={!isDisabled ? 'hover' : undefined}
          initial="initial"
          {...(motionProps as any)}
          {...(props as any)}
        >
          {buttonContent}
        </motion.button>
      )
    }

    return (
      <button
        ref={ref}
        className={buttonClasses}
        disabled={isDisabled}
        {...props}
      >
        {buttonContent}
      </button>
    )
  }
)

EnhancedButton.displayName = 'EnhancedButton'

// Button group component for consistent spacing
interface ButtonGroupProps {
  children: React.ReactNode
  className?: string
  orientation?: 'horizontal' | 'vertical'
  align?: 'start' | 'center' | 'end' | 'stretch'
}

export function ButtonGroup({
  children,
  className,
  orientation = 'horizontal',
  align = 'start'
}: ButtonGroupProps) {
  const alignClasses = {
    start: orientation === 'horizontal' ? 'justify-start' : 'items-start',
    center: orientation === 'horizontal' ? 'justify-center' : 'items-center',
    end: orientation === 'horizontal' ? 'justify-end' : 'items-end',
    stretch: orientation === 'horizontal' ? 'justify-stretch' : 'items-stretch'
  }

  return (
    <div
      className={clsx(
        'flex gap-3',
        orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
        alignClasses[align],
        className
      )}
      role="group"
    >
      {children}
    </div>
  )
}

// Icon button variant with perfect circle and proper touch targets
interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconPosition'> {
  icon: React.ReactNode
  label: string // Required for accessibility
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, size = 'md', className, ...props }, ref) => {
    const iconSizeClasses: Record<ButtonSize, string> = {
      sm: 'h-[44px] w-[44px]', // Minimum touch target
      md: 'h-[48px] w-[48px]', // Recommended
      lg: 'h-[56px] w-[56px]', // Comfortable
      xl: 'h-[64px] w-[64px]' // Extra large
    }

    return (
      <EnhancedButton
        ref={ref}
        size={size}
        className={clsx(
          'rounded-full p-0',
          iconSizeClasses[size],
          className
        )}
        aria-label={label}
        {...props}
      >
        {icon}
      </EnhancedButton>
    )
  }
)

IconButton.displayName = 'IconButton'