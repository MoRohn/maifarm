import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { oauthService } from '@/services/oauth/oauthService';
import { useAuth } from '@/hooks/useAuth';
import { OAuthError } from '@/types/oauth';

export const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          const oauthError: OAuthError = {
            error: errorParam,
            error_description: searchParams.get('error_description') || undefined,
            error_uri: searchParams.get('error_uri') || undefined,
            state: state || undefined,
          };
          throw new Error(`OAuth error: ${oauthError.error} - ${oauthError.error_description}`);
        }

        if (!code || !state) {
          throw new Error('Missing required OAuth parameters');
        }

        const session = await oauthService.handleCallback(code, state);
        
        // Convert OAuth session to app authentication
        // For OAuth, we use the email as username and a special OAuth token
        await login({
          email: session.userInfo?.email || 'oauth_user@maifarm.com',
          password: `oauth:${session.accessToken}`,
          rememberMe: true
        });

        setStatus('success');
        
        // Redirect after a short delay to show success message
        setTimeout(() => {
          const returnUrl = sessionStorage.getItem('oauth_return_url') || '/home';
          sessionStorage.removeItem('oauth_return_url');
          navigate(returnUrl);
        }, 1500);
      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {status === 'processing' && (
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="inline-block"
              >
                <Loader2 className="h-12 w-12 text-indigo-600" />
              </motion.div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                Completing authentication...
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Please wait while we verify your credentials
              </p>
            </div>
          )}

          {status === 'success' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              </motion.div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                Authentication successful!
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Redirecting you to the dashboard...
              </p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <XCircle className="h-12 w-12 text-red-500 mx-auto" />
              </motion.div>
              <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
                Authentication failed
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {error || 'An unexpected error occurred'}
              </p>
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Back to login
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Try again
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};