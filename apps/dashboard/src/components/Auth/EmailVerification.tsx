import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { toast } from 'react-hot-toast'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4567/api'

export const EmailVerification: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    verifyEmail()
  }, [token])

  const verifyEmail = async () => {
    if (!token) {
      setVerificationStatus('error')
      setErrorMessage('Verification token is missing')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/auth/verify/${token}`, {
        method: 'GET'
      })

      // Safely parse JSON response
      let data: { success?: boolean; error?: string } | null = null
      try {
        data = await response.json()
      } catch {
        // Response body is not valid JSON
        data = null
      }

      if (response.ok && data?.success) {
        setVerificationStatus('success')
        toast.success('Email verified successfully!')

        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          navigate('/dashboard')
        }, 3000)
      } else {
        setVerificationStatus('error')
        const errorMsg = data?.error || 'Verification failed'
        setErrorMessage(errorMsg)
        toast.error(errorMsg)
      }
    } catch (error) {
      setVerificationStatus('error')
      setErrorMessage('Network error. Please try again.')
      toast.error('Failed to verify email. Please try again.')
    }
  }

  const handleResendVerification = async () => {
    // This would require the user's email, so redirect to a resend page
    navigate('/resend-verification')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-8 text-center">
          {verificationStatus === 'verifying' && (
            <>
              <Loader className="w-16 h-16 mx-auto text-green-500 animate-spin mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">
                Verifying Your Email
              </h1>
              <p className="text-gray-300">
                Please wait while we verify your email address...
              </p>
            </>
          )}

          {verificationStatus === 'success' && (
            <>
              <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">
                Email Verified! 🎉
              </h1>
              <p className="text-gray-300 mb-6">
                Your email has been successfully verified. You will be redirected to the dashboard shortly.
              </p>
              <GlassButton
                onClick={() => navigate('/dashboard')}
                className="w-full"
              >
                Go to Dashboard
              </GlassButton>
            </>
          )}

          {verificationStatus === 'error' && (
            <>
              <XCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h1 className="text-2xl font-bold text-white mb-2">
                Verification Failed
              </h1>
              <p className="text-gray-300 mb-6">
                {errorMessage}
              </p>
              <div className="space-y-3">
                <GlassButton
                  onClick={handleResendVerification}
                  className="w-full"
                >
                  Request New Verification Email
                </GlassButton>
                <GlassButton
                  onClick={() => navigate('/login')}
                  variant="secondary"
                  className="w-full"
                >
                  Return to Login
                </GlassButton>
              </div>
            </>
          )}
        </GlassCard>
      </motion.div>
    </div>
  )
}