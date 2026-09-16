import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sprout,
  Users,
  Package,
  Rocket,
  ArrowRight,
  Check,
  Zap,
  Shield,
  Cpu,
  DollarSign,
  Cloud,
  Globe
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { cn } from '@/utils/cn'
import { useAuth } from '@/hooks/useAuth'
import { useUserStore } from '@/store/userStore'
import { toast } from 'react-hot-toast'
import { AutoModelSetupWizard } from './AutoModelSetupWizard'
import { useHardwareStore } from '@/store/hardwareStore'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { authService } from '@/services/auth'
import safeLocalStorage from '@/utils/safeLocalStorage'
import { OnboardingProgressBar } from './OnboardingProgressBar'
import { MaiFarmExplainerHero, MaiFarmExplainerMobileList } from './MaiFarmExplainer'

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

// Feature cards data
const features = [
  {
    icon: Users,
    title: 'Plant Your Farm',
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

interface WelcomeExperienceProps {
  isFirstRun?: boolean
  onComplete?: () => void
}

export const WelcomeExperience: React.FC<WelcomeExperienceProps> = ({
  isFirstRun = true,
  onComplete
}) => {
  console.log('[WELCOME_EXPERIENCE] Component rendering started');

  const navigate = useNavigate()
  const { register, login } = useAuth()
  const { updatePreferences } = useUserStore()
  const { isInstalled: isGptOssInstalled, checkInstallationStatus } = useHardwareStore()

  console.log('[WELCOME_EXPERIENCE] Hooks initialized successfully');

  const [showSetup, setShowSetup] = useState(true)
  const [showModelSetup, setShowModelSetup] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    password: ''
  })
  const [currentStep, setCurrentStep] = useState(0)

  // Define onboarding steps
  const onboardingSteps = [
    { id: 'welcome', label: 'Welcome', completed: false, current: true },
    { id: 'account', label: 'Create Account', completed: false, current: false },
    { id: 'ai-setup', label: 'Configure AI', completed: false, current: false },
    { id: 'preferences', label: 'Set Preferences', completed: false, current: false },
    { id: 'complete', label: 'Complete', completed: false, current: false }
  ]

  const [steps, setSteps] = useState(onboardingSteps)

  const isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development'
  const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true' || isDevelopment

  // Update progress when steps change
  const updateProgress = (stepIndex: number) => {
    setCurrentStep(stepIndex)
    setSteps(prevSteps =>
      prevSteps.map((step, index) => ({
        ...step,
        completed: index < stepIndex,
        current: index === stepIndex
      }))
    )
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.set('maifarm:welcome-page:v2', 'viewed')
    }
    // Check if GPT-OSS is already installed
    checkInstallationStatus()
  }, [checkInstallationStatus])

  const handleGetStarted = () => {
    // Always show setup form to allow user creation
    setShowSetup(true)
    updateProgress(1) // Move to Create Account step
  }

  const handleQuickStart = async () => {
    setIsLoading(true)

    try {
      if (!userData.email) {
        toast.error('Please enter an email address')
        setIsLoading(false)
        return
      }

      const usingPassword = Boolean(userData.password)

      console.log('[Setup] Starting user registration...')

      // Register user with the backend
      await register({
        name: userData.name || userData.email.split('@')[0],
        email: userData.email,
        password: userData.password || undefined,
        authMode: usingPassword ? 'password' : 'passwordless'
      }, { redirectTo: null })

      console.log('[Setup] Registration successful, verifying authentication...')

      // Wait a moment for token storage to complete and verify authentication
      // This ensures localStorage operations are complete
      await new Promise(resolve => setTimeout(resolve, 100))

      // Double-check authentication with a retry mechanism
      let authVerified = authService.isAuthenticated()
      if (!authVerified) {
        // Try refreshing the auth state once more
        authService.loadTokensFromStorage()
        authVerified = authService.isAuthenticated()
      }

      if (!authVerified) {
        console.warn('[Setup] Authentication state mismatch detected, but registration was successful')
        // Instead of throwing an error, we can proceed since registration succeeded
        // The tokens were saved by authService.register() and the user is logged in
      }

      console.log('[Setup] User authenticated, preparing preferences...')

      // Prepare user preferences for backend
      const userPreferences = {
        theme: 'dark',
        notifications: {
          enabled: true,
          sound: true,
          desktop: true,
          email: {
            enabled: false,
            address: userData.email,
            frequency: 'immediate'
          },
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00'
          },
          types: {
            farmStart: { enabled: true, channels: { email: false, push: true, inApp: true } },
            farmComplete: { enabled: true, channels: { email: true, push: true, inApp: true } },
            agentError: { enabled: true, channels: { email: false, push: true, inApp: true } },
            resourceAlert: { enabled: true, channels: { email: false, push: false, inApp: true } },
            aiDiscovery: { enabled: true, channels: { email: false, push: true, inApp: true } }
          }
        },
        language: 'en',
        aiSettings: {
          suggestionLevel: 'moderate',
          autoOptimize: true
        },
        aiProvider: 'gpt-oss'
      }

      // Save preferences to frontend store immediately
      updatePreferences(userPreferences)

      // Store preferences in state for later atomic save with setup completion
      setUserData(prev => ({ ...prev, preferences: userPreferences }))

      if (!usingPassword) {
        toast.success('Account created! Passwordless login enabled.')
      } else {
        toast.success('Account created successfully!')
      }

      safeLocalStorage.set('maifarm:initialized', 'true')
      safeLocalStorage.set('maifarm:first-run-complete', 'true')

      // Update progress to AI setup or preferences based on GPT-OSS status
      if (!isGptOssInstalled) {
        updateProgress(2) // Move to Configure AI step
      } else {
        updateProgress(3) // Skip to Set Preferences step
      }

      if (!isGptOssInstalled) {
        console.log('[Setup] GPT-OSS not installed, showing model setup wizard...')
        // Show model setup wizard within the same component context
        setShowModelSetup(true)
        setShowSetup(false)
        return
      }

      console.log('[Setup] Completing setup and navigating to dashboard...')
      await handleComplete()
    } catch (error) {
      console.error('[Setup] Registration error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Registration failed'
      toast.error(`Registration failed: ${errorMessage}`)

      if (errorMessage.toLowerCase().includes('already exists')) {
        try {
          toast('Account already exists. Signing you in...', { icon: '🔐' })
          await login({
            email: userData.email,
            password: userData.password || '',
            rememberMe: true
          }, { redirectTo: null })
          await handleComplete()
          return
        } catch (loginError) {
          console.error('[Setup] Auto-login after duplicate account failed:', loginError)
          toast.error('Account already exists. Please sign in from the login page.')
          setTimeout(() => navigate('/'), 1500)
        }
      }

      // If it's an authentication error after successful registration, still navigate
      if (errorMessage.includes('authentication failed')) {
        console.warn('[Setup] Post-registration auth error, navigating to login')
        toast.info('Please log in with your new account')
        setTimeout(() => navigate('/'), 2000)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSkip = async () => {
    safeLocalStorage.set('maifarm:initialized', 'true')
    safeLocalStorage.set('maifarm:skipped-setup', 'true')

    if (bypassAuth) {
      safeLocalStorage.set('maifarm:auth-bypass', 'true')
    }

    toast.success('Setup skipped - you can configure settings later')
    await handleComplete()
  }

  const handleComplete = async () => {
    try {
      updateProgress(4) // Move to Complete step

      // Verify we're authenticated before attempting to complete setup
      if (!authService.isAuthenticated()) {
        console.warn('[Setup] User not authenticated, skipping setup completion timestamp update')
        // User was just registered, so navigate anyway - setup_completed_at is optional
        toast.success('Welcome to MaiFarm! You can complete setup later in Settings.')
        navigate('/')
        onComplete?.()
        return
      }

      // Atomically save preferences and mark setup as complete
      // Use preferences from userData state if available
      const preferences = (userData as any).preferences

      console.log('[Setup] Completing setup with atomic preferences save...')
      await authService.completeSetup(preferences)

      toast.success('Setup complete! Welcome to MaiFarm!')
      navigate('/home')
      onComplete?.()
    } catch (error) {
      console.error('[Setup] Failed to complete setup atomically:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete setup'

      // Ask user if they want to retry or continue
      const shouldContinue = window.confirm(
        'Failed to save your settings. Would you like to continue anyway?\n\n' +
        'Click OK to continue (you can update settings later)\n' +
        'Click Cancel to try again'
      )

      if (shouldContinue) {
        console.warn('[Setup] User chose to continue despite setup error')
        toast.success('Welcome to MaiFarm! You can update settings later.')
        navigate('/home')
        onComplete?.()
      } else {
        // User wants to retry - just return to let them try again
        toast.error('Please try again')
      }
    }
  }

  const handleModelSetupComplete = async () => {
    safeLocalStorage.set('maifarm:first-run-complete', 'true')
    toast.success('GPT-OSS model setup complete! 🎉')
    updateProgress(3) // Move to Set Preferences step
    await handleComplete()
  }

  const handleModelSetupSkip = async () => {
    safeLocalStorage.set('maifarm:skipped-model-setup', 'true')
    safeLocalStorage.set('maifarm:first-run-complete', 'true')
    toast.success('You can set up GPT-OSS later in Settings')
    updateProgress(3) // Move to Set Preferences step
    await handleComplete()
  }

  // Render both setup and wizard in the same tree to maintain React context
  return (
    <ErrorBoundary>
      {/* Model Setup Wizard - shown after registration */}
      {showModelSetup && (
        <AutoModelSetupWizard
          onComplete={handleModelSetupComplete}
          onSkip={handleModelSetupSkip}
        />
      )}

      {/* Main Setup Form - shown initially */}
      {showSetup && (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white">
        {/* Ambient gradients */}
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

        {/* Progress Bar */}
        <div className="relative z-20 pt-8">
          <OnboardingProgressBar steps={steps} currentStep={currentStep} />
        </div>

        {/* Setup Form */}
        <div className="relative z-10 mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-8">
            <MaiFarmExplainerHero className="text-center lg:text-left" />
            <div className="mt-8 lg:hidden">
              <MaiFarmExplainerMobileList />
            </div>
          </div>

          <GlassCard className="p-8">
            <div className="space-y-6">
              {/* Name field */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  User Name
                </label>
                <input
                  type="text"
                  placeholder="Farm Owner"
                  value={userData.name}
                  onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-black/80 placeholder-white/50 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Email field */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="farmer@example.com"
                  value={userData.email}
                  onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-black/80 placeholder-white/50 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Password Section with Toggle */}
              <div>
                {!showPassword ? (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white mb-1">Passwordless Login (Default)</p>
                        <p className="text-xs text-white/70">
                          Added security for your MaiFarm application if necessary.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPassword(true)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm font-medium text-black/80 transition-colors whitespace-nowrap"
                      >
                        Add Password
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-white/90">
                        Password (Optional)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(false)
                          setUserData({ ...userData, password: '' })
                        }}
                        className="text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                      >
                        Use passwordless instead
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={userData.password}
                      onChange={(e) => setUserData({ ...userData, password: e.target.value })}
                      className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-xl text-black/80 placeholder-white/50 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <p className="text-xs text-white/60 mt-2">
                      Minimum 8 characters recommended
                    </p>
                  </div>
                )}
              </div>

              {/* AI Engine Options - Compact */}
              <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="h-5 w-5 text-emerald-300" />
                  <h3 className="font-bold text-white">AI Engine Options</h3>
                </div>

                <div className="space-y-3">
                  {/* Local */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-3 w-3 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-300">Local</span>
                      <span className="text-xs text-white/50">• Private • Zero Cost</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-2 py-1.5 text-center group hover:bg-emerald-500/30 transition-colors cursor-pointer">
                        <div className="h-6 w-6 mx-auto mb-1 rounded bg-white/10 backdrop-blur-sm p-0 flex items-center justify-center overflow-hidden">
                          <svg viewBox="0 0 158.7128 157.296" fill="none" className="w-full h-full scale-150">
                            <path d="M60.8734,57.2556v-14.9432c0-1.2586.4722-2.2029,1.5728-2.8314l30.0443-17.3023c4.0899-2.3593,8.9662-3.4599,13.9988-3.4599,18.8759,0,30.8307,14.6289,30.8307,30.2006,0,1.1007,0,2.3593-.158,3.6178l-31.1446-18.2467c-1.8872-1.1006-3.7754-1.1006-5.6629,0l-39.4812,22.9651ZM131.0276,115.4561v-35.7074c0-2.2028-.9446-3.7756-2.8318-4.8763l-39.481-22.9651,12.8982-7.3934c1.1007-.6285,2.0453-.6285,3.1458,0l30.0441,17.3024c8.6523,5.0341,14.4708,15.7296,14.4708,26.1107,0,11.9539-7.0769,22.965-18.2461,27.527v.0021ZM51.593,83.9964l-12.8982-7.5497c-1.1007-.6285-1.5728-1.5728-1.5728-2.8314v-34.6048c0-16.8303,12.8982-29.5722,30.3585-29.5722,6.607,0,12.7403,2.2029,17.9324,6.1349l-30.987,17.9324c-1.8871,1.1007-2.8314,2.6735-2.8314,4.8764v45.6159l-.0014-.0015ZM79.3562,100.0403l-18.4829-10.3811v-22.0209l18.4829-10.3811,18.4812,10.3811v22.0209l-18.4812,10.3811ZM91.2319,147.8591c-6.607,0-12.7403-2.2031-17.9324-6.1344l30.9866-17.9333c1.8872-1.1005,2.8318-2.6728,2.8318-4.8759v-45.616l13.0564,7.5498c1.1005.6285,1.5723,1.5728,1.5723,2.8314v34.6051c0,16.8297-13.0564,29.5723-30.5147,29.5723v.001ZM53.9522,112.7822l-30.0443-17.3024c-8.652-5.0343-14.471-15.7296-14.471-26.1107,0-12.1119,7.2356-22.9652,18.403-27.5272v35.8634c0,2.2028.9443,3.7756,2.8314,4.8763l39.3248,22.8068-12.8982,7.3938c-1.1007.6287-2.045.6287-3.1456,0ZM52.2229,138.5791c-17.7745,0-30.8306-13.3713-30.8306-29.8871,0-1.2585.1578-2.5169.3143-3.7754l30.987,17.9323c1.8871,1.1005,3.7757,1.1005,5.6628,0l39.4811-22.807v14.9435c0,1.2585-.4721,2.2021-1.5728,2.8308l-30.0443,17.3025c-4.0898,2.359-8.9662,3.4605-13.9989,3.4605h.0014ZM91.2319,157.296c19.0327,0,34.9188-13.5272,38.5383-31.4594,17.6164-4.562,28.9425-21.0779,28.9425-37.908,0-11.0112-4.719-21.7066-13.2133-29.4143.7867-3.3035,1.2595-6.607,1.2595-9.909,0-22.4929-18.2471-39.3247-39.3251-39.3247-4.2461,0-8.3363.6285-12.4262,2.045-7.0792-6.9213-16.8318-11.3254-27.5271-11.3254-19.0331,0-34.9191,13.5268-38.5384,31.4591C11.3255,36.0212,0,52.5373,0,69.3675c0,11.0112,4.7184,21.7065,13.2125,29.4142-.7865,3.3035-1.2586,6.6067-1.2586,9.9092,0,22.4923,18.2466,39.3241,39.3248,39.3241,4.2462,0,8.3362-.6277,12.426-2.0441,7.0776,6.921,16.8302,11.3251,27.5271,11.3251Z"
                                  fill="rgb(16, 163, 127)"/>
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-emerald-100">GPT-OSS ✓</p>
                      </div>
                      <div className="flex-1 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-1.5 text-center group hover:bg-blue-500/20 transition-colors cursor-pointer">
                        <div className="h-6 w-6 mx-auto mb-1 rounded bg-white/10 backdrop-blur-sm p-0.5 flex items-center justify-center">
                          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
                            <path d="M35 25 Q30 20 25 25 L25 35 Q25 40 30 40 L35 40 Z" fill="url(#llamaGradCompact1)" opacity="0.9"/>
                            <path d="M65 25 Q70 20 75 25 L75 35 Q75 40 70 40 L65 40 Z" fill="url(#llamaGradCompact1)" opacity="0.9"/>
                            <ellipse cx="50" cy="50" rx="28" ry="32" fill="url(#llamaGradCompact2)"/>
                            <path d="M35 48 Q50 42 65 48 Q65 58 50 62 Q35 58 35 48 Z" fill="url(#llamaGradCompact3)"/>
                            <circle cx="40" cy="45" r="3" fill="#ffffff"/>
                            <circle cx="60" cy="45" r="3" fill="#ffffff"/>
                            <path d="M45 55 Q50 58 55 55" stroke="url(#llamaGradCompact1)" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            <defs>
                              <linearGradient id="llamaGradCompact1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#0081fb" />
                                <stop offset="100%" stopColor="#0064e0" />
                              </linearGradient>
                              <linearGradient id="llamaGradCompact2" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#0095ff" />
                                <stop offset="100%" stopColor="#0064e0" />
                              </linearGradient>
                              <linearGradient id="llamaGradCompact3" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#66b3ff" />
                                <stop offset="100%" stopColor="#3399ff" />
                              </linearGradient>
                            </defs>
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-blue-200">Llama</p>
                      </div>
                    </div>
                  </div>

                  {/* Hybrid/API */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="h-3 w-3 text-blue-400" />
                      <span className="text-xs font-semibold text-blue-300">Hybrid, API</span>
                      <span className="text-xs text-white/50">• Requires API Key</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-orange-500/10 border border-orange-500/30 rounded-lg px-2 py-1.5 text-center group hover:bg-orange-500/20 transition-colors cursor-pointer">
                        <div className="h-6 w-6 mx-auto mb-1 rounded bg-white/10 backdrop-blur-sm p-0 flex items-center justify-center overflow-hidden">
                          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
                            <g transform="translate(50, 50)">
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(0)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(30)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(60)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(90)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(120)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(150)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(180)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(210)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(240)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(270)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(300)"/>
                              <rect x="-3" y="-42" width="6" height="32" rx="3" fill="#CC785C" transform="rotate(330)"/>
                            </g>
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-orange-200">Claude</p>
                      </div>
                      <div className="flex-1 bg-teal-500/10 border border-teal-500/30 rounded-lg px-2 py-1.5 text-center group hover:bg-teal-500/20 transition-colors cursor-pointer">
                        <div className="h-6 w-6 mx-auto mb-1 rounded bg-white/10 backdrop-blur-sm p-0 flex items-center justify-center overflow-hidden">
                          <svg viewBox="0 0 158.7128 157.296" fill="none" className="w-full h-full scale-150">
                            <path d="M60.8734,57.2556v-14.9432c0-1.2586.4722-2.2029,1.5728-2.8314l30.0443-17.3023c4.0899-2.3593,8.9662-3.4599,13.9988-3.4599,18.8759,0,30.8307,14.6289,30.8307,30.2006,0,1.1007,0,2.3593-.158,3.6178l-31.1446-18.2467c-1.8872-1.1006-3.7754-1.1006-5.6629,0l-39.4812,22.9651ZM131.0276,115.4561v-35.7074c0-2.2028-.9446-3.7756-2.8318-4.8763l-39.481-22.9651,12.8982-7.3934c1.1007-.6285,2.0453-.6285,3.1458,0l30.0441,17.3024c8.6523,5.0341,14.4708,15.7296,14.4708,26.1107,0,11.9539-7.0769,22.965-18.2461,27.527v.0021ZM51.593,83.9964l-12.8982-7.5497c-1.1007-.6285-1.5728-1.5728-1.5728-2.8314v-34.6048c0-16.8303,12.8982-29.5722,30.3585-29.5722,6.607,0,12.7403,2.2029,17.9324,6.1349l-30.987,17.9324c-1.8871,1.1007-2.8314,2.6735-2.8314,4.8764v45.6159l-.0014-.0015ZM79.3562,100.0403l-18.4829-10.3811v-22.0209l18.4829-10.3811,18.4812,10.3811v22.0209l-18.4812,10.3811ZM91.2319,147.8591c-6.607,0-12.7403-2.2031-17.9324-6.1344l30.9866-17.9333c1.8872-1.1005,2.8318-2.6728,2.8318-4.8759v-45.616l13.0564,7.5498c1.1005.6285,1.5723,1.5728,1.5723,2.8314v34.6051c0,16.8297-13.0564,29.5723-30.5147,29.5723v.001ZM53.9522,112.7822l-30.0443-17.3024c-8.652-5.0343-14.471-15.7296-14.471-26.1107,0-12.1119,7.2356-22.9652,18.403-27.5272v35.8634c0,2.2028.9443,3.7756,2.8314,4.8763l39.3248,22.8068-12.8982,7.3938c-1.1007.6287-2.045.6287-3.1456,0ZM52.2229,138.5791c-17.7745,0-30.8306-13.3713-30.8306-29.8871,0-1.2585.1578-2.5169.3143-3.7754l30.987,17.9323c1.8871,1.1005,3.7757,1.1005,5.6628,0l39.4811-22.807v14.9435c0,1.2585-.4721,2.2021-1.5728,2.8308l-30.0443,17.3025c-4.0898,2.359-8.9662,3.4605-13.9989,3.4605h.0014ZM91.2319,157.296c19.0327,0,34.9188-13.5272,38.5383-31.4594,17.6164-4.562,28.9425-21.0779,28.9425-37.908,0-11.0112-4.719-21.7066-13.2133-29.4143.7867-3.3035,1.2595-6.607,1.2595-9.909,0-22.4929-18.2471-39.3247-39.3251-39.3247-4.2461,0-8.3363.6285-12.4262,2.045-7.0792-6.9213-16.8318-11.3254-27.5271-11.3254-19.0331,0-34.9191,13.5268-38.5384,31.4591C11.3255,36.0212,0,52.5373,0,69.3675c0,11.0112,4.7184,21.7065,13.2125,29.4142-.7865,3.3035-1.2586,6.6067-1.2586,9.9092,0,22.4923,18.2466,39.3241,39.3248,39.3241,4.2462,0,8.3362-.6277,12.426-2.0441,7.0776,6.921,16.8302,11.3251,27.5271,11.3251Z"
                                  fill="rgb(16, 163, 127)"/>
                          </svg>
                        </div>
                        <p className="text-xs font-medium text-teal-200">OpenAI</p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-emerald-100/60 text-xs mt-3 text-center">
                  Configure in Settings → AI Engine Setup
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center pt-4">
                <GlassButton
                  variant="primary"
                  onClick={() => setShowSetup(false)}
                  className="bg-gradient-to-r from-emerald-800 to-green-900 sm:px-8"
                >
                  ← Back
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="lg"
                  onClick={handleQuickStart}
                  disabled={isLoading || !userData.email}
                  className="bg-gradient-to-r from-emerald-200 to-green-400 hover:from-emerald-600 hover:to-green-700 sm:px-10"
                >
                  {isLoading ? 'Setting up...' : 'Complete Setup'}
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </div>
        </div>
      )}

    </ErrorBoundary>
  )
}

export default WelcomeExperience
