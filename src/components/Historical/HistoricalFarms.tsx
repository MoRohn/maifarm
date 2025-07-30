import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Download, Archive, Trash2, Clock, TrendingUp } from 'lucide-react';
import { HistoricalFarm, HistoricalFilters, BulkAction } from '../../types/historical';
import FarmTimeline from './FarmTimeline';
import FarmInsights from './FarmInsights';
import { useHistoricalData } from '../../hooks/useHistoricalData';
import { format } from 'date-fns';

interface HistoricalFarmsProps {
  onFarmSelect?: (farm: HistoricalFarm) => void;
}

const HistoricalFarms: React.FC<HistoricalFarmsProps> = ({ onFarmSelect }) => {
  const {
    farms,
    loading,
    error,
    filters,
    stats,
    setFilters,
    performBulkAction,
    exportData
  } = useHistoricalData();

  const [selectedFarms, setSelectedFarms] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setFilters({ ...filters, search: query });
  }, [filters, setFilters]);

  const handleSelectFarm = (farmId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedFarms);
    if (isSelected) {
      newSelected.add(farmId);
    } else {
      newSelected.delete(farmId);
    }
    setSelectedFarms(newSelected);
  };

  const handleBulkAction = async (type: BulkAction['type']) => {
    if (selectedFarms.size === 0) return;

    const action: BulkAction = {
      type,
      farmIds: Array.from(selectedFarms)
    };

    await performBulkAction(action);
    setSelectedFarms(new Set());
  };

  const getStatusColor = (status: HistoricalFarm['status']) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'failed': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      case 'cancelled': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'archived': return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20';
    }
  };

  const getTypeIcon = (type: HistoricalFarm['type']) => {
    switch (type) {
      case 'debug': return '🐛';
      case 'build': return '🔨';
      case 'test': return '🧪';
      case 'analysis': return '📊';
      case 'custom': return '⚙️';
      default: return '📦';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Historical Farms
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {stats?.totalFarms || 0} farms • {stats?.averageDuration || 0} min avg duration
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Timeline
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={() => exportData('json')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search farms by name, description, or natural language query..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-lg transition-colors ${
              showFilters
                ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Type Filter */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Farm Type
                </label>
                <select
                  multiple
                  value={filters.types || []}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFilters({ ...filters, types: selected });
                  }}
                  className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                >
                  <option value="debug">Debug</option>
                  <option value="build">Build</option>
                  <option value="test">Test</option>
                  <option value="analysis">Analysis</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Status
                </label>
                <select
                  multiple
                  value={filters.statuses || []}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFilters({ ...filters, statuses: selected });
                  }}
                  className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                >
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Sort By
                </label>
                <select
                  value={filters.sortBy || 'date'}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                  className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                >
                  <option value="date">Date</option>
                  <option value="duration">Duration</option>
                  <option value="performance">Performance</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={filters.archived || false}
                  onChange={(e) => setFilters({ ...filters, archived: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Show archived farms
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedFarms.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
            {selectedFarms.size} farm{selectedFarms.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleBulkAction('archive')}
              className="flex items-center space-x-1 px-3 py-1 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Archive className="w-4 h-4" />
              <span className="text-sm">Archive</span>
            </button>
            <button
              onClick={() => handleBulkAction('export')}
              className="flex items-center space-x-1 px-3 py-1 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">Export</span>
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="flex items-center space-x-1 px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 dark:text-red-400">{error}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {farms.map((farm) => (
            <div
              key={farm.id}
              className={`relative bg-gray-50 dark:bg-gray-900 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg ${
                selectedFarms.has(farm.id) ? 'ring-2 ring-purple-500' : ''
              }`}
              onClick={() => onFarmSelect?.(farm)}
            >
              {/* Selection Checkbox */}
              <div className="absolute top-4 right-4">
                <input
                  type="checkbox"
                  checked={selectedFarms.has(farm.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleSelectFarm(farm.id, e.target.checked);
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
              </div>

              {/* Farm Header */}
              <div className="flex items-start space-x-3 mb-3">
                <div className="text-2xl">{getTypeIcon(farm.type)}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {farm.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {farm.description}
                  </p>
                </div>
              </div>

              {/* Status and Date */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(farm.status)}`}>
                  {farm.status}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(farm.createdAt), 'MMM d, yyyy')}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Agents</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {farm.agents.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {farm.duration}m
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tasks</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {farm.metrics.completedTasks}/{farm.metrics.totalTasks}
                  </p>
                </div>
              </div>

              {/* Performance Indicator */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Performance</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {Math.round((farm.metrics.completedTasks / farm.metrics.totalTasks) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                    style={{
                      width: `${(farm.metrics.completedTasks / farm.metrics.totalTasks) * 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Tags */}
              {farm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {farm.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                  {farm.tags.length > 3 && (
                    <span className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400">
                      +{farm.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <FarmTimeline farms={farms} onFarmSelect={onFarmSelect} />
      )}

      {/* Insights Section */}
      {stats && (
        <FarmInsights stats={stats} farms={farms} />
      )}
    </div>
  );
};

export default HistoricalFarms;