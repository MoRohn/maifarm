/**
 * Advanced Terminal Pane
 *
 * Features:
 * - Responsive sizing with container queries
 * - Virtual scrolling for performance
 * - Smooth animations and transitions
 * - Real-time metrics display
 * - Adaptive font sizing
 * - Picture-in-picture mode
 * - Recording capabilities
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  Terminal,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Pause,
  Play,
  Circle,
  Square,
  Download,
  Copy,
  Settings,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { advancedStreamEngine } from '@/services/AdvancedTerminalStreamEngine';

interface AdvancedTerminalPaneProps {
  sessionId: string;
  agentId: number;
  agentName?: string;
  className?: string;
  onResize?: (width: number, height: number) => void;
}

interface TerminalLine {
  content: string;
  timestamp: number;
  type: 'stdout' | 'stderr' | 'command' | 'system';
}

export const AdvancedTerminalPane: React.FC<AdvancedTerminalPaneProps> = ({
  sessionId,
  agentId,
  agentName = `Agent ${agentId}`,
  className = '',
  onResize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // State
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [showMetrics, setShowMetrics] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Metrics
  const [metrics, setMetrics] = useState({
    fps: 0,
    latency: 0,
    bufferSize: 0,
    lineCount: 0,
  });

  // Virtual scrolling
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const LINE_HEIGHT = fontSize * 1.5;
  const OVERSCAN = 10;

  // Motion values for smooth interactions
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);

  // Initialize stream
  useEffect(() => {
    const streamKey = advancedStreamEngine.createStream(sessionId, agentId, {
      targetFPS: 30,
      adaptiveQuality: true,
      compressionEnabled: true,
    });

    const handleFramesReady = ({ streamKey: key, frames, metrics: streamMetrics }: any) => {
      if (key !== `${sessionId}:${agentId}`) return;

      if (!isPaused) {
        setLines((prev) => {
          const newLines = frames.map((frame: any) => ({
            content: frame.content,
            timestamp: frame.timestamp,
            type: 'stdout' as const,
          }));

          const combined = [...prev, ...newLines];

          // Limit total lines to prevent memory issues
          const maxLines = 10000;
          if (combined.length > maxLines) {
            return combined.slice(-maxLines);
          }

          return combined;
        });

        setMetrics({
          fps: Math.round(streamMetrics.fps),
          latency: Math.round(streamMetrics.latency),
          bufferSize: streamMetrics.bufferSize,
          lineCount: lines.length,
        });
      }
    };

    advancedStreamEngine.on('frames:ready', handleFramesReady);

    return () => {
      advancedStreamEngine.off('frames:ready', handleFramesReady);
      advancedStreamEngine.destroyStream(sessionId, agentId);
    };
  }, [sessionId, agentId, isPaused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, isPaused]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
        onResize?.(width, height);

        // Update visible range based on height
        const visibleLines = Math.ceil(height / LINE_HEIGHT);
        setVisibleRange((prev) => ({
          ...prev,
          end: Math.min(prev.start + visibleLines + OVERSCAN, lines.length),
        }));
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [LINE_HEIGHT, lines.length, onResize]);

  // Virtual scrolling handler
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, clientHeight } = e.currentTarget;
      const start = Math.floor(scrollTop / LINE_HEIGHT);
      const visibleCount = Math.ceil(clientHeight / LINE_HEIGHT);

      setVisibleRange({
        start: Math.max(0, start - OVERSCAN),
        end: Math.min(lines.length, start + visibleCount + OVERSCAN),
      });
    },
    [LINE_HEIGHT, lines.length]
  );

  // Visible lines with virtual scrolling
  const visibleLines = useMemo(() => {
    return lines.slice(visibleRange.start, visibleRange.end);
  }, [lines, visibleRange]);

  // Handlers
  const togglePause = () => {
    if (isPaused) {
      advancedStreamEngine.resumeStream(sessionId, agentId);
    } else {
      advancedStreamEngine.pauseStream(sessionId, agentId);
    }
    setIsPaused(!isPaused);
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Implement recording logic
  };

  const handleZoomIn = () => {
    setFontSize((prev) => Math.min(prev + 1, 24));
  };

  const handleZoomOut = () => {
    setFontSize((prev) => Math.max(prev - 1, 8));
  };

  const handleCopy = () => {
    const content = lines.map((line) => line.content).join('\n');
    navigator.clipboard.writeText(content);
  };

  const handleDownload = () => {
    const content = lines.map((line) => line.content).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${sessionId}-${agentId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <motion.div
      ref={containerRef}
      className={`advanced-terminal-pane relative flex flex-col bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-700/50 ${className} ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        // CRITICAL FIX: Use CSS variable for accurate viewport height on iOS Safari
        minHeight: isFullscreen ? 'var(--full-vh, 100vh)' : '400px',
        maxHeight: isFullscreen ? 'var(--full-vh, 100vh)' : undefined,
      }}
    >
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      {/* Header */}
      <motion.div
        className="relative z-10 flex items-center justify-between px-4 py-3 bg-gray-800/80 backdrop-blur-sm border-b border-gray-700/50"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center space-x-3">
          <motion.div
            animate={{
              rotate: isPaused ? 0 : 360,
            }}
            transition={{
              duration: 2,
              repeat: isPaused ? 0 : Infinity,
              ease: 'linear',
            }}
          >
            <Terminal className="w-5 h-5 text-blue-400" />
          </motion.div>

          <div>
            <h3 className="text-sm font-semibold text-gray-200">{agentName}</h3>
            <p className="text-xs text-gray-500">
              Session: {sessionId.slice(0, 8)}...
            </p>
          </div>

          {/* Connection indicator */}
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {isPaused ? (
              <WifiOff className="w-4 h-4 text-gray-500" />
            ) : (
              <Wifi className="w-4 h-4 text-green-400" />
            )}
          </motion.div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          {/* Metrics */}
          {showMetrics && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center space-x-3 text-xs text-gray-400 mr-2"
            >
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3" />
                <span>{metrics.fps} FPS</span>
              </div>
              <div>{metrics.latency}ms</div>
              <div>{metrics.lineCount} lines</div>
            </motion.div>
          )}

          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </button>

          {/* Pause/Resume */}
          <button
            onClick={togglePause}
            className={`p-1.5 rounded transition-colors ${
              isPaused
                ? 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400'
                : 'hover:bg-gray-700/50 text-gray-400'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Recording */}
          <button
            onClick={toggleRecording}
            className={`p-1.5 rounded transition-colors ${
              isRecording
                ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                : 'hover:bg-gray-700/50 text-gray-400'
            }`}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isRecording ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
            title="Download output"
          >
            <Download className="w-4 h-4 text-gray-400" />
          </button>

          {/* Metrics toggle */}
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className={`p-1.5 rounded transition-colors ${
              showMetrics
                ? 'bg-blue-600/20 text-blue-400'
                : 'hover:bg-gray-700/50 text-gray-400'
            }`}
            title="Show metrics"
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-gray-700/50 rounded transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </motion.div>

      {/* Terminal content with virtual scrolling */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative"
        style={{
          scrollBehavior: 'smooth',
        }}
      >
        {/* Spacer for virtual scrolling */}
        <div style={{ height: lines.length * LINE_HEIGHT }} className="relative">
          {/* Visible lines */}
          <div
            ref={contentRef}
            className="absolute inset-x-0 px-4 py-2 font-mono"
            style={{
              top: visibleRange.start * LINE_HEIGHT,
              fontSize: `${fontSize}px`,
              lineHeight: `${LINE_HEIGHT}px`,
            }}
          >
            <AnimatePresence mode="popLayout">
              {visibleLines.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center h-full text-gray-600"
                >
                  <div className="text-center">
                    <Terminal className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Waiting for output...</p>
                    <p className="text-xs mt-1 opacity-70">{agentName} is starting</p>
                  </div>
                </motion.div>
              ) : (
                visibleLines.map((line, index) => (
                  <motion.div
                    key={visibleRange.start + index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className={`whitespace-pre-wrap break-words ${
                      line.type === 'stderr' || line.content.includes('error')
                        ? 'text-red-400'
                        : line.type === 'command'
                        ? 'text-green-400'
                        : line.content.includes('warning')
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  >
                    {line.content}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Custom scrollbar styles */}
        <style jsx>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: rgba(31, 41, 55, 0.5);
          }
          div::-webkit-scrollbar-thumb {
            background: rgba(75, 85, 99, 0.5);
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: rgba(107, 114, 128, 0.7);
          }
        `}</style>
      </div>

      {/* Status bar */}
      <motion.div
        className="relative z-10 flex items-center justify-between px-4 py-2 bg-gray-800/80 backdrop-blur-sm border-t border-gray-700/50 text-xs text-gray-500"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center space-x-4">
          <span>Lines: {lines.length.toLocaleString()}</span>
          <span>Size: {fontSize}px</span>
          <span>
            {dimensions.width}×{dimensions.height}
          </span>
        </div>
        <div className="flex items-center space-x-4">
          {isPaused && (
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-yellow-400"
            >
              PAUSED
            </motion.span>
          )}
          {isRecording && (
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-red-400 flex items-center space-x-1"
            >
              <Circle className="w-2 h-2 fill-current" />
              <span>REC</span>
            </motion.span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
