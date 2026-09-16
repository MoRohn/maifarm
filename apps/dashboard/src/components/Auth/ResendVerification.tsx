import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Loader, ArrowLeft, CheckCircle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassButton } from '@/components/ui/GlassButton';
import { toast } from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4567/api';

export const ResendVerification: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [lastSent, setLastSent] = useState<number | null>(null);

  const RATE_LIMIT_SECONDS = 60; // 1 minute between requests

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side rate limiting
    if (lastSent) {
      const secondsSinceLastSent = Math.floor((Date.now() - lastSent) / 1000);
      if (secondsSinceLastSent < RATE_LIMIT_SECONDS) {
        const remaining = RATE_LIMIT_SECONDS - secondsSinceLastSent;
        setError(`Please wait ${remaining} seconds before requesting another email`);
        return;
      }
    }

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEmailSent(true);
        setLastSent(Date.now());
        toast.success('Verification email sent! Please check your inbox.');
      } else {
        // Handle specific error cases
        if (response.status === 404) {
          setError('No account found with this email address');
        } else if (response.status === 400 && data.error?.includes('already verified')) {
          setError('This email is already verified. You can sign in now.');
          setTimeout(() => navigate('/login'), 2000);
        } else if (response.status === 429) {
          setError('Too many requests. Please try again later.');
        } else {
          setError(data.error || 'Failed to send verification email');
        }
        toast.error(data.error || 'Failed to send verification email');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      setError('Network error. Please check your connection and try again.');
      toast.error('Failed to send verification email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <GlassCard className="p-8">
          {!emailSent ? (
            <>
              <div className="flex items-center mb-6">
                <button
                  onClick={() => navigate(-1)}
                  className="text-gray-400 hover:text-white transition-colors mr-4"
                >
                  <ArrowLeft size={24} />
                </button>
                <h1 className="text-2xl font-bold text-white">
                  Resend Verification Email
                </h1>
              </div>

              <p className="text-gray-300 mb-6">
                Enter your email address and we'll send you a new verification link.
              </p>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg
                               text-white placeholder-gray-500 focus:outline-none focus:ring-2
                               focus:ring-green-500 focus:border-transparent disabled:opacity-50
                               disabled:cursor-not-allowed transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg"
                  >
                    <p className="text-red-400 text-sm">{error}</p>
                  </motion.div>
                )}

                <GlassButton
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader className="animate-spin mr-2" size={20} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2" size={20} />
                      Send Verification Email
                    </>
                  )}
                </GlassButton>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                Email Sent!
              </h2>
              <p className="text-gray-300 mb-6">
                We've sent a verification link to <strong className="text-white">{email}</strong>.
                Please check your inbox and spam folder.
              </p>

              <div className="space-y-3">
                <GlassButton
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Return to Login
                </GlassButton>

                <button
                  onClick={() => {
                    setEmailSent(false);
                    setError('');
                  }}
                  disabled={lastSent && Date.now() - lastSent < RATE_LIMIT_SECONDS * 1000}
                  className="w-full text-sm text-gray-400 hover:text-white transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lastSent && Date.now() - lastSent < RATE_LIMIT_SECONDS * 1000
                    ? `Resend in ${Math.ceil((RATE_LIMIT_SECONDS * 1000 - (Date.now() - lastSent)) / 1000)}s`
                    : 'Need to resend?'}
                </button>
              </div>
            </motion.div>
          )}
        </GlassCard>

        <div className="mt-6 text-center text-gray-400 text-sm">
          <p>
            Didn't receive the email? Check your spam folder or try a different email address.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
