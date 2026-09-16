import React from 'react'
import { motion } from 'framer-motion'
import {
  Sprout,
  Users,
  Package,
  Rocket,
  ArrowRight,
  Shield,
  Cpu,
  DollarSign,
  Cloud,
  Globe,
  CheckCircle
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/common/Logo'

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.15
    }
  }
}

// Feature cards data
const features = [
  {
    icon: Users,
    title: 'Multi-Agent Orchestration',
    description: 'Launch AI agent teams that collaborate like farmhands working the fields',
    gradient: 'from-emerald-500 to-teal-500'
  },
  {
    icon: Sprout,
    title: 'Cultivate Intelligence',
    description: 'Watch your agents grow and learn as they work together on tasks',
    gradient: 'from-green-500 to-emerald-600'
  },
  {
    icon: Package,
    title: 'Harvest Results',
    description: 'Collect polished outputs, ready to use in your projects',
    gradient: 'from-teal-500 to-cyan-600'
  }
]

const aiEngines = [
  { name: 'GPT-OSS', icon: Cpu, color: 'emerald', description: 'Local, private, zero cost' },
  { name: 'Claude', icon: Globe, color: 'orange', description: 'Powerful cloud AI' },
  { name: 'OpenAI', icon: Cloud, color: 'teal', description: 'GPT-4 models' },
  { name: 'Llama', icon: Shield, color: 'blue', description: 'Open source power' }
]

export const SimplifiedWelcomeExperience: React.FC = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  // Don't auto-redirect authenticated users - they might be here for onboarding
  // Let them complete the welcome flow and click the button to proceed
  React.useEffect(() => {
    // Check if user has already completed the welcome flow
    const hasCompletedWelcome = localStorage.getItem('maifarm:welcome-page:v2') === 'viewed'
    const firstRunComplete = localStorage.getItem('maifarm:first-run-complete') === 'true'

    // Only redirect if authenticated AND already completed welcome
    if (isAuthenticated && hasCompletedWelcome && firstRunComplete) {
      navigate('/home')
    }
  }, [isAuthenticated, navigate])

  const handleGetStarted = () => {
    // Mark initialization as complete to prevent redirect loop
    localStorage.setItem('maifarm:initialized', 'true')
    localStorage.setItem('maifarm:welcome-page:v2', 'viewed')
    localStorage.setItem('maifarm:first-run-complete', 'true')

    // If user is already authenticated, go to home, otherwise to login
    if (isAuthenticated) {
      navigate('/home')
    } else {
      navigate('/login')
    }
  }

  // Animation config from login page
  const floatAnimation = {
    animate: {
      y: [0, -20, 0],
      opacity: [0.5, 0.9, 0.5],
      transition: {
        duration: 12,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white">
      {/* Ambient gradients - matching login page */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-32 top-12 h-72 w-72 rounded-full bg-emerald-500/25 blur-[140px]"
          {...floatAnimation}
        />
        <motion.div
          className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-cyan-500/20 blur-[160px]"
          {...floatAnimation}
          transition={{ ...floatAnimation.animate.transition, duration: 14, delay: 1 }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          {/* Large MaiFarm Logo - hidden on mobile */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="hidden sm:flex items-center justify-center mb-8"
          >
            <Logo
              variant="full"
              width={400}
              height={96}
              forceDefault={true}
              className="drop-shadow-2xl"
            />
          </motion.div>

          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Your AI cultivation ecosystem where intelligent agents collaborate to grow your ideas into reality
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <GlassButton
              variant="primary"
              size="lg"
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-500 hover:to-green-600 text-white font-semibold px-8 py-4 rounded-xl flex items-center justify-center gap-2"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="lg"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="border-2 border-white/20 text-white hover:bg-white/10 px-8 py-4 rounded-xl"
            >
              Learn More
            </GlassButton>
          </div>
        </motion.div>

        {/* Features Section */}
        <motion.div
          id="features"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={fadeInUp}>
              <GlassCard className="p-6 h-full hover:scale-105 transition-transform duration-300">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-white/70">{feature.description}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>

        {/* AI Engines Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            Powered by Leading AI Engines
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {aiEngines.map((engine, index) => (
              <motion.div
                key={engine.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <GlassCard className="p-4 text-center hover:scale-105 transition-transform duration-300">
                  <engine.icon className={`w-8 h-8 mx-auto mb-2 text-${engine.color}-400`} />
                  <h4 className="font-semibold text-white">{engine.name}</h4>
                  <p className="text-xs text-white/60 mt-1">{engine.description}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Benefits Section - Centered & Re-colorized */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-white text-center mb-12">Why Choose MaiFarm?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 opacity-10 rounded-xl blur-xl group-hover:opacity-20 transition-opacity"></div>
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Shield className="w-8 h-8 text-purple-400" />
                  </div>
                  <h4 className="font-bold text-white text-lg mb-2">Privacy First</h4>
                  <p className="text-white/70 text-sm leading-relaxed">Run locally or in the cloud - your choice</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 opacity-10 rounded-xl blur-xl group-hover:opacity-20 transition-opacity"></div>
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <DollarSign className="w-8 h-8 text-green-400" />
                  </div>
                  <h4 className="font-bold text-white text-lg mb-2">Cost Effective</h4>
                  <p className="text-white/70 text-sm leading-relaxed">Free local options or pay-as-you-go cloud</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-600 opacity-10 rounded-xl blur-xl group-hover:opacity-20 transition-opacity"></div>
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Rocket className="w-8 h-8 text-orange-400" />
                  </div>
                  <h4 className="font-bold text-white text-lg mb-2">Fast & Efficient</h4>
                  <p className="text-white/70 text-sm leading-relaxed">Optimized for performance and results</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-600 opacity-10 rounded-xl blur-xl group-hover:opacity-20 transition-opacity"></div>
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <CheckCircle className="w-8 h-8 text-blue-400" />
                  </div>
                  <h4 className="font-bold text-white text-lg mb-2">Production Ready</h4>
                  <p className="text-white/70 text-sm leading-relaxed">Battle-tested for real-world applications</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <GlassCard className="p-8 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4">
              Ready to Start Your AI Farming Journey?
            </h3>
            <p className="text-white/70 mb-6">
              Join thousands of developers cultivating AI solutions with MaiFarm
            </p>
            <GlassButton
              variant="primary"
              size="lg"
              onClick={handleGetStarted}
              className="bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-500 hover:to-green-600 text-white font-semibold px-8 py-4 rounded-xl inline-flex items-center gap-2"
            >
              Create Your Account
              <ArrowRight className="w-5 h-5" />
            </GlassButton>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}

export default SimplifiedWelcomeExperience