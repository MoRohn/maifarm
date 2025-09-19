import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Wheat, Clock, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { PromptEnhancer } from '../Chat/PromptEnhancer';
import { motion, AnimatePresence } from 'framer-motion';
import { FarmLaunchService } from '@/services/farmLaunchFix';
import { FarmInputField } from '../Farm/FarmInputField';

interface FarmTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FarmTaskModal: React.FC<FarmTaskModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'input' | 'enhance' | 'config' | 'launching'>('input');
  const [taskDescription, setTaskDescription] = useState('');
  const [enhancedTask, setEnhancedTask] = useState('');
  const [agentCount, setAgentCount] = useState(3);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [loading, setLoading] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input');
      setTaskDescription('');
      setEnhancedTask('');
      setAgentCount(3);
      setTimeoutMinutes(60);
    }
  }, [isOpen]);

  const handleSubmitTask = (description: string) => {
    setTaskDescription(description);
    setStep('enhance');
  };

  const handleEnhanced = (enhanced: string, pills: string[]) => {
    setEnhancedTask(enhanced);
    setStep('config');
  };

  const handleSkipEnhancement = () => {
    setEnhancedTask(taskDescription);
    setStep('config');
  };

  const launchFarm = async () => {
    setLoading(true);
    setStep('launching');
    
    try {
      console.log('[FarmTaskModal] Launching farm with configuration:', {
        prompt: enhancedTask,
        agentCount,
        timeoutMinutes
      });
      
      // Create the farm with configuration
      const result = await FarmLaunchService.createAndLaunchFarm({
        name: `Farm ${Date.now()}`, // Temporary name, will be updated by the service
        description: enhancedTask,
        type: 'collaborative',
        config: {
          maxAgents: agentCount,
          timeout: timeoutMinutes * 60, // Convert to seconds
          autoScale: false
        }
      });
      
      const farmId = result?.farmId;
      
      if (farmId) {
        toast.success('🌾 Farm launched!');
        
        // Navigate to the farm
        navigate(`/farm/${farmId}`);
        
        // Close modal after navigation
        setTimeout(() => {
          onClose();
        }, 100);
      } else {
        throw new Error('Failed to generate farm ID');
      }
    } catch (error: any) {
      console.error('[FarmTaskModal] Critical error:', error);
      toast.error('Failed to launch farm. Please check your connection and try again.');
      setStep('config');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Wheat className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Create New Farm
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Let's farm something amazing
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Input Step */}
              {step === 'input' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      What would you like to build?
                    </label>
                    <FarmInputField
                      placeholder="Describe your project (e.g., 'Build a REST API with user authentication', 'Create a React dashboard with charts')"
                      onSubmit={handleSubmitTask}
                      variant="textarea"
                      minLength={5}
                      showCharacterCount={true}
                      autoFocus={true}
                    />
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 flex items-center space-x-2">
                    <span className="text-lg">🌾</span>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      Farms use multiple AI agents working together
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Enhancement Step */}
              {step === 'enhance' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PromptEnhancer
                    originalPrompt={taskDescription}
                    mode="farm"
                    onEnhanced={handleEnhanced}
                    onSkip={handleSkipEnhancement}
                  />
                </motion.div>
              )}

              {/* Configuration Step */}
              {step === 'config' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-2">Your Task:</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic">{enhancedTask}</p>
                  </div>

                  <div>
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Users className="w-4 h-4" />
                      <span>Number of Agents</span>
                    </label>
                    <select
                      value={agentCount}
                      onChange={(e) => setAgentCount(parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value={2}>2 agents (Small task)</option>
                      <option value={3}>3 agents (Recommended)</option>
                      <option value={5}>5 agents (Complex project)</option>
                      <option value={8}>8 agents (Large system)</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Clock className="w-4 h-4" />
                      <span>Time Limit</span>
                    </label>
                    <select
                      value={timeoutMinutes}
                      onChange={(e) => setTimeoutMinutes(parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour (Recommended)</option>
                      <option value={120}>2 hours</option>
                      <option value={240}>4 hours</option>
                    </select>
                  </div>

                  <button
                    onClick={launchFarm}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <Wheat className="w-4 h-4" />
                    <span>Launch Farm</span>
                  </button>
                </motion.div>
              )}

              {/* Launching Step */}
              {step === 'launching' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 space-y-4"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                    <Wheat className="w-8 h-8 text-green-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    Launching your farm...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Setting up {agentCount} agents for collaboration
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};