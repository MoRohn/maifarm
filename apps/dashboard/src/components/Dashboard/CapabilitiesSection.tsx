import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Monitor,
  HardDrive,
  Zap,
  Gauge,
  Sparkles,
  Sprout,
  Trees,
  Warehouse,
  BarChart3,
  Terminal,
  Bot,
  Brain,
  Layers,
  GitBranch,
  Clock,
  Shield,
  Workflow,
  FileCode,
  MessageSquare,
  Eye,
  RefreshCw,
  Users,
  Settings,
  Palette
} from 'lucide-react';
import { clsx } from 'clsx';
import { useHardwareStore, getComputeScoreColor, getPerformanceBadgeColor } from '@/store/hardwareStore';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  accentColor?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  defaultExpanded = false,
  children,
  accentColor = 'primary'
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const colorClasses: Record<string, string> = {
    primary: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="bg-gray-100/70 dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/40 dark:border-gray-700/40 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            'p-2 rounded-xl bg-gradient-to-br text-white',
            colorClasses[accentColor]
          )}>
            {icon}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Device Capabilities Component
const DeviceCapabilities: React.FC = () => {
  const { capabilities, loading, error, detectHardware, healthStatus } = useHardwareStore();

  useEffect(() => {
    if (!capabilities) {
      detectHardware();
    }
  }, [capabilities, detectHardware]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Detecting hardware...</span>
        </div>
      </div>
    );
  }

  if (error || !capabilities) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
          {error || 'Unable to detect hardware capabilities'}
        </p>
        <button
          onClick={() => detectHardware(true)}
          className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Retry Detection
        </button>
      </div>
    );
  }

  const { cpu, gpu, memory, computeScore, platform, hasAppleSilicon, hasNvidiaGPU, hasAMDGPU } = capabilities;

  return (
    <div className="space-y-4">
      {/* Compute Score */}
      <div className="bg-gray-50/60 dark:bg-gray-700/40 backdrop-blur-sm rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-emerald-500" />
            <span className="font-medium text-gray-900 dark:text-white">Compute Score</span>
          </div>
          <span className={clsx('text-2xl font-bold', getComputeScoreColor(computeScore))}>
            {computeScore}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${computeScore}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={clsx(
              'h-2 rounded-full',
              computeScore >= 80 ? 'bg-green-500' :
              computeScore >= 60 ? 'bg-blue-500' :
              computeScore >= 40 ? 'bg-yellow-500' : 'bg-gray-500'
            )}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {computeScore >= 80 ? 'Excellent for AI workloads' :
           computeScore >= 60 ? 'Good performance expected' :
           computeScore >= 40 ? 'Moderate performance' : 'Basic functionality available'}
        </p>
      </div>

      {/* Hardware Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* CPU */}
        <div className="bg-gray-50/60 dark:bg-gray-700/40 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={cpu.model}>
            {cpu.model}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {cpu.cores} cores / {cpu.threads} threads
          </p>
          {hasAppleSilicon && (
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
              Apple Silicon
            </span>
          )}
        </div>

        {/* GPU */}
        <div className="bg-gray-50/60 dark:bg-gray-700/40 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">GPU</span>
          </div>
          {gpu ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={gpu.name}>
                {gpu.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {gpu.vramGB} GB VRAM
              </p>
              {(hasNvidiaGPU || hasAMDGPU) && (
                <span className={clsx(
                  'inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  hasNvidiaGPU ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                  'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                )}>
                  {hasNvidiaGPU ? 'NVIDIA CUDA' : 'AMD GPU'}
                </span>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Integrated graphics
            </p>
          )}
        </div>

        {/* Memory */}
        <div className="bg-gray-50/60 dark:bg-gray-700/40 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {memory.totalGB.toFixed(1)} GB Total
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {memory.availableGB.toFixed(1)} GB Available
          </p>
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-orange-500"
              style={{ width: `${((memory.totalGB - memory.availableGB) / memory.totalGB) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Platform Info */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        <span>Platform: {platform}</span>
        <span className={clsx(
          'flex items-center gap-1',
          healthStatus === 'healthy' ? 'text-green-500' :
          healthStatus === 'degraded' ? 'text-yellow-500' : 'text-red-500'
        )}>
          <div className={clsx(
            'w-2 h-2 rounded-full',
            healthStatus === 'healthy' ? 'bg-green-500' :
            healthStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
          )} />
          {healthStatus === 'healthy' ? 'System Ready' :
           healthStatus === 'degraded' ? 'Limited Mode' : 'Offline'}
        </span>
      </div>
    </div>
  );
};

// App Capabilities Component
const AppCapabilities: React.FC = () => {
  const capabilities = [
    {
      category: 'Farm Management',
      icon: <Sprout className="w-5 h-5" />,
      color: 'bg-green-500',
      items: [
        { icon: <Sprout className="w-4 h-4" />, title: 'Create Farms', description: 'Launch multi-agent AI farms with customizable configurations' },
        { icon: <Zap className="w-4 h-4" />, title: 'Quick Tasks', description: '5-minute focused tasks with single-agent execution' },
        { icon: <Trees className="w-4 h-4" />, title: 'Go Wild Mode', description: 'Autonomous exploration with self-directed agents' },
        { icon: <Clock className="w-4 h-4" />, title: 'Scheduled Runs', description: 'Set up recurring farm executions on your schedule' },
      ]
    },
    {
      category: 'AI Engines',
      icon: <Brain className="w-5 h-5" />,
      color: 'bg-purple-500',
      items: [
        { icon: <Bot className="w-4 h-4" />, title: 'Claude Integration', description: 'Anthropic Claude for advanced reasoning and coding' },
        { icon: <Sparkles className="w-4 h-4" />, title: 'OpenAI Support', description: 'GPT-4 and GPT-3.5 for versatile AI tasks' },
        { icon: <Cpu className="w-4 h-4" />, title: 'Local Models', description: 'Run Ollama models privately on your hardware' },
        { icon: <Zap className="w-4 h-4" />, title: 'GPT-OSS', description: 'Free, private AI with automatic hardware optimization' },
      ]
    },
    {
      category: 'Harvest & Barn',
      icon: <Warehouse className="w-5 h-5" />,
      color: 'bg-amber-500',
      items: [
        { icon: <FileCode className="w-4 h-4" />, title: 'Code Generation', description: 'Collect generated code, scripts, and configurations' },
        { icon: <Warehouse className="w-4 h-4" />, title: 'Yield Storage', description: 'Organized storage for all farm outputs' },
        { icon: <GitBranch className="w-4 h-4" />, title: 'Version Control', description: 'Track changes and iterations of your yields' },
        { icon: <RefreshCw className="w-4 h-4" />, title: 'Seed Recycling', description: 'Convert yields back into reusable seeds' },
      ]
    },
    {
      category: 'Monitoring & Analytics',
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'bg-blue-500',
      items: [
        { icon: <Terminal className="w-4 h-4" />, title: 'Live Terminal', description: 'Real-time streaming of agent activity' },
        { icon: <BarChart3 className="w-4 h-4" />, title: 'Performance Metrics', description: 'Track success rates, costs, and efficiency' },
        { icon: <Eye className="w-4 h-4" />, title: 'Agent Visibility', description: 'Monitor each agent\'s progress and status' },
        { icon: <Gauge className="w-4 h-4" />, title: 'Resource Usage', description: 'CPU, memory, and API consumption tracking' },
      ]
    },
    {
      category: 'Collaboration & Workflow',
      icon: <Users className="w-5 h-5" />,
      color: 'bg-indigo-500',
      items: [
        { icon: <Users className="w-4 h-4" />, title: 'Multi-Agent Teams', description: 'Coordinate up to 10 agents working together' },
        { icon: <Workflow className="w-4 h-4" />, title: 'Task Distribution', description: 'Automatic work allocation across agents' },
        { icon: <MessageSquare className="w-4 h-4" />, title: 'Agent Communication', description: 'Agents share context and collaborate' },
        { icon: <Layers className="w-4 h-4" />, title: 'Workspace Isolation', description: 'Secure, sandboxed execution environments' },
      ]
    },
    {
      category: 'Customization',
      icon: <Settings className="w-5 h-5" />,
      color: 'bg-pink-500',
      items: [
        { icon: <Palette className="w-4 h-4" />, title: 'Themes', description: 'Multiple color schemes and dark mode support' },
        { icon: <Settings className="w-4 h-4" />, title: 'Farmer Templates', description: 'Pre-configured agent personalities and skills' },
        { icon: <Shield className="w-4 h-4" />, title: 'Security Settings', description: 'API key management and access controls' },
        { icon: <Brain className="w-4 h-4" />, title: 'AI Preferences', description: 'Fine-tune model parameters and behaviors' },
      ]
    },
  ];

  return (
    <div className="space-y-4">
      {capabilities.map((category, catIndex) => (
        <div key={category.category}>
          <div className="flex items-center gap-2 mb-3">
            <div className={clsx('p-1.5 rounded-lg text-white', category.color)}>
              {category.icon}
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {category.category}
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {category.items.map((item, itemIndex) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: catIndex * 0.1 + itemIndex * 0.05 }}
                className="flex items-start gap-3 p-3 bg-gray-50/60 dark:bg-gray-700/40 backdrop-blur-sm rounded-xl hover:bg-gray-100/70 dark:hover:bg-gray-700/60 transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Main Capabilities Section Export
export const CapabilitiesSection: React.FC = () => {
  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Device Capabilities"
        icon={<Cpu className="w-5 h-5" />}
        accentColor="blue"
        defaultExpanded={false}
      >
        <DeviceCapabilities />
      </CollapsibleSection>

      <CollapsibleSection
        title="App Capabilities"
        icon={<Sparkles className="w-5 h-5" />}
        accentColor="purple"
        defaultExpanded={false}
      >
        <AppCapabilities />
      </CollapsibleSection>
    </div>
  );
};

export default CapabilitiesSection;
