import { motion } from 'framer-motion'
import clsx from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700'
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg'
  }
  
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: ''
  }
  
  const style = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '100%')
  }
  
  return (
    <div
      className={clsx(
        baseClasses,
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      style={style}
      aria-hidden="true"
      role="presentation"
    />
  )
}

// Skeleton container for grouping multiple skeletons
interface SkeletonContainerProps {
  children: React.ReactNode
  className?: string
}

export function SkeletonContainer({ children, className }: SkeletonContainerProps) {
  return (
    <div className={clsx('space-y-3', className)} aria-busy="true" aria-live="polite">
      {children}
    </div>
  )
}

// Card skeleton for loading cards
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="40%" height={16} />
        </div>
      </div>
      <Skeleton variant="rounded" height={120} />
      <div className="space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  )
}

// Table skeleton for loading tables
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex space-x-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} variant="text" width={`${100 / columns}%`} height={20} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4">
            <div className="flex space-x-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  variant="text"
                  width={`${100 / columns}%`}
                  height={16}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// List skeleton for loading lists
export function ListSkeleton({ items = 3 }: { items?: number }) {
  return (
    <SkeletonContainer>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3 p-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="70%" height={16} />
            <Skeleton variant="text" width="50%" height={14} />
          </div>
        </div>
      ))}
    </SkeletonContainer>
  )
}

// Farm card skeleton
export function FarmCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative glass rounded-xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="space-y-2">
            <Skeleton variant="text" width={120} height={20} />
            <Skeleton variant="text" width={80} height={16} />
          </div>
        </div>
        <Skeleton variant="rounded" width={80} height={32} />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton variant="text" width="60%" height={14} />
            <Skeleton variant="text" width="80%" height={20} />
          </div>
        ))}
      </div>
      
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <Skeleton variant="rounded" height={40} />
      </div>
    </motion.div>
  )
}

// Analytics chart skeleton
export function ChartSkeleton() {
  return (
    <div className="glass rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={24} />
        <Skeleton variant="rounded" width={100} height={32} />
      </div>
      <Skeleton variant="rounded" height={300} />
      <div className="flex justify-center space-x-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-2">
            <Skeleton variant="circular" width={12} height={12} />
            <Skeleton variant="text" width={60} height={14} />
          </div>
        ))}
      </div>
    </div>
  )
}