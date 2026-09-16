import { motion } from 'framer-motion'
import { Activity, Cpu, GitBranch, Terminal, Users, Zap } from 'lucide-react'
import clsx from 'clsx'

const fadeInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: (index = 0) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.8,
      ease: [0.22, 0.61, 0.36, 1],
      delay: typeof index === 'number' ? index * 0.15 : 0,
    },
  }),
}

const features = [
  {
    icon: Users,
    title: 'Coordinate Multiple Agents',
    description: 'Launch and orchestrate teams of Claude Code agents that stay in sync.',
    gradient: 'from-blue-500/80 to-indigo-500/80',
  },
  {
    icon: Terminal,
    title: 'Real-Time Monitoring',
    description: 'Watch live terminal output streams as agents collaborate on code.',
    gradient: 'from-emerald-500/80 to-teal-500/80',
  },
  {
    icon: GitBranch,
    title: 'Harvest Collection',
    description: 'Automatically collect, organize, and review polished outputs.',
    gradient: 'from-violet-500/80 to-fuchsia-500/80',
  },
  {
    icon: Zap,
    title: 'Lightning Fast Launches',
    description: 'Sub-second orchestration optimized for Claude Code workflows.',
    gradient: 'from-cyan-400/80 to-blue-500/80',
  },
]

const stats = [
  { icon: Activity, value: '99.9%', label: 'Uptime' },
  { icon: Cpu, value: '10ms', label: 'Latency' },
  { icon: Users, value: 'Enterprise', label: 'Ready' },
]

interface HeroProps {
  className?: string
}

export const MaiFarmExplainerHero = ({ className }: HeroProps) => (
  <motion.section
    className={clsx('w-full max-w-2xl text-center lg:text-left', className)}
    initial="hidden"
    animate="visible"
    variants={fadeInLeft}
  >
    <motion.img
      src="/app-icon.png"
      alt="MaiFarm"
      className="mx-auto h-32 w-32 rounded-[28px] drop-shadow-2xl sm:h-40 sm:w-40"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
    />

    <motion.div className="mt-10 space-y-4" initial="hidden" animate="visible" variants={fadeInLeft} custom={0.2}>
      <p className="text-sm uppercase tracking-[0.5em] text-emerald-200">MaiFarm Platform</p>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Multi-Agent AI Orchestration</h1>
      <p className="text-lg text-white/80">
        Deploy and manage collaborative AI development teams at scale. Launch ideas, coordinate specialists, and harvest
        finished work without micromanaging every step.
      </p>
    </motion.div>

    <motion.div className="mt-12 hidden gap-6 lg:grid lg:grid-cols-2" initial="hidden" animate="visible" variants={fadeInLeft} custom={0.3}>
      {features.map((feature, index) => (
        <motion.div
          key={feature.title}
          className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
          custom={index * 0.15}
          variants={fadeInLeft}
        >
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient}`}>
            <feature.icon className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
          <p className="mt-2 text-sm text-white/70">{feature.description}</p>
        </motion.div>
      ))}
    </motion.div>

    <motion.div className="mt-12 hidden items-center gap-6 lg:flex" initial="hidden" animate="visible" variants={fadeInLeft} custom={0.5}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur"
        >
          <div className="rounded-xl bg-white/10 p-2">
            <stat.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-semibold">{stat.value}</p>
            <p className="text-xs uppercase tracking-wide text-white/70">{stat.label}</p>
          </div>
        </div>
      ))}
    </motion.div>
  </motion.section>
)

interface MobileListProps {
  className?: string
}

export const MaiFarmExplainerMobileList = ({ className }: MobileListProps) => (
  <div className={clsx('rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur', className)}>
    <h3 className="text-base font-semibold text-white">MaiFarm Explainer</h3>
    <div className="mt-6 space-y-4">
      {features.map((feature) => (
        <div key={feature.title} className="flex items-center gap-4">
          <div className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient}`}>
            <feature.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{feature.title}</p>
            <p className="text-xs text-white/70">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
)
