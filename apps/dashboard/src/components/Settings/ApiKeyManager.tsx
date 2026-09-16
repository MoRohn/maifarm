import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { useUserStore } from '@/store/userStore';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  service: string;
  permissions: string[];
  createdAt: Date;
  lastUsed?: Date;
}

export const ApiKeyManager: React.FC = () => {
  const { preferences, updatePreferences } = useUserStore();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(preferences?.apiKeys || []);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [claudeKeyStatus, setClaudeKeyStatus] = useState<'checking' | 'configured' | 'not-configured'>('checking');
  const [openaiKeyStatus, setOpenaiKeyStatus] = useState<'checking' | 'configured' | 'not-configured'>('checking');
  
  const [newKey, setNewKey] = useState({
    name: '',
    service: '',
    permissions: [] as string[],
    customKey: '' // For entering existing API keys
  });

  // Check if Claude and OpenAI API keys are configured on the server
  useEffect(() => {
    checkClaudeKeyStatus();
    checkOpenAIKeyStatus();
    // Load any stored API keys from localStorage/server
    loadStoredApiKeys();
  }, []);

  const checkClaudeKeyStatus = async () => {
    try {
      const response = await fetch('/api/apikeys/claude/status');
      if (response.ok) {
        const data = await response.json();
        setClaudeKeyStatus(data.configured ? 'configured' : 'not-configured');
      } else {
        setClaudeKeyStatus('not-configured');
      }
    } catch (error) {
      console.error('Error checking Claude API key status:', error);
      setClaudeKeyStatus('not-configured');
    }
  };

  const checkOpenAIKeyStatus = async () => {
    try {
      const response = await fetch('/api/openai/status');
      if (response.ok) {
        const data = await response.json();
        setOpenaiKeyStatus(data.configured ? 'configured' : 'not-configured');
      } else {
        setOpenaiKeyStatus('not-configured');
      }
    } catch (error) {
      console.error('Error checking OpenAI API key status:', error);
      setOpenaiKeyStatus('not-configured');
    }
  };

  const loadStoredApiKeys = () => {
    // Load from localStorage for persistence (with iOS Safari private browsing safety)
    let storedKeys: string | null = null;
    try {
      storedKeys = localStorage.getItem('maifarm_api_keys');
    } catch (e) {
      console.warn('Failed to access localStorage:', e);
      return; // Exit early if localStorage is not available
    }
    if (storedKeys) {
      try {
        const parsed = JSON.parse(storedKeys);
        setApiKeys(parsed);
        // Send Claude keys to server if found
        const claudeKey = parsed.find((k: ApiKey) => k.service === 'Claude');
        if (claudeKey) {
          // Re-configure on server in case it restarted
          fetch('/api/apikeys/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: claudeKey.key, name: claudeKey.name })
          }).catch(console.error);
        }
        // Send OpenAI keys to server if found
        const openaiKey = parsed.find((k: ApiKey) => k.service === 'OpenAI');
        if (openaiKey) {
          // Re-configure on server in case it restarted
          fetch('/api/openai/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              apiKey: openaiKey.key,
              model: 'gpt-4-turbo-preview',
              maxTokens: 128000
            })
          }).catch(console.error);
        }
      } catch (error) {
        console.error('Error loading stored API keys:', error);
      }
    }
  };

  const services = [
    'Claude',
    'OpenAI',
    'GitHub',
    'GitLab',
    'Slack',
    'Discord',
    'Custom'
  ];

  const permissions = [
    'read',
    'write',
    'delete',
    'admin'
  ];

  const generateApiKey = () => {
    return 'sk_' + Array.from({ length: 48 }, () => 
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
    ).join('');
  };

  const handleCreateKey = async () => {
    // Use custom key if provided, otherwise generate one
    const apiKeyValue = newKey.customKey || generateApiKey();
    
    const key: ApiKey = {
      id: Date.now().toString(),
      name: newKey.name,
      key: apiKeyValue,
      service: newKey.service,
      permissions: newKey.permissions,
      createdAt: new Date()
    };

    // If it's a Claude API key, send it to the server
    if (newKey.service === 'Claude') {
      try {
        const response = await fetch('/api/apikeys/claude', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiKey: key.key, name: key.name })
        });
        
        if (!response.ok) {
          console.error('Failed to configure Claude API key on server');
          toast.error('Failed to configure Claude API key on server');
        } else {
          toast.success('Claude API key configured successfully');
        }
      } catch (error) {
        console.error('Error configuring Claude API key:', error);
        toast.error('Failed to configure Claude API key. Please try again.');
      }
    }

    // If it's an OpenAI API key, send it to the server
    if (newKey.service === 'OpenAI') {
      try {
        const response = await fetch('/api/openai/configure', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            apiKey: key.key,
            model: 'gpt-4-turbo-preview',
            maxTokens: 128000,
            temperature: 0.7
          })
        });
        
        if (!response.ok) {
          console.error('Failed to configure OpenAI API key on server');
          toast.error('Failed to configure OpenAI API key on server');
        } else {
          toast.success('OpenAI API key configured successfully');
        }
      } catch (error) {
        console.error('Error configuring OpenAI API key:', error);
        toast.error('Failed to configure OpenAI API key. Please try again.');
      }
    }

    const updated = [...apiKeys, key];
    setApiKeys(updated);
    updatePreferences({ apiKeys: updated });

    // Save to localStorage for persistence (with iOS Safari private browsing safety)
    try {
      localStorage.setItem('maifarm_api_keys', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save API keys to localStorage:', e);
    }
    
    // Refresh key status if we just added one
    if (newKey.service === 'Claude') {
      setTimeout(checkClaudeKeyStatus, 500);
    }
    if (newKey.service === 'OpenAI') {
      setTimeout(checkOpenAIKeyStatus, 500);
    }
    
    setShowNewKeyModal(false);
    setNewKey({ name: '', service: '', permissions: [], customKey: '' });
  };

  const handleDeleteKey = (id: string) => {
    const keyToDelete = apiKeys.find(k => k.id === id);
    const updated = apiKeys.filter(key => key.id !== id);
    setApiKeys(updated);
    updatePreferences({ apiKeys: updated });

    // Update localStorage (with iOS Safari private browsing safety)
    try {
      localStorage.setItem('maifarm_api_keys', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to update API keys in localStorage:', e);
    }
    
    // If deleting API key, refresh status
    if (keyToDelete?.service === 'Claude') {
      setTimeout(checkClaudeKeyStatus, 500);
    }
    if (keyToDelete?.service === 'OpenAI') {
      setTimeout(checkOpenAIKeyStatus, 500);
    }
  };

  const toggleShowKey = (id: string) => {
    setShowKeys({ ...showKeys, [id]: !showKeys[id] });
  };

  const copyToClipboard = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskApiKey = (key: string) => {
    return key.substring(0, 7) + '•'.repeat(key.length - 11) + key.substring(key.length - 4);
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            API Keys
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage API keys for external integrations
          </p>
        </div>
        <button
          onClick={() => setShowNewKeyModal(true)}
          className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 self-start sm:self-auto"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          New API Key
        </button>
      </div>

      {/* API Provider Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claude API Key Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Claude API Status:
            </span>
            {claudeKeyStatus === 'checking' ? (
              <span className="text-sm text-gray-500">Checking...</span>
            ) : claudeKeyStatus === 'configured' ? (
              <div className="flex items-center space-x-1">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <XCircleIcon className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">Not Configured</span>
              </div>
            )}
          </div>
          {claudeKeyStatus === 'not-configured' && (
            <button
              onClick={() => {
                setNewKey({ ...newKey, service: 'Claude' });
                setShowNewKeyModal(true);
              }}
              className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
            >
              Add Claude Key
            </button>
          )}
        </div>

        {/* OpenAI API Key Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              OpenAI API Status:
            </span>
            {openaiKeyStatus === 'checking' ? (
              <span className="text-sm text-gray-500">Checking...</span>
            ) : openaiKeyStatus === 'configured' ? (
              <div className="flex items-center space-x-1">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">Configured</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <XCircleIcon className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">Not Configured</span>
              </div>
            )}
          </div>
          {openaiKeyStatus === 'not-configured' && (
            <button
              onClick={() => {
                setNewKey({ ...newKey, service: 'OpenAI' });
                setShowNewKeyModal(true);
              }}
              className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
            >
              Add OpenAI Key
            </button>
          )}
        </div>
      </div>

      {/* API Keys List */}
      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <div className="text-center py-12">
            <KeyIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No API keys configured</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Add API keys to connect with external services
            </p>
          </div>
        ) : (
          apiKeys.map((apiKey) => (
            <motion.div
              key={apiKey.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors duration-200 bg-white dark:bg-gray-800/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {apiKey.name}
                    </h4>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                      {apiKey.service}
                    </span>
                  </div>
                  
                  <div className="mt-3">
                    <div className="flex items-center p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                      <code className="flex-1 text-sm font-mono text-gray-600 dark:text-gray-400 truncate">
                        {showKeys[apiKey.id] ? apiKey.key : maskApiKey(apiKey.key)}
                      </code>
                      <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                        <button
                          onClick={() => toggleShowKey(apiKey.id)}
                          className="p-1 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          title={showKeys[apiKey.id] ? "Hide key" : "Show key"}
                        >
                          {showKeys[apiKey.id] ? (
                            <EyeSlashIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                          className="p-1 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedKey === apiKey.id ? (
                            <CheckIcon className="w-4 h-4 text-green-500" />
                          ) : (
                            <ClipboardDocumentIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Created: {new Date(apiKey.createdAt).toLocaleDateString()}</span>
                      {apiKey.lastUsed && (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">•</span>
                          <span>Last used: {new Date(apiKey.lastUsed).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Permissions:</span>
                      {apiKey.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteKey(apiKey.id)}
                  className="flex-shrink-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* New API Key Modal */}
      <AnimatePresence>
        {showNewKeyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowNewKeyModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6"
            >
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Create New API Key
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKey.name}
                    onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Production API Key"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Service
                  </label>
                  <select
                    value={newKey.service}
                    onChange={(e) => setNewKey({ ...newKey, service: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select a service</option>
                    {services.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </div>

                {newKey.service === 'Claude' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API Key (Enter your Anthropic API key)
                    </label>
                    <input
                      type="password"
                      value={newKey.customKey}
                      onChange={(e) => setNewKey({ ...newKey, customKey: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      placeholder="sk-ant-api03-..."
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300">console.anthropic.com</a>
                    </p>
                  </div>
                )}

                {newKey.service === 'OpenAI' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API Key (Enter your OpenAI API key)
                    </label>
                    <input
                      type="password"
                      value={newKey.customKey}
                      onChange={(e) => setNewKey({ ...newKey, customKey: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300">platform.openai.com</a>
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Permissions
                  </label>
                  <div className="space-y-2">
                    {permissions.map((permission) => (
                      <label key={permission} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={newKey.permissions.includes(permission)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewKey({
                                ...newKey,
                                permissions: [...newKey.permissions, permission]
                              });
                            } else {
                              setNewKey({
                                ...newKey,
                                permissions: newKey.permissions.filter(p => p !== permission)
                              });
                            }
                          }}
                          className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                          {permission.charAt(0).toUpperCase() + permission.slice(1)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowNewKeyModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateKey}
                  disabled={!newKey.name || !newKey.service || newKey.permissions.length === 0 || 
                           ((newKey.service === 'Claude' || newKey.service === 'OpenAI') && !newKey.customKey)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 font-medium"
                >
                  Create Key
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApiKeyManager;