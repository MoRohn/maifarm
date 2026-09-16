/**
 * Model Visualization Panel
 *
 * Integrates Problem Model and Causal Graph visualizations into a unified panel
 * for display in Farm/Harvest pages.
 *
 * Based on:
 * - arxiv 2512.14474 (Model-First Reasoning LLM Agents)
 * - arxiv 2512.07796 (Large Causal Models / DEMOCRITUS)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Network,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ProblemModelViewer } from './ProblemModelViewer';
import { CausalGraphVisualization } from './CausalGraphVisualization';
import { useWebSocketStore } from '@/store/websocketStore';

interface ModelVisualizationPanelProps {
  farmId: string;
  defaultExpanded?: boolean;
  compact?: boolean;
}

interface ProblemModel {
  id: string;
  farmId: string;
  entities: any[];
  variables: any[];
  actions: any[];
  constraints: any[];
  goals: any[];
  verified: boolean;
  verificationScore?: number;
}

interface CausalModel {
  id: string;
  farmId: string;
  graph: {
    nodes: any[];
    edges: any[];
    topologicalOrder: string[];
    isDAG: boolean;
    cycles?: string[][];
    criticalPath?: string[];
    stats: {
      nodeCount: number;
      edgeCount: number;
      rootCount: number;
      leafCount: number;
      maxDepth: number;
      avgConfidence: number;
      componentCount: number;
    };
  };
  conflicts: any[];
  topologicalOrder: string[];
  conflictResolutionStatus: string;
}

interface ModelStats {
  hasProblemModel: boolean;
  hasCausalModel: boolean;
  problemModel?: {
    entityCount: number;
    actionCount: number;
    constraintCount: number;
    goalCount: number;
    verified: boolean;
    verificationScore?: number;
  };
  causalModel?: {
    tripleCount: number;
    nodeCount: number;
    edgeCount: number;
    conflictCount: number;
    unresolvedConflicts: number;
    isDAG: boolean;
  };
}

export const ModelVisualizationPanel: React.FC<ModelVisualizationPanelProps> = ({
  farmId,
  defaultExpanded = false,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'problem' | 'causal'>('problem');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [problemModel, setProblemModel] = useState<ProblemModel | null>(null);
  const [causalModel, setCausalModel] = useState<CausalModel | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [modelingInProgress, setModelingInProgress] = useState(false);

  const { subscribe, connected } = useWebSocketStore();

  // Fetch model stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/modeling/stats/${farmId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching model stats:', err);
    }
  }, [farmId]);

  // Fetch problem model
  const fetchProblemModel = useCallback(async () => {
    try {
      const response = await fetch(`/api/modeling/problem/${farmId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setProblemModel(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching problem model:', err);
    }
  }, [farmId]);

  // Fetch causal model
  const fetchCausalModel = useCallback(async () => {
    try {
      const response = await fetch(`/api/modeling/causal/${farmId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setCausalModel(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching causal model:', err);
    }
  }, [farmId]);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchStats(), fetchProblemModel(), fetchCausalModel()]);
      } catch (err) {
        setError('Failed to load model data');
      } finally {
        setLoading(false);
      }
    };

    if (farmId) {
      fetchData();
    }
  }, [farmId, fetchStats, fetchProblemModel, fetchCausalModel]);

  // WebSocket subscriptions for real-time updates
  useEffect(() => {
    if (!farmId || !connected) return;

    const handleModelingStarted = (data: any) => {
      if (data.farmId === farmId) {
        setModelingInProgress(true);
      }
    };

    const handleProblemModelGenerated = (data: any) => {
      if (data.farmId === farmId) {
        fetchProblemModel();
        fetchStats();
      }
    };

    const handleCausalModelGenerated = (data: any) => {
      if (data.farmId === farmId) {
        fetchCausalModel();
        fetchStats();
      }
    };

    const handleModelingComplete = (data: any) => {
      if (data.farmId === farmId) {
        setModelingInProgress(false);
        fetchStats();
      }
    };

    const unsubscribe1 = subscribe('farm:modeling-started', handleModelingStarted);
    const unsubscribe2 = subscribe('farm:problem-model-generated', handleProblemModelGenerated);
    const unsubscribe3 = subscribe('farm:causal-model-generated', handleCausalModelGenerated);
    const unsubscribe4 = subscribe('farm:modeling-complete', handleModelingComplete);

    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
    };
  }, [farmId, connected, subscribe, fetchProblemModel, fetchCausalModel, fetchStats]);

  // Refresh data
  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchProblemModel(), fetchCausalModel()]);
    setLoading(false);
  };

  // Check if we have any models
  const hasModels = stats?.hasProblemModel || stats?.hasCausalModel;

  // Compact view - just a summary bar
  if (compact && !expanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3"
      >
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Model-First Reasoning
              </span>
              {stats && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {stats.hasProblemModel && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Problem Model
                    </span>
                  )}
                  {stats.hasCausalModel && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Causal Graph
                    </span>
                  )}
                  {!hasModels && !modelingInProgress && (
                    <span className="text-gray-400">No models generated</span>
                  )}
                  {modelingInProgress && (
                    <span className="flex items-center gap-1 text-blue-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating...
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </motion.div>
    );
  }

  // Full panel content
  const panelContent = (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 p-6 overflow-auto' : ''}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Model-First Reasoning
            </h3>
            <p className="text-xs text-gray-500">
              arxiv 2512.14474 + arxiv 2512.07796
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {modelingInProgress && (
            <span className="flex items-center gap-1 text-sm text-blue-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Modeling...
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          {compact && (
            <button
              onClick={() => setExpanded(false)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && !hasModels && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* No models state */}
      {!loading && !hasModels && !modelingInProgress && (
        <div className="text-center py-8 text-gray-500">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No models generated for this farm yet.</p>
          <p className="text-sm mt-1">
            Models are automatically generated during the MODELING phase.
          </p>
        </div>
      )}

      {/* Model content */}
      {hasModels && (
        <>
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
            <button
              onClick={() => setActiveTab('problem')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'problem'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Brain className="h-4 w-4" />
              Problem Model
              {stats?.problemModel && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 rounded">
                  {stats.problemModel.entityCount} entities
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('causal')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'causal'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Network className="h-4 w-4" />
              Causal Graph
              {stats?.causalModel && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 rounded">
                  {stats.causalModel.nodeCount} nodes
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {activeTab === 'problem' && problemModel && (
              <motion.div
                key="problem"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <ProblemModelViewer model={problemModel} compact={false} />
              </motion.div>
            )}
            {activeTab === 'causal' && causalModel && (
              <motion.div
                key="causal"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <CausalGraphVisualization
                  model={causalModel}
                  width={fullscreen ? window.innerWidth - 100 : 600}
                  height={fullscreen ? window.innerHeight - 300 : 400}
                  compact={false}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );

  // Wrap in panel if not fullscreen
  if (fullscreen) {
    return panelContent;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4"
    >
      {panelContent}
    </motion.div>
  );
};

export default ModelVisualizationPanel;
