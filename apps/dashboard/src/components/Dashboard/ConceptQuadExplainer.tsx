import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sprout, Users, Package, Zap, ArrowRight, ChevronRight, Sparkles, Target, Cpu, Cloud, Shield, DollarSign } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'

interface ConceptCard {
  icon: React.ElementType
  title: string
  description: string
  features: string[]
  gradient: string
  action?: {
    label: string
    path: string
  }
}

const concepts: ConceptCard[] = [
  {
    icon: Sprout,
    title: 'Farms',
    description: 'Your AI workspace where agents collaborate on projects',
    features: [
      'Isolated workspaces',
      'Multi-agent teams',
      'Automated orchestration',
      'Resource management'
    ],
    gradient: 'from-emerald-500 to-green-600',
    action: { label: 'Create Farm', path: '/farms/new' }
  },
  {
    icon: Users,
    title: 'Agents',
    description: 'AI workers that bring specialized skills to your farm',
    features: [
      'Claude, GPT-4, Local AI',
      'Parallel execution',
      'Skill specialization',
      'Auto-coordination'
    ],
    gradient: 'from-blue-500 to-indigo-600',
    action: { label: 'View Farmers', path: '/farmers' }
  },
  {
    icon: Package,
    title: 'Harvest',
    description: 'Collect and organize outputs from your AI teams',
    features: [
      'Real-time collection',
      'Auto-organization',
      'Quality validation',
      'Export ready'
    ],
    gradient: 'from-orange-500 to-red-600',
    action: { label: 'View Barn', path: '/barn' }
  },
  {
    icon: Zap,
    title: 'Quick Tasks',
    description: '5-minute AI sprints for rapid results',
    features: [
      'Fast execution',
      'Single-agent mode',
      'Immediate results',
      'Zero configuration'
    ],
    gradient: 'from-leaf-400 to-leaf-700'
  }
]

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
}

export const ConceptQuadExplainer: React.FC = () => {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const { theme } = useThemeStore()

  // Force re-render after theme is applied to prevent theme flash
  useEffect(() => {
    setMounted(true)
  }, [])

  // Wait for theme to be applied before rendering
  if (!mounted) {
    return null
  }

  return (
    <div className="w-full" key={theme}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">How MaiFarm Works</h2>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Cultivate AI intelligence through collaborative agent farming</p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {concepts.map((concept, index) => (
          <motion.div
            key={index}
            variants={fadeInUp}
            whileHover={{ scale: 1.02 }}
            className="group"
          >
            <div className={`relative h-full bg-gradient-to-br ${concept.gradient} p-[1px] rounded-xl overflow-hidden`}>
              {/* Animated background effect */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer" />
              </div>

              <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl p-5 h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${concept.gradient} flex items-center justify-center flex-shrink-0`}>
                    <concept.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{concept.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{concept.description}</p>
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 space-y-1 mb-3">
                  {concept.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <ChevronRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                {concept.action && (
                  <button
                    onClick={() => navigate(concept.action!.path)}
                    className={`w-full mt-auto px-3 py-2 rounded-lg bg-gradient-to-r ${concept.gradient} text-white font-medium text-sm flex items-center justify-center gap-2 opacity-90 hover:opacity-100 transition-opacity`}
                  >
                    {concept.action.label}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6 p-4 bg-gradient-to-r from-emerald-100/80 to-teal-100/80 dark:from-emerald-900/50 dark:to-teal-900/50 rounded-xl border border-emerald-200 dark:border-emerald-500/20"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Ready to start farming?</h4>
              <p className="text-xs text-gray-700 dark:text-gray-300">Launch your first AI team in under 30 seconds</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/farms/new')}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-medium text-sm hover:from-emerald-600 hover:to-green-700 transition-all flex items-center gap-2"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* AI Engine badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 flex items-center justify-center gap-4"
      >
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Powered by:</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800/50 rounded">
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span className="text-gray-700 dark:text-gray-300">GPT-OSS</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800/50 rounded">
              <Cloud className="w-3 h-3 text-orange-400" />
              <span className="text-gray-700 dark:text-gray-300">Claude</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800/50 rounded">
              <Shield className="w-3 h-3 text-blue-400" />
              <span className="text-gray-700 dark:text-gray-300">OpenAI</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800/50 rounded">
              <DollarSign className="w-3 h-3 text-green-400" />
              <span className="text-gray-700 dark:text-gray-300">Free Local</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default ConceptQuadExplainer