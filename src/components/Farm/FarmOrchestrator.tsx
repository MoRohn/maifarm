import React, { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { Farm } from '../../types';
import { FarmSetupProgress, FarmTemplate } from '../../types/orchestration';
import { useFarmOrchestration } from '../../hooks/useFarmOrchestration';
import FarmTemplateSelector from './FarmTemplateSelector';
import FarmStatusMonitor from './FarmStatusMonitor';
import AgentPoolManager from './AgentPoolManager';

interface FarmOrchestratorProps {
  onFarmCreated?: (farmId: string) => void;
}

const FarmOrchestrator: React.FC<FarmOrchestratorProps> = ({ onFarmCreated }) => {
  const { 
    templates, 
    farms, 
    createFarm, 
    getSetupProgress,
    loading,
    error 
  } = useFarmOrchestration();

  const [selectedTemplate, setSelectedTemplate] = useState<FarmTemplate | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmDescription, setFarmDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [setupProgress, setSetupProgress] = useState<FarmSetupProgress | null>(null);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);

  useEffect(() => {
    if (setupProgress && setupProgress.status === 'ready') {
      setIsCreating(false);
      if (onFarmCreated) {
        onFarmCreated(setupProgress.farmId);
      }
      setActiveFarmId(setupProgress.farmId);
      setSetupProgress(null);
    }
  }, [setupProgress, onFarmCreated]);

  const handleCreateFarm = async () => {
    if (!farmName) {
      alert('Please enter a farm name');
      return;
    }

    setIsCreating(true);
    
    try {
      const progress = await createFarm({
        name: farmName,
        description: farmDescription,
        templateId: selectedTemplate?.id,
        autoStart: true
      });
      
      setSetupProgress(progress);
      
      // Poll for setup progress
      const interval = setInterval(async () => {
        const updatedProgress = await getSetupProgress(progress.farmId);
        if (updatedProgress) {
          setSetupProgress(updatedProgress);
          
          if (['ready', 'failed'].includes(updatedProgress.status)) {
            clearInterval(interval);
          }
        }
      }, 1000);
    } catch (err) {
      setIsCreating(false);
      console.error('Failed to create farm:', err);
    }
  };

  const renderSetupProgress = () => {
    if (!setupProgress) return null;

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'completed':
          return <CheckCircle className="h-5 w-5 text-green-500" />;
        case 'running':
          return <Loader className="h-5 w-5 text-blue-500 animate-spin" />;
        case 'failed':
          return <AlertCircle className="h-5 w-5 text-red-500" />;
        default:
          return <div className="h-5 w-5 rounded-full bg-gray-300" />;
      }
    };

    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Farm Setup Progress</h3>
        
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>{setupProgress.currentStep}</span>
            <span>{Math.round(setupProgress.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${setupProgress.progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {setupProgress.steps.map((step, index) => (
            <div key={index} className="flex items-center space-x-3">
              {getStatusIcon(step.status)}
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{step.name}</span>
                  {step.status === 'running' && (
                    <span className="text-xs text-gray-500">{step.progress}%</span>
                  )}
                </div>
                {step.error && (
                  <p className="text-xs text-red-500 mt-1">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {setupProgress.status === 'failed' && setupProgress.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{setupProgress.error}</p>
          </div>
        )}
      </div>
    );
  };

  const renderFarmCreation = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Create New Farm</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Farm Name
              </label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="My AI Farm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={farmDescription}
                onChange={(e) => setFarmDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Describe your farm's purpose..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Farm Template
              </label>
              <FarmTemplateSelector
                templates={templates}
                selectedTemplate={selectedTemplate}
                onSelectTemplate={setSelectedTemplate}
              />
            </div>

            <button
              onClick={handleCreateFarm}
              disabled={isCreating || !farmName}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Creating Farm...</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Create Farm</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderActiveFarm = () => {
    if (!activeFarmId) return null;
    
    const farm = farms.find(f => f.id === activeFarmId);
    if (!farm) return null;

    return (
      <div className="space-y-6">
        <FarmStatusMonitor farm={farm} />
        <AgentPoolManager farm={farm} />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {isCreating && setupProgress ? (
        renderSetupProgress()
      ) : activeFarmId ? (
        renderActiveFarm()
      ) : (
        renderFarmCreation()
      )}
    </div>
  );
};

export default FarmOrchestrator;