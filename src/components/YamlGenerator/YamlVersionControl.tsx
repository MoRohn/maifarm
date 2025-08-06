import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitBranch, 
  Clock, 
  User, 
  Tag, 
  CheckCircle,
  AlertCircle,
  RotateCcw,
  GitCommit,
  FileText
} from 'lucide-react';
import { YamlVersion, YamlDiff } from '../../types/yamlPipeline';
import useYamlStore from '../../store/yamlStore';
import { formatDistanceToNow } from 'date-fns';

interface YamlVersionControlProps {
  currentVersionId?: string;
  onVersionSelect: (version: YamlVersion) => void;
  onCompare: (fromId: string, toId: string) => void;
}

const YamlVersionControl: React.FC<YamlVersionControlProps> = ({
  currentVersionId,
  onVersionSelect,
  onCompare
}) => {
  const { 
    versions, 
    refreshVersions,
    saveVersion,
    loadVersion
  } = useYamlStore();
  
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitAuthor, setCommitAuthor] = useState('Current User'); // Get from auth

  useEffect(() => {
    refreshVersions();
  }, [refreshVersions]);

  const handleVersionSelect = (versionId: string) => {
    if (selectedVersions.includes(versionId)) {
      setSelectedVersions(selectedVersions.filter(id => id !== versionId));
    } else {
      if (selectedVersions.length >= 2) {
        setSelectedVersions([selectedVersions[1], versionId]);
      } else {
        setSelectedVersions([...selectedVersions, versionId]);
      }
    }
  };

  const handleCompare = () => {
    if (selectedVersions.length === 2) {
      onCompare(selectedVersions[0], selectedVersions[1]);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    
    await saveVersion(commitMessage, commitAuthor);
    setShowCommitDialog(false);
    setCommitMessage('');
  };

  const handleRollback = async (versionId: string) => {
    if (confirm('Are you sure you want to rollback to this version?')) {
      await loadVersion(versionId);
    }
  };

  const getStatusColor = (status: YamlVersion['status']) => {
    switch (status) {
      case 'draft': return 'text-gray-500';
      case 'pending_review': return 'text-yellow-500';
      case 'approved': return 'text-green-500';
      case 'deployed': return 'text-blue-500';
      case 'archived': return 'text-gray-400';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: YamlVersion['status']) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'pending_review': return <Clock className="w-4 h-4" />;
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'deployed': return <GitBranch className="w-4 h-4" />;
      case 'archived': return <AlertCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Version Control
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({versions.length} versions)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {selectedVersions.length === 2 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleCompare}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Compare Selected
              </motion.button>
            )}
            <button
              onClick={() => setShowCommitDialog(true)}
              className="px-3 py-1.5 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1"
            >
              <GitCommit className="w-4 h-4" />
              Commit Changes
            </button>
          </div>
        </div>
      </div>

      {/* Version List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {versions.map((version, index) => (
            <motion.div
              key={version.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className={`px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                currentVersionId === version.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              } ${selectedVersions.includes(version.id) ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
              onClick={() => handleVersionSelect(version.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      v{version.version}
                    </span>
                    <span className={`flex items-center gap-1 text-sm ${getStatusColor(version.status)}`}>
                      {getStatusIcon(version.status)}
                      {version.status}
                    </span>
                    {version.tags?.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {version.message}
                  </p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {version.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(version.timestamp), { addSuffix: true })}
                    </span>
                    <span className="font-mono text-xs">
                      {version.hash.substring(0, 8)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {currentVersionId !== version.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onVersionSelect(version);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Load this version"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  )}
                  {version.status !== 'deployed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRollback(version.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Rollback to this version"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Commit Dialog */}
      <AnimatePresence>
        {showCommitDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowCommitDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Commit Changes
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Commit Message
                  </label>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Describe your changes..."
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={commitAuthor}
                    onChange={(e) => setCommitAuthor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCommitDialog(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim()}
                  className="px-4 py-2 bg-green-500 text-white rounded-md font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Commit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default YamlVersionControl;