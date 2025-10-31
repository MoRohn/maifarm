import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Archive, RotateCcw, Download, X, CheckSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface BarnBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkArchive: () => void;
  onBulkRestore?: () => void;
  onBulkExport: () => void;
  isArchivedView?: boolean;
  isDeleting?: boolean;
  isArchiving?: boolean;
  isRestoring?: boolean;
}

export const BarnBulkActions: React.FC<BarnBulkActionsProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onBulkArchive,
  onBulkRestore,
  onBulkExport,
  isArchivedView = false,
  isDeleting = false,
  isArchiving = false,
  isRestoring = false
}) => {
  const isProcessing = isDeleting || isArchiving || isRestoring;

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-lg"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <CheckSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedCount} of {totalCount} selected
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={onSelectAll}
                    className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={onClearSelection}
                    className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 font-medium"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!isArchivedView && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onBulkArchive}
                    disabled={isProcessing}
                    className={clsx(
                      'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                      isProcessing
                        ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                  >
                    {isArchiving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Archiving...</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4" />
                        <span>Archive</span>
                      </>
                    )}
                  </motion.button>
                )}

                {isArchivedView && onBulkRestore && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onBulkRestore}
                    disabled={isProcessing}
                    className={clsx(
                      'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                      isProcessing
                        ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    )}
                  >
                    {isRestoring ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        <span>Restore</span>
                      </>
                    )}
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBulkExport}
                  disabled={isProcessing}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                    isProcessing
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  )}
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBulkDelete}
                  disabled={isProcessing}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                    isProcessing
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  )}
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </>
                  )}
                </motion.button>

                <button
                  onClick={onClearSelection}
                  className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};