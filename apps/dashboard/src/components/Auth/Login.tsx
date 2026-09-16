import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { MaiFarmExplainerHero, MaiFarmExplainerMobileList } from '@/components/Onboarding/MaiFarmExplainer'

const fadeInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }
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

export const Login = () => {
  const navigate = useNavigate()
  const { login, isLoading, error } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [formState, setFormState] = useState({
    email: '',
    password: '',
    rememberMe: true
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!formState.email.trim()) {
      setLocalError('Email or username is required to sign in.')
      return
    }

    setLocalError(null)
    await login({
      email: formState.email.trim(),
      password: formState.password,
      rememberMe: formState.rememberMe
    })
  }

  // REMOVED: Development bypass functions - all users must authenticate properly

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
            <div className="mb-8 text-center">
              <p className="text-sm uppercase tracking-[0.4em] text-emerald-200">Welcome</p>
              <h2 className="mt-2 text-3xl font-semibold">Sign in to MaiFarm</h2>
              <p className="mt-2 text-sm text-white/70">Secure gateway for your AI farm ecosystem</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80" htmlFor="email">
                  Email or Username <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" aria-hidden="true" />
                  <input
                    id="email"
                    type="text"
                    autoComplete="username email"
                    value={formState.email}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, email: event.target.value }))
                      setLocalError(null)
                    }}
                    className={`w-full rounded-2xl border bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300 ${
                      formError ? 'border-red-400/60' : 'border-white/10'
                    }`}
                    placeholder="you@maifarm.dev or username"
                    required
                    aria-invalid={formError ? 'true' : 'false'}
                    aria-describedby={formError ? 'login-error' : undefined}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-white/80" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-xs text-emerald-200 hover:text-emerald-100"
                    onClick={() => navigate('/forgot-password')}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={formState.password}
                    onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-base text-white placeholder-white/40 outline-none transition focus:border-emerald-300"
                    placeholder="Leave blank for passwordless login"
                    aria-describedby={formError ? 'login-error password-hint' : 'password-hint'}
                  />
                  <button
                    type="button"
                    id="password-toggle"
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/60 hover:text-white/80 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                <p id="password-hint" className="mt-1 text-xs text-white/50">Optional for passwordless accounts</p>
              </div>

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

              {formError && (
                <div
                  id="login-error"
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                >
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !formState.email}
                aria-busy={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 px-4 py-3 text-lg font-semibold text-slate-950 transition hover:from-emerald-300 hover:via-green-300 hover:to-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/70">
              Need to create your first owner account?{' '}
              <button
                type="button"
                className="font-semibold text-emerald-200 hover:text-emerald-100"
                onClick={() => navigate('/welcome')}
              >
                Launch setup
              </button>
            </div>
          </div>

          {/* REMOVED: Development bypass mode - all users must authenticate properly */}
        </motion.section>

        <div className="mb-12 w-full lg:hidden">
          <MaiFarmExplainerMobileList />
        </div>
      </div>
    </div>
  )
}

export default Login
