/**
 * SimpleLogin - Safari-safe authentication component
 * Avoids framer-motion, complex state, and other Safari-problematic patterns
 */
import { FormEvent, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Mail, Lock, User, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'react-hot-toast'

export const SimpleLogin = () => {
  const navigate = useNavigate()
  const { login, register, isLoading, error: authError } = useAuth()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Development mode: Continue as Guest
  const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost'

  const handleContinueAsGuest = () => {
    localStorage.setItem('maifarm:auth-bypass', 'true')
    localStorage.setItem('maifarm:guest-mode', 'true')
    localStorage.setItem('maifarm:initialized', 'true')
    localStorage.setItem('maifarm:first-run-complete', 'true')
    toast.success('Continuing as Guest')
    // Force page reload to re-initialize AuthProvider with guest mode
    window.location.href = '/'
  }

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  })

  // Clear errors when switching modes
  useEffect(() => {
    setLocalError(null)
  }, [mode])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setLocalError(null)
  }

  const validateForm = (): boolean => {
    if (!formData.email.trim()) {
      setLocalError('Email is required')
      return false
    }

    if (!formData.email.includes('@')) {
      setLocalError('Please enter a valid email address')
      return false
    }

    if (mode === 'register') {
      if (!formData.name.trim()) {
        setLocalError('Name is required')
        return false
      }

      if (formData.password.length < 8) {
        setLocalError('Password must be at least 8 characters')
        return false
      }

      if (formData.password !== formData.confirmPassword) {
        setLocalError('Passwords do not match')
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)
    setLocalError(null)

    try {
      if (mode === 'register') {
        await register({
          email: formData.email.trim(),
          name: formData.name.trim(),
          password: formData.password,
          authMode: 'password'
        }, { redirectTo: '/home' })

        // Set initialization flags
        localStorage.setItem('maifarm:initialized', 'true')
        localStorage.setItem('maifarm:first-run-complete', 'true')
        toast.success('Account created successfully!')
      } else {
        await login({
          email: formData.email.trim(),
          password: formData.password,
          rememberMe: true
        }, { redirectTo: '/home' })

        toast.success('Welcome back!')
      }
    } catch (err: any) {
      console.error('Auth error:', err)

      const errorMessage = err?.message || err?.response?.data?.error ||
        (mode === 'register' ? 'Registration failed' : 'Login failed')

      // Handle specific error codes
      if (err?.code === 'EMAIL_EXISTS' || errorMessage.includes('already exists')) {
        setLocalError('This email is already registered. Try signing in.')
        setMode('login')
      } else if (err?.code === 'USER_NOT_FOUND' || errorMessage.includes('not found')) {
        setLocalError('No account found with this email. Please sign up.')
        setMode('register')
      } else if (err?.code === 'INVALID_CREDENTIALS') {
        setLocalError('Invalid email or password')
      } else {
        setLocalError(errorMessage)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = localError || authError

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo - hidden on mobile */}
        <div className="text-center mb-8 hidden sm:block">
          <img
            src="/app-icon.png"
            alt="MaiFarm"
            className="h-24 w-24 mx-auto mb-4 rounded-[20px] shadow-lg"
            onError={(e) => {
              // Fallback if logo doesn't load
              (e.target as HTMLImageElement).src = '/maifarm-logo-forest-walk-dark.svg'
            }}
          />
          <h1 className="text-3xl font-bold text-white">MaiFarm</h1>
          <p className="text-emerald-200/70 mt-2">Multi-Agent AI Orchestration</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'login'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                mode === 'register'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none transition-colors"
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none transition-colors"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none transition-colors"
                  placeholder={mode === 'register' ? 'Create password (8+ chars)' : 'Your password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none transition-colors"
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            {/* Error Display */}
            {displayError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm">
                {displayError}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || isSubmitting}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-slate-900 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {(isLoading || isSubmitting) ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {mode === 'register' ? 'Creating Account...' : 'Signing In...'}
                </>
              ) : (
                <>
                  {mode === 'register' ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>
          </form>

          {/* Footer Links */}
          <div className="mt-6 text-center text-sm text-white/60">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-emerald-300 hover:text-emerald-200 font-medium"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-emerald-300 hover:text-emerald-200 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          {/* Development mode: Continue as Guest */}
          {isDevelopment && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-xs text-white/40 text-center mb-3 uppercase tracking-wide">Development Mode</p>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                className="w-full py-3 px-4 rounded-xl border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2 font-medium"
              >
                <User className="h-4 w-4" />
                Continue as Guest
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/40 text-sm mt-6">
          Secure authentication for your AI farming operations
        </p>
      </div>
    </div>
  )
}

export default SimpleLogin
