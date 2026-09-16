import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, AlertCircle, Info, Clock, Key, Settings, Lock } from 'lucide-react';

interface AgentErrorDetails {
  farmId: string;
  agentId: number;
  agentName: string;
  severity: 'error' | 'warning' | 'critical';
  type: 'api_key' | 'cli_missing' | 'permission' | 'timeout' | 'crash' | 'unknown';
  message: string;
  rawOutput: string;
  timestamp: Date;
  context?: string;
}

interface AgentErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: AgentErrorDetails | null;
}

const errorTypeConfig = {
  api_key: {
    icon: Key,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    title: 'API Key Issue',
    suggestions: [
      'Check your Anthropic API key in Settings > API Keys',
      'Ensure the API key has not expired',
      'Verify the API key has sufficient credits'
    ]
  },
  cli_missing: {
    icon: Settings,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    title: 'Claude CLI Missing',
    suggestions: [
      'Install Claude CLI: npm install -g @anthropic-ai/cli',
      'Restart the application after installation',
      'Check your PATH environment variable'
    ]
  },
  permission: {
    icon: Lock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    title: 'Permission Denied',
    suggestions: [
      'Check file and directory permissions',
      'Ensure the agent has write access to the workspace',
      'Verify network permissions if accessing external resources'
    ]
  },
  timeout: {
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    title: 'Request Timeout',
    suggestions: [
      'Check your internet connection',
      'The agent will retry automatically',
      'Consider increasing the timeout in settings if this persists'
    ]
  },
  crash: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    title: 'Agent Crashed',
    suggestions: [
      'The agent has been automatically restarted',
      'Check system resources (memory, CPU)',
      'Review the full output for more details'
    ]
  },
  unknown: {
    icon: AlertCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    title: 'Unknown Issue',
    suggestions: [
      'Check the full output for more context',
      'The agent will continue processing',
      'Contact support if this error persists'
    ]
  }
};

const severityConfig = {
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Critical'
  },
  error: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Error'
  },
  warning: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    label: 'Warning'
  }
};

export const AgentErrorModal: React.FC<AgentErrorModalProps> = ({
  isOpen,
  onClose,
  error
}) => {
  if (!error) return null;

  const errorConfig = errorTypeConfig[error.type] || errorTypeConfig.unknown;
  const severityColors = severityConfig[error.severity];
  const IconComponent = errorConfig.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 
                       w-full max-w-2xl max-h-[90vh] overflow-y-auto
                       bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50
                       border border-gray-200 dark:border-gray-700"
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-700 ${errorConfig.bgColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${severityColors.bgColor}`}>
                    <IconComponent className={`w-6 h-6 ${errorConfig.color}`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {errorConfig.title}
                    </h2>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${severityColors.bgColor} ${severityColors.color}`}>
                        {severityColors.label}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Agent {error.agentName}
                      </span>
                      <span className="text-sm text-gray-400">
                        {error.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4">
              {/* Error Message */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Error Message
                </h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                  <p className="text-sm text-gray-900 dark:text-white font-medium">
                    {error.message}
                  </p>
                </div>
              </div>

              {/* Raw Output */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Raw Output
                </h3>
                <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                  <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                    {error.rawOutput}
                  </pre>
                </div>
              </div>

              {/* Context (if available) */}
              {error.context && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Context
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                    <pre className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                      {error.context}
                    </pre>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Suggested Actions
                </h3>
                <div className="space-y-2">
                  {errorConfig.suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Farm Info */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Farm ID:</span>
                    <span className="ml-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {error.farmId}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Agent:</span>
                    <span className="ml-2 text-gray-700 dark:text-gray-300">
                      {error.agentName} (ID: {error.agentId})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(error, null, 2));
                  // TODO: Show toast notification
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 
                          bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                          rounded-lg transition-colors"
              >
                Copy Details
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 
                          hover:bg-blue-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};