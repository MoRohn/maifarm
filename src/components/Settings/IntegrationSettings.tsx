import React, { useState } from 'react';
import { 
  Github, 
  Gitlab, 
  MessageSquare, 
  Zap, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntegrationConfig } from '../../types/settings';

interface Integration {
  id: string;
  name: string;
  type: 'github' | 'gitlab' | 'slack' | 'discord' | 'webhook';
  icon: React.ReactNode;
  description: string;
  connected: boolean;
  config?: IntegrationConfig;
}

const IntegrationSettings: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: '1',
      name: 'GitHub',
      type: 'github',
      icon: <Github className="w-6 h-6" />,
      description: 'Connect to GitHub for automatic PR creation and code syncing',
      connected: false
    },
    {
      id: '2',
      name: 'GitLab',
      type: 'gitlab',
      icon: <Gitlab className="w-6 h-6" />,
      description: 'Integrate with GitLab for CI/CD pipeline management',
      connected: false
    },
    {
      id: '3',
      name: 'Slack',
      type: 'slack',
      icon: <MessageSquare className="w-6 h-6" />,
      description: 'Send farm notifications and updates to Slack channels',
      connected: true,
      config: {
        id: '3',
        name: 'Slack',
        type: 'slack',
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/services/...',
        config: {
          channel: '#maifarm-updates',
          username: 'MaiFarm Bot'
        }
      }
    },
    {
      id: '4',
      name: 'Discord',
      type: 'discord',
      icon: <MessageSquare className="w-6 h-6" />,
      description: 'Post updates and alerts to Discord servers',
      connected: false
    }
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [webhooks, setWebhooks] = useState<any[]>([]);

  const handleConnect = (integration: Integration) => {
    // Simulate connection process
    setIntegrations(prev => 
      prev.map(i => 
        i.id === integration.id 
          ? { ...i, connected: true }
          : i
      )
    );
  };

  const handleDisconnect = (integration: Integration) => {
    setIntegrations(prev => 
      prev.map(i => 
        i.id === integration.id 
          ? { ...i, connected: false, config: undefined }
          : i
      )
    );
  };

  const addWebhook = () => {
    const newWebhook = {
      id: Date.now().toString(),
      name: 'New Webhook',
      url: '',
      events: ['farm.completed', 'agent.error'],
      enabled: true
    };
    setWebhooks([...webhooks, newWebhook]);
  };

  const removeWebhook = (id: string) => {
    setWebhooks(webhooks.filter(w => w.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Integrations
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Connect MaiFarm with your favorite tools and services.
        </p>
      </div>

      {/* Service Integrations */}
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">Services</h4>
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <motion.div
              key={integration.id}
              layout
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {integration.icon}
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      {integration.name}
                      {integration.connected && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </h5>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {integration.description}
                    </p>
                    {integration.connected && integration.config && (
                      <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                        {integration.type === 'slack' && (
                          <span>Connected to {(integration.config.config as any).channel}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {integration.connected ? (
                    <>
                      <button
                        onClick={() => setEditingIntegration(integration)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDisconnect(integration)}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(integration)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Webhooks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Webhooks</h4>
          <button
            onClick={addWebhook}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Webhook
          </button>
        </div>

        <AnimatePresence>
          {webhooks.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
              <Zap className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                No webhooks configured yet. Add a webhook to receive real-time updates.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((webhook) => (
                <motion.div
                  key={webhook.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={webhook.name}
                        onChange={(e) => {
                          setWebhooks(prev => 
                            prev.map(w => 
                              w.id === webhook.id 
                                ? { ...w, name: e.target.value }
                                : w
                            )
                          );
                        }}
                        className="font-medium text-gray-900 dark:text-white bg-transparent border-0 p-0 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                        placeholder="Webhook Name"
                      />
                      <input
                        type="url"
                        value={webhook.url}
                        onChange={(e) => {
                          setWebhooks(prev => 
                            prev.map(w => 
                              w.id === webhook.id 
                                ? { ...w, url: e.target.value }
                                : w
                            )
                          );
                        }}
                        className="w-full mt-2 text-sm text-gray-600 dark:text-gray-400 bg-transparent border-0 p-0 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                        placeholder="https://your-webhook-url.com"
                      />
                      <div className="flex items-center gap-4 mt-3">
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={webhook.enabled}
                            onChange={(e) => {
                              setWebhooks(prev => 
                                prev.map(w => 
                                  w.id === webhook.id 
                                    ? { ...w, enabled: e.target.checked }
                                    : w
                                )
                              );
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Enabled
                        </label>
                        <span className="text-sm text-gray-500">
                          Events: {webhook.events.join(', ')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeWebhook(webhook.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* API Keys */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">API Keys</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage API keys for programmatic access to MaiFarm
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Key className="w-4 h-4" />
            Generate Key
          </button>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h5 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                API Access in Beta
              </h5>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                API access is currently in beta. Please contact support to request access to the MaiFarm API.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1 mt-2 text-sm text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
              >
                Learn more about the API
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationSettings;