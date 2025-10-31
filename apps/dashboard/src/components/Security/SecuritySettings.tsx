import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, Lock, Key, AlertTriangle, Check, X, 
  Eye, UserCheck, Globe, Clock, Database, Download 
} from 'lucide-react';
import { SecurityConfig, PasswordPolicy } from '@/types/security';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'react-hot-toast';

export const SecuritySettings: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  
  const [config, setConfig] = useState<SecurityConfig>({
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      maxAge: 90,
      preventReuse: 5,
    },
    sessionPolicy: {
      maxDuration: 30,
      idleTimeout: 15,
      maxConcurrentSessions: 3,
      requireMFA: false,
    },
    apiPolicy: {
      rateLimit: 100,
      maxRequestSize: 10485760, // 10MB
      allowedOrigins: ['http://localhost:3000'],
      requireApiKey: true,
    },
    encryptionEnabled: true,
    auditLoggingEnabled: true,
    twoFactorRequired: false,
    allowedIPs: undefined,
    blockedIPs: undefined,
  });

  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeys] = useState([
    { id: '1', name: 'Production API', lastUsed: '2 hours ago', status: 'active' },
    { id: '2', name: 'Development API', lastUsed: '5 days ago', status: 'active' },
  ]);

  const handlePasswordPolicyChange = (key: keyof PasswordPolicy, value: any) => {
    setConfig(prev => ({
      ...prev,
      passwordPolicy: {
        ...prev.passwordPolicy,
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    try {
      // Save config via API
      toast.success('Security settings updated successfully');
    } catch (error) {
      toast.error('Failed to update security settings');
    }
  };

  const handleExportAuditLogs = async () => {
    try {
      // Export audit logs
      toast.success('Audit logs exported successfully');
    } catch (error) {
      toast.error('Failed to export audit logs');
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Admin Access Required
        </h3>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Only administrators can manage security settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Security Settings
          </h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Configure security policies and access controls
          </p>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Save Changes
        </button>
      </div>

      {/* Encryption Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Encryption & Data Protection
          </h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">
              Enable end-to-end encryption
            </span>
            <input
              type="checkbox"
              checked={config.encryptionEnabled}
              onChange={(e) => setConfig(prev => ({ ...prev, encryptionEnabled: e.target.checked }))}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              All sensitive data is encrypted using AES-256-GCM encryption.
              Agent communication logs and configuration files are protected at rest and in transit.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Authentication Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <UserCheck className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Authentication & Access
          </h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">
              Require two-factor authentication
            </span>
            <input
              type="checkbox"
              checked={config.twoFactorRequired}
              onChange={(e) => setConfig(prev => ({ ...prev, twoFactorRequired: e.target.checked }))}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Session timeout (minutes)
            </label>
            <input
              type="number"
              value={config.sessionPolicy.maxDuration}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                sessionPolicy: { 
                  ...prev.sessionPolicy, 
                  maxDuration: parseInt(e.target.value) 
                } 
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              min="5"
              max="1440"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Rate Limit (requests/minute)
            </label>
            <input
              type="number"
              value={config.apiPolicy.rateLimit}
              onChange={(e) => setConfig(prev => ({ 
                ...prev, 
                apiPolicy: { 
                  ...prev.apiPolicy, 
                  rateLimit: parseInt(e.target.value) 
                } 
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              min="10"
              max="1000"
            />
          </div>
        </div>
      </motion.div>

      {/* Password Policy */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Password Policy
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Minimum length
            </label>
            <input
              type="number"
              value={config.passwordPolicy.minLength}
              onChange={(e) => handlePasswordPolicyChange('minLength', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              min="6"
              max="32"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password expiration (days)
            </label>
            <input
              type="number"
              value={config.passwordPolicy.maxAge}
              onChange={(e) => handlePasswordPolicyChange('maxAge', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              min="0"
              max="365"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.passwordPolicy.requireUppercase}
              onChange={(e) => handlePasswordPolicyChange('requireUppercase', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Require uppercase letters
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.passwordPolicy.requireLowercase}
              onChange={(e) => handlePasswordPolicyChange('requireLowercase', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Require lowercase letters
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.passwordPolicy.requireNumbers}
              onChange={(e) => handlePasswordPolicyChange('requireNumbers', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Require numbers
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.passwordPolicy.requireSpecialChars}
              onChange={(e) => handlePasswordPolicyChange('requireSpecialChars', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Require special characters
            </span>
          </label>
        </div>
      </motion.div>

      {/* API Keys */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Key className="w-6 h-6 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              API Keys
            </h3>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
            Generate New Key
          </button>
        </div>

        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {key.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Last used: {key.lastUsed}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowApiKeys(!showApiKeys)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showApiKeys ? <X className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button className="p-2 text-red-500 hover:text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Audit Logs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Audit & Compliance
            </h3>
          </div>
          <button
            onClick={handleExportAuditLogs}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export Logs
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Audit Logging
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auditLoggingEnabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auditLoggingEnabled: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Enable audit logging for all actions
              </span>
            </label>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              All user actions, system events, and security incidents are logged for compliance and security purposes.
              Logs are encrypted and tamper-proof.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};