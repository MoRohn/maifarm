import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  FileText,
  Folder,
  Download,
  CheckCircle,
  Clock,
  TrendingUp,
  Activity,
  Cpu,
  HardDrive,
  Zap,
  Database,
  GitBranch,
  Calendar,
  Users,
  BarChart3,
  PieChart,
  Eye,
  ExternalLink,
  ChevronRight,
  Search,
  Filter,
  SortAsc
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatBytes, formatDuration } from '@/utils/format';

interface HarvestDashboardViewProps {
  farmId: string;
  farmName: string;
  harvest: any;
  agents: any[];
  onClose?: () => void;
}

export const HarvestDashboardView: React.FC<HarvestDashboardViewProps> = ({
  farmId,
  farmName,
  harvest,
  agents,
  onClose
}) => {
  const { subscribe } = useWebSocket();
  const [yieldItems, setYieldItems] = useState<any[]>([]);
  const [taskMetrics, setTaskMetrics] = useState({
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageTime: 0,
    successRate: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'file' | 'folder' | 'artifact'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');

  useEffect(() => {
    // Subscribe to harvest updates
    const unsubscribe = subscribe('harvest:updated', (data) => {
      if (data.farmId === farmId && data.yield) {
        setYieldItems(data.yield);
      }
    });

    // Set initial yield items
    if (harvest?.yield) {
      setYieldItems(harvest.yield);
    }

    // Calculate task metrics
    if (agents && agents.length > 0) {
      const totalCompleted = agents.reduce((acc, agent) => 
        acc + (agent.metrics?.tasksCompleted || 0), 0
      );
      const totalFailed = agents.reduce((acc, agent) => 
        acc + (agent.metrics?.tasksFailed || 0), 0
      );
      const avgTime = agents.reduce((acc, agent) => 
        acc + (agent.metrics?.avgResponseTime || 0), 0
      ) / agents.length;
      
      setTaskMetrics({
        totalTasks: totalCompleted + totalFailed,
        completedTasks: totalCompleted,
        failedTasks: totalFailed,
        averageTime: avgTime,
        successRate: totalCompleted > 0 ? (totalCompleted / (totalCompleted + totalFailed)) * 100 : 0
      });
    }

    return unsubscribe;
  }, [farmId, harvest, agents, subscribe]);

  // Filter and sort yield items
  const filteredItems = yieldItems
    .filter(item => {
      if (searchQuery && !item.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'size':
          return (b.size || 0) - (a.size || 0);
        case 'date':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        default:
          return 0;
      }
    });

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="w-5 h-5" />;
      case 'folder':
        return <Folder className="w-5 h-5" />;
      case 'artifact':
        return <Package className="w-5 h-5" />;
      default:
        return <Database className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'processing':
        return 'text-blue-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Header Section */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Harvest Dashboard
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {farmName} • {filteredItems.length} items yielded
              </p>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                onClick={() => window.open(`/api/harvest/${farmId}/download`, '_blank')}
              >
                <Download className="w-4 h-4" />
                Download All
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Tasks</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {taskMetrics.totalTasks}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {agents.length} agents active
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {taskMetrics.successRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {taskMetrics.completedTasks} completed
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Avg Response</span>
              <Clock className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {(taskMetrics.averageTime / 1000).toFixed(1)}s
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              per task
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Yield Size</span>
              <HardDrive className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBytes(yieldItems.reduce((acc, item) => acc + (item.size || 0), 0))}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {yieldItems.length} items
            </div>
          </motion.div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="px-6 py-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search yield items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="file">Files</option>
              <option value="folder">Folders</option>
              <option value="artifact">Artifacts</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
            </select>
          </div>
        </div>
      </div>

      {/* Yield Items Grid */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id || index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -2 }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        item.type === 'file' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                        item.type === 'folder' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                        'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                      )}>
                        {getItemIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {item.name || 'Unnamed Item'}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.type} • {formatBytes(item.size || 0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.status && (
                        <span className={cn(
                          "text-xs font-medium",
                          getStatusColor(item.status)
                        )}>
                          {item.status}
                        </span>
                      )}
                      {item.agentId && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          by Agent {agents.findIndex(a => a.id === item.agentId) + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => {
                          // Handle view action
                          console.log('View item:', item);
                        }}
                      >
                        <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => {
                          // Handle download action
                          window.open(`/api/harvest/${farmId}/items/${item.id}/download`, '_blank');
                        }}
                      >
                        <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </motion.button>
                    </div>
                  </div>

                  {item.metadata && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(item.metadata).slice(0, 3).map(([key, value]) => (
                          <span
                            key={key}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md"
                          >
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {searchQuery || filterType !== 'all' 
                ? 'No items match your filters'
                : 'No yield items yet'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Items will appear here as agents complete their tasks
            </p>
          </div>
        )}
      </div>

      {/* Agent Performance Summary */}
      <div className="px-6 py-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {agents.length} Agents
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                CPU: {agents.reduce((acc, a) => acc + (a.metrics?.cpu || 0), 0) / agents.length || 0}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Memory: {agents.reduce((acc, a) => acc + (a.metrics?.memory || 0), 0) / agents.length || 0}%
              </span>
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
};