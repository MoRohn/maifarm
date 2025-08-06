import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Calendar, 
  Filter,
  Search,
  Download,
  Eye,
  Archive,
  Plus,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  Loader2
} from 'lucide-react';
import { harvestService } from '../../services/harvestService';
import { Harvest, HarvestFilter } from '../../types/harvest';
import { HarvestView } from './HarvestView';
import { format } from 'date-fns';
import { clsx } from 'clsx';

export const HarvestList: React.FC = () => {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHarvest, setSelectedHarvest] = useState<Harvest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHarvests();
    
    // Subscribe to real-time updates
    const unsubscribe = subscribeToHarvestUpdates();
    
    return () => {
      unsubscribe?.();
    };
  }, []);

  const loadHarvests = async () => {
    try {
      setLoading(true);
      const filter: HarvestFilter = {
        searchQuery: searchQuery || undefined,
        status: statusFilter === 'all' ? undefined : [statusFilter as Harvest['status']]
      };
      
      const data = await harvestService.getAll(filter);
      setHarvests(data);
    } catch (error) {
      console.error('Failed to load harvests:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToHarvestUpdates = () => {
    // WebSocket subscription handled by harvestService
    // Just refresh the list when updates occur
    const handleUpdate = () => {
      loadHarvests();
    };

    // In a real app, we'd subscribe to specific events
    // For now, we'll just return a no-op
    return () => {};
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHarvests();
    setRefreshing(false);
  };

  const handleExport = async (harvest: Harvest, format: 'json' | 'pdf' | 'markdown' | 'csv') => {
    try {
      await harvestService.downloadExport(harvest.id, format);
    } catch (error) {
      console.error('Failed to export harvest:', error);
    }
  };

  const handleArchive = async (harvest: Harvest) => {
    // TODO: Implement archive functionality
    console.log('Archive harvest:', harvest.id);
  };

  const getStatusIcon = (status: Harvest['status']) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return <Archive className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const filteredHarvests = harvests.filter(harvest => {
    const matchesSearch = !searchQuery || 
      harvest.farmName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      harvest.summary.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || harvest.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Harvests</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Collected outputs from your farms
          </p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          <span>Refresh</span>
        </motion.button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search harvests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadHarvests()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              loadHarvests();
            }}
            className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none"
          >
            <option value="all">All Status</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="archived">Archived</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Harvest List */}
      {filteredHarvests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-apple-xl">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No harvests found</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Harvests will appear here when your farms complete their work
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {filteredHarvests.map((harvest) => (
              <motion.div
                key={harvest.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-lg p-6 hover:shadow-apple-xl transition-shadow cursor-pointer"
                onClick={() => setSelectedHarvest(harvest)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-apple-lg">
                      {getStatusIcon(harvest.status)}
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {harvest.farmName}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {harvest.summary.description}
                      </p>
                      
                      <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500 dark:text-gray-500">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {format(harvest.createdAt, 'MMM d, yyyy')}
                        </span>
                        <span>
                          {harvest.results.length} results • {harvest.insights.length} insights
                        </span>
                        <span className="flex items-center">
                          Quality: {harvest.quality.overallScore.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(harvest, 'json');
                      }}
                      className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                      title="Export"
                    >
                      <Download className="w-4 h-4" />
                    </motion.button>
                    
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHarvest(harvest);
                      }}
                      className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
                
                {/* Progress bar for quality */}
                <div className="mt-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${harvest.quality.overallScore}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={clsx(
                        'h-2 rounded-full',
                        harvest.quality.overallScore >= 90 ? 'bg-green-500' :
                        harvest.quality.overallScore >= 70 ? 'bg-yellow-500' :
                        'bg-red-500'
                      )}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Harvest Detail Modal */}
      {selectedHarvest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-6xl w-full max-h-[90vh] overflow-auto"
          >
            <HarvestView
              harvest={selectedHarvest}
              onClose={() => setSelectedHarvest(null)}
              onExport={(format) => handleExport(selectedHarvest, format)}
              onArchive={() => handleArchive(selectedHarvest)}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
};