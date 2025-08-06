import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Wand2, 
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
  Cpu
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm, FarmConfig, YAMLTemplate } from '../../types';
import { YAMLEditor } from './YAMLEditor';
import { YAMLDisplay } from './YAMLDisplay';
import { SeedSelector } from '../Seeds/SeedSelector';
import { useFarmStore } from '../../store/farmStore';
import { useSettingsStore } from '../../store/settingsStore';
import { farmService } from '../../services/farmService';
import { api } from '../../services/apiClient';
import { Seed } from '../../types/seed';
import yamlGeneratorService from '../../services/yamlGeneratorService';
import { toast } from 'react-hot-toast';
import FileUpload from '../common/FileUpload';
import { AIProvider } from './ProviderSelector';

interface FarmCreatorProps {
  onClose?: () => void;
  className?: string;
}

export const FarmCreator: React.FC<FarmCreatorProps> = ({ onClose, className }) => {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [step, setStep] = useState<'plant' | 'plow' | 'grow'>('plant');
  const [farmDetails, setFarmDetails] = useState({
    name: '',
    description: '',
    type: 'sequential' as Farm['type']
  });
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  
  // Get AI provider from settings, defaulting to 'claude' if not set
  const selectedProvider = (settings.aiProvider as AIProvider) || 'claude';
  
  const [config, setConfig] = useState<FarmConfig>({
    autoScale: true,
    maxAgents: 5,
    timeout: 3600,
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      backoffMultiplier: 2
    },
    goWildMode: {
      enabled: false,
      creativityLevel: 3,
      boundaries: []
    }
  });

  const [yaml, setYaml] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<YAMLTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsSeed, setSaveAsSeed] = useState(false);
  const [seedName, setSeedName] = useState('');
  const [isGeneratingYaml, setIsGeneratingYaml] = useState(false);
  const [yamlGenerated, setYamlGenerated] = useState(false);

  const { addFarm } = useFarmStore();

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
Timeout: ${config.timeout} seconds
${config.goWildMode?.enabled ? `GoWild mode enabled with creativity level ${config.goWildMode?.creativityLevel}` : ''}${fileContext}`;

      const response = await yamlGeneratorService.generateYaml({
        prompt,
        options: {
          num_agents: config.maxAgents,
          complexity: 'moderate'
        }
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

  const templates: YAMLTemplate[] = [
    {
      id: '1',
      name: 'Web App Builder',
      description: 'Full-stack web application with React and Node.js',
      category: 'Development',
      popularity: 95,
      aiGenerated: false,
      yaml: `name: Web App Builder Farm
type: collaborative
agents:
  - name: Frontend Builder
    type: builder
    capabilities: [React, TypeScript, Tailwind CSS]
    tasks:
      - Initialize React project
      - Build UI components
      - Implement routing
  - name: Backend Builder
    type: builder
    capabilities: [Node.js, Express, MongoDB]
    tasks:
      - Setup API server
      - Implement endpoints
      - Database integration
  - name: Test Runner
    type: tester
    capabilities: [Jest, Cypress]
    tasks:
      - Write unit tests
      - E2E testing
config:
  autoScale: true
  maxAgents: 6`,
      parameters: []
    },
    {
      id: '2',
      name: 'Code Review Pipeline',
      description: 'Automated code review and quality assurance',
      category: 'Quality',
      popularity: 88,
      aiGenerated: true,
      yaml: `name: Code Review Pipeline
type: sequential
agents:
  - name: Linter
    type: reviewer
    capabilities: [ESLint, Prettier]
  - name: Security Scanner
    type: reviewer
    capabilities: [Security, OWASP]
  - name: Performance Analyzer
    type: reviewer
    capabilities: [Performance, Optimization]`,
      parameters: []
    }
  ];

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
    // Pre-validation checks
    if (!farmDetails.name || farmDetails.name.trim().length === 0) {
      setError('Farm name is required');
      toast.error('Please enter a farm name');
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
      let farmData: any = {
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
        attachedFiles.forEach((file, index) => {
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
          avgCompletionTime: 0,
          totalAgents: 0,
          activeAgents: 0,
          resourceUsage: {
            cpu: 0,
            memory: 0,
            network: 0
          },
          collaborationScore: 0,
          efficiency: 0
        }
      });
      
      // Launch the farm with multi-claude agents
      try {
        const launchResponse = await fetch(`/api/farms/${newFarm.id}/launch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            numberOfAgents: config.maxAgents || 3,
            collaborative: farmDetails.type === 'collaborative',
            bundleSteps: farmDetails.type === 'sequential' ? 1 : undefined,
            provider: selectedProvider
          })
        });

        if (!launchResponse.ok) {
          console.error('Failed to launch farm agents, but farm was created');
        } else {
          console.log('Farm agents launching successfully');
        }
      } catch (launchError) {
        console.error('Error launching farm agents:', launchError);
        // Don't fail the whole operation if launching fails
      }
      
      // Optionally save as seed
      if (saveAsSeed && seedName) {
        try {
          await api.seeds.create({
            name: seedName.trim(),
            description: farmDetails.description?.trim() || '',
            yaml: yaml,
            farmType: farmDetails.type,
            category: 'Custom',
            tags: ['user-created', farmDetails.type],
            isPublic: false
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
      
      // Navigate to growing page to show progress animation
      setTimeout(() => {
        navigate(`/farms/${newFarm.id}/growing`);
        onClose?.();
      }, 500);
    } catch (err: any) {
      // Detailed error handling
      let errorMessage = 'Failed to create farm';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
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
              <input
                type="text"
                value={farmDetails.name}
                onChange={(e) => setFarmDetails({ ...farmDetails, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="My Awesome Farm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={farmDetails.description}
                onChange={(e) => setFarmDetails({ ...farmDetails, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={3}
                placeholder="Describe what this farm will do..."
              />
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
            {/* File Upload Section */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                Attach Context Files (Optional)
              </h4>
              <FileUpload
                onFilesChange={setAttachedFiles}
                maxFiles={10}
                maxSizeInMB={10}
                acceptedTypes={['*']}
                className="mb-4"
              />
            </div>

            {/* Seeds Section */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">
                Use a Seed Template (Optional)
              </h4>
              <SeedSelector
                onSelectSeed={handleSelectSeed}
                selectedSeedId={selectedSeed?.id}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Maximum Agents
                </label>
                <input
                  type="number"
                  value={config.maxAgents}
                  onChange={(e) => setConfig({ ...config, maxAgents: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="20"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Timeout
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={Math.floor((config.timeout || 0) / 3600)}
                      onChange={(e) => {
                        const hours = parseInt(e.target.value) || 0;
                        const minutes = (config.timeout || 0) % 3600 / 60;
                        setConfig({ ...config, timeout: hours * 3600 + minutes * 60 });
                      }}
                      min="0"
                      max="24"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">Hours</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={Math.floor(((config.timeout || 0) % 3600) / 60)}
                      onChange={(e) => {
                        const hours = Math.floor((config.timeout || 0) / 3600);
                        const minutes = parseInt(e.target.value) || 0;
                        setConfig({ ...config, timeout: hours * 3600 + Math.min(minutes, 59) * 60 });
                      }}
                      min="0"
                      max="59"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">Minutes</span>
                  </div>
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
                        ) : (
                          <Sparkles className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {selectedProvider === 'claude' ? 'Claude Code' : 'Qwen3-Coder'}
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

            <div className="pt-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                Use a Template
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setYaml(template.yaml);
                      setStep('grow');
                    }}
                    className="p-4 border border-gray-300 dark:border-gray-600 rounded-apple hover:border-primary-500 dark:hover:border-primary-400 transition-colors text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-medium text-gray-900 dark:text-white">
                          {template.name}
                        </h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {template.description}
                        </p>
                      </div>
                      {template.aiGenerated && (
                        <Wand2 className="w-4 h-4 text-primary-500 ml-2 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
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
                      {selectedProvider === 'qwen' ? 'Qwen3-Coder' : 'Claude Code'}
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
          {(['plant', 'plow', 'grow'] as const).map((s, index) => (
            <React.Fragment key={s}>
              <button
                onClick={() => setStep(s)}
                className={clsx(
                  'flex items-center space-x-2',
                  step === s ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                )}
              >
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2',
                  step === s 
                    ? 'border-primary-600 bg-primary-600 text-white' 
                    : 'border-gray-300 dark:border-gray-600'
                )}>
                  {index + 1}
                </div>
                <span className="text-sm font-medium capitalize">{s}</span>
              </button>
              {index < 2 && (
                <div className="flex-1 h-0.5 bg-gray-200 dark:bg-gray-700 mx-4" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
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
              disabled={loading || !yaml || !farmDetails.name}
              className="flex items-center space-x-2 px-6 py-2 bg-primary-600 text-gray-700 rounded-apple hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 text-gray-700 border-2 border-white border-t-transparent" />
                  <span>Creating Farm...</span>
                </>
              ) : (
                <>
                  <div className="px-0 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" />
                  <Play className="w-4 h-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" />
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