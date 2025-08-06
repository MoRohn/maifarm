import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, 
  Save, 
  Clock, 
  Database,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Eye,
  Play
} from 'lucide-react';
import { ExplorationSnapshot, RollbackRequest, RollbackResult } from '../../types/safety';
import { snapshotService } from '../../services/explorationSnapshot';
import { rollbackManager } from '../../services/rollbackManager';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface RollbackControlsProps {
  farmId: string;
  sessionId: string;
  onRollbackComplete?: (result: RollbackResult) => void;
  className?: string;
}

export const RollbackControls: React.FC<RollbackControlsProps> = ({
  farmId,
  sessionId,
  onRollbackComplete,
  className
}) => {
  const [snapshots, setSnapshots] = useState<ExplorationSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ExplorationSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<RollbackResult | null>(null);
  const [rollbackType, setRollbackType] = useState<'full' | 'partial'>('full');
  const [selectedComponents, setSelectedComponents] = useState<string[]>(['agents', 'tasks', 'resources', 'discoveries']);

  useEffect(() => {
    loadSnapshots();
    const interval = setInterval(loadSnapshots, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [farmId]);

  const loadSnapshots = async () => {
    try {
      const snapshotList = await snapshotService.listSnapshots(farmId);
      setSnapshots(snapshotList);
    } catch (error) {
      console.error('Failed to load snapshots:', error);
      toast.error('Failed to load snapshots');
    }
  };

  const handleCreateSnapshot = async () => {
    setIsLoading(true);
    try {
      await snapshotService.createSnapshot(
        { id: sessionId, farmId } as any,
        'manual',
        'Manual snapshot created by user'
      );
      toast.success('Snapshot created successfully');
      await loadSnapshots();
    } catch (error) {
      toast.error('Failed to create snapshot');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewRollback = async () => {
    if (!selectedSnapshot) return;

    setIsLoading(true);
    try {
      const request: RollbackRequest = {
        snapshotId: selectedSnapshot.id,
        type: rollbackType,
        components: rollbackType === 'partial' ? selectedComponents as any : undefined,
        preview: true,
        reason: 'Preview rollback changes'
      };

      const result = await rollbackManager.initiateRollback(request);
      setPreviewResult(result);
      setShowPreview(true);
    } catch (error) {
      toast.error('Failed to preview rollback');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!selectedSnapshot) return;

    const reason = prompt('Please provide a reason for this rollback:');
    if (!reason) return;

    setIsLoading(true);
    try {
      const request: RollbackRequest = {
        snapshotId: selectedSnapshot.id,
        type: rollbackType,
        components: rollbackType === 'partial' ? selectedComponents as any : undefined,
        preview: false,
        reason
      };

      const result = await rollbackManager.initiateRollback(request);
      
      if (result.status === 'success') {
        toast.success('Rollback completed successfully');
      } else if (result.status === 'partial') {
        toast('Rollback partially completed with errors', {
          icon: '⚠️',
          style: {
            background: '#FEF3C7',
            color: '#92400E',
          },
        });
      } else {
        toast.error('Rollback failed');
      }

      onRollbackComplete?.(result);
      setShowPreview(false);
      setSelectedSnapshot(null);
    } catch (error) {
      toast.error('Failed to execute rollback');
    } finally {
      setIsLoading(false);
    }
  };

  const getSnapshotIcon = (type: ExplorationSnapshot['type']) => {
    switch (type) {
      case 'automatic':
        return <Clock className="w-4 h-4" />;
      case 'manual':
        return <Save className="w-4 h-4" />;
      case 'checkpoint':
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getSnapshotColor = (type: ExplorationSnapshot['type']) => {
    switch (type) {
      case 'automatic':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      case 'manual':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'checkpoint':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
    }
  };

  return (
    <div className={clsx("bg-white dark:bg-gray-800 rounded-xl shadow-lg", className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <RotateCcw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Rollback Controls
            </h3>
          </div>
          <button
            onClick={handleCreateSnapshot}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Create Snapshot</span>
          </button>
        </div>
      </div>

      {/* Snapshot List */}
      <div className="p-6 space-y-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Available Snapshots ({snapshots.length})
        </h4>
        
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              onClick={() => setSelectedSnapshot(snapshot)}
              className={clsx(
                "border rounded-lg p-4 cursor-pointer transition-all",
                selectedSnapshot?.id === snapshot.id
                  ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={clsx("p-1.5 rounded", getSnapshotColor(snapshot.type))}>
                    {getSnapshotIcon(snapshot.type)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {snapshot.type.charAt(0).toUpperCase() + snapshot.type.slice(1)} Snapshot
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {snapshot.id.substring(0, 8)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {snapshot.metadata.reason}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatDistanceToNow(snapshot.timestamp, { addSuffix: true })}</span>
                      <span>{(snapshot.metadata.size / 1024).toFixed(1)} KB</span>
                      <span>{snapshot.state.agents.length} agents</span>
                      <span>{snapshot.state.discoveries.length} discoveries</span>
                    </div>
                  </div>
                </div>
                {selectedSnapshot?.id === snapshot.id && (
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Rollback Options */}
        {selectedSnapshot && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rollback Options
            </h4>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="full"
                    checked={rollbackType === 'full'}
                    onChange={(e) => setRollbackType(e.target.value as 'full')}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Full Rollback</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="partial"
                    checked={rollbackType === 'partial'}
                    onChange={(e) => setRollbackType(e.target.value as 'partial')}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Partial Rollback</span>
                </label>
              </div>

              {rollbackType === 'partial' && (
                <div className="space-y-2 pl-6">
                  {['agents', 'tasks', 'resources', 'discoveries'].map((component) => (
                    <label key={component} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        value={component}
                        checked={selectedComponents.includes(component)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedComponents([...selectedComponents, component]);
                          } else {
                            setSelectedComponents(selectedComponents.filter(c => c !== component));
                          }
                        }}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {component}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex items-center space-x-3">
                <button
                  onClick={handlePreviewRollback}
                  disabled={isLoading}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={handleExecuteRollback}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  <Play className="w-4 h-4" />
                  <span>Execute Rollback</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreview && previewResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Rollback Preview
              </h3>
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Changes that will be applied:
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Agents</span>
                      <span className="text-gray-900 dark:text-white">
                        +{previewResult.changes.agents.added} / -{previewResult.changes.agents.removed} / ~{previewResult.changes.agents.modified}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Tasks</span>
                      <span className="text-gray-900 dark:text-white">
                        Cancelled: {previewResult.changes.tasks.cancelled}, Restored: {previewResult.changes.tasks.restored}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Resources</span>
                      <span className="text-gray-900 dark:text-white">
                        Released: {previewResult.changes.resources.released}, Allocated: {previewResult.changes.resources.allocated}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Discoveries</span>
                      <span className="text-gray-900 dark:text-white">
                        Preserved: {previewResult.changes.discoveries.preserved}, Removed: {previewResult.changes.discoveries.removed}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteRollback}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Proceed with Rollback
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};