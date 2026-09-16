import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Clock,
  Users,
  Activity,
  Cpu,
  TrendingUp,
  Terminal,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings,
  BarChart3,
  Zap,
  Bot,
  Brain,
  FileText,
  ExternalLink
} from 'lucide-react';
import { Farm, Agent } from '@/types';
import { getAgentsFromFarm, getAgentCount } from '@/utils/farmHelpers';
import { api } from '@/services/apiClient';

interface FarmDetailsResponse {
  success: boolean;
  data?: Farm;
  error?: { code: string; message: string };
}

export function FarmDetailsPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchFarm = useCallback(async () => {
    if (!farmId) return;

    try {
      setLoading(true);
      const response = await api.get<FarmDetailsResponse>(`/farms/${farmId}`);
      if (response.data.success && response.data.data) {
        setFarm(response.data.data);
        setError(null);
      } else {
        setError(response.data.error?.message || 'Failed to load farm');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load farm');
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    fetchFarm();
    // Poll for updates every 5 seconds if farm is active
    const interval = setInterval(() => {
      if (farm?.status === 'active' || farm?.status === 'running' || farm?.status === 'launching') {
        fetchFarm();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchFarm, farm?.status]);

  const handleAction = async (action: 'launch' | 'pause' | 'resume' | 'recover' | 'delete') => {
    if (!farmId) return;

    setActionLoading(action);
    try {
      let endpoint = '';
      let method: 'post' | 'delete' = 'post';

      switch (action) {
        case 'launch':
          endpoint = `/farms/${farmId}/launch`;
          break;
        case 'pause':
          endpoint = `/farms/${farmId}/pause`;
          break;
        case 'resume':
          endpoint = `/farms/${farmId}/resume`;
          break;
        case 'recover':
          endpoint = `/farms/${farmId}/recover`;
          break;
        case 'delete':
          endpoint = `/farms/${farmId}`;
          method = 'delete';
          break;
      }

      if (method === 'delete') {
        await api.delete(endpoint);
        toast.success('Farm deleted successfully');
        navigate('/home');
      } else {
        await api.post(endpoint);
        toast.success(`Farm ${action} initiated`);
        await fetchFarm();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || `Failed to ${action} farm`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'running':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'launching':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'paused':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'completed':
        return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30';
      case 'failed':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'working':
        return 'bg-green-500';
      case 'idle':
        return 'bg-gray-500';
      case 'error':
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-yellow-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-gray-200 mb-2">Failed to Load Farm</h2>
        <p className="text-gray-400 mb-4">{error || 'Farm not found'}</p>
        <button
          onClick={() => navigate('/home')}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>
    );
  }

  const agents = getAgentsFromFarm(farm);
  const agentCount = getAgentCount(farm);
  const activeAgents = agents.filter(a => a.status === 'working' || a.status === 'active').length;
  const completionRate = farm.metrics?.totalTasks && farm.metrics.totalTasks > 0
    ? Math.round((farm.metrics.completedTasks || 0) / farm.metrics.totalTasks * 100)
    : farm.status === 'completed' ? 100 : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/home')}
            className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{farm.name}</h1>
            <div className="flex items-center space-x-3 mt-1">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getStatusColor(farm.status)}`}>
                {farm.status}
              </span>
              <span className="text-sm text-gray-400">
                {farm.provider && <span className="capitalize">{farm.provider}</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {farm.status === 'idle' && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction('launch')}
              disabled={actionLoading === 'launch'}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg transition-all disabled:opacity-50"
            >
              {actionLoading === 'launch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Launch</span>
            </motion.button>
          )}

          {(farm.status === 'active' || farm.status === 'running') && (
            <>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/harvest/${farmId}`)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg transition-all"
              >
                <Terminal className="w-4 h-4" />
                <span>View Terminal</span>
              </motion.button>
              <button
                onClick={() => handleAction('pause')}
                disabled={actionLoading === 'pause'}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                <span>Pause</span>
              </button>
            </>
          )}

          {farm.status === 'paused' && (
            <button
              onClick={() => handleAction('resume')}
              disabled={actionLoading === 'resume'}
              className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Resume</span>
            </button>
          )}

          {farm.status === 'failed' && (
            <button
              onClick={() => handleAction('recover')}
              disabled={actionLoading === 'recover'}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'recover' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Recover</span>
            </button>
          )}

          {farm.status === 'completed' && (
            <button
              onClick={() => navigate(`/barn`)}
              className="flex items-center space-x-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>View Harvest</span>
            </button>
          )}

          <button
            onClick={() => handleAction('delete')}
            disabled={actionLoading === 'delete'}
            className="flex items-center space-x-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Description */}
      {farm.description && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <p className="text-gray-300">{farm.description}</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Agents</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {activeAgents}/{agentCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">Active / Total</div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Progress</span>
          </div>
          <div className="text-2xl font-bold text-white">{completionRate}%</div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Efficiency</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {farm.metrics?.efficiency || 0}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Task completion rate</div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Runtime</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {farm.startedAt
              ? `${Math.round((Date.now() - new Date(farm.startedAt).getTime()) / 60000)}m`
              : '0m'
            }
          </div>
          <div className="text-xs text-gray-500 mt-1">Since launch</div>
        </div>
      </div>

      {/* Agents Section */}
      {agentCount > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <span>Agents ({agentCount})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-bold">
                        {agent.name?.charAt(0).toUpperCase() || `A${index + 1}`}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {agent.name || `Agent ${index + 1}`}
                      </h3>
                      <p className="text-xs text-gray-400 capitalize">{agent.type || 'builder'}</p>
                    </div>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${getAgentStatusColor(agent.status)} ${
                    (agent.status === 'active' || agent.status === 'working') ? 'animate-pulse' : ''
                  }`} />
                </div>

                <div className="text-sm text-gray-400">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="capitalize text-gray-300">{agent.status}</span>
                  </div>
                  {agent.currentTask && (
                    <div className="flex items-center justify-between mt-1">
                      <span>Task</span>
                      <span className="text-gray-300 truncate max-w-[150px]">{agent.currentTask}</span>
                    </div>
                  )}
                  {agent.metrics?.tasksCompleted !== undefined && (
                    <div className="flex items-center justify-between mt-1">
                      <span>Completed</span>
                      <span className="text-gray-300">{agent.metrics.tasksCompleted} tasks</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate(`/harvest/${farmId}`)}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <Terminal className="w-5 h-5 text-green-400" />
          <span className="text-gray-300">Terminal</span>
        </button>

        <button
          onClick={() => navigate('/analytics')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <span className="text-gray-300">Analytics</span>
        </button>

        <button
          onClick={() => navigate('/barn')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <FileText className="w-5 h-5 text-yellow-400" />
          <span className="text-gray-300">Barn</span>
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-400" />
          <span className="text-gray-300">Settings</span>
        </button>
      </div>

      {/* Metadata */}
      <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Created</span>
            <p className="text-gray-300">{new Date(farm.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Updated</span>
            <p className="text-gray-300">{new Date(farm.updatedAt).toLocaleString()}</p>
          </div>
          {farm.startedAt && (
            <div>
              <span className="text-gray-500">Started</span>
              <p className="text-gray-300">{new Date(farm.startedAt).toLocaleString()}</p>
            </div>
          )}
          <div>
            <span className="text-gray-500">Farm ID</span>
            <p className="text-gray-300 font-mono text-xs truncate">{farm.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FarmDetailsPage;
