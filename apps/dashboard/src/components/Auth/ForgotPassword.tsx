import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowLeft } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { toast } from 'react-hot-toast'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4567/api'

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      toast.error('Please enter your email address')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setIsSubmitted(true)
        toast.success('Password reset instructions sent to your email')
      } else {
        // Always show success to prevent email enumeration
        setIsSubmitted(true)
        toast.success('If an account exists with this email, password reset instructions have been sent')
      }
    } catch (error) {
      toast.error('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-8">
          {!isSubmitted ? (
            <>
              <div className="flex items-center mb-6">
                <button
                  onClick={() => navigate('/login')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-white ml-4">
                  Forgot Password
                </h1>
              </div>

              <p className="text-gray-300 mb-6">
                Enter your email address and we'll send you instructions to reset your password.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="mb-6">
                  <label htmlFor="email" className="block text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3 py-3 bg-white/10 border border-white/20 rounded-lg
                                 text-white placeholder-gray-400 focus:outline-none focus:border-green-500
                                 transition-colors"
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <GlassButton
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? 'Sending...' : 'Send Reset Instructions'}
                </GlassButton>
              </form>

              <div className="mt-6 text-center">
                <p className="text-gray-400">
                  Remember your password?{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-green-400 hover:text-green-300 transition-colors"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Check Your Email
              </h2>
              <p className="text-gray-300 mb-6">
                We've sent password reset instructions to:
                <br />
                <span className="text-white font-semibold">{email}</span>
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Didn't receive the email? Check your spam folder or click below to resend.
              </p>
              <div className="space-y-3">
                <GlassButton
                  onClick={() => setIsSubmitted(false)}
                  variant="secondary"
                  className="w-full"
                >
                  Try Another Email
                </GlassButton>
                <GlassButton
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Return to Login
                </GlassButton>
              </div>
            </div>
          )}
        </GlassCard>
      </motion.div>
    </div>
  )
}