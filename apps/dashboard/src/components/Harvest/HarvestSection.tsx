import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse,
  Package,
  Code,
  Wrench,
  FileText,
  ArrowRight,
  Plus,
  Clock,
  Star
} from 'lucide-react';
import { clsx } from 'clsx';
import { useHarvestStore } from '@/store/harvestStore';

export const HarvestSection: React.FC = () => {
  const navigate = useNavigate();
  const { recentHarvests, stats } = useHarvestStore();
  
  const typeIcons = {
    app: Package,
    tool: Wrench,
    script: Code,
    workflow: FileText,
    other: FileText
  };

  const handleViewBarn = () => {
    navigate('/barn');
  };

  if (recentHarvests.length === 0) {
    return null; // Don't show section if no harvests
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-apple">
            <Warehouse className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recent Harvests
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your saved creations from the barn
            </p>
          </div>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleViewBarn}
          className="flex items-center space-x-2 px-4 py-2 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <span>View All</span>
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {recentHarvests.slice(0, 4).map((harvest) => {
          const Icon = typeIcons[harvest.type];
          
          return (
            <motion.div
              key={harvest.id}
              whileHover={{ y: -2 }}
              onClick={() => navigate(`/barn?harvest=${harvest.id}`)}
              className={clsx(
                'bg-white dark:bg-gray-900 rounded-apple-lg p-5',
                'border border-gray-200 dark:border-gray-800',
                'cursor-pointer transition-all duration-200',
                'hover:shadow-apple-sm'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-apple">
                  <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Star className="w-3 h-3" />
                  <span>{harvest.useCount}</span>
                </div>
              </div>
              
              <h4 className="font-medium text-gray-900 dark:text-white mb-1 line-clamp-1">
                {harvest.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                {harvest.description}
              </p>
              
              <div className="flex items-center text-xs text-gray-500">
                <Clock className="w-3 h-3 mr-1" />
                <span>{formatRelativeTime(harvest.createdAt)}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Barn Stats */}
      {stats && (
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-apple-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Warehouse className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {stats?.totalHarvests || 0} harvests saved in your barn
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Most popular: {stats?.harvestsByType?.app || 0} apps, {stats?.harvestsByType?.tool || 0} tools
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleViewBarn}
              className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-apple hover:bg-amber-700 transition-colors"
            >
              Open Barn
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
};

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return past.toLocaleDateString();
}