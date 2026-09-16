import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
  Shield,
  Check,
  ArrowRight,
  UserPlus,
  LogIn,
  Sparkles
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { MaiFarmExplainerHero, MaiFarmExplainerMobileList } from '@/components/Onboarding/MaiFarmExplainer'
import { toast } from 'react-hot-toast'
import { consumeSelectedProfile, DeviceProfile } from '@/utils/deviceProfiles'

const fadeInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }
  }
}

const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }
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

export const EnhancedLogin = () => {
  const navigate = useNavigate()
  const { login, register, isLoading, error } = useAuth()

  // Form state
  const [isRegistering, setIsRegistering] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<any>(null)
  const [usePasswordless, setUsePasswordless] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const [formState, setFormState] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: '',
    rememberMe: true
  })
  const [pendingProfile, setPendingProfile] = useState<DeviceProfile | null>(null)

  // Password validation states
  const passwordRequirements = [
    { met: formState.password.length >= 8, label: 'At least 8 characters' },
    { met: /[A-Z]/.test(formState.password), label: 'One uppercase letter' },
    { met: /[a-z]/.test(formState.password), label: 'One lowercase letter' },
    { met: /[0-9]/.test(formState.password), label: 'One number' }
  ]

  const isPasswordValid = !usePasswordless && isRegistering ?
    passwordRequirements.every(req => req.met) : true

  const isFormValid = () => {
    if (!formState.email.trim()) return false

    if (isRegistering) {
      if (!formState.name.trim()) return false
      if (!usePasswordless) {
        if (!isPasswordValid) return false
        if (formState.password !== formState.confirmPassword) return false
      }
    } else {
      // For login, password is optional (passwordless)
      // Just need email
    }

    return true
  }

  useEffect(() => {
    const storedProfile = consumeSelectedProfile()
    if (storedProfile?.email) {
      setFormState((prev) => ({ ...prev, email: storedProfile.email }))
      setPendingProfile(storedProfile)
    }
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    setErrorCode(null)
    setErrorDetails(null)

    if (!isFormValid()) {
      setLocalError('Please fill in all required fields correctly.')
      return
    }

    try {
      if (isRegistering) {
        // Registration flow
        const result = await register({
          email: formState.email.trim(),
          name: formState.name.trim(),
          password: usePasswordless ? undefined : formState.password,
          authMode: usePasswordless ? 'passwordless' : 'password'
        }, { redirectTo: '/home' }) // Let auth system handle navigation

        // Check if email verification is required
        if ((result as any)?.requiresVerification) {
          setRegistrationSuccess(true)
          setRegisteredEmail(formState.email)
          toast.success('🎉 Registration successful! Please check your email to verify your account.')
        } else {
          // Mark first run as complete for new users to prevent welcome redirect loop
          localStorage.setItem('maifarm:initialized', 'true')
          localStorage.setItem('maifarm:welcome-page:v2', 'viewed')
          localStorage.setItem('maifarm:first-run-complete', 'true')

          toast.success('🎉 Welcome to MaiFarm! Your account has been created.')
          // Navigation will be handled by auth system via redirectTo
        }
      } else {
        // Login flow - handle passwordless properly
        const loginPayload: any = {
          email: formState.email.trim(),
          rememberMe: formState.rememberMe
        }

        // Only include password if it's provided (not for passwordless)
        if (formState.password && formState.password.trim() !== '') {
          loginPayload.password = formState.password
        }

        await login(loginPayload, { redirectTo: '/home' })

        toast.success('Welcome back to MaiFarm!')
      }
    } catch (err: any) {
      console.error('Auth error:', err)

      // Parse structured error response
      const code = err?.code || err?.response?.data?.code
      const message = err?.message || err?.response?.data?.error || (isRegistering ? 'Registration failed' : 'Login failed')
      const details = err?.details || err?.response?.data?.details

      setErrorCode(code)
      setErrorDetails(details)

      // Handle specific error codes with better messaging
      switch (code) {
        case 'EMAIL_EXISTS':
          setLocalError('This email is already registered. Try signing in instead.')
          if (isRegistering) {
            setTimeout(() => {
              setIsRegistering(false)
              toast.info('Account exists. Switched to sign in mode.')
            }, 1500)
          }
          break

        case 'EMAIL_NOT_VERIFIED':
          setLocalError('Please verify your email address before signing in.')
          setTimeout(() => {
            navigate('/resend-verification', { state: { email: formState.email } })
          }, 2000)
          break

        case 'USERNAME_EXISTS':
          setLocalError('This username is already taken. Please choose another.')
          break

        case 'VALIDATION_ERROR':
          if (details?.fieldErrors) {
            const firstError = Object.values(details.fieldErrors)[0]
            setLocalError(Array.isArray(firstError) ? firstError[0] : 'Please check your inputs.')
          } else {
            setLocalError(message)
          }
          break

        case 'PASSWORD_REQUIRED':
          setLocalError('Password is required for password-based authentication.')
          break

        case 'INVALID_CREDENTIALS':
          setLocalError('Invalid email or password. Please try again.')
          break

        case 'USER_NOT_FOUND':
          setLocalError('No account found with this email. Please sign up first.')
          if (!isRegistering) {
            setTimeout(() => {
              setIsRegistering(true)
              toast.info('No account found. Switched to sign up mode.')
            }, 1500)
          }
          break

        case 'ACCOUNT_INACTIVE':
          setLocalError('Your account has been deactivated. Please contact support.')
          break

        case 'SERVICE_UNAVAILABLE':
          setLocalError('Service temporarily unavailable. Please try again in a moment.')
          break

        default:
          setLocalError(message)
          // Check legacy error messages for backwards compatibility
          if (message.toLowerCase().includes('already exists') && isRegistering) {
            setIsRegistering(false)
            toast.info('Account exists. Please sign in instead.')
          }
          break
      }
    }
  }

  const toggleMode = () => {
    setIsRegistering(!isRegistering)
    setLocalError(null)
    setErrorCode(null)
    setErrorDetails(null)
    setFormState(prev => ({
      ...prev,
      password: '',
      confirmPassword: '',
      name: isRegistering ? '' : prev.name
    }))
  }

  // Development mode: Continue as Guest
  const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost'

  const handleContinueAsGuest = () => {
    // Set auth bypass flag and navigate to dashboard
    localStorage.setItem('maifarm:auth-bypass', 'true')
    localStorage.setItem('maifarm:guest-mode', 'true')
    toast.success('Continuing as Guest')
    navigate('/')
  }

  const formError = localError || error

  return (
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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center gap-12 px-6 py-12 lg:flex-row lg:items-stretch lg:px-12 lg:py-16">
        {/* Explainer section */}
        <MaiFarmExplainerHero />

        {/* Authentication card */}
        <motion.section
          className="w-full max-w-md lg:max-w-lg"
          variants={fadeInRight}
          initial="hidden"
          animate="visible"
        >
          <div className="rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-2xl">
            {/* Header with mode toggle */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                <button
                  onClick={() => setIsRegistering(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                    !isRegistering
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                      : 'text-white/60 hover:text-white/80'
                  }`}
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </button>
                <button
                  onClick={() => setIsRegistering(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                    isRegistering
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                      : 'text-white/60 hover:text-white/80'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={isRegistering ? 'register' : 'login'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <p className="text-sm uppercase tracking-[0.4em] text-emerald-200">
                    {isRegistering ? 'Welcome to' : 'Welcome back'}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {isRegistering ? 'Create Account' : 'Sign in to MaiFarm'}
                  </h2>
                  <p className="mt-2 text-sm text-white/70">
                    {isRegistering
                      ? 'Start your AI farming journey today'
                      : 'Secure gateway for your AI farm ecosystem'}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {registrationSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="mb-6">
                  <div className="mx-auto w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                    <Check className="h-10 w-10 text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Check Your Email!</h3>
                  <p className="text-white/70">
                    We've sent a verification link to <strong className="text-emerald-200">{registeredEmail}</strong>
                  </p>
                </div>

                <div className="space-y-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-start gap-3 text-left">
                    <Mail className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">Check your inbox</p>
                      <p className="text-xs text-white/60">Click the verification link in the email we sent you</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-left">
                    <Shield className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">Secure your account</p>
                      <p className="text-xs text-white/60">Verification helps keep your MaiFarm account safe</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => navigate('/resend-verification', { state: { email: registeredEmail } })}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                  >
                    Didn't receive the email?
                  </button>
                  <button
                    onClick={() => {
                      setRegistrationSuccess(false)
                      setRegisteredEmail('')
                      setIsRegistering(false)
                    }}
                    className="text-sm text-emerald-200 hover:text-emerald-100"
                  >
                    ← Back to login
                  </button>
                </div>
              </motion.div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                {pendingProfile && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 text-emerald-900 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        Ready to switch to {pendingProfile.name || pendingProfile.email}
                      </p>
                      <p className="text-xs text-emerald-800">
                        Enter this account's credentials to continue.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingProfile(null)
                        setFormState((prev) => ({ ...prev, email: '' }))
                      }}
                      className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 underline underline-offset-2"
                    >
                      Use another profile
                    </button>
                  </div>
                )}
                <AnimatePresence mode="wait">
                {/* Name field (registration only) */}
                {isRegistering && (
                  <motion.div
                    key="name-field"
                    variants={slideUp}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                  >
                    <label className="mb-2 block text-sm font-medium text-white/80" htmlFor="name">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        value={formState.name}
                        onChange={(event) => {
                          setFormState((prev) => ({ ...prev, name: event.target.value }))
                          setLocalError(null)
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300"
                        placeholder="John Doe"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Email field */}
                <motion.div key="email-field" variants={slideUp} initial="hidden" animate="visible">
                  <label className="mb-2 block text-sm font-medium text-white/80" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={formState.email}
                      onChange={(event) => {
                        setFormState((prev) => ({ ...prev, email: event.target.value }))
                        setLocalError(null)
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </motion.div>

                {/* Passwordless option for registration */}
                {isRegistering && (
                  <motion.div
                    key="passwordless-option"
                    variants={slideUp}
                    initial="hidden"
                    animate="visible"
                    className="flex items-center justify-between p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-blue-300" />
                      <div>
                        <p className="text-sm font-medium text-white">Passwordless Login</p>
                        <p className="text-xs text-white/60">Sign in with just your email</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUsePasswordless(!usePasswordless)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        usePasswordless ? 'bg-emerald-500' : 'bg-white/20'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          usePasswordless ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </motion.div>
                )}

                {/* Password field */}
                {(!isRegistering || !usePasswordless) && (
                  <motion.div key="password-field" variants={slideUp} initial="hidden" animate="visible">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-white/80" htmlFor="password">
                        Password
                      </label>
                      {!isRegistering && (
                        <button
                          type="button"
                          className="text-xs text-emerald-200 hover:text-emerald-100"
                          onClick={() => navigate('/forgot-password')}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isRegistering ? 'new-password' : 'current-password'}
                        value={formState.password}
                        onChange={(event) => {
                          setFormState((prev) => ({ ...prev, password: event.target.value }))
                          // UX FIX: Clear error when user starts typing
                          setLocalError(null)
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300"
                        placeholder={isRegistering ? "Create a strong password" : "Enter your password"}
                      />
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {!isRegistering && (
                      <p className="mt-1 text-xs text-white/50">Leave blank for passwordless accounts</p>
                    )}
                  </motion.div>
                )}

                {/* Confirm Password (registration only) */}
                {isRegistering && !usePasswordless && (
                  <motion.div
                    key="confirm-password"
                    variants={slideUp}
                    initial="hidden"
                    animate="visible"
                  >
                    <label className="mb-2 block text-sm font-medium text-white/80" htmlFor="confirmPassword">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={formState.confirmPassword}
                        onChange={(event) => {
                          setFormState((prev) => ({ ...prev, confirmPassword: event.target.value }))
                          // UX FIX: Clear error when user starts typing
                          setLocalError(null)
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300"
                        placeholder="Confirm your password"
                      />
                    </div>
                    {formState.confirmPassword && (
                      <p className={`mt-1 text-xs ${
                        formState.password === formState.confirmPassword
                          ? 'text-emerald-300'
                          : 'text-red-300'
                      }`}>
                        {formState.password === formState.confirmPassword
                          ? '✓ Passwords match'
                          : '✗ Passwords do not match'}
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Password requirements (registration only) */}
                {isRegistering && !usePasswordless && formState.password && (
                  <motion.div
                    key="password-requirements"
                    variants={slideUp}
                    initial="hidden"
                    animate="visible"
                    className="p-3 bg-white/5 rounded-xl border border-white/10"
                  >
                    <p className="text-xs font-medium text-white/70 mb-2">Password requirements:</p>
                    <div className="space-y-1">
                      {passwordRequirements.map((req, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Check className={`h-3 w-3 ${req.met ? 'text-emerald-400' : 'text-white/30'}`} />
                          <span className={`text-xs ${req.met ? 'text-emerald-200' : 'text-white/50'}`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Remember me / Terms */}
                <motion.div key="options" variants={slideUp} initial="hidden" animate="visible">
                  {!isRegistering ? (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-3 text-sm text-white/80">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-300"
                          checked={formState.rememberMe}
                          onChange={(event) => setFormState((prev) => ({ ...prev, rememberMe: event.target.checked }))}
                        />
                        Remember me
                      </label>
                      <button
                        type="button"
                        onClick={() => navigate('/welcome')}
                        className="text-sm text-emerald-200 hover:text-emerald-100"
                      >
                        Guided setup
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-white/60 text-center">
                      By creating an account, you agree to MaiFarm's{' '}
                      <a href="#" className="text-emerald-200 hover:text-emerald-100">Terms of Service</a>{' '}
                      and{' '}
                      <a href="#" className="text-emerald-200 hover:text-emerald-100">Privacy Policy</a>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Error message */}
              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                >
                  {formError}
                </motion.div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading || !isFormValid()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-slate-950 transition hover:from-emerald-300 hover:via-green-300 hover:to-emerald-400 disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {isRegistering ? 'Creating Account...' : 'Signing in...'}
                  </>
                ) : (
                  <>
                    {isRegistering ? (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Create Account
                      </>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </>
                )}
              </button>
            </form>
            )}

            {/* Mode switch prompt */}
            {!registrationSuccess && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/70">
              {isRegistering ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-emerald-200 hover:text-emerald-100"
                    onClick={toggleMode}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Need to create an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-emerald-200 hover:text-emerald-100"
                    onClick={toggleMode}
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
            )}
          </div>

          {/* Development mode: Continue as Guest */}
          {isDevelopment && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 text-center"
            >
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-2 text-white/40">Development Mode</span>
                </div>
              </div>
              <button
                onClick={handleContinueAsGuest}
                className="mt-4 w-full rounded-xl border border-white/20 bg-white/5 py-3 px-4 text-white/80 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <User className="h-4 w-4" />
                Continue as Guest
              </button>
            </motion.div>
          )}
        </motion.section>

        <div className="mb-12 w-full lg:hidden">
          <MaiFarmExplainerMobileList />
        </div>
      </div>
    </div>
  )
}

export default EnhancedLogin
