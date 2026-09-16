import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Archive,
  Clock,
  DollarSign,
  Brain,
  Eye,
  Calendar,
  User,
  Tag,
  FileText,
  MessageSquare,
  Package,
  Download,
  RotateCcw,
  Pin,
  Star,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Cpu,
  HardDrive,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';
import { useArchiveStore } from '@/store/archiveStore';
import { ArchivedFarm, AgentMessage, HarvestOutput } from '@/types/archive';
import { toast } from 'react-hot-toast';

interface ArchivedFarmDetailsProps {
  archiveId: string;
  onClose: () => void;
}

export const ArchivedFarmDetails: React.FC<ArchivedFarmDetailsProps> = ({ archiveId, onClose }) => {
  const { selectedArchive, loading, fetchArchiveDetails, updateArchive, restoreFarm } = useArchiveStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'prompt' | 'messages' | 'outputs' | 'metrics'>('overview');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['info', 'prompt']));

  useEffect(() => {
    if (archiveId) {
      fetchArchiveDetails(archiveId);
    }
  }, [archiveId, fetchArchiveDetails]);

  if (loading || !selectedArchive) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(selectedArchive.originalPrompt);
    toast.success('Prompt copied to clipboard');
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(selectedArchive, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `farm-archive-${selectedArchive.farmName.replace(/\s+/g, '-')}-${selectedArchive.id.substring(0, 8)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleRestore = async () => {
    if (confirm(`Are you sure you want to restore "${selectedArchive.farmName}"?`)) {
      try {
        await restoreFarm({ farmId: selectedArchive.farmId });
        toast.success('Farm restored successfully');
        onClose();
      } catch (error) {
        toast.error('Failed to restore farm');
      }
    }
  };

  const handleTogglePin = async () => {
    try {
      await updateArchive(archiveId, { isPinned: !selectedArchive.isPinned });
      toast.success(selectedArchive.isPinned ? 'Unpinned' : 'Pinned');
    } catch (error) {
      toast.error('Failed to update pin status');
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'prompt', label: 'Prompt', icon: MessageSquare },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'outputs', label: 'Outputs', icon: Package },
    { id: 'metrics', label: 'Metrics', icon: Zap }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
            <Archive className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedArchive.farmName}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Archived {formatDistanceToNow(new Date(selectedArchive.archivedAt), { addSuffix: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleTogglePin}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                selectedArchive.isPinned
                  ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <Pin className="w-5 h-5" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handleRestore}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center space-x-1 p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={clsx(
                'flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === id
                  ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Brain}
                  label="Agents"
                  value={selectedArchive.agentCount}
                  color="blue"
                />
                <StatCard
                  icon={Clock}
                  label="Execution Time"
                  value={`${Math.round(selectedArchive.metadata.executionTimeSeconds / 60)}min`}
                  color="green"
                />
                <StatCard
                  icon={DollarSign}
                  label="Total Cost"
                  value={`$${selectedArchive.metadata.totalCost.toFixed(2)}`}
                  color="yellow"
                />
                <StatCard
                  icon={Eye}
                  label="Views"
                  value={selectedArchive.viewCount}
                  color="purple"
                />
              </div>

              {/* Info Section */}
              <CollapsibleSection
                title="Farm Information"
                isExpanded={expandedSections.has('info')}
                onToggle={() => toggleSection('info')}
              >
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="Type" value={selectedArchive.farmType || 'Standard'} />
                  <InfoRow label="Category" value={selectedArchive.category || 'Uncategorized'} />
                  <InfoRow label="Created" value={format(new Date(selectedArchive.farmCreatedAt), 'PPpp')} />
                  <InfoRow
                    label="Completed"
                    value={selectedArchive.farmCompletedAt ? format(new Date(selectedArchive.farmCompletedAt), 'PPpp') : 'N/A'}
                  />
                  <InfoRow label="Archived By" value={selectedArchive.archivedByUsername || 'System'} />
                  <InfoRow label="Archive Reason" value={selectedArchive.archiveReason || 'Manual archive'} />
                </div>
              </CollapsibleSection>

              {/* Tags */}
              {selectedArchive.tags && selectedArchive.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedArchive.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full text-xs"
                      >
                        <Tag className="inline w-3 h-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedArchive.archiveNotes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</h3>
                  <p className="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    {selectedArchive.archiveNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Original Prompt</h3>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">Copy</span>
                </button>
              </div>
              <pre className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {selectedArchive.originalPrompt}
                </code>
              </pre>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Agent Messages</h3>
              {selectedArchive.agentMessages && selectedArchive.agentMessages.length > 0 ? (
                <div className="space-y-4">
                  {selectedArchive.agentMessages.map((message, index) => (
                    <MessageCard key={message.id || index} message={message} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No agent messages recorded
                </p>
              )}
            </div>
          )}

          {activeTab === 'outputs' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Outputs & Artifacts</h3>
              {selectedArchive.artifacts && selectedArchive.artifacts.length > 0 ? (
                <div className="space-y-2">
                  {selectedArchive.artifacts.map((artifact, index) => (
                    <OutputCard key={artifact.id || index} output={artifact} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No outputs recorded
                </p>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="p-6 space-y-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Execution Metrics</h3>

              {/* Performance Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Token Usage"
                  value={selectedArchive.metadata.tokenUsage.toLocaleString()}
                  icon={Zap}
                />
                <MetricCard
                  label="Success Rate"
                  value={`${selectedArchive.metadata.successRate || 0}%`}
                  icon={Brain}
                />
                <MetricCard
                  label="Error Count"
                  value={selectedArchive.metadata.errorCount || 0}
                  icon={X}
                />
                {selectedArchive.metadata.resourceUsage && (
                  <>
                    <MetricCard
                      label="CPU Usage"
                      value={`${selectedArchive.metadata.resourceUsage.cpu}%`}
                      icon={Cpu}
                    />
                    <MetricCard
                      label="Memory Usage"
                      value={`${selectedArchive.metadata.resourceUsage.memory}%`}
                      icon={HardDrive}
                    />
                    <MetricCard
                      label="Storage"
                      value={`${(selectedArchive.metadata.resourceUsage.storage / 1024 / 1024).toFixed(2)} MB`}
                      icon={HardDrive}
                    />
                  </>
                )}
              </div>

              {/* Quality Score */}
              {selectedArchive.qualityScore !== undefined && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quality Score</h4>
                  <div className="flex items-center space-x-2">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={clsx(
                            'w-5 h-5',
                            i < Math.round(selectedArchive.qualityScore!)
                              ? 'text-yellow-400 fill-current'
                              : 'text-gray-300 dark:text-gray-700'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedArchive.qualityScore.toFixed(1)} / 5.0
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Helper Components

const StatCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}> = ({ icon: Icon, label, value, color }) => {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
      <div className={clsx('inline-flex p-2 rounded-lg mb-2', colorClasses[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="text-sm font-medium text-gray-900 dark:text-white">{value}</dd>
  </div>
);

const CollapsibleSection: React.FC<{
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, isExpanded, onToggle, children }) => (
  <div className="border border-gray-200 dark:border-gray-800 rounded-lg">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">{title}</h3>
      {isExpanded ? (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-400" />
      )}
    </button>
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          className="overflow-hidden"
        >
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const MessageCard: React.FC<{ message: AgentMessage }> = ({ message }) => (
  <div className="flex space-x-3">
    <div className="flex-shrink-0">
      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center">
        <span className="text-white text-xs font-bold">
          {message.agentName?.charAt(0) || 'A'}
        </span>
      </div>
    </div>
    <div className="flex-1">
      <div className="flex items-center space-x-2 mb-1">
        <span className="font-medium text-sm text-gray-900 dark:text-white">
          {message.agentName}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {format(new Date(message.timestamp), 'HH:mm:ss')}
        </span>
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  </div>
);

const OutputCard: React.FC<{ output: HarvestOutput }> = ({ output }) => (
  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
    <div className="flex items-center space-x-3">
      <Package className="w-5 h-5 text-gray-400" />
      <div>
        <div className="font-medium text-sm text-gray-900 dark:text-white">{output.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {output.type} • {(output.size / 1024).toFixed(2)} KB
        </div>
      </div>
    </div>
    <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
      <ExternalLink className="w-4 h-4" />
    </button>
  </div>
);

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}> = ({ label, value, icon: Icon }) => (
  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
    <div className="flex items-center justify-between mb-2">
      <Icon className="w-5 h-5 text-gray-400" />
      <span className="text-lg font-bold text-gray-900 dark:text-white">{value}</span>
    </div>
    <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
  </div>
);