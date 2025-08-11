import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Rocket, CheckCircle, AlertCircle, PauseIcon } from 'lucide-react';
import { seedService } from '../../services/seedService';
import { workflowService } from '../../services/workflowService';
import { Seed } from '../../types/seed';
import { WorkflowStatus } from '../../services/workflowService';
import { toast } from 'react-hot-toast';
import { useSettingsStore } from '../../store/settingsStore';

export const CreateFarmFromSeed: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmDescription, setFarmDescription] = useState('');
  const [autoHarvest, setAutoHarvest] = useState(true);
  const [autoStore, setAutoStore] = useState(true);
  const [autoPauseOnClose, setAutoPauseOnClose] = useState(
    settings.system?.behavior?.autoPauseOnClose ?? true
  );
  const [creating, setCreating] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);

  useEffect(() => {
    loadSeeds();
  }, []);

  const loadSeeds = async () => {
    try {
      const seedList = await seedService.getAll({
        isPublic: true,
        sortBy: 'usage',
        sortOrder: 'desc'
      });
      setSeeds(seedList);
    } catch (error) {
      console.error('Error loading seeds:', error);
      toast.error('Failed to load seeds');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFarm = async () => {
    if (!selectedSeed || !farmName) {
      toast.error('Please select a seed and enter a farm name');
      return;
    }

    setCreating(true);
    try {
      const result = await workflowService.createFarmFromSeedWithWorkflow(
        selectedSeed.id,
        farmName,
        {
          description: farmDescription || undefined,
          autoHarvest,
          autoStore,
          autoPauseOnClose
        }
      );

      toast.success(`Farm "${farmName}" created successfully!`);

      // Subscribe to workflow progress
      const unsubscribe = workflowService.subscribeToWorkflowProgress(
        result.workflowId,
        (status) => {
          setWorkflowStatus(status);
          
          if (status.status === 'completed') {
            toast.success('Workflow completed successfully!');
            setTimeout(() => {
              navigate(`/harvests/${result.farm.id}`);
            }, 2000);
          } else if (status.status === 'failed') {
            toast.error(`Workflow failed: ${status.error}`);
          }
        }
      );

      // Clean up subscription on unmount
      return () => unsubscribe();
    } catch (error) {
      console.error('Error creating farm:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create farm');
      setCreating(false);
    }
  };

  const filteredSeeds = seeds.filter(seed =>
    seed.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seed.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seed.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (status: WorkflowStatus['status']) => {
    switch (status) {
      case 'initializing':
      case 'planting':
      case 'growing':
      case 'harvesting':
      case 'storing':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Create Farm from Seed</h1>

      {!workflowStatus && (
        <>
          {/* Seed Selection */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Select a Seed Template</h2>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search seeds..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Seed Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSeeds.map((seed) => (
                <div
                  key={seed.id}
                  onClick={() => setSelectedSeed(seed)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedSeed?.id === seed.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <h3 className="font-semibold mb-2">{seed.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {seed.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {seed.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {seed.farmType}
                    </span>
                  </div>
                  {seed.isOfficial && (
                    <span className="text-xs text-primary-600 mt-2 inline-block">
                      ✓ Official Template
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Farm Configuration */}
          {selectedSeed && (
            <div className="mb-8 p-6 border border-gray-300 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Configure Your Farm</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Farm Name *
                  </label>
                  <input
                    type="text"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="Enter farm name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={farmDescription}
                    onChange={(e) => setFarmDescription(e.target.value)}
                    placeholder="Describe your farm's purpose"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoHarvest}
                      onChange={(e) => setAutoHarvest(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm">
                      Automatically harvest results when farm completes
                    </span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoStore}
                      onChange={(e) => setAutoStore(e.target.checked)}
                      disabled={!autoHarvest}
                      className="mr-2"
                    />
                    <span className="text-sm">
                      Automatically store harvest in barn
                    </span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={autoPauseOnClose}
                      onChange={(e) => setAutoPauseOnClose(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm flex items-center">
                      <PauseIcon className="w-4 h-4 mr-1" />
                      Auto-pause farm when closing app
                    </span>
                  </label>
                  {!autoPauseOnClose && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 ml-6">
                      Farm will continue running in the background
                    </p>
                  )}
                </div>

                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Selected Seed: {selectedSeed.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will create a {selectedSeed.farmType} farm with pre-configured agents
                    and workflows based on the seed template.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCreateFarm}
                disabled={!farmName || creating}
                className="mt-6 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Farm...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5 mr-2" />
                    Create Farm
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Workflow Progress */}
      {workflowStatus && (
        <div className="p-6 border border-gray-300 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Workflow Progress</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {getStatusIcon(workflowStatus.status)}
                <span className="ml-2 font-medium">
                  {workflowStatus.currentStep}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {workflowStatus.progress}%
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${workflowStatus.progress}%` }}
              />
            </div>

            {workflowStatus.error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400">
                  {workflowStatus.error}
                </p>
              </div>
            )}

            <div className="text-sm text-gray-500">
              <p>Workflow ID: {workflowStatus.workflowId}</p>
              <p>Status: {workflowStatus.status}</p>
              {workflowStatus.completedAt && (
                <p>Completed at: {new Date(workflowStatus.completedAt).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};