import { motion } from 'framer-motion'
import { Glass, GlassCard } from '../ui/Glass'
import { useGlassMorphism } from '@/hooks/useGlassMorphism'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

interface GlassChartProps {
  title: string
  value: string | number
  change?: number
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  children?: React.ReactNode
  className?: string
  color?: 'primary' | 'success' | 'error' | 'warning'
}

export function GlassChart({
  title,
  value,
  change,
  trend,
  subtitle,
  children,
  className,
  color = 'primary'
}: GlassChartProps) {
  const { isSupported } = useGlassMorphism()
  
  const getTrendIcon = () => {
    if (!trend) return null
    
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4" />
      case 'down':
        return <TrendingDown className="h-4 w-4" />
      default:
        return <Minus className="h-4 w-4" />
    }
  }
  
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-500 dark:text-green-400'
      case 'down':
        return 'text-red-500 dark:text-red-400'
      default:
        return 'text-gray-500 dark:text-gray-400'
    }
  }
  
  return (
    <GlassCard
      color={color === 'primary' ? 'none' : color}
      className={clsx('relative overflow-hidden', className)}
    >
      {/* Background gradient animation */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 20% 50%, var(--color-${color}) 0%, transparent 50%)`
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              {title}
            </h3>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {value}
              </span>
              {change !== undefined && (
                <div className={clsx('flex items-center space-x-1 text-sm', getTrendColor())}>
                  {getTrendIcon()}
                  <span>{Math.abs(change)}%</span>
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        
        {/* Chart content */}
        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
      
      {/* Glass quality indicator */}
      {!isSupported && (
        <div className="absolute top-2 right-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Fallback mode
          </span>
        </div>
      )}
    </GlassCard>
  )
}

// Mini sparkline chart component
export function GlassSparkline({ 
  data, 
  height = 40,
  color = 'primary' 
}: { 
  data: number[]
  height?: number
  color?: string 
}) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  
  return (
    <div className="relative" style={{ height }}>
      <svg
        width="100%"
        height={height}
        className="overflow-visible"
        preserveAspectRatio="none"
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={`var(--color-${color})`} stopOpacity="0.3" />
            <stop offset="100%" stopColor={`var(--color-${color})`} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Area fill */}
        <polygon
          points={`0,${height} ${points} 100,${height}`}
          fill={`url(#gradient-${color})`}
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={`var(--color-${color})`}
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        
        {/* Animated dot on last point */}
        <motion.circle
          cx="100"
          cy={height - ((data[data.length - 1] - min) / range) * height}
          r="3"
          fill={`var(--color-${color})`}
          className="drop-shadow-md"
          animate={{
            r: [3, 4, 3],
            opacity: [1, 0.7, 1]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      </svg>
    </div>
  )
}

// Metric card with glass effect
export function GlassMetric({
  label,
  value,
  icon,
  color = 'primary',
  className
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  color?: 'primary' | 'success' | 'error' | 'warning'
  className?: string
}) {
  return (
    <Glass
      variant="subtle"
      className={clsx(
        'p-4 rounded-xl flex items-center space-x-3',
        className
      )}
    >
      {icon && (
        <div className={clsx(
          'p-2 rounded-lg',
          color === 'primary' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
          color === 'success' && 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
          color === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
          color === 'warning' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
        )}>
          {icon}
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      </div>
    </Glass>
  )
}