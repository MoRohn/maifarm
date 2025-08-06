import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  Download, 
  Upload, 
  Trash2, 
  Clock, 
  Shield,
  FileArchive,
  AlertCircle,
  CheckCircle,
  Calendar,
  RefreshCw,
  MoreVertical,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { backupService, BackupMetadata } from '../../services/backupService';
import { formatBytes } from '../../utils/format';

interface BackupManagerProps {
  className?: string;
  compact?: boolean;
}

export const BackupManager: React.FC<BackupManagerProps> = ({
  className = '',
  compact = false
}) => {
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();

    // Listen for backup events
    const handleBackupEvent = (metadata: BackupMetadata) => {
      loadBackups();
    };

    const handleProgress = (progress: any) => {
      if (progress.stage === 'complete') {
        setBackupProgress(null);
      } else {
        setBackupProgress(progress.progress);
      }
    };

    backupService.on('backup:created', handleBackupEvent);
    backupService.on('backup:deleted', loadBackups);
    backupService.on('backup:imported', handleBackupEvent);
    backupService.on('backup:progress', handleProgress);
    backupService.on('backup:error', (error) => setError(error.toString()));

    return () => {
      backupService.off('backup:created', handleBackupEvent);
      backupService.off('backup:deleted', loadBackups);
      backupService.off('backup:imported', handleBackupEvent);
      backupService.off('backup:progress', handleProgress);
    };
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const backupList = await backupService.listBackups();
      setBackups(backupList);
    } catch (error) {
      console.error('Failed to load backups:', error);
      setError('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async (description?: string) => {
    setCreating(true);
    setError(null);
    try {
      await backupService.createBackup('manual', description);
    } catch (error) {
      console.error('Failed to create backup:', error);
      setError('Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to restore this backup? This will overwrite current data.')) {
      return;
    }

    setRestoreProgress(0);
    setError(null);
    
    try {
      await backupService.restoreBackup(backupId, {
        overwrite: true,
        validateChecksum: true
      });
      
      setRestoreProgress(100);
      setTimeout(() => {
        setRestoreProgress(null);
        // Reload the page to reflect restored data
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      setError('Failed to restore backup');
      setRestoreProgress(null);
    }
  };

  const deleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup?')) {
      return;
    }

    try {
      await backupService.deleteBackup(backupId);
    } catch (error) {
      console.error('Failed to delete backup:', error);
      setError('Failed to delete backup');
    }
  };

  const exportBackup = async (backupId: string) => {
    try {
      const blob = await backupService.exportBackup(backupId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maifarm-backup-${backupId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export backup:', error);
      setError('Failed to export backup');
    }
  };

  const importBackup = async (file: File) => {
    try {
      await backupService.importBackup(file);
    } catch (error) {
      console.error('Failed to import backup:', error);
      setError('Failed to import backup');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBackupTypeIcon = (type: BackupMetadata['type']) => {
    switch (type) {
      case 'auto':
        return <RefreshCw className="w-4 h-4" />;
      case 'manual':
        return <HardDrive className="w-4 h-4" />;
      case 'pre-update':
        return <Shield className="w-4 h-4" />;
      case 'emergency':
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getBackupTypeColor = (type: BackupMetadata['type']) => {
    switch (type) {
      case 'auto':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900';
      case 'manual':
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900';
      case 'pre-update':
        return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900';
      case 'emergency':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900';
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <FileArchive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Backup Manager
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {backups.length} backups available
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Import Backup */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
                className="hidden"
              />
              <div className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <Upload className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
            </label>

            {/* Create Backup */}
            <button
              onClick={() => createBackup()}
              disabled={creating}
              className={`
                px-4 py-2 rounded-lg flex items-center gap-2 transition-colors
                ${creating 
                  ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
              `}
            >
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  Create Backup
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Bars */}
        {backupProgress !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Creating backup...</span>
              <span className="text-gray-900 dark:text-gray-100">{backupProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${backupProgress}%` }}
                className="bg-blue-600 h-2 rounded-full"
              />
            </div>
          </div>
        )}

        {restoreProgress !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Restoring backup...</span>
              <span className="text-gray-900 dark:text-gray-100">{restoreProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${restoreProgress}%` }}
                className="bg-green-600 h-2 rounded-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Backup List */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8">
            <FileArchive className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No backups yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Create your first backup to protect your data
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <motion.div
                key={backup.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`
                  p-3 rounded-lg border transition-all
                  ${selectedBackup === backup.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${getBackupTypeColor(backup.type)}`}>
                      {getBackupTypeIcon(backup.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {backup.description || `${backup.type} backup`}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {formatDate(backup.timestamp)}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span className="text-gray-600 dark:text-gray-400">
                          Size: {formatBytes(backup.size)}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          Items: {backup.items.farms} farms, {backup.items.agents} agents
                        </span>
                        {backup.encrypted && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Shield className="w-3 h-3" />
                            Encrypted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowDropdown(showDropdown === backup.id ? null : backup.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>

                    <AnimatePresence>
                      {showDropdown === backup.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
                        >
                          <button
                            onClick={() => {
                              restoreBackup(backup.id);
                              setShowDropdown(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Restore
                          </button>
                          <button
                            onClick={() => {
                              exportBackup(backup.id);
                              setShowDropdown(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <FileDown className="w-4 h-4" />
                            Export
                          </button>
                          <button
                            onClick={() => {
                              deleteBackup(backup.id);
                              setShowDropdown(null);
                            }}
                            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};