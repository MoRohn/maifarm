import React, { useState, useEffect } from 'react';
import {
  Github,
  Globe,
  ExternalLink,
  Shield,
  FileText,
  Users,
  Terminal,
  GitBranch,
  Zap,
  Activity,
  Cpu,
  Package,
  Sprout,
  Heart,
  Code,
  Database,
  Cloud,
  BookOpen,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { ConceptQuadExplainer } from '../Dashboard/ConceptQuadExplainer';
import { Logo } from '@/components/common/Logo';
import { useThemeStore } from '@/store/themeStore';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const AboutSettings: React.FC = () => {
  const [showConcepts, setShowConcepts] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme } = useThemeStore();

  // Force re-render after theme is applied to prevent flash
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until theme is fully applied to prevent theme flash
  if (!mounted) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const version = '2.0.0';
  const buildDate = '2024-02-15';
  const buildNumber = '2024.02.15.001';

  const coreFeatures = [
    {
      icon: Users,
      title: 'Multi-Agent Orchestration',
      description: 'Deploy and coordinate teams of AI agents working collaboratively on complex tasks',
      gradient: 'from-blue-500 to-indigo-500'
    },
    {
      icon: Terminal,
      title: 'Real-Time Terminal Streaming',
      description: 'Watch live output as agents execute commands with sub-10ms latency',
      gradient: 'from-emerald-500 to-teal-500'
    },
    {
      icon: GitBranch,
      title: 'Harvest Collection',
      description: 'Automatically collect, organize, and review polished outputs from agent workflows',
      gradient: 'from-violet-500 to-fuchsia-500'
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Sub-second farm launches with optimized WebSocket delivery and state management',
      gradient: 'from-yellow-400 to-orange-500'
    },
    {
      icon: Shield,
      title: 'Secure by Design',
      description: 'Isolated workspaces, encrypted API keys, and comprehensive audit logging',
      gradient: 'from-red-500 to-pink-500'
    },
    {
      icon: Package,
      title: 'Multiple AI Providers',
      description: 'Support for Claude, OpenAI, GPT-OSS, and local models with hot-swapping',
      gradient: 'from-cyan-500 to-blue-500'
    }
  ];

  const architecture = [
    {
      icon: Code,
      title: 'Modern Tech Stack',
      description: 'React 18, TypeScript, Vite, Express, PostgreSQL, Redis, Socket.io',
    },
    {
      icon: Database,
      title: 'Production-Grade',
      description: 'Event outbox pattern, circuit breakers, distributed tracing, auto-recovery',
    },
    {
      icon: Cloud,
      title: 'Flexible Deployment',
      description: 'Run locally, on-premise, or in the cloud with Docker/PM2 support',
    }
  ];

  const stats = [
    { icon: Activity, value: '99.9%', label: 'Event Delivery' },
    { icon: Cpu, value: '<10ms', label: 'Terminal Latency' },
    { icon: Zap, value: '<500ms', label: 'Farm Launch' },
  ];

  return (
    <motion.div
      key={`about-settings-${theme}`}
      className="space-y-6"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Hero Section with Logo */}
      <motion.div variants={fadeInUp}>
        <GlassCard className="p-8 text-center bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-900/20 dark:to-teal-900/20">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center mb-6"
          >
            <Logo
              variant="full"
              width={400}
              height={96}
              forceDefault={true}
              className="drop-shadow-2xl"
            />
          </motion.div>
        </GlassCard>
      </motion.div>

      {/* Performance Stats */}
      <motion.div variants={fadeInUp} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <GlassCard key={stat.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 p-3">
                <stat.icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </motion.div>

      {/* What is MaiFarm */}
      <motion.div variants={fadeInUp}>
        <GlassCard className="p-6">
          <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Sprout className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            What is MaiFarm?
          </h4>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            MaiFarm is a production-grade orchestration platform for deploying and managing teams of AI agents working collaboratively on complex software development tasks.
          </p>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            The name combines <span className="font-semibold text-emerald-600 dark:text-emerald-400">"Mai"</span> (My + AI) and <span className="font-semibold text-emerald-600 dark:text-emerald-400">"Farm"</span> — representing an ecosystem where specialized agents cultivate ideas, coordinate workflows, and harvest polished outputs without micromanagement.
          </p>
        </GlassCard>
      </motion.div>

      {/* MaiFarm Core Concepts - Collapsible */}
      <motion.div variants={fadeInUp}>
        <GlassCard className="p-6 bg-gradient-to-br from-indigo-50/30 to-purple-50/30 dark:from-indigo-900/10 dark:to-purple-900/10">
          <button
            onClick={() => setShowConcepts(!showConcepts)}
            className="w-full flex items-center justify-between text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 p-3 group-hover:from-indigo-500/30 group-hover:to-purple-500/30 transition-colors">
                <BookOpen className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white">
                  MaiFarm Core Concepts
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Learn about Farms, Seeds, Harvests, and the Barn
                </p>
              </div>
            </div>
            <motion.div
              animate={{ rotate: showConcepts ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </motion.div>
          </button>

          <motion.div
            initial={false}
            animate={{
              height: showConcepts ? 'auto' : 0,
              opacity: showConcepts ? 1 : 0
            }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pt-6">
              <ConceptQuadExplainer />
            </div>
          </motion.div>
        </GlassCard>
      </motion.div>

      {/* Core Features Grid */}
      <motion.div variants={fadeInUp}>
        <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Core Features
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coreFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={fadeInUp}
              custom={index}
            >
              <GlassCard className="p-6 h-full hover:shadow-lg transition-shadow duration-300">
                <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} mb-4 shadow-lg`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h5 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h5>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Architecture & Tech Stack */}
      <motion.div variants={fadeInUp}>
        <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Architecture & Technology
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {architecture.map((item) => (
            <GlassCard key={item.title} className="p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-gradient-to-br from-gray-500/20 to-gray-600/20 p-2.5">
                  <item.icon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </div>
                <div>
                  <h5 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {item.title}
                  </h5>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </motion.div>

      {/* Team Section */}
      <motion.div variants={fadeInUp}>
        <GlassCard className="p-6 bg-gradient-to-br from-purple-50/30 to-pink-50/30 dark:from-purple-900/10 dark:to-pink-900/10">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-6 w-6 text-pink-600 dark:text-pink-400" />
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white">
              Built with Love
            </h4>
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
            A collaborative effort of AI agents and humans working together to create the future of multi-agent orchestration. MaiFarm dogfoods its own platform — agents build features, review code, write docs, and optimize performance.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              'Architecture',
              'UI/UX Design',
              'Backend Systems',
              'Security',
              'Performance',
              'Testing',
              'Documentation',
              'DevOps'
            ].map((role) => (
              <span
                key={role}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium"
              >
                {role}
              </span>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* CLI Reference */}
      <motion.div variants={fadeInUp}>
        <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Terminal className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          Command Line Interface
        </h4>
        <GlassCard className="p-6 bg-gradient-to-br from-purple-50/30 to-indigo-50/30 dark:from-purple-900/10 dark:to-indigo-900/10">
          <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
            MaiFarm includes a powerful CLI for managing farms from your terminal. Install globally for quick access.
          </p>

          {/* Installation */}
          <div className="mb-6">
            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Installation</h5>
            <div className="space-y-2">
              <code className="block px-4 py-2 bg-gray-900 dark:bg-black text-green-400 rounded-lg font-mono text-xs">
                ./install-farm-command.sh
              </code>
              <p className="text-xs text-gray-500 dark:text-gray-400">or</p>
              <code className="block px-4 py-2 bg-gray-900 dark:bg-black text-green-400 rounded-lg font-mono text-xs">
                npm run cli:install
              </code>
            </div>
          </div>

          {/* Core Commands */}
          <div className="space-y-3">
            <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Commands</h5>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1">
                  farm create "My Project"
                </code>
                <span className="text-xs text-gray-500 dark:text-gray-400">Create multi-agent farm</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1">
                  farm quick "Fix bug"
                </code>
                <span className="text-xs text-gray-500 dark:text-gray-400">5-minute focused task</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1">
                  farm wild "Explore ideas"
                </code>
                <span className="text-xs text-gray-500 dark:text-gray-400">Autonomous exploration</span>
              </div>
            </div>

            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mt-4">Management</h5>
            <div className="grid grid-cols-2 gap-2">
              <code className="block px-3 py-2 bg-white/50 dark:bg-gray-800/50 rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300">
                farm start
              </code>
              <code className="block px-3 py-2 bg-white/50 dark:bg-gray-800/50 rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300">
                farm stop
              </code>
              <code className="block px-3 py-2 bg-white/50 dark:bg-gray-800/50 rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300">
                farm restart
              </code>
              <code className="block px-3 py-2 bg-white/50 dark:bg-gray-800/50 rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300">
                farm status
              </code>
            </div>
          </div>

          {/* Note */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              <strong>Tip:</strong> Use <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded font-mono">farm --help</code> to see all available commands and options.
            </p>
          </div>
        </GlassCard>
      </motion.div>

      {/* Resources */}
      <motion.div variants={fadeInUp}>
        <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Resources & Links
        </h4>
        <GlassCard className="p-6">
          <div className="space-y-2">
            <a
              href="https://docs.maifarm.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2 group-hover:bg-blue-500/20 transition-colors">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Documentation</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Complete guides and API reference</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
            </a>
            <a
              href="https://github.com/maifarm/maifarm"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gray-500/10 p-2 group-hover:bg-gray-500/20 transition-colors">
                  <Github className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">GitHub Repository</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Source code and contributions</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
            </a>
            <a
              href="https://maifarm.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 group-hover:bg-emerald-500/20 transition-colors">
                  <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Official Website</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Learn more about MaiFarm</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
            </a>
          </div>
        </GlassCard>
      </motion.div>

      {/* Legal & Copyright */}
      <motion.div variants={fadeInUp} className="pt-4">
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-3">
          <p className="flex items-center justify-center gap-2">
            © 2024 MaiFarm Platform
            <span className="text-xs">•</span>
            <span className="text-xs">Open Source Software</span>
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href="#" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Privacy Policy
            </a>
            <span>•</span>
            <a href="#" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Terms of Service
            </a>
            <span>•</span>
            <a href="#" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              MIT License
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AboutSettings;