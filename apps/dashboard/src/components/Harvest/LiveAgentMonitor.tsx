/**
 * Live Agent Monitor Component
 *
 * Real-time agent activity monitoring with structured message display,
 * activity detection, and yield tracking.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Activity,
  Code,
  FileText,
  GitBranch,
  Database,
  Zap,
  Package,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Eye,
  Filter,
  Search,
  Download,
  Maximize2,
  Minimize2,
  ChevronRight,
  Brain,
  Sparkles,
  FileCode,
  TestTube,
  Bug,
  Settings,
  Globe,
  Command
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface StructuredMessage {
  id: string;
  farmId: string;
  agentId: number;
  agentName: string;
  timestamp: Date;
  type: 'command' | 'output' | 'error' | 'thinking' | 'file_operation' | 'api_call' | 'yield_created' | 'status';
  category: 'system' | 'user_action' | 'ai_response' | 'file_io' | 'network' | 'computation';
  content: string;
  metadata: {
    raw: string;
    cleaned: string;
    isImportant: boolean;
    relevanceScore: number;
    phase?: 'planning' | 'executing' | 'validating' | 'completing';
    context?: string;
    tool?: string;
    parameters?: any;
    result?: any;
    duration?: number;
    lineNumber?: number;
  };
  activity?: {
    type: string;
    description: string;
    target?: string;
    language?: string;
    linesOfCode?: number;
    testsPassed?: number;
    testsFailed?: number;
    coverage?: number;
  };
  yield?: {
    type: string;
    path: string;
    title: string;
    quality: string;
    relevance: number;
  };
}

interface AgentStats {
  totalMessages: number;
  commandsExecuted: number;
  filesCreated: number;
  filesModified: number;
  errorsEncountered: number;
  linesOfCodeWritten: number;
  testsRun: number;
  testsPassed: number;
  apiCalls: number;
  yieldsCreated: number;
  executionTime: number;
}

interface LiveAgentMonitorProps {
  farmId: string;
  agentId: number;
  agentName: string;
  status?: 'starting' | 'active' | 'thinking' | 'executing' | 'idle' | 'error' | 'completed';
  className?: string;
}

// ============================================================================
// Live Agent Monitor Component
// ============================================================================

export const LiveAgentMonitor: React.FC<LiveAgentMonitorProps> = ({
  farmId,
  agentId,
  agentName,
  status = 'starting',
  className
}) => {
  const [messages, setMessages] = useState<StructuredMessage[]>([]);
  const [stats, setStats] = useState<AgentStats>({
    totalMessages: 0,
    commandsExecuted: 0,
    filesCreated: 0,
    filesModified: 0,
    errorsEncountered: 0,
    linesOfCodeWritten: 0,
    testsRun: 0,
    testsPassed: 0,
    apiCalls: 0,
    yieldsCreated: 0,
    executionTime: 0
  });
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [currentPhase, setCurrentPhase] = useState<string>('initializing');
  const [yields, setYields] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket, connected, subscribe } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Subscribe to agent activity events
  useEffect(() => {
    if (!socket || !connected) return;

    // Join agent room
    socket.emit('agent:join', { farmId, agentId });

    // Subscribe to structured messages
    const unsubActivity = subscribe('agent:activity', (data: any) => {
      if (data.agentId === agentId) {
        setMessages(prev => [...prev, data.message]);
        updatePhase(data.message);
      }
    });

    // Subscribe to statistics
    const unsubStats = subscribe('agent:statistics', (data: any) => {
      if (data.agentId === agentId) {
        setStats(data.statistics);
        if (data.yields) {
          setYields(data.yields);
        }
      }
    });

    // Subscribe to yield detection
    const unsubYield = subscribe('yield:detected', (data: any) => {
      if (data.agentId === agentId) {
        setYields(prev => [...prev, data]);
      }
    });

    return () => {
      unsubActivity();
      unsubStats();
      unsubYield();
      socket.emit('agent:leave', { farmId, agentId });
    };
  }, [socket, connected, subscribe, farmId, agentId]);

  const updatePhase = (message: StructuredMessage) => {
    if (message.metadata.phase) {
      setCurrentPhase(message.metadata.phase);
    }
  };

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (filter !== 'all' && msg.type !== filter) return false;
    if (searchQuery && !msg.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Get icon for message type
  const getMessageIcon = (type: string, category: string) => {
    switch (type) {
      case 'command': return <Terminal className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      case 'thinking': return <Brain className="w-4 h-4" />;
      case 'file_operation': return <FileCode className="w-4 h-4" />;
      case 'api_call': return <Globe className="w-4 h-4" />;
      case 'yield_created': return <Package className="w-4 h-4" />;
      case 'status': return <Activity className="w-4 h-4" />;
      default: return <ChevronRight className="w-4 h-4" />;
    }
  };

  // Get color for message type
  const getMessageColor = (type: string, isImportant: boolean) => {
    if (isImportant) return 'text-amber-600 dark:text-amber-400 font-semibold';

    switch (type) {
      case 'command': return 'text-blue-600 dark:text-blue-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'thinking': return 'text-purple-600 dark:text-purple-400';
      case 'file_operation': return 'text-green-600 dark:text-green-400';
      case 'api_call': return 'text-indigo-600 dark:text-indigo-400';
      case 'yield_created': return 'text-emerald-600 dark:text-emerald-400';
      default: return 'text-gray-700 dark:text-gray-300';
    }
  };

  // Get phase color and icon
  const getPhaseInfo = (phase: string) => {
    switch (phase) {
      case 'planning':
        return { icon: <Brain className="w-4 h-4" />, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' };
      case 'executing':
        return { icon: <Zap className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' };
      case 'validating':
        return { icon: <TestTube className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
      case 'completing':
        return { icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' };
      default:
        return { icon: <Activity className="w-4 h-4" />, color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30' };
    }
  };

  const phaseInfo = getPhaseInfo(currentPhase);

  return (
    <div className={clsx(
      'flex flex-col h-full',
      'bg-white dark:bg-gray-900',
      'border border-gray-200 dark:border-gray-700',
      'rounded-xl overflow-hidden',
      isExpanded && 'fixed inset-4 z-50',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-850 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            status === 'active' && 'bg-green-500',
            status === 'thinking' && 'bg-purple-500 animate-pulse',
            status === 'executing' && 'bg-blue-500',
            status === 'idle' && 'bg-gray-400',
            status === 'error' && 'bg-red-500',
            status === 'completed' && 'bg-emerald-500'
          )}>
            <Terminal className="w-4 h-4 text-white" />
          </div>

          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {agentName}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={clsx('flex items-center gap-1', phaseInfo.color)}>
                {phaseInfo.icon}
                {currentPhase}
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-500">
                {stats.totalMessages} messages
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All</option>
            <option value="command">Commands</option>
            <option value="file_operation">Files</option>
            <option value="error">Errors</option>
            <option value="thinking">Thinking</option>
            <option value="yield_created">Yields</option>
          </select>

          {/* Toggle Stats */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              showStats
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <TrendingUp className="w-4 h-4" />
          </button>

          {/* Auto Scroll */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              autoScroll
                ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-700"
          >
            <div className="grid grid-cols-5 gap-4 text-xs">
              <div className="flex items-center gap-2">
                <FileCode className="w-3 h-3 text-blue-500" />
                <div>
                  <span className="text-gray-500">Files:</span>
                  <span className="ml-1 font-semibold text-gray-900 dark:text-white">
                    {stats.filesCreated + stats.filesModified}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Code className="w-3 h-3 text-green-500" />
                <div>
                  <span className="text-gray-500">Lines:</span>
                  <span className="ml-1 font-semibold text-gray-900 dark:text-white">
                    {stats.linesOfCodeWritten}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TestTube className="w-3 h-3 text-purple-500" />
                <div>
                  <span className="text-gray-500">Tests:</span>
                  <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
                    {stats.testsPassed}
                  </span>
                  {stats.testsFailed > 0 && (
                    <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                      /{stats.testsFailed}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Package className="w-3 h-3 text-emerald-500" />
                <div>
                  <span className="text-gray-500">Yields:</span>
                  <span className="ml-1 font-semibold text-gray-900 dark:text-white">
                    {stats.yieldsCreated}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Bug className="w-3 h-3 text-red-500" />
                <div>
                  <span className="text-gray-500">Errors:</span>
                  <span className="ml-1 font-semibold text-gray-900 dark:text-white">
                    {stats.errorsEncountered}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        <div className="space-y-1">
          <AnimatePresence initial={false}>
            {filteredMessages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.01 }}
                className={clsx(
                  'group flex items-start gap-2 py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800',
                  msg.metadata.isImportant && 'bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500'
                )}
              >
                {/* Icon */}
                <div className={clsx(
                  'mt-0.5 flex-shrink-0',
                  getMessageColor(msg.type, msg.metadata.isImportant)
                )}>
                  {getMessageIcon(msg.type, msg.category)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={clsx(
                    'break-words whitespace-pre-wrap',
                    getMessageColor(msg.type, msg.metadata.isImportant)
                  )}>
                    {msg.content}
                  </div>

                  {/* Activity Info */}
                  {msg.activity && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium">{msg.activity.type}:</span> {msg.activity.description}
                      {msg.activity.target && (
                        <span className="ml-2 text-blue-600 dark:text-blue-400">
                          {msg.activity.target}
                        </span>
                      )}
                      {msg.activity.linesOfCode && (
                        <span className="ml-2">
                          ({msg.activity.linesOfCode} lines)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Yield Info */}
                  {msg.yield && (
                    <div className="mt-1 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Yield Created: {msg.yield.title}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        Quality: {msg.yield.quality} • Relevance: {msg.yield.relevance}%
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  {msg.metadata.tool && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Command className="w-3 h-3" />
                      <span>{msg.metadata.tool}</span>
                      {msg.metadata.duration && (
                        <span className="ml-2">({msg.metadata.duration}ms)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Yields Summary */}
      {yields.length > 0 && (
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-t border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {yields.length} Yields Generated
              </span>
            </div>
            <div className="flex items-center gap-3">
              {yields.slice(-3).map((y, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <FileCode className="w-3 h-3 text-gray-500" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {y.title || y.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveAgentMonitor;