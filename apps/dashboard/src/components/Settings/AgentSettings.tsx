import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Bot, 
  Settings, 
  Sliders, 
  Clock, 
  Users,
  Zap,
  Shield,
  Save,
  RotateCcw,
  Info,
  AlertTriangle,
  Rocket,
  Cpu
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore, calculateMaxAgents } from '@/store/settingsStore';
import { settingsPersistence } from '@/utils/settingsPersistence';

export interface AgentConfiguration {
  maxAgents: number;
  staggerTime: number;
  defaultTimeout: number;
  autoRestart: boolean;
  parallelExecution: boolean;
  memoryLimit: number;
  cpuLimit: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  coordinationMode: 'centralized' | 'distributed' | 'hybrid';
  taskAllocation: 'round-robin' | 'load-balanced';
  failoverStrategy: 'restart' | 'reassign' | 'skip';
  agentMode: 'default' | 'supercharge' | 'ultrafarmer';
  defaultInterval: number;
}

type SettingType = 
  | {
      key: string;
      label: string;
      type: 'toggle';
      description: string;
      icon: any;
      disabled?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'number';
      min: number;
      max: number;
      step?: number;
      description: string;
      icon: any;
      disabled?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'select';
      options: { value: string; label: string }[];
      description: string;
      icon: any;
      disabled?: boolean;
    };

interface SettingSection {
  title: string;
  icon: any;
  settings: SettingType[];
}

interface AgentSettingsProps {
  className?: string;
  onSave?: (config: AgentConfiguration) => void;
}

export const AgentSettings: React.FC<AgentSettingsProps> = ({
  className,
  onSave
}) => {
  const { agentConfig, updateAgentConfig } = useSettingsStore();
  const [localConfig, setLocalConfig] = useState<AgentConfiguration>(agentConfig);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load persisted settings on mount
    const persisted = settingsPersistence.loadAgentSettings();
    if (persisted) {
      setLocalConfig(persisted);
      updateAgentConfig(persisted);
    }
  }, []);

  useEffect(() => {
    // Check if there are unsaved changes
    setHasChanges(JSON.stringify(localConfig) !== JSON.stringify(agentConfig));
  }, [localConfig, agentConfig]);

  const handleChange = (_key: keyof AgentConfiguration, _value: any) => {
    setLocalConfig(prev => {
      const updated = {
        ...prev,
        [_key]: _value
      };
      
      // Automatically update maxAgents when agentMode changes
      if (_key === 'agentMode') {
        updated.maxAgents = calculateMaxAgents(_value);
      }
      
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to store
      updateAgentConfig(localConfig);
      
      // Persist to local storage
      settingsPersistence.saveAgentSettings(localConfig);
      
      // Call optional callback
      onSave?.(localConfig);
      
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save agent settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaultConfig = settingsPersistence.getDefaultAgentSettings();
    setLocalConfig(defaultConfig);
  };

  const settingSections: SettingSection[] = [
    {
      title: 'Agent Mode',
      icon: Rocket,
      settings: [
        {
          key: 'agentMode',
          label: 'Agent Mode',
          type: 'select',
          options: [
            { value: 'default', label: 'Default (8 agents)' },
            { value: 'supercharge', label: 'Supercharge (+2 agents)' },
            { value: 'ultrafarmer', label: 'UltraFarmer Mode (GPU-based)' }
          ],
          description: 'Choose your agent capacity mode',
          icon: Rocket
        }
      ]
    },
    {
      title: 'Agent Management',
      icon: Users,
      settings: [
        {
          key: 'staggerTime',
          label: 'Stagger Time (ms)',
          type: 'number',
          min: 0,
          max: 10000,
          step: 100,
          description: 'Delay between agent startups',
          icon: Clock
        },
        {
          key: 'parallelExecution',
          label: 'Parallel Execution',
          type: 'toggle',
          description: 'Allow agents to run in parallel',
          icon: Zap
        }
      ]
    },
    {
      title: 'Resource Limits',
      icon: Shield,
      settings: [
        {
          key: 'memoryLimit',
          label: 'Memory Limit (MB)',
          type: 'number',
          min: 256,
          max: 8192,
          step: 256,
          description: 'Maximum memory per agent',
          icon: Shield
        },
        {
          key: 'cpuLimit',
          label: 'CPU Limit (%)',
          type: 'number',
          min: 10,
          max: 100,
          step: 10,
          description: 'Maximum CPU usage per agent',
          icon: Zap
        },
        {
          key: 'defaultTimeout',
          label: 'Default Timeout (s)',
          type: 'number',
          min: 30,
          max: 3600,
          step: 30,
          description: 'Default task timeout in seconds',
          icon: Clock
        }
      ]
    },
    {
      title: 'Coordination',
      icon: Settings,
      settings: [
        {
          key: 'coordinationMode',
          label: 'Coordination Mode',
          type: 'select',
          options: [
            { value: 'centralized', label: 'Centralized' },
            { value: 'distributed', label: 'Distributed' },
            { value: 'hybrid', label: 'Hybrid' }
          ],
          description: 'How agents coordinate with each other',
          icon: Bot
        },
        {
          key: 'taskAllocation',
          label: 'Task Allocation',
          type: 'select',
          options: [
            { value: 'round-robin', label: 'Round Robin' },
            { value: 'load-balanced', label: 'Load Balanced' }
          ],
          description: 'How tasks are assigned to agents',
          icon: Sliders
        },
        {
          key: 'failoverStrategy',
          label: 'Failover Strategy',
          type: 'select',
          options: [
            { value: 'restart', label: 'Restart Agent' },
            { value: 'reassign', label: 'Reassign Task' },
            { value: 'skip', label: 'Skip Task' }
          ],
          description: 'What to do when an agent fails',
          icon: AlertTriangle
        }
      ]
    },
    {
      title: 'Logging',
      icon: Info,
      settings: [
        {
          key: 'enableLogging',
          label: 'Enable Logging',
          type: 'toggle',
          description: 'Enable agent activity logging',
          icon: Info
        },
        {
          key: 'logLevel',
          label: 'Log Level',
          type: 'select',
          options: [
            { value: 'debug', label: 'Debug' },
            { value: 'info', label: 'Info' },
            { value: 'warn', label: 'Warning' },
            { value: 'error', label: 'Error' }
          ],
          description: 'Minimum log level to capture',
          icon: Info,
          disabled: !localConfig.enableLogging
        },
        {
          key: 'autoRestart',
          label: 'Auto Restart',
          type: 'toggle',
          description: 'Automatically restart failed agents',
          icon: RotateCcw
        }
      ]
    }
  ];

  const intervalOptions = [
    { value: 5, label: '5m' },
    { value: 10, label: '10m' },
    { value: 30, label: '30m' },
    { value: 60, label: '1hr' },
    { value: 120, label: '2hr' }
  ];

  const [customHours, setCustomHours] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleCustomHoursSubmit = () => {
    const hours = parseInt(customHours);
    if (hours > 0 && hours <= 24) {
      handleChange('defaultInterval', hours * 60); // Convert hours to minutes
      setShowCustomInput(false);
      setCustomHours('');
    }
  };

  const isCustomInterval = () => {
    return !intervalOptions.some(option => option.value === localConfig.defaultInterval);
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-apple">
            <Bot className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Agent Configuration
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure how AI agents operate and coordinate
            </p>
          </div>
        </div>
        
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center space-x-2"
          >
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                'flex items-center space-x-2 px-4 py-2 rounded-apple-lg transition-colors',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {saving ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <RotateCcw className="w-4 h-4" />
                </motion.div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </motion.div>
        )}
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {settingSections.map((section) => {
          const SectionIcon = section.icon;
          
          return (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-sm p-6"
            >
              <div className="flex items-center space-x-2 mb-4">
                <SectionIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {section.title}
                </h3>
              </div>
              
              <div className="space-y-4">
                {section.settings.map((setting) => {
                  const SettingIcon = setting.icon;
                  const value = localConfig[setting.key as keyof AgentConfiguration];
                  
                  return (
                    <div
                      key={setting.key}
                      className={clsx(
                        'flex items-center justify-between py-3 px-4',
                        'bg-gray-50 dark:bg-gray-800 rounded-apple-lg',
                        ('disabled' in setting && setting.disabled) && 'opacity-50'
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        <SettingIcon className="w-4 h-4 text-gray-500 mt-0.5" />
                        <div>
                          <label className="text-sm font-medium text-gray-900 dark:text-white">
                            {setting.label}
                          </label>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {setting.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        {setting.type === 'toggle' && (
                          <button
                            onClick={() => handleChange(setting.key as keyof AgentConfiguration, !value)}
                            disabled={'disabled' in setting ? setting.disabled : false}
                            className={clsx(
                              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                              value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                            )}
                          >
                            <span
                              className={clsx(
                                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                value ? 'translate-x-6' : 'translate-x-1'
                              )}
                            />
                          </button>
                        )}
                        
                        {setting.type === 'number' && (
                          <input
                            type="number"
                            value={value as number}
                            onChange={(e) => handleChange(setting.key as keyof AgentConfiguration, parseInt(e.target.value))}
                            min={'min' in setting ? setting.min : undefined}
                            max={'max' in setting ? setting.max : undefined}
                            step={'step' in setting ? setting.step : undefined}
                            disabled={'disabled' in setting ? setting.disabled : false}
                            className={clsx(
                              'w-24 px-3 py-1 text-sm rounded-apple',
                              'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
                              'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          />
                        )}
                        
                        {setting.type === 'select' && (
                          <select
                            value={value as string}
                            onChange={(e) => handleChange(setting.key as keyof AgentConfiguration, e.target.value)}
                            disabled={'disabled' in setting ? setting.disabled : false}
                            className={clsx(
                              'px-3 py-1 text-sm rounded-apple',
                              'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
                              'focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                          >
                            {'options' in setting && setting.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}

        {/* Custom Interval Selector Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-sm p-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Default Time Interval
            </h3>
          </div>
          
          <div className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-apple-lg">
            <div className="flex items-start space-x-3">
              <Clock className="w-4 h-4 text-gray-500 mt-0.5" />
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white">
                  Time Intervals
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Select default time interval for farms
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2 ml-4">
              {intervalOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleChange('defaultInterval', option.value)}
                  className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                    localConfig.defaultInterval === option.value
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  )}
                >
                  {option.label}
                </button>
              ))}
              
              {/* Custom Hours Input */}
              {showCustomInput ? (
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    placeholder="hrs"
                    min="1"
                    max="24"
                    className="w-12 h-12 rounded-full text-center text-sm font-medium bg-white dark:bg-gray-700 border-2 border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCustomHoursSubmit();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowCustomInput(false);
                        setCustomHours('');
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleCustomHoursSubmit}
                    className="w-6 h-6 rounded-full bg-green-500 text-white text-xs hover:bg-green-600 transition-colors flex items-center justify-center"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setShowCustomInput(false);
                      setCustomHours('');
                    }}
                    className="w-6 h-6 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 transition-colors flex items-center justify-center"
                  >
                    ✗
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                    isCustomInterval()
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/25'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  )}
                >
                  {isCustomInterval() ? `${Math.floor(localConfig.defaultInterval / 60)}h` : '+'}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Agent Count Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary-50 dark:bg-primary-900/20 rounded-apple-xl p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <span className="text-sm font-medium text-primary-900 dark:text-primary-300">
                Active Configuration
              </span>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-primary-900 dark:text-primary-300">
                {localConfig.maxAgents} agents
              </div>
              <div className="text-xs text-primary-600 dark:text-primary-400 capitalize">
                {localConfig.agentMode} mode
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};