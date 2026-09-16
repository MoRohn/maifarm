import React, { useMemo, useState } from 'react';
import {
  Github,
  Gitlab,
  MessageSquare,
  Zap,
  Plus,
  X,
  Edit,
  CheckCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/settingsStore';
import type { IntegrationConfig } from '@/types/settings';

const serviceMeta = {
  github: {
    name: 'GitHub',
    description: 'Sync repositories, trigger actions, and manage PR workflows.',
    icon: <Github className="w-6 h-6" />,
  },
  gitlab: {
    name: 'GitLab',
    description: 'Connect GitLab projects and pipelines for CI/CD orchestration.',
    icon: <Gitlab className="w-6 h-6" />,
  },
  slack: {
    name: 'Slack',
    description: 'Send farm notifications and agent alerts directly to Slack channels.',
    icon: <MessageSquare className="w-6 h-6" />,
  },
  discord: {
    name: 'Discord',
    description: 'Keep your Discord community updated with MaiFarm activity.',
    icon: <MessageSquare className="w-6 h-6" />,
  },
  webhook: {
    name: 'Webhook',
    description: 'Trigger custom HTTP callbacks for farm lifecycle events.',
    icon: <Zap className="w-6 h-6" />,
  },
} as const;

type ServiceId = keyof typeof serviceMeta;

const IntegrationSettings: React.FC = () => {
  const {
    integrations,
    addIntegration,
    updateIntegration,
    removeIntegration,
  } = useSettingsStore();

  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<IntegrationConfig | null>(null);

  const services = useMemo(() => Object.entries(serviceMeta) as Array<[ServiceId, typeof serviceMeta[ServiceId]]>, []);
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Integrations</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Bridge MaiFarm with your development and collaboration tools.
        </p>
      </div>

      <div className="grid gap-4">
        {services.map(([id, meta]) => {
          const existing = integrations.find((integration) => integration.id === id);
          const connected = Boolean(existing);

          return (
            <motion.div
              key={id}
              layout
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                    {meta.icon}
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                      {meta.name}
                      {connected && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{meta.description}</p>
                    {connected && existing?.config && existing.config.channel && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Channel: {(existing.config as any).channel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connected ? (
                    <>
                      <button
                        onClick={() => setEditingIntegration(existing)}
                        className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeIntegration(existing.id)}
                        className="px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() =>
                        addIntegration({
                          id,
                          name: meta.name,
                          type: id,
                          enabled: true,
                          config: {},
                        })
                      }
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Webhooks</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Trigger custom HTTP callbacks when farms start, finish, or fail.
            </p>
          </div>
          <button
            onClick={() => setShowWebhookModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Webhook
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Once created, webhooks appear in the integration list above and can be managed from there.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Integration Logs</h4>
        <div className="space-y-3 text-xs text-gray-500 dark:text-gray-400">
          <p>No integration events recorded yet. Connections will appear here.</p>
        </div>
      </div>

      <AnimatePresence>
        {showWebhookModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowWebhookModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Webhook</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Define an endpoint to receive MaiFarm event payloads.
                  </p>
                </div>
                <button
                  onClick={() => setShowWebhookModal(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/hooks/maifarm"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select events
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      Farm Completed
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      Agent Error
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      Resource Alert
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                      Farm Failure
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-200">
                  <Zap className="w-4 h-4" />
                  Webhooks require an authentication secret. Store it in your MaiFarm environment variables.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-700">
                <button
                  onClick={() => setShowWebhookModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowWebhookModal(false)}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <CheckCircle className="w-4 h-4" />
                  Save Webhook
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingIntegration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setEditingIntegration(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Configure {editingIntegration.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Update connection details and defaults for this integration.
                  </p>
                </div>
                <button
                  onClick={() => setEditingIntegration(null)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Display name
                  </label>
                  <input
                    type="text"
                    defaultValue={editingIntegration.name}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="grid gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked={editingIntegration.enabled} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    Enabled
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                    Archive logs
                  </label>
                </div>

                <div className="rounded-lg bg-gray-50 p-4 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  Secure tokens and secrets for integrations should be stored in the MaiFarm backend vault.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-700">
                <button
                  onClick={() => setEditingIntegration(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateIntegration(editingIntegration.id, { enabled: true });
                    setEditingIntegration(null);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <CheckCircle className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default IntegrationSettings;
