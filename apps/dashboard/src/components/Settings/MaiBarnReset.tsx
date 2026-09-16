import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrashIcon, 
  ExclamationTriangleIcon,
  FolderIcon,
  DocumentIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';

interface StorageInfo {
  totalFiles: number;
  totalFolders: number;
  sizeEstimate: string;
}

export const MaiBarnReset: React.FC = () => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [includeDatabase, setIncludeDatabase] = useState(false);
  const [resetResult, setResetResult] = useState<{
    success: boolean;
    message: string;
    deletedItems?: {
      folders: string[];
      files: string[];
    };
    databaseCleanup?: {
      farmsDeleted: number;
      agentsDeleted: number;
      harvestsDeleted: number;
      tasksDeleted: number;
      sessionsKilled: number;
    };
  } | null>(null);

  useEffect(() => {
    fetchStorageInfo();
  }, []);

  const fetchStorageInfo = async () => {
    setLoading(true);
    console.log('[MaiBarnReset] Starting to fetch storage info...');
    
    try {
      console.log('[MaiBarnReset] Making API call to /api/maibarn/info');
      const response = await api.maibarn.info();
      
      console.log('[MaiBarnReset] Response received:', response);
      
      if (response?.data?.success && response.data.data) {
        setStorageInfo(response.data.data);
        console.log('[MaiBarnReset] Storage info loaded successfully:', response.data.data);
      } else {
        console.error('[MaiBarnReset] API returned unsuccessful response:', response?.data || 'No response data');
        setStorageInfo({
          totalFiles: 0,
          totalFolders: 0,
          sizeEstimate: 'Unable to load'
        });
      }
    } catch (error: any) {
      console.error('[MaiBarnReset] Failed to fetch storage info:', error);
      console.error('[MaiBarnReset] Error type:', error.constructor.name);
      console.error('[MaiBarnReset] Error message:', error.message);
      
      // Log detailed error information
      if (error.response) {
        console.error('[MaiBarnReset] Response error - Status:', error.response.status);
        console.error('[MaiBarnReset] Response error - Data:', error.response.data);
        console.error('[MaiBarnReset] Response error - Headers:', error.response.headers);
      } else if (error.request) {
        console.error('[MaiBarnReset] Request error - No response received');
        console.error('[MaiBarnReset] Request error - Request:', error.request);
      } else {
        console.error('[MaiBarnReset] Setup error:', error.message);
      }
      
      // Set default values on error
      setStorageInfo({
        totalFiles: 0,
        totalFolders: 0,
        sizeEstimate: 'Unable to load'
      });
    } finally {
      setLoading(false);
      console.log('[MaiBarnReset] Loading complete');
    }
  };

  const handleResetClick = () => {
    setShowConfirmDialog(true);
    setConfirmText('');
    setIncludeDatabase(false);
    setResetResult(null);
  };

  const handleConfirmReset = async () => {
    if (confirmText !== 'DELETE ALL DATA') {
      toast.error('Please type the confirmation text exactly');
      return;
    }

    setIsResetting(true);
    try {
      const response = await api.maibarn.reset({ includeDatabase });
      
      if (response?.data?.success) {
        setResetResult(response.data);
        toast.success('MaiBarn has been reset successfully');
        
        // Refresh storage info after reset
        setTimeout(() => {
          fetchStorageInfo();
        }, 1000);
      } else {
        const errorMessage = response?.data?.message || 'Failed to reset MaiBarn - unknown error';
        toast.error(errorMessage);
        setResetResult({
          success: false,
          message: errorMessage
        });
      }
    } catch (error: any) {
      console.error('Reset failed:', error);
      
      // Extract error message from response
      let errorMessage = 'An error occurred while resetting MaiBarn';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      
      // Log details for debugging
      if (error.response?.data?.details) {
        console.error('Error details:', error.response.data.details);
      }
    } finally {
      setIsResetting(false);
      setConfirmText('');
    }
  };

  const handleCloseDialog = () => {
    if (!isResetting) {
      setShowConfirmDialog(false);
      setConfirmText('');
      setResetResult(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Complete MaiBarn Reset
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This action will completely clean the <span className="font-mono font-semibold">maibarn/</span> folder and reset it to its original state. 
              All agent data, farm workspaces, harvests (including barn harvests), barn items, and coordination files within the maibarn folder will be permanently deleted.
              <span className="block mt-2 text-xs">Note: This only affects the maibarn folder, not your main project files.</span>
            </p>
            
            {/* Storage Info */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                MaiBarn Folder Storage:
              </div>
              <button
                onClick={fetchStorageInfo}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 mb-2"
                disabled={loading}
              >
                <ArrowPathIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
            {loading ? (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                <span>Loading storage information...</span>
              </div>
            ) : storageInfo ? (
              <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <DocumentIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Files</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {storageInfo.totalFiles}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <FolderIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Folders</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {storageInfo.totalFolders}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <InformationCircleIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Size</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {storageInfo.sizeEstimate}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
                  <span>Unable to load storage information</span>
                </div>
                <button
                  onClick={fetchStorageInfo}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warning List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          What will be deleted from <span className="font-mono">maibarn/</span> folder:
        </h4>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span>All farm workspaces in <span className="font-mono">maibarn/workspaces/</span></span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span>All harvests in <span className="font-mono">maibarn/harvests/</span></span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span>All coordination files in <span className="font-mono">maibarn/coordination/</span></span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span>All terminal logs in <span className="font-mono">maibarn/terminals/</span></span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span>All barn items and barn harvests in <span className="font-mono">maibarn/barn/</span></span>
          </li>
        </ul>
        
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mt-4 mb-3">
          What will be preserved:
        </h4>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>Folder structure (empty folders will be recreated)</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>.gitignore and README.md files</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>Your settings and API keys (stored separately)</span>
          </li>
        </ul>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleResetClick}
          className={clsx(
            'px-6 py-3 rounded-xl font-medium transition-all',
            'bg-red-600 hover:bg-red-700 text-white',
            'flex items-center space-x-2',
            'shadow-lg hover:shadow-xl'
          )}
        >
          <TrashIcon className="w-5 h-5" />
          <span>Reset MaiBarn</span>
        </motion.button>
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={handleCloseDialog}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              {!resetResult ? (
                <>
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-xl">
                      <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      Confirm Complete Reset
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    This action cannot be undone. All data in the MaiBarn folder will be permanently deleted.
                  </p>

                  {/* Database Cleanup Option */}
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeDatabase}
                        onChange={(e) => setIncludeDatabase(e.target.checked)}
                        className="mt-1 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          Also clean database (Remove ALL farms)
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          This will permanently delete all farm records from the database, including failed, completed, and stopped farms.
                          Only check this if you want a complete fresh start.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Type <span className="font-mono text-red-600 dark:text-red-400">DELETE ALL DATA</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className={clsx(
                        'w-full px-4 py-2 rounded-lg border',
                        'bg-white dark:bg-gray-800',
                        'text-gray-900 dark:text-white',
                        'focus:outline-none focus:ring-2',
                        confirmText === 'DELETE ALL DATA'
                          ? 'border-green-500 focus:ring-green-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-red-500'
                      )}
                      placeholder="Type confirmation text"
                      disabled={isResetting}
                    />
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={handleCloseDialog}
                      disabled={isResetting}
                      className={clsx(
                        'px-4 py-2 rounded-lg font-medium transition-colors',
                        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                        'hover:bg-gray-200 dark:hover:bg-gray-700',
                        isResetting && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmReset}
                      disabled={isResetting || confirmText !== 'DELETE ALL DATA'}
                      className={clsx(
                        'px-4 py-2 rounded-lg font-medium transition-colors',
                        'bg-red-600 text-white',
                        'hover:bg-red-700',
                        'flex items-center space-x-2',
                        (isResetting || confirmText !== 'DELETE ALL DATA') && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {isResetting ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          <span>Resetting...</span>
                        </>
                      ) : (
                        <>
                          <TrashIcon className="w-4 h-4" />
                          <span>Reset Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-3 mb-4">
                    <div className={clsx(
                      'p-2 rounded-xl',
                      resetResult.success 
                        ? 'bg-green-100 dark:bg-green-900/50' 
                        : 'bg-red-100 dark:bg-red-900/50'
                    )}>
                      {resetResult.success ? (
                        <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      Reset {resetResult.success ? 'Complete' : 'Failed'}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {resetResult.message}
                  </p>

                  {resetResult.deletedItems && (
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Deleted items:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Folders:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.deletedItems.folders.length}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Files:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.deletedItems.files.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {resetResult.databaseCleanup && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Database cleanup:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Farms deleted:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.databaseCleanup.farmsDeleted}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Agents deleted:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.databaseCleanup.agentsDeleted}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Harvests deleted:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.databaseCleanup.harvestsDeleted}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-300">Sessions killed:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {resetResult.databaseCleanup.sessionsKilled}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleCloseDialog}
                      className={clsx(
                        'px-4 py-2 rounded-lg font-medium transition-colors',
                        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                        'hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};