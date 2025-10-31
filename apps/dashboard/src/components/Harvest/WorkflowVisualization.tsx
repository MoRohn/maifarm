import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Cpu, 
  Database, 
  Network, 
  Shield, 
  Zap,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  GitBranch,
  Layers,
  Cloud,
  Server,
  HardDrive,
  Workflow,
  CircuitBoard,
  Bot,
  ChevronRight,
  Send
} from 'lucide-react';
import { clsx } from 'clsx';

interface WorkflowAgent {
  id: string | number;
  name?: string;
  status: 'starting' | 'ready' | 'active' | 'idle' | 'error';
  uid?: string;
  progress?: number;
  messages?: string[];
  metrics?: {
    cpu: number;
    memory: number;
    throughput: number;
  };
}

interface WorkflowVisualizationProps {
  systemId?: string;
  systemName?: string;
  agents: WorkflowAgent[];
  className?: string;
  status?: 'operational' | 'standby' | 'maintenance' | 'critical';
  onLaunchAgents?: () => void;
  onSendCommand?: (agentId: string, command: string) => void;
  farmId?: string;
}

const NetworkGrid: React.FC = () => {
  return (
    <svg 
      className="absolute inset-0 w-full h-full opacity-5"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
};

const FloatingParticles: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-blue-400/30 rounded-full"
          initial={{ 
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            opacity: 0
          }}
          animate={{
            x: [null, Math.random() * window.innerWidth],
            y: [null, -50],
            opacity: [0, 0.5, 0]
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            delay: Math.random() * 5
          }}
        />
      ))}
    </div>
  );
};

const AgentNode: React.FC<{
  agent: WorkflowAgent;
  index: number;
  onSelect?: () => void;
  onSendCommand?: (agentId: string, command: string) => void;
  command?: string;
  onCommandChange?: (agentId: string, command: string) => void;
}> = ({ agent, index, onSelect, onSendCommand, command = '', onCommandChange }) => {
  const [localCommand, setLocalCommand] = useState(command);
  const getStatusColor = () => {
    switch (agent.status) {
      case 'active': return 'border-green-500/50 bg-green-500/10 shadow-green-500/20';
      case 'ready': return 'border-blue-500/50 bg-blue-500/10 shadow-blue-500/20';
      case 'idle': return 'border-yellow-500/50 bg-yellow-500/10 shadow-yellow-500/20';
      case 'error': return 'border-red-500/50 bg-red-500/10 shadow-red-500/20';
      default: return 'border-gray-500/50 bg-gray-500/10 shadow-gray-500/20';
    }
  };

  const getStatusIcon = () => {
    switch (agent.status) {
      case 'active': return <Activity className="w-4 h-4 text-green-400" />;
      case 'ready': return <CheckCircle className="w-4 h-4 text-blue-400" />;
      case 'idle': return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <CircuitBoard className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
      onClick={onSelect}
      className={clsx(
        'relative p-6 rounded-2xl border-2 backdrop-blur-xl cursor-pointer transition-all duration-300',
        'hover:shadow-2xl',
        getStatusColor()
      )}
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-800/50 rounded-lg">
            <Bot className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{agent.name}</h3>
            <p className="text-xs text-gray-500">Process ID: {agent.uid}</p>
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Metrics */}
      {agent.metrics && (
        <div className="space-y-3">
          {/* CPU Usage */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center space-x-1">
                <Cpu className="w-3 h-3" />
                <span>CPU</span>
              </span>
              <span className="text-gray-300">{agent.metrics.cpu}%</span>
            </div>
            <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${agent.metrics.cpu}%` }}
                transition={{ duration: 1, delay: index * 0.1 }}
              />
            </div>
          </div>

          {/* Memory Usage */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center space-x-1">
                <HardDrive className="w-3 h-3" />
                <span>Memory</span>
              </span>
              <span className="text-gray-300">{agent.metrics.memory}%</span>
            </div>
            <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${agent.metrics.memory}%` }}
                transition={{ duration: 1, delay: index * 0.1 + 0.2 }}
              />
            </div>
          </div>

          {/* Throughput */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400 flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>Throughput</span>
              </span>
              <span className="text-gray-300">{agent.metrics.throughput} ops/s</span>
            </div>
            <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(agent.metrics.throughput, 100)}%` }}
                transition={{ duration: 1, delay: index * 0.1 + 0.4 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Status Badge */}
      <div className="mt-4 flex items-center justify-between">
        <span className={clsx(
          'px-2 py-1 text-xs font-medium rounded-lg',
          agent.status === 'active' ? 'bg-green-500/20 text-green-400' :
          agent.status === 'ready' ? 'bg-blue-500/20 text-blue-400' :
          agent.status === 'idle' ? 'bg-yellow-500/20 text-yellow-400' :
          agent.status === 'error' ? 'bg-red-500/20 text-red-400' :
          'bg-gray-500/20 text-gray-400'
        )}>
          {agent.status.toUpperCase()}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </div>

      {/* Command Input */}
      {onSendCommand && (
        <div className="mt-3 flex items-center space-x-2">
          <input
            type="text"
            value={localCommand}
            onChange={(e) => {
              setLocalCommand(e.target.value);
              onCommandChange?.(String(agent.id), e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && localCommand.trim()) {
                onSendCommand(String(agent.id), localCommand);
                setLocalCommand('');
              }
            }}
            className="flex-1 bg-gray-800/50 text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500/50 border border-gray-700/30 placeholder-gray-500"
            placeholder="Enter command..."
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (localCommand.trim()) {
                onSendCommand(String(agent.id), localCommand);
                setLocalCommand('');
              }
            }}
            className="p-1.5 bg-blue-600/80 hover:bg-blue-600 rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/20"
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Connection Lines */}
      {index < 3 && (
        <svg className="absolute -right-20 top-1/2 w-20 h-px pointer-events-none">
          <motion.line 
            x1="0" 
            y1="0" 
            x2="80" 
            y2="0" 
            stroke="url(#gradient)" 
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: index * 0.2 }}
          />
          <defs>
            <linearGradient id="gradient">
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0)" />
              <stop offset="50%" stopColor="rgba(59, 130, 246, 0.5)" />
              <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </motion.div>
  );
};

export const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({
  systemId = 'harvest-system',
  systemName = 'Harvest Workflow',
  agents,
  className,
  status = 'operational',
  onLaunchAgents,
  onSendCommand,
  farmId
}) => {
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentCommands, setAgentCommands] = useState<{ [key: string]: string }>({});
  const [systemMetrics, setSystemMetrics] = useState({
    totalCpu: 0,
    totalMemory: 0,
    totalThroughput: 0,
    uptime: '00:00:00'
  });
  const startTimeRef = useRef(Date.now());

  // Calculate actual uptime
  const calculateUptime = (): string => {
    const uptimeMs = Date.now() - startTimeRef.current;
    const seconds = Math.floor(uptimeMs / 1000) % 60;
    const minutes = Math.floor(uptimeMs / (1000 * 60)) % 60;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Safe metrics calculation with bounds checking
  const calculateSystemMetrics = () => {
    if (!agents || agents.length === 0) {
      return {
        totalCpu: 0,
        totalMemory: 0,
        totalThroughput: 0,
        uptime: calculateUptime()
      };
    }

    // Filter out agents without valid metrics
    const validAgents = agents.filter(agent => agent.metrics && 
      typeof agent.metrics.cpu === 'number' && 
      typeof agent.metrics.memory === 'number' && 
      typeof agent.metrics.throughput === 'number'
    );

    if (validAgents.length === 0) {
      return {
        totalCpu: 0,
        totalMemory: 0,
        totalThroughput: 0,
        uptime: calculateUptime()
      };
    }

    // Calculate averages with proper bounds checking
    const totalCpu = validAgents.reduce((sum, agent) => {
      const cpu = Math.max(0, Math.min(100, agent.metrics!.cpu)); // Ensure 0-100 range
      return sum + cpu;
    }, 0) / validAgents.length;

    const totalMemory = validAgents.reduce((sum, agent) => {
      const memory = Math.max(0, Math.min(100, agent.metrics!.memory)); // Ensure 0-100 range
      return sum + memory;
    }, 0) / validAgents.length;

    const totalThroughput = validAgents.reduce((sum, agent) => {
      const throughput = Math.max(0, agent.metrics!.throughput || 0); // Ensure non-negative
      return sum + throughput;
    }, 0);

    return {
      totalCpu: Math.round(Math.max(0, Math.min(100, totalCpu))), // Final bounds check
      totalMemory: Math.round(Math.max(0, Math.min(100, totalMemory))), // Final bounds check
      totalThroughput: Math.max(0, Math.round(totalThroughput * 10) / 10), // Round to 1 decimal, ensure non-negative
      uptime: calculateUptime()
    };
  };

  // Update system metrics with optimized frequency
  useEffect(() => {
    // Initial calculation
    setSystemMetrics(calculateSystemMetrics());

    const interval = setInterval(() => {
      const newMetrics = calculateSystemMetrics();
      
      // Only update if metrics have actually changed (avoid unnecessary re-renders)
      setSystemMetrics(prevMetrics => {
        if (JSON.stringify(prevMetrics) !== JSON.stringify(newMetrics)) {
          return newMetrics;
        }
        return prevMetrics;
      });
    }, 2000); // Reduced frequency for better performance
    
    return () => clearInterval(interval);
  }, [agents]); // Re-run when agents change

  const getStatusColor = () => {
    switch (status) {
      case 'operational': return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'standby': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'maintenance': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  return (
    <div className={clsx('relative min-h-screen overflow-hidden', className)}>
      {/* Background Effects */}
      <NetworkGrid />
      <FloatingParticles />
      
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-950/20 to-black opacity-90" />

      {/* System Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 p-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/30 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
                  <Workflow className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">{systemName}</h1>
                  <p className="text-sm text-gray-400">System ID: {systemId}</p>
                </div>
              </div>
              
              {/* System Status */}
              <div className={clsx('px-4 py-2 rounded-lg border', getStatusColor())}>
                <span className="text-sm font-medium uppercase">{status}</span>
              </div>
            </div>

            {/* System Metrics Bar */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">CPU Usage</span>
                  <Cpu className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-lg font-semibold text-white mt-1">{systemMetrics.totalCpu}%</p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Memory</span>
                  <Database className="w-4 h-4 text-green-400" />
                </div>
                <p className="text-lg font-semibold text-white mt-1">{systemMetrics.totalMemory}%</p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Throughput</span>
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-lg font-semibold text-white mt-1">{systemMetrics.totalThroughput} ops/s</p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Uptime</span>
                  <Clock className="w-4 h-4 text-yellow-400" />
                </div>
                <p className="text-lg font-semibold text-white mt-1">{systemMetrics.uptime}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Workflow Nodes */}
      <div className="relative z-10 px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          {agents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {agents.map((agent, index) => (
                <AgentNode
                  key={agent.id}
                  agent={agent}
                  index={index}
                  onSelect={() => setSelectedAgent(typeof agent.id === 'number' ? agent.id : parseInt(String(agent.id)) || 0)}
                  onSendCommand={onSendCommand}
                  command={agentCommands[agent.id] || ''}
                  onCommandChange={(agentId, cmd) => setAgentCommands(prev => ({ ...prev, [agentId]: cmd }))}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/30 p-8 text-center max-w-md">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Server className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  No Active Processes
                </h3>
                <p className="text-gray-400 mb-6">
                  Your workflow system is configured but no processes are running. Launch agents to begin operations.
                </p>
                <button
                  onClick={onLaunchAgents || (() => window.location.reload())}
                  className="px-6 py-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg shadow-blue-500/20"
                >
                  Initialize Workflow Agents
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Central Hub Visualization (for connected agents) */}
      {agents.length > 2 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="relative"
          >
            <div className="w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Network className="w-12 h-12 text-blue-400/50" />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};