/**
 * Enhanced Real-Time Terminal Component
 *
 * Advanced terminal display with:
 * - Structured message rendering
 * - AI provider-specific styling
 * - Real-time yield detection
 * - Command/output/error categorization
 * - Ultra-smooth scrolling
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Package,
  AlertCircle,
  CheckCircle,
  Command,
  Brain,
  FileCode,
  Activity,
  Cpu,
  Zap,
  FileText,
  Database,
  GitBranch
} from 'lucide-react';
import { useWebSocketStore } from '@/store/websocketStore';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

interface StructuredMessage {
  id: string;
  timestamp: Date;
  type: 'command' | 'output' | 'error' | 'system' | 'thinking' | 'result' | 'yield';
  level: 'info' | 'warning' | 'error' | 'success' | 'debug';
  source: 'agent' | 'system' | 'user';
  content: string;
  metadata?: {
    command?: string;
    exitCode?: number;
    duration?: number;
    filePath?: string;
    language?: string;
    lineCount?: number;
    byteSize?: number;
    aiProvider?: string;
    modelVersion?: string;
  };
  formatted?: string;
}

interface YieldItem {
  path: string;
  type: 'file' | 'code' | 'document' | 'artifact';
  name: string;
  size: number;
  language?: string;
  description?: string;
  relevance: number;
  timestamp: Date;
}

interface EnhancedRealTimeTerminalProps {
  farmId: string;
  agentId: string;
  agentName: string;
  aiProvider?: string;
  className?: string;
  height?: number;
  theme?: 'dark' | 'light' | 'matrix' | 'ocean';
}

// ============================================================================
// Message Icons
// ============================================================================

const MessageIcon: React.FC<{ type: StructuredMessage['type'] }> = ({ type }) => {
  const icons = {
    command: <Command className="w-4 h-4" />,
    output: <Terminal className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    system: <Cpu className="w-4 h-4" />,
    thinking: <Brain className="w-4 h-4" />,
    result: <CheckCircle className="w-4 h-4" />,
    yield: <Package className="w-4 h-4" />
  };

  return icons[type] || <Activity className="w-4 h-4" />;
};

// ============================================================================
// AI Provider Badge
// ============================================================================

const AIProviderBadge: React.FC<{ provider?: string; version?: string }> = ({ provider, version }) => {
  if (!provider) return null;

  const providerColors = {
    claude: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    openai: 'bg-green-500/20 text-green-300 border-green-500/30',
    'gpt-oss': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    llama: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
  };

  const providerIcons = {
    claude: <Zap className="w-3 h-3" />,
    openai: <Brain className="w-3 h-3" />,
    'gpt-oss': <Cpu className="w-3 h-3" />,
    llama: <GitBranch className="w-3 h-3" />
  };

  const color = providerColors[provider.toLowerCase()] || providerColors['gpt-oss'];
  const icon = providerIcons[provider.toLowerCase()] || providerIcons['gpt-oss'];

  return (
    <div className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
      color
    )}>
      {icon}
      <span className="uppercase">{provider}</span>
      {version && (
        <span className="opacity-70 text-[10px]">{version.split('/').pop()}</span>
      )}
    </div>
  );
};

// ============================================================================
// Yield Card Component
// ============================================================================

const YieldCard: React.FC<{ yield: YieldItem; onView: () => void }> = ({ yield: yieldItem, onView }) => {
  const getYieldIcon = () => {
    switch (yieldItem.type) {
      case 'code':
        return <FileCode className="w-4 h-4" />;
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'artifact':
        return <Database className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10
                 border border-green-500/30 rounded-lg hover:border-green-500/50
                 transition-all cursor-pointer group"
      onClick={onView}
    >
      <div className="text-green-400">
        {getYieldIcon()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-green-300">{yieldItem.name}</span>
          {yieldItem.language && (
            <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
              {yieldItem.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{formatSize(yieldItem.size)}</span>
          <span>•</span>
          <span>Relevance: {Math.round(yieldItem.relevance * 100)}%</span>
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">
          View
        </button>
      </div>
    </motion.div>
  );
};

// ============================================================================
// Message Component
// ============================================================================

const MessageLine: React.FC<{ message: StructuredMessage }> = ({ message }) => {
  const getMessageColor = () => {
    const colors = {
      info: 'text-gray-300',
      warning: 'text-yellow-400',
      error: 'text-red-400',
      success: 'text-green-400',
      debug: 'text-gray-500'
    };
    return colors[message.level] || colors.info;
  };

  const getTypeColor = () => {
    const colors = {
      command: 'text-blue-400',
      output: 'text-gray-300',
      error: 'text-red-400',
      system: 'text-purple-400',
      thinking: 'text-yellow-400',
      result: 'text-green-400',
      yield: 'text-emerald-400'
    };
    return colors[message.type] || colors.output;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.1 }}
      className="group hover:bg-white/5 px-4 py-1 rounded transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <span className="text-xs text-gray-600 font-mono mt-0.5 min-w-[60px]">
          {new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </span>

        {/* Icon */}
        <div className={cn('mt-0.5', getTypeColor())}>
          <MessageIcon type={message.type} />
        </div>

        {/* Content */}
        <div className="flex-1 font-mono text-sm">
          {message.type === 'command' && (
            <span className="text-blue-400">$ </span>
          )}
          <span className={getMessageColor()}>
            {message.formatted || message.content}
          </span>

          {/* Metadata */}
          {message.metadata && (
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
              {message.metadata.duration && (
                <span>Duration: {message.metadata.duration}ms</span>
              )}
              {message.metadata.exitCode !== undefined && (
                <span>Exit: {message.metadata.exitCode}</span>
              )}
              {message.metadata.lineCount && (
                <span>Lines: {message.metadata.lineCount}</span>
              )}
              {message.metadata.byteSize && (
                <span>Size: {message.metadata.byteSize}B</span>
              )}
            </div>
          )}
        </div>

        {/* AI Provider Badge (only show occasionally) */}
        {message.type === 'system' && message.metadata?.aiProvider && (
          <AIProviderBadge
            provider={message.metadata.aiProvider}
            version={message.metadata.modelVersion}
          />
        )}
      </div>
    </motion.div>
  );
};

// ============================================================================
// Enhanced Real-Time Terminal Component
// ============================================================================

export const EnhancedRealTimeTerminal: React.FC<EnhancedRealTimeTerminalProps> = ({
  farmId,
  agentId,
  agentName,
  aiProvider,
  className,
  height = 500,
  theme = 'dark'
}) => {
  const [messages, setMessages] = useState<StructuredMessage[]>([]);
  const [yields, setYields] = useState<YieldItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const { subscribe, unsubscribe } = useWebSocketStore();

  // Theme styles
  const themeStyles = {
    dark: 'bg-gray-900 text-gray-300',
    light: 'bg-white text-gray-800',
    matrix: 'bg-black text-green-400',
    ocean: 'bg-gradient-to-b from-blue-900/50 to-indigo-900/50 text-blue-100'
  };

  // Handle structured messages
  const handleStructuredMessage = useCallback((data: any) => {
    if (data.farmId !== farmId || data.agentId !== agentId) return;

    const message = data.message as StructuredMessage;
    setMessages(prev => {
      const updated = [...prev, message];
      // Keep only last 1000 messages
      if (updated.length > 1000) {
        return updated.slice(-1000);
      }
      return updated;
    });

    // Auto-scroll if enabled
    if (autoScroll && terminalRef.current) {
      setTimeout(() => {
        terminalRef.current?.scrollTo({
          top: terminalRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 50);
    }
  }, [farmId, agentId, autoScroll]);

  // Handle yield detection
  const handleYieldDetection = useCallback((data: any) => {
    if (data.farmId !== farmId || data.agentId !== agentId) return;

    const yieldItem = data.yield as YieldItem;
    setYields(prev => [...prev, yieldItem]);

    // Add yield message to terminal
    const yieldMessage: StructuredMessage = {
      id: `yield-${Date.now()}`,
      timestamp: new Date(),
      type: 'yield',
      level: 'success',
      source: 'system',
      content: `📦 Created ${yieldItem.type}: ${yieldItem.name}`,
      metadata: {
        filePath: yieldItem.path,
        language: yieldItem.language,
        byteSize: yieldItem.size
      }
    };

    setMessages(prev => [...prev, yieldMessage]);
  }, [farmId, agentId]);

  // Handle traditional terminal output (fallback)
  const handleTerminalOutput = useCallback((data: any) => {
    if (data.farmId !== farmId || data.agentId !== agentId) return;

    // Convert to structured message
    const message: StructuredMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type: 'output',
      level: 'info',
      source: 'agent',
      content: data.content
    };

    setMessages(prev => [...prev, message]);
  }, [farmId, agentId]);

  // Subscribe to WebSocket events
  useEffect(() => {
    const subscriptions = [
      subscribe('terminal:structured', handleStructuredMessage),
      subscribe('yield:detected', handleYieldDetection),
      subscribe('terminal:output', handleTerminalOutput),
      subscribe('terminal:health', (data: any) => {
        if (data.farmId === farmId && data.agentId === agentId) {
          setIsConnected(data.isHealthy);
        }
      })
    ];

    // Initial connection message
    const connectMessage: StructuredMessage = {
      id: 'connect-msg',
      timestamp: new Date(),
      type: 'system',
      level: 'info',
      source: 'system',
      content: `Terminal connected to ${agentName}`,
      metadata: {
        aiProvider: aiProvider
      }
    };
    setMessages([connectMessage]);
    setIsConnected(true);

    return () => {
      subscriptions.forEach(unsubscribe);
    };
  }, [farmId, agentId, agentName, aiProvider, subscribe, unsubscribe,
      handleStructuredMessage, handleYieldDetection, handleTerminalOutput]);

  // Clear terminal
  const handleClear = () => {
    setMessages([]);
    setYields([]);
  };

  // Toggle auto-scroll
  const toggleAutoScroll = () => {
    setAutoScroll(!autoScroll);
  };

  // View yield item
  const handleViewYield = (yieldItem: YieldItem) => {
    // Open yield viewer (to be implemented)
    console.log('View yield:', yieldItem);
  };

  return (
    <div className={cn('flex flex-col rounded-lg border border-gray-700 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-sm">{agentName}</span>
          {aiProvider && (
            <AIProviderBadge provider={aiProvider} />
          )}
          {isConnected ? (
            <div className="flex items-center gap-1 text-xs text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span>Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <div className="w-2 h-2 bg-gray-500 rounded-full" />
              <span>Connecting...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoScroll}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              autoScroll
                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            )}
          >
            Auto-scroll
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded hover:bg-gray-600 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden p-2',
          themeStyles[theme]
        )}
        style={{ height: `${height}px` }}
      >
        {/* Messages */}
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <MessageLine key={message.id} message={message} />
          ))}
        </AnimatePresence>

        {/* Cursor */}
        {isConnected && (
          <div className="flex items-center gap-2 px-4 py-1">
            <span className="text-gray-500">$</span>
            <div className="w-2 h-4 bg-gray-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* Yields Panel */}
      {yields.length > 0 && (
        <div className="border-t border-gray-700 bg-gray-800/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-gray-300">
              Detected Yields ({yields.length})
            </span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {yields.map((yieldItem, index) => (
              <YieldCard
                key={`${yieldItem.path}-${index}`}
                yield={yieldItem}
                onView={() => handleViewYield(yieldItem)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{messages.length} messages</span>
          {yields.length > 0 && <span>{yields.length} yields</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>Theme: {theme}</span>
          {aiProvider && <span>Engine: {aiProvider.toUpperCase()}</span>}
        </div>
      </div>
    </div>
  );
};