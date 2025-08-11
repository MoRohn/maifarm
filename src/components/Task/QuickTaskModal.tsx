import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Zap, Send, Clock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../services/apiClient';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSettingsStore } from '../../store/settingsStore';
import { toast } from 'react-hot-toast';

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickTaskModal: React.FC<QuickTaskModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);

  // Get the user's preferred AI provider from settings
  const preferredProvider = settings.aiProvider || 'claude';

  const { socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  React.useEffect(() => {
    if (taskId && socket) {
      // Subscribe to task updates
      const handleProgress = (data: any) => {
        if (data.taskId === taskId) {
          console.log('Task progress:', data);
        }
      };

      const handleCompleted = (data: any) => {
        if (data.taskId === taskId) {
          setTaskStatus('completed');
          console.log('Task completed:', data);
        }
      };

      const handleFailed = (data: any) => {
        if (data.taskId === taskId) {
          setTaskStatus('failed');
          setError(data.error || 'Task failed');
        }
      };

      socket.on('task:progress', handleProgress);
      socket.on('task:completed', handleCompleted);
      socket.on('task:failed', handleFailed);

      return () => {
        socket.off('task:progress', handleProgress);
        socket.off('task:completed', handleCompleted);
        socket.off('task:failed', handleFailed);
      };
    }
  }, [taskId, socket]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim()) {
      setError('Please provide both title and description');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.tasks.quick({
        title,
        description,
        priority,
        provider: preferredProvider,
        metadata: {
          source: 'quick-task-modal',
          timestamp: new Date().toISOString()
        }
      });

      if (response.data.success) {
        const taskData = response.data.data;
        setTaskId(taskData.taskId || taskData.id);
        setTaskStatus('created');
        
        // Get the farmId and harvestId from the response
        const quickFarmId = taskData.farmId || response.data.farmId;
        const harvestId = taskData.harvestId;
        
        if (quickFarmId) {
          setFarmId(quickFarmId);
          toast.success('Quick task created successfully!');
          
          // Navigate directly to harvest page to show progress
          const navigationPath = `/harvests/${quickFarmId}`;
          console.log('Quick task created, navigating to harvest page:', navigationPath);
          
          // Store harvestId in sessionStorage for the harvest page to use
          if (harvestId) {
            sessionStorage.setItem(`quicktask-harvest-${quickFarmId}`, `/harvest/${harvestId}`);
          }
          
          // Close modal first, then navigate
          handleClose();
          
          setTimeout(() => {
            console.log('Executing navigation to:', navigationPath);
            navigate(navigationPath);
          }, 100);
        } else {
          // If no farmId, try to get it from the quick task service
          try {
            const farms = await api.farms.list();
            const quickTaskFarm = farms.data.data?.find((f: any) => 
              f.name.includes('Quick Task') || f.id.startsWith('quick-task-')
            );
            if (quickTaskFarm) {
              toast.success('Quick task created successfully!');
              
              // Try to find harvest for this farm
              try {
                const harvests = await api.harvests.list();
                const quickHarvest = harvests.data.data?.find((h: any) => h.farmId === quickTaskFarm.id);
                if (quickHarvest) {
                  sessionStorage.setItem(`quicktask-harvest-${quickTaskFarm.id}`, `/harvest/${quickHarvest.id}`);
                }
              } catch (err) {
                console.warn('Could not fetch harvests:', err);
              }
              
              // Navigate directly to harvest page 
              const navigationPath = `/harvests/${quickTaskFarm.id}`;
              console.log('Found quick task farm, navigating to harvest page:', navigationPath);
              
              handleClose();
              
              setTimeout(() => {
                console.log('Executing navigation to:', navigationPath);
                navigate(navigationPath);
              }, 100);
            } else {
              toast('Quick task created but cannot navigate to harvest page', { icon: '⚠️' });
              console.warn('No quick task farm found for navigation');
              handleClose();
            }
          } catch (err) {
            console.error('Could not find Quick Task Farm:', err);
          }
        }
      } else {
        setError(response.data.error?.message || 'Failed to create task');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create quick task');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setError(null);
    setTaskId(null);
    setTaskStatus(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-apple-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-apple">
                    <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Quick Task
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-apple hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
              <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Fix TypeScript errors"
                      className={clsx(
                        'w-full px-4 py-2 rounded-apple border transition-colors',
                        'bg-white dark:bg-gray-800',
                        'border-gray-300 dark:border-gray-700',
                        'focus:border-primary-500 dark:focus:border-primary-400',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500/20'
                      )}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what needs to be done..."
                      rows={4}
                      className={clsx(
                        'w-full px-4 py-2 rounded-apple border transition-colors',
                        'bg-white dark:bg-gray-800',
                        'border-gray-300 dark:border-gray-700',
                        'focus:border-primary-500 dark:focus:border-primary-400',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500/20',
                        'resize-none'
                      )}
                    />
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Priority
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={clsx(
                            'px-3 py-2 rounded-apple text-sm font-medium transition-all',
                            priority === p ? (
                              p === 'low' ? 'bg-blue-500 text-white' :
                              p === 'medium' ? 'bg-yellow-500 text-white' :
                              p === 'high' ? 'bg-orange-500 text-white' :
                              'bg-red-500 text-white'
                            ) : (
                              'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            )
                          )}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-apple border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start space-x-3">
                      <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Quick tasks run with a single agent and have a default timeout of 5 minutes.
                          For complex tasks requiring multiple agents, create a full farm instead.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-apple border border-red-200 dark:border-red-800">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Submit */}
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className={clsx(
                        'px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
                        'hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !title.trim() || !description.trim()}
                      className={clsx(
                        'px-4 py-2 rounded-apple text-sm font-medium transition-all',
                        'bg-orange-500 text-white',
                        'hover:bg-orange-600',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'flex items-center space-x-2'
                      )}
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Create Task</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};