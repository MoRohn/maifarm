import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, X, Minus, Square, Maximize2, 
  Copy, Download, Settings, Palette, 
  ChevronLeft, ChevronRight, Plus,
  Activity, Cpu, Zap, Wifi
} from 'lucide-react';
import { useTerminalTheme } from '../themes/TerminalThemeProvider';
import { windowEntry, glowPulse, statusPulse } from '../animations/terminalAnimations';

interface TerminalTab {
  id: string;
  title: string;
  agentId: number;
  agentName: string;
  active: boolean;
  status: 'active' | 'idle' | 'working' | 'error';
}

interface TerminalWindowProps {
  sessionId: string;
  farmId: string;
  agentId: number;
  agentName: string;
  status?: 'active' | 'idle' | 'working' | 'error';
  children: React.ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
  isMinimized?: boolean;
  className?: string;
  tabs?: TerminalTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  onNewTab?: () => void;
  metrics?: {
    cpu?: number;
    memory?: number;
    throughput?: number;
    latency?: number;
  };
}

export const TerminalWindow: React.FC<TerminalWindowProps> = ({
  sessionId,
  farmId,
  agentId,
  agentName,
  status = 'idle',
  children,
  onClose,
  onMinimize,
  onMaximize,
  isMaximized = false,
  isMinimized = false,
  className = '',
  tabs,
  activeTab,
  onTabChange,
  onNewTab,
  metrics,
}) => {
  const { currentTheme } = useTerminalTheme();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const windowRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ width: 800, height: 600 });

  // Handle window dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.terminal-controls')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && !isMaximized) {
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      });
    }
    if (isResizing && !isMaximized) {
      setSize({
        width: Math.max(400, e.clientX - position.x),
        height: Math.max(300, e.clientY - position.y),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
  };

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing]);

  // Status colors
  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    working: 'bg-blue-500',
    error: 'bg-red-500',
  };

  const statusAnimations = {
    active: 'animate-pulse',
    idle: '',
    working: 'animate-spin',
    error: 'animate-ping',
  };

  if (isMinimized) {
    return null;
  }

  return (
    <motion.div
      ref={windowRef}
      className={`terminal-window ${isMaximized ? 'fixed inset-0 z-50' : 'absolute'} ${className}`}
      style={{
        ...(isMaximized ? {} : {
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
        }),
        backgroundColor: currentTheme.colors.background,
        border: `1px solid ${currentTheme.colors.border}`,
        borderRadius: isMaximized ? '0' : '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      }}
      variants={windowEntry}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Title Bar */}
      <div
        className="terminal-titlebar flex items-center justify-between px-4 py-2 select-none cursor-move"
        style={{
          background: currentTheme.colors.headerBg,
          borderBottom: `1px solid ${currentTheme.colors.border}`,
          borderTopLeftRadius: isMaximized ? '0' : '12px',
          borderTopRightRadius: isMaximized ? '0' : '12px',
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center space-x-3">
          {/* Window Controls */}
          <div className="terminal-controls flex items-center space-x-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              aria-label="Close"
            />
            <button
              onClick={onMinimize}
              className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors"
              aria-label="Minimize"
            />
            <button
              onClick={onMaximize}
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
              aria-label="Maximize"
            />
          </div>

          {/* Agent Info */}
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
            <span className="text-sm font-semibold" style={{ color: currentTheme.colors.foreground }}>
              {agentName}
            </span>
            <motion.div
              className={`w-2 h-2 rounded-full ${statusColors[status]}`}
              variants={statusPulse}
              animate={status}
            />
          </div>
        </div>

        {/* Metrics Display */}
        {metrics && (
          <div className="flex items-center space-x-4 text-xs" style={{ color: currentTheme.colors.foreground }}>
            {metrics.cpu !== undefined && (
              <div className="flex items-center space-x-1">
                <Cpu className="w-3 h-3" />
                <span>{metrics.cpu.toFixed(1)}%</span>
              </div>
            )}
            {metrics.memory !== undefined && (
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3" />
                <span>{metrics.memory}MB</span>
              </div>
            )}
            {metrics.throughput !== undefined && (
              <div className="flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>{metrics.throughput}/s</span>
              </div>
            )}
            {metrics.latency !== undefined && (
              <div className="flex items-center space-x-1">
                <Wifi className="w-3 h-3" />
                <span>{metrics.latency}ms</span>
              </div>
            )}
          </div>
        )}

        {/* Window Actions */}
        <div className="flex items-center space-x-2">
          <button
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            onClick={() => navigator.clipboard.writeText(sessionId)}
            aria-label="Copy session ID"
          >
            <Copy className="w-3 h-3" style={{ color: currentTheme.colors.foreground }} />
          </button>
          <button
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-3 h-3" style={{ color: currentTheme.colors.foreground }} />
          </button>
          <button
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            onClick={onMaximize}
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Square className="w-3 h-3" style={{ color: currentTheme.colors.foreground }} />
            ) : (
              <Maximize2 className="w-3 h-3" style={{ color: currentTheme.colors.foreground }} />
            )}
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      {tabs && tabs.length > 0 && (
        <div
          className="terminal-tabs flex items-center px-2 py-1"
          style={{
            backgroundColor: currentTheme.colors.background,
            borderBottom: `1px solid ${currentTheme.colors.border}`,
          }}
        >
          <div className="flex items-center space-x-1 flex-1 overflow-x-auto">
            {tabs.map((tab) => (
              <motion.button
                key={tab.id}
                className={`px-3 py-1 rounded-t text-xs font-medium transition-all ${
                  tab.id === activeTab ? 'bg-opacity-20' : 'bg-opacity-0 hover:bg-opacity-10'
                }`}
                style={{
                  backgroundColor: tab.id === activeTab ? currentTheme.colors.accent : 'transparent',
                  color: tab.id === activeTab ? currentTheme.colors.foreground : currentTheme.colors.brightBlack,
                  borderBottom: tab.id === activeTab ? `2px solid ${currentTheme.colors.accent}` : 'none',
                }}
                onClick={() => onTabChange?.(tab.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="flex items-center space-x-2">
                  <span>{tab.title}</span>
                  <motion.div
                    className={`w-1.5 h-1.5 rounded-full ${statusColors[tab.status]}`}
                    animate={{ opacity: tab.status === 'working' ? [1, 0.3, 1] : 1 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                </div>
              </motion.button>
            ))}
          </div>
          {onNewTab && (
            <button
              className="p-1 ml-2 hover:bg-gray-700 rounded transition-colors"
              onClick={onNewTab}
              aria-label="New tab"
            >
              <Plus className="w-3 h-3" style={{ color: currentTheme.colors.foreground }} />
            </button>
          )}
        </div>
      )}

      {/* Terminal Content */}
      <div
        className="terminal-content flex-1 overflow-hidden"
        style={{
          backgroundColor: currentTheme.colors.background,
          borderBottomLeftRadius: isMaximized ? '0' : '12px',
          borderBottomRightRadius: isMaximized ? '0' : '12px',
        }}
      >
        {children}
      </div>

      {/* Resize Handle */}
      {!isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(true);
            resizeStartSize.current = size;
          }}
          style={{
            borderRight: `2px solid ${currentTheme.colors.border}`,
            borderBottom: `2px solid ${currentTheme.colors.border}`,
            borderBottomRightRadius: '12px',
          }}
        />
      )}

      {/* Visual Effects Overlay */}
      {currentTheme.effects.scanlines && (
        <div className="terminal-scanlines pointer-events-none absolute inset-0" />
      )}
      {currentTheme.effects.crtEffect && (
        <div className="terminal-crt-effect pointer-events-none absolute inset-0" />
      )}
      {currentTheme.effects.holographicShimmer && (
        <div className="terminal-holographic pointer-events-none absolute inset-0" />
      )}
    </motion.div>
  );
};