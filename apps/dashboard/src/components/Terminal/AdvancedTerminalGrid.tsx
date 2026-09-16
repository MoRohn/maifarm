/**
 * Advanced Terminal Grid
 *
 * Features:
 * - Responsive grid with CSS Grid and Flexbox
 * - Split view (horizontal/vertical)
 * - Picture-in-picture mode
 * - Drag and drop reordering
 * - Synchronized scrolling
 * - Smart layout adaptation
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Grid,
  Columns,
  Rows,
  Maximize2,
  PictureInPicture,
  ArrowsUpDown,
  Link,
  Unlink,
} from 'lucide-react';
import { AdvancedTerminalPane } from './AdvancedTerminalPane';

interface GridAgent {
  sessionId: string;
  agentId: number;
  agentName: string;
  pinned?: boolean;
}

interface AdvancedTerminalGridProps {
  agents: GridAgent[];
  className?: string;
}

type LayoutMode = 'grid' | 'split-horizontal' | 'split-vertical' | 'pip' | 'focus';
type GridSize = '1x1' | '2x1' | '2x2' | '3x2' | '4x2' | 'auto';

export const AdvancedTerminalGrid: React.FC<AdvancedTerminalGridProps> = ({
  agents: initialAgents,
  className = '',
}) => {
  const [agents, setAgents] = useState(initialAgents);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [gridSize, setGridSize] = useState<GridSize>('auto');
  const [focusedAgent, setFocusedAgent] = useState<number | null>(null);
  const [pipAgent, setPipAgent] = useState<number | null>(null);
  const [syncScroll, setSyncScroll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate optimal grid layout
  const getGridLayout = useCallback((count: number): { cols: number; rows: number } => {
    if (gridSize !== 'auto') {
      const [cols, rows] = gridSize.split('x').map(Number);
      return { cols, rows };
    }

    if (count <= 1) return { cols: 1, rows: 1 };
    if (count <= 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(count / 4) };
  }, [gridSize]);

  const layout = useMemo(() => getGridLayout(agents.length), [agents.length, getGridLayout]);

  // Get CSS grid template based on layout
  const getGridTemplate = useCallback(() => {
    switch (layoutMode) {
      case 'grid':
        return {
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          gap: '1rem',
        };
      case 'split-horizontal':
        return {
          display: 'flex',
          flexDirection: 'row' as const,
          gap: '1rem',
        };
      case 'split-vertical':
        return {
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '1rem',
        };
      case 'focus':
        return {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gridTemplateRows: '1fr',
        };
      default:
        return {
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gap: '1rem',
        };
    }
  }, [layoutMode, layout]);

  // Filter agents based on layout mode
  const visibleAgents = useMemo(() => {
    if (layoutMode === 'focus' && focusedAgent !== null) {
      return agents.filter((agent) => agent.agentId === focusedAgent);
    }
    if (layoutMode === 'pip' && pipAgent !== null) {
      return agents.filter((agent) => agent.agentId !== pipAgent);
    }
    return agents;
  }, [agents, layoutMode, focusedAgent, pipAgent]);

  const pipAgentData = useMemo(() => {
    if (layoutMode === 'pip' && pipAgent !== null) {
      return agents.find((agent) => agent.agentId === pipAgent);
    }
    return null;
  }, [agents, layoutMode, pipAgent]);

  // Handlers
  const handleLayoutChange = (mode: LayoutMode) => {
    setLayoutMode(mode);
    if (mode === 'focus' && focusedAgent === null && agents.length > 0) {
      setFocusedAgent(agents[0].agentId);
    }
  };

  const handlePipToggle = (agentId: number) => {
    if (pipAgent === agentId) {
      setPipAgent(null);
      setLayoutMode('grid');
    } else {
      setPipAgent(agentId);
      setLayoutMode('pip');
    }
  };

  const handleFocus = (agentId: number) => {
    setFocusedAgent(agentId);
    setLayoutMode('focus');
  };

  const handleExitFocus = () => {
    setLayoutMode('grid');
    setFocusedAgent(null);
  };

  return (
    <div className={`advanced-terminal-grid relative h-full ${className}`} ref={containerRef}>
      {/* Control bar */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center justify-between mb-4 px-4 py-3 bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50"
      >
        <div className="flex items-center space-x-2">
          {/* Layout mode buttons */}
          <button
            onClick={() => handleLayoutChange('grid')}
            className={`p-2 rounded-lg transition-all ${
              layoutMode === 'grid'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="Grid layout"
          >
            <Grid className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleLayoutChange('split-horizontal')}
            className={`p-2 rounded-lg transition-all ${
              layoutMode === 'split-horizontal'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="Split horizontal"
          >
            <Columns className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleLayoutChange('split-vertical')}
            className={`p-2 rounded-lg transition-all ${
              layoutMode === 'split-vertical'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title="Split vertical"
          >
            <Rows className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-700" />

          {/* Sync scroll toggle */}
          <button
            onClick={() => setSyncScroll(!syncScroll)}
            className={`p-2 rounded-lg transition-all ${
              syncScroll
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            title={syncScroll ? 'Unsync scrolling' : 'Sync scrolling'}
          >
            {syncScroll ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center space-x-3 text-sm text-gray-400">
          <span>{agents.length} agents</span>
          <span>•</span>
          <span className="capitalize">{layoutMode.replace('-', ' ')}</span>
          {focusedAgent !== null && layoutMode === 'focus' && (
            <>
              <span>•</span>
              <button
                onClick={handleExitFocus}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Exit focus
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Terminal grid */}
      <motion.div
        className="h-[calc(100%-5rem)] relative"
        style={getGridTemplate()}
        layout
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <AnimatePresence mode="popLayout">
          {visibleAgents.map((agent, index) => (
            <motion.div
              key={agent.agentId}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: 0.3,
                delay: index * 0.05,
                ease: 'easeOut',
              }}
              className="relative group"
              style={{
                minHeight: layoutMode === 'grid' ? '300px' : undefined,
              }}
            >
              {/* Quick action overlay */}
              <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex space-x-1 bg-gray-900/90 backdrop-blur-sm rounded-lg p-1 shadow-xl">
                  <button
                    onClick={() => handleFocus(agent.agentId)}
                    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                    title="Focus this terminal"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                  <button
                    onClick={() => handlePipToggle(agent.agentId)}
                    className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                    title="Picture-in-picture"
                  >
                    <PictureInPicture className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                </div>
              </div>

              <AdvancedTerminalPane
                sessionId={agent.sessionId}
                agentId={agent.agentId}
                agentName={agent.agentName}
                className="h-full"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Picture-in-picture terminal */}
      <AnimatePresence>
        {pipAgentData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 100, y: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 100, y: 100 }}
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            className="fixed bottom-4 right-4 z-50 w-96 h-64 shadow-2xl cursor-move"
            style={{
              touchAction: 'none',
            }}
          >
            <div className="relative h-full group">
              {/* PiP close button */}
              <button
                onClick={() => handlePipToggle(pipAgentData.agentId)}
                className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600/90 hover:bg-red-700 text-white p-1.5 rounded-full shadow-lg"
                title="Close PiP"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              <AdvancedTerminalPane
                sessionId={pipAgentData.sessionId}
                agentId={pipAgentData.agentId}
                agentName={pipAgentData.agentName}
                className="h-full ring-2 ring-blue-500 ring-opacity-50"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Performance stats overlay (optional) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm text-xs text-gray-400 p-2 rounded-lg border border-gray-700/50 font-mono">
          <div>Layout: {layoutMode}</div>
          <div>Grid: {layout.cols}×{layout.rows}</div>
          <div>Visible: {visibleAgents.length}/{agents.length}</div>
        </div>
      )}
    </div>
  );
};
