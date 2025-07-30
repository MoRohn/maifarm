import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldCheckIcon,
  KeyIcon,
  FingerPrintIcon,
  LockClosedIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useUserStore } from '../../store/userStore';
import { useAuth } from '../../hooks/useAuth';

const SecuritySettings: React.FC = () => {
  const { user } = useAuth();
  const { preferences, updatePreferences } = useUserStore();
  const [security, setSecurity] = useState(preferences?.security || {
    twoFactorEnabled: false,
    sessionTimeout: 30,
    encryptLogs: true,
    auditLevel: 'detailed',
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      expiryDays: 90
    }
  });

  const [showPasswordPolicy, setShowPasswordPolicy] = useState(false);

  const handleToggle = (key: string, value: any) => {
    const updated = { ...security, [key]: value };
    setSecurity(updated);
    updatePreferences({ security: updated });
  };

  const handlePasswordPolicyChange = (key: string, value: any) => {
    const updated = {
      ...security,
      passwordPolicy: {
        ...security.passwordPolicy,
        [key]: value
      }
    };
    setSecurity(updated);
    updatePreferences({ security: updated });
  };

  const enable2FA = async () => {
    // In a real app, this would initiate 2FA setup
    console.log('Setting up 2FA...');
    handleToggle('twoFactorEnabled', true);
  };

  return (
    <div className="space-y-8">
      {/* Account Security */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Account Security
        </h3>
        
        {/* Two-Factor Authentication */}
        <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-start space-x-3">
            <FingerPrintIcon className="w-6 h-6 text-purple-600 dark:text-purple-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Two-Factor Authentication
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Add an extra layer of security to your account
              </p>
              {!security.twoFactorEnabled ? (
                <button
                  onClick={enable2FA}
                  className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
                >
                  Enable 2FA
                </button>
              ) : (
                <div className="mt-3 flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <ShieldCheckIcon className="w-3.5 h-3.5 mr-1" />
                    Enabled
                  </span>
                  <button className="text-sm text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300">
                    Manage
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Session Timeout */}
        <div className="mb-6">
          <label className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ClockIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Session Timeout
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Automatically log out after inactivity
                </p>
              </div>
            </div>
            <select
              value={security.sessionTimeout}
              onChange={(e) => handleToggle('sessionTimeout', parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={480}>8 hours</option>
            </select>
          </label>
        </div>

        {/* Encrypt Logs */}
        <label className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LockClosedIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Encrypt Communication Logs
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                End-to-end encryption for agent communications
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={security.encryptLogs}
            onChange={(e) => handleToggle('encryptLogs', e.target.checked)}
            className="w-5 h-5 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
        </label>
      </div>

      {/* Password Policy */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Password Policy
          </h3>
          <button
            onClick={() => setShowPasswordPolicy(!showPasswordPolicy)}
            className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
          >
            {showPasswordPolicy ? 'Hide' : 'Configure'}
          </button>
        </div>

        {showPasswordPolicy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Minimum Password Length
              </label>
              <input
                type="number"
                min={8}
                max={32}
                value={security.passwordPolicy.minLength}
                onChange={(e) => handlePasswordPolicyChange('minLength', parseInt(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireUppercase}
                  onChange={(e) => handlePasswordPolicyChange('requireUppercase', e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Require uppercase letters
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireNumbers}
                  onChange={(e) => handlePasswordPolicyChange('requireNumbers', e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Require numbers
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireSpecialChars}
                  onChange={(e) => handlePasswordPolicyChange('requireSpecialChars', e.target.checked)}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Require special characters
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password Expiry (days)
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={security.passwordPolicy.expiryDays}
                onChange={(e) => handlePasswordPolicyChange('expiryDays', parseInt(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Set to 0 to disable password expiry
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Audit & Compliance */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Audit & Compliance
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Audit Level
            </label>
            <select
              value={security.auditLevel}
              onChange={(e) => handleToggle('auditLevel', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="basic">Basic - Essential actions only</option>
              <option value="detailed">Detailed - Most user actions</option>
              <option value="comprehensive">Comprehensive - All actions and API calls</option>
            </select>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
            <div className="flex">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="ml-3">
                <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Compliance Note
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Audit logs are retained for 90 days and include user actions, system events, and security-related activities.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200 font-medium text-sm">
              View Audit Logs
            </button>
            <button className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200 font-medium text-sm">
              Export Logs
            </button>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Active Sessions
        </h3>
        
        <div className="space-y-3">
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Current Session
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Browser: Chrome • IP: 192.168.1.1
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                Active
              </span>
            </div>
          </div>
        </div>

        <button className="mt-4 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
          Sign out all other sessions
        </button>
      </div>
    </div>
  );
};

export default SecuritySettings;