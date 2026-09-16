import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff,
  Shield,
  Fingerprint,
  Check,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { AuthCredentials, AuthResponse } from '@/types/security';
import { useAuthentication } from '@/hooks/useAuthentication';
import { useAuth } from '@/hooks/useAuth';

interface AuthenticationProps {
  onSuccess?: (response: AuthResponse) => void;
  className?: string;
}

export const Authentication: React.FC<AuthenticationProps> = ({
  onSuccess,
  className
}) => {
  const { login, isLoading, error } = useAuthentication();
  // REMOVED: Development bypass - all users must authenticate properly
  const [mode, setMode] = useState<'login' | 'mfa'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState<AuthCredentials>({
    email: '',
    password: '',
    rememberMe: false
  });
  const [mfaCode, setMfaCode] = useState('');

  // REMOVED: Development bypass availability check - all users must authenticate properly

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'login') {
      const response = await login(credentials);
      if (response?.user?.mfaEnabled) {
        setMode('mfa');
      } else if (response?.success) {
        onSuccess?.(response);
      }
    } else {
      const response = await login({ ...credentials, mfaCode });
      if (response?.success) {
        onSuccess?.(response);
      }
    }
  };

  // REMOVED: Development bypass handler - all users must authenticate properly

  const passwordStrength = calculatePasswordStrength(credentials.password);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'w-full max-w-md mx-auto',
        className
      )}
    >
      <div className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="w-20 h-20 bg-white/20 rounded-apple-lg mx-auto mb-4 flex items-center justify-center"
          >
            <Shield className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to MaiFarm
          </h2>
          <p className="text-white/80">
            Secure authentication for your AI farm
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={credentials.email}
                      onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                      className={clsx(
                        'w-full pl-10 pr-4 py-3 rounded-apple',
                        'bg-gray-50 dark:bg-gray-800',
                        'border border-gray-300 dark:border-gray-700',
                        'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        'text-gray-900 dark:text-white',
                        'placeholder-gray-500 dark:placeholder-gray-400',
                        'transition-all duration-200'
                      )}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password <span className="text-xs text-gray-500 dark:text-gray-400">(optional for passwordless accounts)</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={credentials.password}
                      onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                      className={clsx(
                        'w-full pl-10 pr-12 py-3 rounded-apple',
                        'bg-gray-50 dark:bg-gray-800',
                        'border border-gray-300 dark:border-gray-700',
                        'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        'text-gray-900 dark:text-white',
                        'placeholder-gray-500 dark:placeholder-gray-400',
                        'transition-all duration-200'
                      )}
                      placeholder="Leave blank for passwordless login"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {credentials.password && (
                    <PasswordStrengthIndicator strength={passwordStrength} />
                  )}
                </div>

                {/* Remember Me */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={credentials.rememberMe}
                      onChange={(e) => setCredentials({ ...credentials, rememberMe: e.target.checked })}
                      className={clsx(
                        'w-4 h-4 rounded',
                        'text-primary-600 focus:ring-primary-500',
                        'border-gray-300 dark:border-gray-700'
                      )}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Remember me
                    </span>
                  </label>
                  
                  <a href="#" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
                    Forgot password?
                  </a>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="mfa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <Fingerprint className="w-12 h-12 text-primary-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                {/* MFA Code Input */}
                <div>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={clsx(
                      'w-full px-4 py-3 rounded-apple text-center text-2xl font-mono tracking-widest',
                      'bg-gray-50 dark:bg-gray-800',
                      'border border-gray-300 dark:border-gray-700',
                      'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                      'text-gray-900 dark:text-white',
                      'transition-all duration-200'
                    )}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMfaCode('');
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  ← Back to login
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-apple"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          <motion.button
            type="submit"
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              'w-full py-3 px-4 rounded-apple font-medium',
              'bg-gradient-to-r from-primary-500 to-primary-600',
              'hover:from-primary-600 hover:to-primary-700',
              'text-white shadow-lg',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200',
              'flex items-center justify-center space-x-2'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                <span>{mode === 'login' ? 'Sign In' : 'Verify'}</span>
              </>
            )}
          </motion.button>
        </form>

        {/* REMOVED: Development bypass mode - all users must authenticate properly */}

        {/* Footer */}
        <div className="px-8 pb-8">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <a href="#" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium">
              Contact your administrator
            </a>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-center"
      >
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <Shield className="w-4 h-4" />
          <span>Protected by end-to-end encryption</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

interface PasswordStrengthIndicatorProps {
  strength: number;
}

const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ strength }) => {
  const strengthConfig = [
    { label: 'Weak', color: 'bg-red-500' },
    { label: 'Fair', color: 'bg-yellow-500' },
    { label: 'Good', color: 'bg-blue-500' },
    { label: 'Strong', color: 'bg-green-500' }
  ];

  const config = strengthConfig[Math.min(strength, 3)];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Password strength
        </span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {config.label}
        </span>
      </div>
      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(strength + 1) * 25}%` }}
          transition={{ duration: 0.3 }}
          className={clsx('h-full', config.color)}
        />
      </div>
    </motion.div>
  );
};

// Helper function to calculate password strength
function calculatePasswordStrength(password: string): number {
  let strength = 0;
  
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password) && /[^a-zA-Z\d]/.test(password)) strength++;
  
  return Math.min(strength, 3);
}