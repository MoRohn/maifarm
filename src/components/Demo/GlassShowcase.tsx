import { motion } from 'framer-motion'
import { 
  Glass, 
  GlassCard, 
  GlassPanel, 
  GlassModal, 
  GlassButton,
  GlassSurface,
  GlassMotion 
} from '../ui/Glass'
import { 
  Sparkles, 
  Zap, 
  Rocket, 
  Heart, 
  Star, 
  Globe,
  Cpu,
  Brain,
  Database,
  Cloud
} from 'lucide-react'
import { useState } from 'react'

export function GlassShowcase() {
  const [selectedCard, setSelectedCard] = useState<number | null>(null)

  const cards = [
    {
      id: 1,
      title: 'Neural Processing',
      description: 'Advanced AI computations with glass morphism',
      icon: Brain,
      color: 'primary' as const
    },
    {
      id: 2,
      title: 'Cloud Infrastructure',
      description: 'Scalable cloud solutions with elegant UI',
      icon: Cloud,
      color: 'success' as const
    },
    {
      id: 3,
      title: 'Data Analytics',
      description: 'Real-time data visualization and insights',
      icon: Database,
      color: 'warning' as const
    },
    {
      id: 4,
      title: 'Quantum Computing',
      description: 'Next-generation computing paradigms',
      icon: Cpu,
      color: 'error' as const
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 p-8">
      {/* Hero Section with Glass Surface */}
      <GlassSurface className="mb-12 rounded-3xl overflow-hidden">
        <div className="p-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Glass Morphism Showcase
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Experience the beauty of modern glass morphism effects with enhanced blur, depth, and interactivity
            </p>
          </motion.div>
        </div>
      </GlassSurface>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {cards.map((card, index) => (
          <GlassMotion
            key={card.id}
            variant="card"
            color={card.color}
            hover
            glow={selectedCard === card.id}
            className="p-6 rounded-2xl cursor-pointer"
            onClick={() => setSelectedCard(card.id)}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 p-3 rounded-full bg-white/20 dark:bg-black/20">
                <card.icon className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {card.description}
              </p>
            </div>
          </GlassMotion>
        ))}
      </div>

      {/* Interactive Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <GlassPanel className="col-span-2 p-8">
          <h2 className="text-2xl font-bold mb-4">Glass Panel Effects</h2>
          <div className="space-y-4">
            <Glass variant="subtle" className="p-4 rounded-lg">
              <p className="text-sm">Subtle glass effect with light blur</p>
            </Glass>
            <Glass variant="default" className="p-4 rounded-lg">
              <p className="text-sm">Default glass effect with medium blur</p>
            </Glass>
            <Glass variant="heavy" className="p-4 rounded-lg">
              <p className="text-sm">Heavy glass effect with strong blur</p>
            </Glass>
          </div>
        </GlassPanel>

        <GlassCard className="p-8">
          <h3 className="text-xl font-bold mb-4">Interactive Buttons</h3>
          <div className="space-y-3">
            <GlassButton color="primary" className="w-full">
              <Sparkles className="h-4 w-4 mr-2 inline" />
              Primary Action
            </GlassButton>
            <GlassButton color="success" className="w-full">
              <Zap className="h-4 w-4 mr-2 inline" />
              Success Action
            </GlassButton>
            <GlassButton color="error" className="w-full">
              <Heart className="h-4 w-4 mr-2 inline" />
              Danger Action
            </GlassButton>
          </div>
        </GlassCard>
      </div>

      {/* Floating Elements Demo */}
      <Glass variant="panel" className="relative h-64 rounded-2xl overflow-hidden mb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-purple-400/10" />
        
        {/* Animated floating icons */}
        <motion.div
          className="absolute top-10 left-10"
          animate={{ 
            y: [0, -20, 0],
            rotate: [0, 360]
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <Star className="h-8 w-8 text-yellow-500" />
        </motion.div>
        
        <motion.div
          className="absolute top-20 right-20"
          animate={{ 
            y: [0, 20, 0],
            rotate: [360, 0]
          }}
          transition={{ 
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <Globe className="h-10 w-10 text-blue-500" />
        </motion.div>
        
        <motion.div
          className="absolute bottom-10 left-1/2"
          animate={{ 
            x: [-20, 20, -20],
            scale: [1, 1.2, 1]
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          <Rocket className="h-12 w-12 text-purple-500" />
        </motion.div>
        
        <div className="relative z-10 flex items-center justify-center h-full">
          <h2 className="text-3xl font-bold text-center">
            Floating Elements in Glass Container
          </h2>
        </div>
      </Glass>

      {/* Modal Demo */}
      <div className="text-center">
        <GlassButton 
          onClick={() => alert('Modal would open here!')}
          color="primary"
          className="px-8 py-3"
        >
          Open Glass Modal
        </GlassButton>
      </div>

      {/* Performance Note */}
      <Glass variant="subtle" className="mt-12 p-6 rounded-xl">
        <div className="flex items-start space-x-3">
          <Cpu className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <h4 className="font-semibold mb-1">Performance Optimized</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              All glass effects are GPU-accelerated and automatically adjust based on device capabilities.
              On low-end devices, effects gracefully degrade to maintain smooth performance.
            </p>
          </div>
        </div>
      </Glass>
    </div>
  )
}