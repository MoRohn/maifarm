import { motion } from 'framer-motion'
import { 
  Wheat, 
  Rocket, 
  Package, 
  Users, 
  FileCode, 
  BarChart3,
  Plus,
  Sparkles,
  Zap,
  Search,
  FolderOpen,
  Bot
} from 'lucide-react'
import { EnhancedButton } from '../ui/EnhancedButton'
import clsx from 'clsx'

export type EmptyStateType = 
  | 'no-farms' 
  | 'no-harvests' 
  | 'no-barn-items'
  | 'no-agents'
  | 'no-data'
  | 'no-results'
  | 'error'
  | 'coming-soon'

interface EmptyStateProps {
  type: EmptyStateType
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  className?: string
}

const emptyStateConfigs = {
  'no-farms': {
    icon: Wheat,
    defaultTitle: 'No farms yet',
    defaultDescription: 'Start your AI farming journey by creating your first multi-agent farm.',
    animation: 'plant'
  },
  'no-harvests': {
    icon: Package,
    defaultTitle: 'No harvests to display',
    defaultDescription: 'Once your agents complete their tasks, their outputs will appear here.',
    animation: 'float'
  },
  'no-barn-items': {
    icon: FolderOpen,
    defaultTitle: 'Your barn is empty',
    defaultDescription: 'Completed harvests will be stored here for future reference.',
    animation: 'bounce'
  },
  'no-agents': {
    icon: Users,
    defaultTitle: 'No agents available',
    defaultDescription: 'Deploy AI agents to start working on your tasks.',
    animation: 'wave'
  },
  'no-data': {
    icon: BarChart3,
    defaultTitle: 'No data to display',
    defaultDescription: 'Data will appear here once you start using the application.',
    animation: 'pulse'
  },
  'no-results': {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search or filters to find what you\'re looking for.',
    animation: 'shake'
  },
  'error': {
    icon: Zap,
    defaultTitle: 'Something went wrong',
    defaultDescription: 'We encountered an error loading this content. Please try again.',
    animation: 'error'
  },
  'coming-soon': {
    icon: Sparkles,
    defaultTitle: 'Coming soon',
    defaultDescription: 'This feature is under construction and will be available soon.',
    animation: 'sparkle'
  }
}

// Animation variants for different empty states
const animationVariants = {
  plant: {
    initial: { scale: 0, rotate: -180 },
    animate: { 
      scale: 1, 
      rotate: 0,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 15
      }
    }
  },
  float: {
    initial: { y: 20, opacity: 0 },
    animate: { 
      y: [0, -10, 0],
      opacity: 1,
      transition: {
        y: {
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut'
        },
        opacity: {
          duration: 0.5
        }
      }
    }
  },
  bounce: {
    initial: { y: -20, opacity: 0 },
    animate: { 
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 10
      }
    }
  },
  wave: {
    initial: { x: -20, opacity: 0 },
    animate: { 
      x: 0,
      opacity: 1,
      rotate: [0, 5, -5, 0],
      transition: {
        x: { duration: 0.5 },
        opacity: { duration: 0.5 },
        rotate: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1
        }
      }
    }
  },
  pulse: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { 
      scale: [1, 1.05, 1],
      opacity: 1,
      transition: {
        scale: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut'
        },
        opacity: {
          duration: 0.5
        }
      }
    }
  },
  shake: {
    initial: { x: 0, opacity: 0 },
    animate: { 
      x: [0, -5, 5, -5, 5, 0],
      opacity: 1,
      transition: {
        x: {
          duration: 0.5,
          delay: 0.5
        },
        opacity: {
          duration: 0.3
        }
      }
    }
  },
  error: {
    initial: { scale: 0, rotate: 0 },
    animate: { 
      scale: [1, 1.1, 1],
      rotate: [0, 5, -5, 0],
      transition: {
        duration: 0.5,
        ease: 'easeOut'
      }
    }
  },
  sparkle: {
    initial: { scale: 0, opacity: 0 },
    animate: { 
      scale: 1,
      opacity: [0, 1, 0.8, 1],
      rotate: [0, 180, 360],
      transition: {
        duration: 1.5,
        ease: 'easeOut',
        rotate: {
          duration: 20,
          repeat: Infinity,
          ease: 'linear'
        }
      }
    }
  }
}

export function EmptyState({ 
  type, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  const config = emptyStateConfigs[type]
  const Icon = config.icon
  const animation = animationVariants[config.animation as keyof typeof animationVariants]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={clsx(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        className
      )}
    >
      {/* Animated Icon Container */}
      <motion.div
        variants={animation}
        initial="initial"
        animate="animate"
        className="relative mb-6"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl scale-150 opacity-50" />
        
        {/* Icon */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
          <Icon className="h-12 w-12 text-primary-500 dark:text-primary-400" />
        </div>

        {/* Decorative elements */}
        {type === 'coming-soon' && (
          <>
            <motion.div
              className="absolute -top-2 -right-2"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles className="h-5 w-5 text-yellow-500" />
            </motion.div>
            <motion.div
              className="absolute -bottom-2 -left-2"
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Text Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="max-w-md"
      >
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {title || config.defaultTitle}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {description || config.defaultDescription}
        </p>
      </motion.div>

      {/* Action Button */}
      {action && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <EnhancedButton
            onClick={action.onClick}
            icon={action.icon || <Plus className="h-5 w-5" />}
            size="lg"
            motionProps={{
              whileHover: { scale: 1.05 },
              whileTap: { scale: 0.95 }
            }}
          >
            {action.label}
          </EnhancedButton>
        </motion.div>
      )}
    </motion.div>
  )
}

// Farm-specific empty state with animated tractor
export function FarmEmptyState({ onCreateFarm }: { onCreateFarm: () => void }) {
  return (
    <div className="relative">
      <EmptyState
        type="no-farms"
        action={{
          label: 'Create Your First Farm',
          onClick: onCreateFarm,
          icon: <Wheat className="h-5 w-5" />
        }}
      />
      
      {/* Animated tractor */}
      <motion.div
        className="absolute bottom-0 left-0 w-full h-20 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <motion.div
          className="text-6xl"
          animate={{ x: ['0%', '100%'] }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'linear'
          }}
        >
          🚜
        </motion.div>
      </motion.div>
    </div>
  )
}

// Agent-specific empty state with animated robots
export function AgentEmptyState() {
  const robots = ['🤖', '🦾', '🦿', '👾']
  
  return (
    <div className="relative">
      <EmptyState
        type="no-agents"
        title="No agents deployed"
        description="Your AI workforce is ready to be deployed. Start a task to see them in action!"
      />
      
      {/* Floating robots */}
      <div className="absolute inset-0 pointer-events-none">
        {robots.map((robot, index) => (
          <motion.div
            key={index}
            className="absolute text-2xl"
            style={{
              left: `${20 + index * 20}%`,
              top: `${10 + index * 15}%`
            }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 10, -10, 0]
            }}
            transition={{
              duration: 3 + index,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.5
            }}
          >
            {robot}
          </motion.div>
        ))}
      </div>
    </div>
  )
}