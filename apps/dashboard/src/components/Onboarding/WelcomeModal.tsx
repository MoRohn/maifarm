import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Sprout,
  Zap,
  Trees,
  BarChart3,
  CheckCircle2,
  ShieldCheck,
  Palette,
  Moon,
  Sun,
  Monitor,
  Wifi,
  WifiOff,
  ArrowRight
} from 'lucide-react'
import clsx from 'clsx'
import { useThemeStore } from '@/store/themeStore'
import { COLOR_SCHEMES } from '@/types/theme'
import { Logo } from '@/components/common/Logo'

type WelcomeAction = 'new-farm' | 'quick-task' | 'go-wild' | 'analytics'

type DismissReason = 'skip' | 'complete'

interface WelcomeModalProps {
  open: boolean
  onDismiss: (reason: DismissReason) => void
  onAction?: (action: WelcomeAction) => void
  userName?: string
  stats?: {
    activeFarms?: number
    totalAgents?: number
    harvestsCompleted?: number
  }
  isConnected?: boolean
}

type Step = {
  id: 'intro' | 'actions' | 'personalize'
  title: string
  description: string
  accent: string
}

const steps: Step[] = [
  {
    id: 'intro',
    title: 'Plant the seeds for your next breakthrough',
    description: 'MaiFarm orchestrates multi-agent workflows so you can launch ideas, coordinate specialists, and harvest finished work without micromanaging every step.',
    accent: 'from-primary-500/20 via-emerald-400/15 to-sky-400/10'
  },
  {
    id: 'actions',
    title: 'Choose where to start',
    description: 'Jump straight into a collaborative farm, spin up a focused task, or let your agents explore new concepts autonomously.',
    accent: 'from-amber-400/15 via-rose-400/10 to-sky-400/15'
  },
  {
    id: 'personalize',
    title: 'Make the workspace yours',
    description: 'Tune themes and colors to match your flow. You can always fine-tune more details from Settings later.',
    accent: 'from-purple-500/15 via-sky-500/10 to-emerald-400/10'
  }
]

const quickStartActions: Array<{
  id: WelcomeAction
  title: string
  description: string
  icon: React.ElementType
  accent: string
}> = [
  {
    id: 'new-farm',
    title: 'Plan a new farm',
    description: 'Design a multi-agent workflow with the Farm Architect and launch in minutes.',
    icon: Sprout,
    accent: 'from-emerald-400 to-emerald-600'
  },
  {
    id: 'quick-task',
    title: 'Run a quick task',
    description: 'Give a focused agent clear instructions and harvest a fast deliverable.',
    icon: Zap,
    accent: 'from-sky-400 to-cyan-500'
  },
  {
    id: 'go-wild',
    title: 'Explore with Go Wild',
    description: 'Let agents ideate freely, gather context, and report back with creative approaches.',
    icon: Trees,
    accent: 'from-orange-400 to-pink-500'
  },
  {
    id: 'analytics',
    title: 'Check the analytics',
    description: 'Review farm insights and performance trends in the analytics dashboard.',
    icon: BarChart3,
    accent: 'from-purple-400 to-indigo-500'
  }
]

const featuredColorIds = new Set(['forest-walk', 'sunset-glow', 'ocean-breeze'])

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  open,
  onDismiss,
  onAction,
  userName,
  stats,
  isConnected = true
}) => {
  const [stepIndex, setStepIndex] = useState(0)
  const { theme, colorScheme, setTheme, setColorScheme } = useThemeStore()

  useEffect(() => {
    if (open) {
      setStepIndex(0)
    }
  }, [open])

  const currentStep = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  const metricCards = useMemo(() => (
    [
      {
        label: 'Active farms',
        value: stats?.activeFarms ?? 0,
        accent: 'from-emerald-400 to-emerald-500'
      },
      {
        label: 'Agents collaborating',
        value: stats?.totalAgents ?? 0,
        accent: 'from-sky-400 to-sky-500'
      },
      {
        label: 'Harvests completed',
        value: stats?.harvestsCompleted ?? 0,
        accent: 'from-amber-400 to-amber-500'
      }
    ]
  ), [stats?.activeFarms, stats?.totalAgents, stats?.harvestsCompleted])

  const connectionIndicator = isConnected
    ? { icon: Wifi, label: 'Real-time connection live', tone: 'text-emerald-500' }
    : { icon: WifiOff, label: 'Offline — we will retry automatically', tone: 'text-rose-500' }

  const colorOptions = useMemo(
    () => COLOR_SCHEMES.filter((scheme) => featuredColorIds.has(scheme.id)),
    []
  )

  const handleAction = (action: WelcomeAction) => {
    onAction?.(action)
    onDismiss('complete')
  }

  const handleNext = () => {
    if (isLastStep) {
      onDismiss('complete')
      return
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const handleBack = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center px-4 py-8"
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 32px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
            paddingLeft: 'max(env(safe-area-inset-left), 16px)',
            paddingRight: 'max(env(safe-area-inset-right), 16px)'
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur"
            onClick={() => onDismiss('skip')}
          />

          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ type: 'spring', damping: 24, stiffness: 240 }}
            className="relative z-[310] w-full max-w-7xl overflow-hidden rounded-[28px] border border-white/10 bg-white/98 shadow-[0_48px_140px_rgba(15,23,42,0.35)] dark:border-slate-700/60 dark:bg-slate-950/94"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div
                className={clsx(
                  'absolute inset-0 opacity-80 blur-2xl',
                  'bg-gradient-to-br',
                  currentStep.accent
                )}
              />
              <div className="absolute top-10 right-10 h-32 w-32 rounded-full bg-white/15 blur-3xl dark:bg-white/5" />
            </div>

            <div className="relative grid gap-12 p-10 md:grid-cols-[340px,1fr] md:p-14">
              <div className="space-y-6">
                <div className="flex justify-center md:justify-start mb-4">
                  <Logo variant="icon" width={80} height={80} forceDefault={true} />
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-slate-600 shadow-sm dark:bg-slate-900/60 dark:text-slate-300">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Welcome tour</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
                    Step {stepIndex + 1} of {steps.length}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {userName ? `Hi ${userName.split(' ')[0]},` : 'Hi there,'}
                  </h2>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                    {currentStep.title}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {currentStep.description}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {steps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setStepIndex(index)}
                      className={clsx(
                        'h-2 w-12 rounded-full transition-all duration-200',
                        index === stepIndex
                          ? 'bg-slate-900/80 dark:bg-white'
                          : 'bg-slate-400/30 hover:bg-slate-400/50 dark:bg-slate-600/50 dark:hover:bg-slate-500/70'
                      )}
                      aria-label={`Go to ${step.title}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
                {currentStep.id === 'intro' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-3">
                      {metricCards.map((metric) => (
                        <div
                          key={metric.label}
                          className={clsx(
                            'rounded-2xl border border-white/50 bg-white/80 p-4 shadow-sm backdrop-blur',
                            'dark:border-slate-700/70 dark:bg-slate-900/80'
                          )}
                        >
                          <div className={clsx('inline-flex items-center rounded-full bg-gradient-to-r px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white', metric.accent)}>
                            {metric.label}
                          </div>
                          <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                            {metric.value}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {metric.label === 'Active farms' && 'Currently running'}
                            {metric.label === 'Agents collaborating' && 'Ready to coordinate'}
                            {metric.label === 'Harvests completed' && 'Deliverables shipped'}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80">
                      <div className={clsx('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium shadow-sm', isConnected ? 'bg-emerald-400/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-rose-400/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-200')}>
                        {React.createElement(connectionIndicator.icon, { className: 'h-3.5 w-3.5' })}
                        <span>{connectionIndicator.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span>Secure workspace with orchestrated agent governance</span>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep.id === 'actions' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {quickStartActions.map((action) => {
                      const Icon = action.icon
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleAction(action.id)}
                          className="group flex h-full flex-col justify-between rounded-2xl border border-white/50 bg-white/80 p-5 text-left shadow-sm transition-colors hover:border-white hover:bg-white/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700/70 dark:bg-slate-900/80 dark:hover:border-slate-500"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className={clsx('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg shadow-slate-900/10', action.accent)}>
                              <Icon className="h-6 w-6" />
                            </div>
                            <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" />
                          </div>
                          <div className="mt-4 space-y-2">
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                              {action.title}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {action.description}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {currentStep.id === 'personalize' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Theme mode
                      </h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {[
                          { id: 'light' as const, label: 'Light', icon: Sun, preview: 'from-white to-amber-50', description: 'Great for daytime reviews' },
                          { id: 'dark' as const, label: 'Dark', icon: Moon, preview: 'from-slate-900 to-slate-800', description: 'Ideal for late-night harvesting' },
                          { id: 'system' as const, label: 'System', icon: Monitor, preview: 'from-white to-slate-900', description: 'Follow your OS preference' }
                        ].map((option) => {
                          const Icon = option.icon
                          const isActive = theme === option.id
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setTheme(option.id)}
                              className={clsx(
                                'flex flex-col rounded-2xl border p-4 text-left transition-all',
                                isActive
                                  ? 'border-primary-400/80 bg-primary-50/70 shadow-sm dark:border-primary-400/40 dark:bg-primary-500/10'
                                  : 'border-white/50 bg-white/80 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-900/70 dark:hover:border-slate-500'
                              )}
                            >
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                <Icon className="h-4 w-4" />
                                <span>{option.label}</span>
                              </div>
                              <div className={clsx('mt-4 h-16 rounded-xl bg-gradient-to-br shadow-inner', option.preview)} />
                              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{option.description}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Color palette
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Pick a mood now or dive deeper in Settings → Appearance later.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {colorOptions.map((scheme) => (
                          <button
                            key={scheme.id}
                            type="button"
                            onClick={() => setColorScheme(scheme)}
                            className={clsx(
                              'flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                              colorScheme.id === scheme.id
                                ? 'border-primary-400/70 bg-primary-500/10 shadow-sm'
                                : 'border-white/50 bg-white/80 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-slate-500'
                            )}
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                              <Palette className="h-4 w-4 text-primary" />
                              <span>{scheme.name}</span>
                            </div>
                            <div className="flex w-full gap-2">
                              <span className="h-8 flex-1 rounded-full" style={{ background: scheme.primary }} />
                              <span className="h-8 flex-1 rounded-full" style={{ background: scheme.accent }} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Primary {scheme.primary} · Accent {scheme.accent}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/80 px-4 py-3 text-xs text-slate-500 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>Need more? Visit Settings → Appearance for advanced customization.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-white/40 bg-white/70 px-6 py-4 text-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70 md:flex-row md:items-center md:justify-between md:px-10">
              <button
                type="button"
                onClick={() => onDismiss('skip')}
                className="text-xs font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Skip for now
              </button>

              <div className="flex items-center gap-3">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="rounded-full border border-slate-200/60 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700/60 dark:text-slate-300 dark:hover:border-slate-500"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90"
                >
                  {isLastStep ? 'Finish' : 'Next'}
                  {!isLastStep && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type { WelcomeAction, DismissReason as WelcomeDismissReason }
