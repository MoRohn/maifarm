import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, AlertTriangle, Info, Wand2, Rocket } from 'lucide-react';
import { GoWildConfig } from '../../types/goWild';
import { CreativityControls } from './CreativityControls';
import { BoundaryControls } from './BoundaryControls';
import { useFarmStore } from '../../store/farmStore';
import { api } from '../../services/apiClient';
import { toast } from 'react-hot-toast';
import FileUpload from '../common/FileUpload';

interface GoWildModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmId?: string;
}

export const GoWildModal: React.FC<GoWildModalProps> = ({ isOpen, onClose, farmId }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'running'>('config');
  const [tempFarmId, setTempFarmId] = useState<string>('');
  const [farmName, setFarmName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const { addFarm, fetchFarms } = useFarmStore();
  
  const [config, setConfig] = useState<GoWildConfig>({
    creativityLevel: 70,
    explorationDepth: 5,
    maxDuration: 30,
    boundaries: {
      allowExternalAPIs: true,
      allowFileSystem: true,
      allowNetworkRequests: true,
      restrictedDomains: []
    },
    focusAreas: []
  });

  const handleStart = async () => {
    // If no farm exists, create a Go Wild-specific farm
    if (!farmId && !tempFarmId) {
      if (!farmName.trim()) {
        toast.error('Please enter a topic');
        return;
      }
      
      setIsCreating(true);
      try {
        // Prepare farm data
        const farmData = {
          name: farmName,
          description: description || `Go Wild exploration farm - Creativity level ${config.creativityLevel}%`,
          type: 'autonomous', // Go Wild farms are autonomous
          config: {
            autoScale: true,
            maxAgents: config.explorationDepth || 5,
            timeout: config.maxDuration * 60, // Convert minutes to seconds
            retryPolicy: {
              enabled: true,
              maxRetries: 3,
              backoffMultiplier: 2
            },
            goWildMode: {
              enabled: true,
              creativityLevel: Math.ceil(config.creativityLevel / 20), // Convert 0-100 to 1-5
              boundaries: Object.keys(config.boundaries)
                .filter(key => config.boundaries[key as keyof typeof config.boundaries])
            }
          }
        };

        let response;
        // If files are attached, use FormData
        if (attachedFiles.length > 0) {
          const formData = new FormData();
          formData.append('farmData', JSON.stringify(farmData));
          
          // Append each file
          attachedFiles.forEach((file) => {
            formData.append('files', file);
          });

          response = await fetch('/api/farms', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Failed to create farm: ${response.statusText}`);
          }
          
          response = { data: await response.json() };
        } else {
          // Create farm without files
          response = await api.post('/api/farms', farmData);
        }
        
        // Check the response structure
        const newFarm = response.data?.data || response.data;
        console.log('Go Wild farm created:', newFarm);
        
        if (!newFarm?.id) {
          console.error('Invalid farm response:', response.data);
          toast.error('Farm created but missing ID');
          return;
        }
        
        addFarm(newFarm);
        await fetchFarms();
        setTempFarmId(newFarm.id);
        toast.success('Go Wild farm created successfully!');
        
        // Navigate to growing page to show progress animation
        const harvestPath = `/farms/${newFarm.id}/growing`;
        console.log('Navigating to harvest page:', harvestPath);
        
        // Close modal first, then navigate
        onClose();
        
        // Small delay to ensure modal closes before navigation
        setTimeout(() => {
          console.log('Executing navigation to:', harvestPath);
          navigate(harvestPath);
        }, 100);
      } catch (error) {
        console.error('Failed to create Go Wild farm:', error);
        toast.error('Failed to create farm. Please try again.');
      } finally {
        setIsCreating(false);
      }
    } else {
      // Use existing farm - navigate to growing page
      const existingFarmId = farmId || tempFarmId;
      const harvestPath = `/farms/${existingFarmId}/growing`;
      
      toast.success('Starting Go Wild exploration!');
      console.log('Using existing farm, navigating to:', harvestPath);
      
      // Close modal first, then navigate
      onClose();
      
      setTimeout(() => {
        console.log('Executing navigation to:', harvestPath);
        navigate(harvestPath);
      }, 100);
    }
  };

  const handleClose = () => {
    setStep('config');
    setTempFarmId('');
    setFarmName('');
    setDescription('');
    onClose();
  };

  const modalContent = () => {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Go Wild Mode
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Let your AI agents explore and discover new possibilities autonomously
          </p>
        </div>

        {/* Farm Creation/Selection */}
        {!farmId && (
          <div className="space-y-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-apple-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center space-x-2 mb-3">
              <Rocket className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                Go Wild Farm Setup
              </h4>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Topic <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Wild Explorer Alpha"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                className="w-full px-4 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                placeholder="Describe what you want the agents to explore..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 h-20 resize-none"
              />
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-purple-700 dark:text-purple-300">
              <Info className="w-4 h-4" />
              <span>A new autonomous farm will be created with Go Wild mode enabled</span>
            </div>
          </div>
        )}

        {/* Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Exploration Configuration
          </h3>
          
          <CreativityControls
            config={config}
            onUpdate={setConfig}
            disabled={false}
          />

          {/* Safety Boundaries */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Safety Boundaries
            </h4>
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.boundaries.allowExternalAPIs}
                  onChange={(e) => setConfig({
                    ...config,
                    boundaries: { ...config.boundaries, allowExternalAPIs: e.target.checked }
                  })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Allow External APIs</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.boundaries.allowFileSystem}
                  onChange={(e) => setConfig({
                    ...config,
                    boundaries: { ...config.boundaries, allowFileSystem: e.target.checked }
                  })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Allow File System Access</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.boundaries.allowNetworkRequests}
                  onChange={(e) => setConfig({
                    ...config,
                    boundaries: { ...config.boundaries, allowNetworkRequests: e.target.checked }
                  })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Allow Network Requests</span>
              </label>
            </div>
          </div>

          {/* Duration Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Duration (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={config.maxDuration}
              onChange={(e) => setConfig({ ...config, maxDuration: parseInt(e.target.value) })}
              className="w-full px-4 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Focus Areas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Focus Areas (optional)
            </label>
            <textarea
              placeholder="Enter focus areas, one per line"
              value={config.focusAreas.join('\n')}
              onChange={(e) => setConfig({ 
                ...config, 
                focusAreas: e.target.value.split('\n').filter(a => a.trim()) 
              })}
              className="w-full px-4 py-2 rounded-apple border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-24 resize-none"
            />
          </div>

          {/* File Upload Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Context Files (optional)
            </label>
            <FileUpload
              onFilesChange={setAttachedFiles}
              maxFiles={10}
              maxSizeInMB={10}
              acceptedTypes={['*']}
              className="mt-2"
            />
          </div>
        </div>

        {/* Warning */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-apple-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-medium mb-1">Important Safety Notice</p>
              <p>Go Wild mode allows agents to explore autonomously. All actions are monitored and can be rolled back if needed. Resource limits and safety boundaries are enforced.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4">
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={(!farmId && !farmName.trim()) || isCreating}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-apple hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isCreating ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Creating Farm...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Start Exploration</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-2xl relative flex flex-col w-full max-w-2xl max-h-[90vh]">
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors z-10"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>

              {/* Content */}
              <div className="p-8 overflow-y-auto">
                {modalContent()}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};