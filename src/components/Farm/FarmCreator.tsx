import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Sprout, 
  Code, 
  Settings, 
  Play,
  Save,
  Copy,
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  Sparkles,
  X,
  Cpu,
  Clock,
  Brain,
  Users,
  Zap,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm, FarmConfig } from '@/types';
import { YAMLEditor } from './YAMLEditor';
import { YAMLDisplay } from './YAMLDisplay';
import { SeedPills } from '../Seeds/SeedPills';
import { useFarmStore } from '@/store/farmStore';
import { useSettingsStore, calculateMaxAgents } from '@/store/settingsStore';
import { useUserStore } from '@/store/userStore';
import { logFarmCreation, useActivityStore } from '@/store/activityStore';
import { farmService } from '@/services/farmService';
import { api } from '@/services/apiClient';
import { Seed } from '@/types/seed';
import yamlGeneratorService from '@/services/yamlGeneratorService';
import { toast } from 'react-hot-toast';
import { TIMEOUT_PRESETS, getTimeoutPreset, formatTimeout, getRecommendedTimeout } from '../../config/timeoutPresets';
import FileUpload from '../common/FileUpload';
import { AIProvider } from './ProviderSelector';

interface FarmCreatorProps {
  onClose?: () => void;
  className?: string;
}

export const FarmCreator: React.FC<FarmCreatorProps> = ({ onClose, className }) => {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { user } = useUserStore();
  const [step, setStep] = useState<'plant' | 'plow' | 'grow'>('plant');
  const [farmDetails, setFarmDetails] = useState({
    name: '',
    description: '',
    type: 'sequential' as Farm['type']
  });
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isFileUploadExpanded, setIsFileUploadExpanded] = useState(false);
  const contentContainerRef = React.useRef<HTMLDivElement>(null);
  
  // Get AI provider from settings, defaulting to 'claude' if not set
  const selectedProvider = (settings.aiProvider as AIProvider) || 'claude';
  
  const [config, setConfig] = useState<FarmConfig>({
    autoScale: true,
    maxAgents: 3, // Will be auto-calculated
    timeout: 1800, // Will be auto-calculated (30 minutes default)
    retryPolicy: {
      enabled: settings.agentConfig?.autoRestart ?? true,
      maxRetries: (settings.agentConfig as any)?.retryAttempts || 3,
      backoffMultiplier: 2
    },
    goWildMode: {
      enabled: false,
      creativityLevel: (user?.preferences?.goWild?.creativityLevel || 3) as 1 | 2 | 3 | 4 | 5,
      boundaries: user?.preferences?.goWild?.boundaries?.restrictedDomains || []
    }
  });
  
  const [complexityAnalysis, setComplexityAnalysis] = useState<{
    category: string;
    score: number;
    recommendedAgents: number;
    recommendedTimeout: number;
    explanation: string;
  } | null>(null);

  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsSeed, setSaveAsSeed] = useState(false);
  const [seedName, setSeedName] = useState('');
  const [isGeneratingYaml, setIsGeneratingYaml] = useState(false);
  const [yamlGenerated, setYamlGenerated] = useState(false);

  const { addFarm } = useFarmStore();

  // Auto-scroll to bottom when entering grow phase or when content updates
  React.useEffect(() => {
    if (step === 'grow' && contentContainerRef.current) {
      // Scroll to bottom with smooth animation
      setTimeout(() => {
        if (contentContainerRef.current) {
          contentContainerRef.current.scrollTo({
            top: contentContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100); // Small delay to ensure content is rendered
    }
  }, [step, yaml, error, saveAsSeed, isGeneratingYaml]);

  // Analyze task complexity when farm details change
  React.useEffect(() => {
    if (farmDetails.name || farmDetails.description) {
      analyzeTaskComplexity();
    }
  }, [farmDetails.name, farmDetails.description]);
  
  const analyzeTaskComplexity = async () => {
    try {
      const response = await api.post('/api/tasks/analyze-complexity', {
        prompt: farmDetails.name,
        description: farmDetails.description
      });
      
      if (response.data) {
        const analysis = response.data;
        setComplexityAnalysis(analysis);
        
        // Update config with AI-recommended values
        setConfig(prev => ({
          ...prev,
          maxAgents: analysis.recommendedAgents,
          timeout: analysis.recommendedTimeout
        }));
      }
    } catch (error) {
      // Use intelligent defaults if analysis fails
      const defaultAgents = farmDetails.type === 'collaborative' ? 4 : 3;
      const defaultTimeout = 1800; // 30 minutes
      
      setConfig(prev => ({
        ...prev,
        maxAgents: defaultAgents,
        timeout: defaultTimeout
      }));
    }
  };
  
  const formatTimeout = (seconds: number): string => {
    if (seconds < 3600) {
      return `${Math.ceil(seconds / 60)} minutes`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  // Auto-generate YAML when reaching the review step
  React.useEffect(() => {
    if (step === 'grow' && !yamlGenerated && !yaml) {
      generateYAMLFromDetails();
    }
  }, [step]);

  const generateYAMLFromDetails = async () => {
    setIsGeneratingYaml(true);
    setError(null);
    
    try {
      // Build prompt based on farm details and config
      const fileContext = attachedFiles.length > 0 
        ? `\nAttached files: ${attachedFiles.map(f => f.name).join(', ')}`
        : '';
      
      const prompt = `Create a farm configuration for:
Name: ${farmDetails.name}
Description: ${farmDetails.description}
Type: ${farmDetails.type}
Auto-scaling: ${config.autoScale ? 'enabled' : 'disabled'}
Max agents: ${config.maxAgents}
Timeout: ${config.timeout || 3600} seconds (${Math.floor((config.timeout || 3600) / 3600)} hour${Math.floor((config.timeout || 3600) / 3600) !== 1 ? 's' : ''} ${Math.floor(((config.timeout || 3600) % 3600) / 60)} minutes)
${config.goWildMode?.enabled ? `GoWild mode enabled with creativity level ${config.goWildMode?.creativityLevel}` : ''}${fileContext}`;

      const response = await yamlGeneratorService.generateYaml({
        prompt,
        mode: 'freestyle',
        options: {
          num_agents: config.maxAgents,
          complexity: 'moderate'
        }
        // Remove enhancePrompt as it's not in the GenerationRequest type
      });

      if (response.success && response.raw_yaml) {
        setYaml(response.raw_yaml);
        setYamlGenerated(true);
        
        if (response.suggestions && response.suggestions.length > 0) {
          toast(`Generated with ${response.suggestions.length} suggestions`, { icon: '⚠️' });
        } else {
          toast.success('YAML configuration generated successfully');
        }
      } else {
        toast.error(response.error || 'Failed to generate YAML');
      }
    } catch (err) {
      setError('Failed to generate YAML configuration');
      toast.error('Failed to generate YAML. Please try again.');
      // Fallback to basic template
      const fallbackYaml = `name: ${farmDetails.name}
description: ${farmDetails.description}
type: ${farmDetails.type}
agents:
  - name: Primary Agent
    type: worker
    capabilities: [general]
    tasks:
      - Execute primary task
config:
  autoScale: ${config.autoScale}
  maxAgents: ${config.maxAgents}
  timeout: ${config.timeout}`;
      setYaml(fallbackYaml);
    } finally {
      setIsGeneratingYaml(false);
    }
  };


  const handleSelectSeed = (seed: Seed) => {
    setSelectedSeed(seed);
    setYaml(seed.yaml);
    
    // Pre-fill farm details from seed
    if (!farmDetails.name) {
      setFarmDetails(prev => ({
        ...prev,
        name: seed.name,
        description: seed.description,
        type: seed.farmType
      }));
    }
    
    // Record seed usage
    api.seeds.recordUsage(seed.id, true).catch(console.error);
    
    // Move to YAML step
    setStep('grow');
  };

  const generateYAMLFromAI = async (prompt: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate AI generation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const generatedYAML = `name: ${farmDetails.name}
description: ${farmDetails.description}
type: ${farmDetails.type}
agents:
  - name: Primary Agent
    type: builder
    capabilities: [${prompt.includes('web') ? 'React, TypeScript' : 'Python, Data Analysis'}]
    tasks:
      - Analyze requirements
      - Implement solution
      - Test and validate
  - name: Quality Agent
    type: reviewer
    capabilities: [Code Review, Best Practices]
    tasks:
      - Review implementation
      - Suggest improvements
config:
  autoScale: ${config.autoScale}
  maxAgents: ${config.maxAgents}
  timeout: ${config.timeout}`;
      
      setYaml(generatedYAML);
      setStep('grow');
    } catch (err) {
      setError('Failed to generate YAML. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateYaml = (yamlContent: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!yamlContent || yamlContent.trim().length === 0) {
      errors.push('YAML configuration is required');
      return { valid: false, errors };
    }
    
    // Basic YAML structure validation
    const lines = yamlContent.split('\n');
    const hasName = lines.some(line => line.startsWith('name:'));
    const hasAgents = lines.some(line => line.startsWith('agents:'));
    
    if (!hasName) {
      errors.push('YAML must contain a "name" field');
    }
    
    if (!hasAgents) {
      errors.push('YAML must contain an "agents" field');
    }
    
    // Check for basic YAML syntax errors
    try {
      // Simple check for balanced quotes
      const quoteCount = (yamlContent.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        errors.push('Unbalanced quotes detected in YAML');
      }
      
      // Check for tab characters (YAML should use spaces)
      if (yamlContent.includes('\t')) {
        errors.push('YAML should use spaces instead of tabs for indentation');
      }
    } catch (e) {
      errors.push('Invalid YAML syntax');
    }
    
    return { valid: errors.length === 0, errors };
  };

  const handleCreateFarm = async () => {
    // Prevent double submission
    if (isCreating) {
      console.log('[FarmCreator] Already creating farm, ignoring duplicate request');
      return;
    }
    
    console.log('[DEBUG] Farm creation started');
    console.log('[DEBUG] farmDetails:', farmDetails);
    console.log('[DEBUG] config:', config);
    console.log('[DEBUG] attachedFiles:', attachedFiles.length);
    
    setIsCreating(true);
    setError(null);
    
    // Pre-validation checks
    if (!farmDetails.name || farmDetails.name.trim().length === 0) {
      setError('Farm name is required');
      toast.error('Please enter a farm name');
      setIsCreating(false);
      return;
    }
    
    // Validate description length
    if (!farmDetails.description || farmDetails.description.trim().length < 5) {
      setError('Description must be at least 5 characters');
      toast.error('Please provide at least 5 characters to describe your farm', {
        icon: '⚠️',
        duration: 3000
      });
      setIsCreating(false);
      return;
    }
    
    if (farmDetails.name.length > 100) {
      setError('Farm name must be less than 100 characters');
      toast.error('Farm name is too long');
      return;
    }
    
    // Validate YAML
    const yamlValidation = validateYaml(yaml);
    if (!yamlValidation.valid) {
      setError(`YAML validation failed: ${yamlValidation.errors.join(', ')}`);
      toast.error('Please fix YAML configuration errors');
      setIsCreating(false);
      return;
    }
    
    // Validate seed name if saving as seed
    if (saveAsSeed) {
      if (!seedName || seedName.trim().length === 0) {
        setError('Seed name is required when saving as seed');
        toast.error('Please enter a seed name');
        return;
      }
      if (seedName.length > 50) {
        setError('Seed name must be less than 50 characters');
        toast.error('Seed name is too long');
        return;
      }
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Prepare form data if files are attached
      const farmData: any = {
        name: farmDetails.name.trim(),
        description: farmDetails.description?.trim() || '',
        type: farmDetails.type,
        provider: selectedProvider,
        config: {
          ...config,
          yaml
        },
        tags: []
      };

      // If files are attached, use FormData
      let newFarm;
      if (attachedFiles.length > 0) {
        const formData = new FormData();
        formData.append('farmData', JSON.stringify(farmData));
        
        // Append each file
        attachedFiles.forEach((file, _index) => {
          formData.append(`files`, file);
        });

        // Create farm with files
        newFarm = await farmService.createFarmWithFiles(formData);
      } else {
        // Create farm without files
        newFarm = await farmService.createFarm(farmData);
      }
      
      // Add the farm to the local store
      addFarm({
        ...newFarm,
        status: newFarm.status || 'preparing',
        agents: newFarm.agents || [],
        metrics: newFarm.metrics || {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          queuedTasks: 0,
          efficiency: 0,
          resourceUtilization: {
            cpu: 0,
            memory: 0
          }
        }
      });
      
      // Log the creation activity
      logFarmCreation(newFarm.name, newFarm.id);
      
      // Launch the farm with multi-claude agents - UPDATED WORKFLOW
      console.log('Launching farm with agents...');
      try {
        const launchResult = await farmService.launchFarm(newFarm.id, {
          numberOfAgents: config.maxAgents || 3,
          yamlContent: yaml, // Include the YAML content for proper agent configuration
          prompt: farmDetails.description || farmDetails.name || yaml,
          provider: selectedProvider,
          collaborative: farmDetails.type === 'collaborative',
          goWildMode: config.goWildMode?.enabled || false
        });

        console.log('Farm agents launched successfully:', launchResult);
        toast.success(`Farm launched with ${config.maxAgents || 3} agents! 🚀`);
        
        // Update the farm status to indicate it's active
        addFarm({
          ...newFarm,
          status: 'active'
        });
      } catch (launchError: any) {
        console.error('Error launching farm agents:', launchError);
        // Show a warning but don't fail the operation
        toast.error(`Farm created but agents failed to launch: ${launchError.message || 'Unknown error'}`);
        // The farm is still created, just not launched
      }
      
      // Optionally save as seed
      if (saveAsSeed && seedName) {
        try {
          const seedResponse = await api.seeds.create({
            name: seedName.trim(),
            description: farmDetails.description?.trim() || '',
            yaml: yaml,
            farmType: farmDetails.type,
            category: 'Custom',
            tags: ['user-created', farmDetails.type],
            isPublic: false
          });
          
          // Log seed creation activity
          const activityStore = useActivityStore.getState();
          activityStore.addActivity({
            type: 'seed_created',
            title: 'Seed Created',
            description: `Seed "${seedName.trim()}" has been saved from farm "${farmDetails.name}"`,
            farmId: newFarm.id,
            metadata: {
              seedName: seedName.trim(),
              farmName: farmDetails.name
            }
          });
          
          toast.success('Farm created and saved as seed');
        } catch (seedError: any) {
          console.error('Failed to save as seed:', seedError);
          toast('Farm created but failed to save as seed', { icon: '⚠️' });
          // Don't fail the farm creation if seed saving fails
        }
      } else {
        toast.success('Farm created successfully');
      }
      
      // Close modal first, then navigate after a small delay to prevent race conditions
      console.log('[FarmCreator] Closing modal');
      onClose?.();
      
      // Navigate to ConceptExplainer for smooth transition
      setTimeout(() => {
        console.log(`[FarmCreator] Navigating to concept explainer for farm ${newFarm.id}`);
        navigate(`/farm/${newFarm.id}/transition/create`);
      }, 100);
    } catch (err: any) {
      console.error('[FarmCreator] Failed to create farm:', err);
      
      // Detailed error handling
      let errorMessage = 'Failed to create farm';
      
      // Extract the most specific error message available
      if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in.';
      } else if (err.response?.status === 403) {
        errorMessage = 'You do not have permission to create farms';
      } else if (err.response?.status === 500) {
        errorMessage = 'Server error. Please check if the server is running.';
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = 'Cannot connect to server. Please ensure the server is running on port 4567.';
      } else if (err.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
      console.error('Farm creation error:', err);
    } finally {
      setLoading(false);
      setIsCreating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'plant':
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Plant Your Seeds
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Farm Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={farmDetails.name}
                  onChange={(e) => setFarmDetails({ ...farmDetails, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="My Awesome Farm"
                />
                {farmDetails.name.length > 0 && (
                  <div className="absolute bottom-2 right-2 text-xs">
                    <span className={clsx(
                      "font-medium",
                      farmDetails.name.length < 5 
                        ? "text-yellow-600 dark:text-yellow-400" 
                        : "text-gray-500 dark:text-gray-400"
                    )}>
                      {farmDetails.name.length}/5
                    </span>
                  </div>
                )}
              </div>
              {farmDetails.name.length > 0 && farmDetails.name.length < 5 && (
                <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                  Please add {5 - farmDetails.name.length} more character{5 - farmDetails.name.length !== 1 ? 's' : ''} for a better name
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <div className="relative">
                <textarea
                  value={farmDetails.description}
                  onChange={(e) => setFarmDetails({ ...farmDetails, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Describe what this farm will do..."
                />
                {farmDetails.description.trim().length > 0 && (
                  <div className="absolute bottom-2 right-2 text-xs">
                    <span className={clsx(
                      "font-medium",
                      farmDetails.description.trim().length < 5 
                        ? "text-yellow-600 dark:text-yellow-400" 
                        : "text-gray-500 dark:text-gray-400"
                    )}>
                      {farmDetails.description.trim().length}/5
                    </span>
                  </div>
                )}
              </div>
              {farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 && (
                <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                  Please add {5 - farmDetails.description.trim().length} more character{5 - farmDetails.description.trim().length !== 1 ? 's' : ''} for a better description
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Farm Type
              </label>
              <div className="grid grid-cols-3 gap-4">
                {(['sequential', 'collaborative', 'autonomous'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFarmDetails({ ...farmDetails, type })}
                    className={clsx(
                      'relative p-6 rounded-lg transition-all duration-200 transform hover:scale-[1.02]',
                      farmDetails.type === type
                        ? 'bg-gray-200/30 dark:bg-gray-700/30 border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                        : 'bg-gray-100/20 dark:bg-gray-600/30 border border-gray-600/50 hover:border-gray-500/50 hover:bg-gray-700/40 dark:hover:bg-gray-800/40'
                    )}
                  >
                    <div className="text-center">
                      <h4 className={clsx(
                        'font-semibold text-lg capitalize mb-2 transition-colors',
                        farmDetails.type === type
                          ? 'text-black-700'
                          : 'text-black-300 dark:text-black-500'
                      )}>
                        {type}
                      </h4>
                      <p className={clsx(
                        'text-sm transition-colors',
                        farmDetails.type === type
                          ? 'text-black-700'
                          : 'text-gray-400 dark:text-gray-500'
                      )}>
                        {type === 'sequential' && 'Tasks run one after another'}
                        {type === 'collaborative' && 'Agents work together'}
                        {type === 'autonomous' && 'Self-directed exploration'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Collapsible File Upload Section */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <button
                type="button"
                onClick={() => setIsFileUploadExpanded(!isFileUploadExpanded)}
                className="flex items-center space-x-2 w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {isFileUploadExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Upload className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Attach Context Files {attachedFiles.length > 0 && `(${attachedFiles.length})`}
                </span>
                {attachedFiles.length > 0 && (
                  <div className="flex-1 flex justify-end">
                    <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                      {attachedFiles.length} file{attachedFiles.length > 1 ? 's' : ''} attached
                    </span>
                  </div>
                )}
              </button>
              
              <AnimatePresence>
                {isFileUploadExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 pb-1">
                      <FileUpload
                        onFilesChange={setAttachedFiles}
                        maxFiles={10}
                        maxSizeInMB={10}
                        acceptedTypes={['*']}
                        className="mb-4"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Seeds Section - Minimal Pills */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <SeedPills
                onSelectSeed={handleSelectSeed}
                selectedSeedId={selectedSeed?.id}
                className="mt-2"
              />
            </div>
          </motion.div>
        );

      case 'plow':
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Plow the Field
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">Auto-scaling</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically scale agents based on workload
                  </p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, autoScale: !config.autoScale })}
                  className={clsx(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    config.autoScale ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <span
                    className={clsx(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      config.autoScale ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {/* Agent Configuration Display */}
              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-apple-lg border border-primary-200 dark:border-primary-800">
                <h4 className="font-medium text-primary-900 dark:text-primary-300 mb-3 flex items-center space-x-2">
                  <Cpu className="w-5 h-5" />
                  <span>Agent Configuration</span>
                </h4>
                <div className="space-y-4">
                  {/* AI-Optimized Configuration Display */}
                  {(farmDetails.name || farmDetails.description) && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-apple-lg p-4 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h4 className="font-medium text-gray-900 dark:text-white">AI-Optimized Configuration</h4>
                        {complexityAnalysis && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">
                            {complexityAnalysis.category}
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-800 rounded-apple p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Optimal Agents</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {config.maxAgents}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            {farmDetails.type === 'collaborative' ? 'Collaborative agents' : 'Sequential workflow'}
                          </p>
                        </div>
                        
                        <div className="bg-white dark:bg-gray-800 rounded-apple p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Runtime Limit</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {formatTimeout(config.timeout || 300)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Auto-adjusted for task
                          </p>
                        </div>
                      </div>
                      
                      {complexityAnalysis && (
                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                          <div className="flex items-start gap-2">
                            <Zap className="w-3 h-3 text-blue-500 mt-0.5" />
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {complexityAnalysis.explanation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!farmDetails.name && !farmDetails.description && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4 text-center">
                      <Brain className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Enter farm details to see AI-optimized configuration
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AI Engine
                  </h4>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-apple">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-apple">
                        {selectedProvider === 'claude' ? (
                          <Cpu className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        ) : selectedProvider === 'openai' ? (
                          <Brain className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        ) : (
                          <Sparkles className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedProvider === 'claude' ? 'Claude Code' : 'OpenAI GPT-4'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Default AI engine from settings
                        </p>
                      </div>
                    </div>
                    <a
                      href="/settings?tab=ai"
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/settings?tab=ai');
                      }}
                    >
                      Change in Settings
                    </a>
                  </div>
                </div>
              </div>

              {/* Database Persistence Toggle */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Persist in Background</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Keep farm data after completion (recommended)
                    </p>
                  </div>
                  <button
                    onClick={() => {}}
                    disabled
                    className={clsx(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      'bg-gray-300 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        'translate-x-1'
                      )}
                    />
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Go Wild Mode</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Enable autonomous exploration
                    </p>
                  </div>
                  <button
                    onClick={() => setConfig({ 
                      ...config, 
                      goWildMode: { 
                        ...config.goWildMode!, 
                        enabled: !config.goWildMode?.enabled 
                      } 
                    })}
                    className={clsx(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      config.goWildMode?.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        config.goWildMode?.enabled ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {config.goWildMode?.enabled && (
                  <div className="space-y-4 pl-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Creativity Level
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={config.goWildMode.creativityLevel}
                        onChange={(e) => setConfig({
                          ...config,
                          goWildMode: {
                            ...config.goWildMode!,
                            creativityLevel: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5
                          }
                        })}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Conservative</span>
                        <span>Balanced</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        );

      case 'grow':
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Watch It Grow
            </h3>

            <div className="space-y-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-apple">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Farm Summary
                </h4>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-600 dark:text-gray-400 mb-1">Name</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">
                      {farmDetails.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600 dark:text-gray-400 mb-1">Type</dt>
                    <dd className="text-gray-900 dark:text-white font-medium capitalize">
                      {farmDetails.type}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600 dark:text-gray-400 mb-1">AI Engine</dt>
                    <dd className="text-gray-900 dark:text-white font-medium capitalize">
                      {selectedProvider === 'claude' ? 'Claude Code' : 'OpenAI GPT-4'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600 dark:text-gray-400 mb-1">Max Agents</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">
                      {config.maxAgents}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600 dark:text-gray-400 mb-1">Auto-scaling</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">
                      {config.autoScale ? 'Enabled' : 'Disabled'}
                    </dd>
                  </div>
                  {farmDetails.description && (
                    <div className="col-span-2">
                      <dt className="text-gray-600 dark:text-gray-400 mb-1">Description</dt>
                      <dd className="text-gray-900 dark:text-white">
                        {farmDetails.description}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {isGeneratingYaml ? (
                <div className="h-64 flex flex-col items-center justify-center space-y-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-apple">
                  <div className="relative">
                    <Sparkles className="w-12 h-12 text-primary-500 animate-pulse" />
                    <div className="absolute inset-0 animate-spin">
                      <div className="h-12 w-12 border-3 border-primary-500 border-t-transparent rounded-full" />
                    </div>
                  </div>
                  <p className="text-base font-medium text-gray-900 dark:text-white">
                    Generating Configuration...
                  </p>
                </div>
              ) : yaml ? (
                <YAMLDisplay 
                  yaml={yaml} 
                  farmName={farmDetails.name}
                />
              ) : null}

              {/* Save as Seed Option */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-apple border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Save as Seed</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Save this configuration for future use
                    </p>
                  </div>
                  <button
                    onClick={() => setSaveAsSeed(!saveAsSeed)}
                    className={clsx(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      saveAsSeed ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        saveAsSeed ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>
                
                {saveAsSeed && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={seedName}
                      onChange={(e) => setSeedName(e.target.value)}
                      placeholder="Enter seed name..."
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-apple text-sm"
                    />
                  </div>
                )}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start space-x-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-apple border border-red-200 dark:border-red-800"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">
                      Error Creating Farm
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      {error}
                    </p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className={clsx('bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple-lg', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Create New Farm
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-apple transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          {(['plant', 'plow', 'grow'] as const).map((stepName, index) => (
            <React.Fragment key={stepName}>
              <button
                onClick={() => setStep(stepName)}
                className={clsx(
                  'flex items-center space-x-2',
                  step === stepName ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                )}
              >
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2',
                  step === stepName 
                    ? 'border-primary-600 bg-primary-600 text-white' 
                    : 'border-gray-300 dark:border-gray-600'
                )}>
                  {index + 1}
                </div>
                <span className="text-sm font-medium capitalize">{stepName}</span>
              </button>
              {index < 2 && (
                <div className="flex-1 h-0.5 bg-gray-200 dark:bg-gray-700 mx-4" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div 
        ref={contentContainerRef}
        className="p-6 max-h-[70vh] overflow-y-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        {renderStep()}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <button
          onClick={() => {
            const steps = ['plant', 'plow', 'grow'] as const;
            const currentIndex = steps.indexOf(step);
            if (currentIndex > 0) {
              setStep(steps[currentIndex - 1]);
            }
          }}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          disabled={step === 'plant'}
        >
          Previous
        </button>

        <div className="flex items-center space-x-3">
          {step === 'grow' ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCreateFarm}
              disabled={loading || isCreating || !yaml || !farmDetails.name}
              className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-apple-green to-apple-green-dark text-white rounded-apple-lg hover:shadow-apple-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-apple font-medium"
            >
              {(loading || isCreating) ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Creating Farm...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Create Farm</span>
                </>
              )}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const steps = ['plant', 'plow', 'grow'] as const;
                const currentIndex = steps.indexOf(step);
                if (currentIndex < steps.length - 1) {
                  setStep(steps[currentIndex + 1]);
                }
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              disabled={step === 'plant' && !farmDetails.name}
            >
              Next
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};