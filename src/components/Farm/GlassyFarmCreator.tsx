import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sprout, 
  Code, 
  Settings, 
  Play,
  Save,
  X,
  Cpu,
  Clock,
  Brain,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Users,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm, FarmConfig } from '@/types';
import { YAMLEditor } from './YAMLEditor';
import { YAMLDisplay } from './YAMLDisplay';
import { SeedPills } from '../Seeds/SeedPills';
import { AppleCard, AppleCardHeader, AppleCardContent, AppleCardFooter } from '../ui/AppleCard';
import { useFarmStore } from '@/store/farmStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUserStore } from '@/store/userStore';
import { logFarmCreation, useActivityStore } from '@/store/activityStore';
import { farmService } from '@/services/farmService';
import { api } from '@/services/apiClient';
import { Seed } from '@/types/seed';
import yamlGeneratorService from '@/services/yamlGeneratorService';
import { toast } from 'react-hot-toast';
import FileUpload from '../common/FileUpload';
import { AIProvider } from './ProviderSelector';
import { FarmLaunchService } from '@/services/farmLaunchFix';

interface GlassyFarmCreatorProps {
  onClose: () => void;
  className?: string;
}

export const GlassyFarmCreator: React.FC<GlassyFarmCreatorProps> = ({ onClose, className }) => {
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
  const [generatingYaml, setGeneratingYaml] = useState(false);
  const [generatedAgentNames, setGeneratedAgentNames] = useState<string[]>([]);
  
  const handleClose = () => {
    setStep('plant');
    onClose();
  };

  const selectedProvider = (settings.aiProvider as AIProvider) || 'claude';
  
  const [config, setConfig] = useState<FarmConfig>({
    autoScale: true,
    maxAgents: settings.agentConfig?.maxAgents || 8,
    timeout: 600
  });

  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complexityAnalysis, setComplexityAnalysis] = useState<{
    category: string;
    score: number;
    recommendedAgents: number;
    recommendedTimeout: number;
    explanation: string;
  } | null>(null);
  const { addFarm } = useFarmStore();
  
  // Analyze task complexity when farm details change
  useEffect(() => {
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

  // Generate YAML automatically when moving to grow step
  const generateYamlForFarm = async () => {
    setGeneratingYaml(true);
    setError(null);
    
    try {
      // Build a comprehensive prompt from farm details
      const prompt = `Create a ${farmDetails.type} farm called "${farmDetails.name}" with ${config.maxAgents} agents. 
        ${farmDetails.description ? `Purpose: ${farmDetails.description}` : ''}
        ${attachedFiles.length > 0 ? `Working with ${attachedFiles.length} attached files.` : ''}
        The farm should have well-coordinated agents with unique personalities.`;
      
      // Generate YAML using the service
      const result = await yamlGeneratorService.generateYaml({
        prompt,
        mode: 'freestyle',
        options: {
          // farm_type: farmDetails.type, // Removed - type mismatch
          num_agents: config.maxAgents,
          complexity: 'moderate' as const,
          include_estimates: true,
          auto_dependencies: true,
          enhance_prompt: true
        }
      });
      
      if (result.success && result.raw_yaml) {
        setYaml(result.raw_yaml);
        
        // Extract agent names from the generated YAML
        const agentMatches = result.raw_yaml.match(/agents:\s*\n([\s\S]*?)(?=\n[a-z_]+:|$)/i);
        if (agentMatches) {
          const agentSection = agentMatches[1];
          const nameMatches = agentSection.match(/name:\s*["']?([^"'\n]+)["']?/g);
          if (nameMatches) {
            const names = nameMatches.map(match => 
              match.replace(/name:\s*["']?/, '').replace(/["']?$/, '').trim()
            );
            setGeneratedAgentNames(names);
            console.log('Generated agent names:', names);
          }
        }
        
        // Show any suggestions from the AI
        if (result.suggestions && result.suggestions.length > 0) {
          console.log('YAML generation suggestions:', result.suggestions);
        }
      } else {
        throw new Error(result.error || 'Failed to generate YAML');
      }
    } catch (err) {
      console.error('YAML generation failed:', err);
      setError('Failed to generate configuration. Please try again.');
      
      // Fallback to a basic YAML if generation fails
      const fallbackYaml = `name: ${farmDetails.name}
type: ${farmDetails.type}
initial_prompt: |
  ${farmDetails.description || 'Help me with my development tasks'}
agents:
${Array.from({ length: config.maxAgents || 3 }, (_, i) => `  - name: Agent_${i + 1}
    role: assistant
    personality: helpful`).join('\n')}
`;
      setYaml(fallbackYaml);
    } finally {
      setGeneratingYaml(false);
    }
  };

  const handleSelectSeed = (seed: Seed) => {
    setSelectedSeed(seed);
    setYaml(seed.yaml);
    
    // Extract agent names from seed's YAML
    const agentMatches = seed.yaml.match(/agents:\s*\n([\s\S]*?)(?=\n[a-z_]+:|$)/i);
    if (agentMatches) {
      const agentSection = agentMatches[1];
      const nameMatches = agentSection.match(/name:\s*["']?([^"'\n]+)["']?/g);
      if (nameMatches) {
        const names = nameMatches.map(match => 
          match.replace(/name:\s*["']?/, '').replace(/["']?$/, '').trim()
        );
        setGeneratedAgentNames(names);
      }
    }
    
    if (seed.name && seed.name !== farmDetails.name) {
      setFarmDetails(prev => ({
        ...prev,
        name: seed.name,
        description: seed.description,
        type: seed.farmType
      }));
    }
    
    api.seeds.recordUsage(seed.id, true).catch(console.error);
    setStep('grow');
  };

  const handleCreateFarm = async () => {
    // Prevent double submission
    if (isCreating) {
      console.log('[GlassyFarmCreator] Already creating farm, ignoring duplicate request');
      return;
    }
    
    // Validate farm name and description length
    if (farmDetails.name.trim().length < 3) {
      toast.error('Farm name must be at least 3 characters long', {
        icon: '⚠️',
        duration: 3000
      });
      return;
    }
    
    if (farmDetails.description && farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5) {
      toast.error('Farm description should be at least 5 characters for better results', {
        icon: '⚠️',
        duration: 3000
      });
      return;
    }
    
    setLoading(true);
    setIsCreating(true);
    setError(null);
    
    try {
      console.log('[GlassyFarmCreator] Starting enhanced farm creation...');
      
      // Use the fixed farm launch service for a more reliable creation
      const farm = await FarmLaunchService.createAndLaunchFarm({
        name: farmDetails.name,
        description: farmDetails.description,
        type: farmDetails.type || 'sequential',
        config: {
          ...config,
          yaml,
          maxAgents: config.maxAgents || 3,
          timeout: config.timeout || 3600
        },
        provider: selectedProvider,
        attachedFiles: attachedFiles
      });
      
      if (!farm || !farm.id) {
        throw new Error('Farm creation failed - no farm ID returned');
      }
      
      console.log('[GlassyFarmCreator] Farm created successfully:', farm);
      
      // Add to store
      addFarm({
        ...farm,
        status: 'running'
      });
      
      toast.success(`Farm "${farmDetails.name}" launched with ${config.maxAgents || 3} agents! 🚀`);
      
      // Close modal first
      if (onClose) onClose();
      
      // Navigate through concept explainer
      setTimeout(() => {
        const transitionUrl = `/farm/${farm.id}/transition/farm`;
        console.log('[GlassyFarmCreator] Navigating to:', transitionUrl);
        navigate(transitionUrl);
      }, 100);
    } catch (err: any) {
      console.error('[GlassyFarmCreator] Failed to create farm:', err);
      console.error('[GlassyFarmCreator] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        stack: err.stack
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to create farm';
      if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setIsCreating(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'plant':
        return (
          <AppleCardContent>
            <div className="space-y-6">
              {/* Farm Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Farm Name
                  {farmDetails.name.trim().length > 0 && (
                    <span className={clsx(
                      "ml-2 text-xs font-normal",
                      farmDetails.name.trim().length < 3 
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-gray-500 dark:text-gray-400"
                    )}>
                      ({farmDetails.name.trim().length}/3 min)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={farmDetails.name}
                    onChange={(e) => setFarmDetails({ ...farmDetails, name: e.target.value })}
                    className={clsx(
                      "w-full px-4 py-3 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-leaf-500 focus:border-transparent transition-all",
                      farmDetails.name.trim().length > 0 && farmDetails.name.trim().length < 3
                        ? "border-yellow-400 dark:border-yellow-600"
                        : "border-gray-200/50 dark:border-gray-700/50"
                    )}
                    placeholder="My Digital Farm"
                  />
                  <Sprout className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-leaf-500 opacity-50" />
                </div>
                {farmDetails.name.trim().length > 0 && farmDetails.name.trim().length < 3 && (
                  <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                    Farm name needs {3 - farmDetails.name.trim().length} more character{3 - farmDetails.name.trim().length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                  {farmDetails.description.trim().length > 0 && (
                    <span className={clsx(
                      "ml-2 text-xs font-normal",
                      farmDetails.description.trim().length < 5 
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-gray-500 dark:text-gray-400"
                    )}>
                      ({farmDetails.description.trim().length}/10 recommended)
                    </span>
                  )}
                </label>
                <textarea
                  value={farmDetails.description}
                  onChange={(e) => setFarmDetails({ ...farmDetails, description: e.target.value })}
                  className={clsx(
                    "w-full px-4 py-3 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border rounded-2xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-leaf-500 focus:border-transparent transition-all resize-none",
                    farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5
                      ? "border-yellow-400 dark:border-yellow-600"
                      : "border-gray-200/50 dark:border-gray-700/50"
                  )}
                  rows={3}
                  placeholder="What will your farm cultivate? (Optional but recommended)"
                />
                {farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 && (
                  <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                    Add {10 - farmDetails.description.trim().length} more character{10 - farmDetails.description.trim().length !== 1 ? 's' : ''} for better AI understanding
                  </p>
                )}
              </div>

              {/* Farm Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Farm Type
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {(['sequential', 'collaborative', 'autonomous'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFarmDetails({ ...farmDetails, type })}
                      className={clsx(
                        'relative p-4 rounded-2xl backdrop-blur-xl transition-all duration-200',
                        farmDetails.type === type
                          ? 'bg-gradient-to-br from-leaf-400/20 to-leaf-600/20 border-2 border-leaf-500 shadow-lg'
                          : 'bg-gradient-to-br from-gray-100/40 to-gray-600/10 dark:bg-gradient-to-r dark:from-gray-400/10 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/50 hover:bg-white/70 dark:hover:bg-gray-800/70'
                      )}
                    >
                      <div className="text-center">
                        <h4 className={clsx(
                          'font-semibold capitalize mb-1',
                          farmDetails.type === type
                            ? 'text-leaf-700 dark:text-leaf-400'
                            : 'text-gray-700 dark:text-gray-300'
                        )}>
                          {type}
                        </h4>
                        <p className={clsx(
                          'text-xs',
                          farmDetails.type === type
                            ? 'text-leaf-600 dark:text-leaf-300'
                            : 'text-gray-500 dark:text-gray-400'
                        )}>
                          {type === 'sequential' && 'One after another'}
                          {type === 'collaborative' && 'Work together'}
                          {type === 'autonomous' && 'Self-directed'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
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

              {/* Seeds */}
              <div className="pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
                <SeedPills
                  onSelectSeed={handleSelectSeed}
                  selectedSeedId={selectedSeed?.id}
                  className="mt-2"
                />
              </div>
            </div>
          </AppleCardContent>
        );

      case 'plow':
        return (
          <AppleCardContent>
            <div className="space-y-6">
              {/* Auto-scaling Toggle */}
              <div className="p-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">Auto-scaling</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Scale agents based on workload
                    </p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, autoScale: !config.autoScale })}
                    className={clsx(
                      'relative inline-flex h-7 w-12 items-center rounded-full transition-all',
                      config.autoScale 
                        ? 'bg-gradient-to-r from-leaf-400 to-leaf-600' 
                        : 'bg-gray-300 dark:bg-gray-600'
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        config.autoScale ? "translate-x-5" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Agent Configuration */}
              <AppleCard variant="inset" padding="md">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="p-2 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl">
                    <Cpu className="w-5 h-5 text-white" />
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Agent Configuration
                  </h4>
                </div>
                
                <div className="space-y-4">
                  {/* AI-Optimized Configuration Display */}
                  {(farmDetails.name || farmDetails.description) ? (
                    <div className="bg-gradient-to-br from-leaf-500/10 to-emerald-500/10 backdrop-blur-md rounded-xl p-4 border border-leaf-400/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-5 h-5 text-leaf-400" />
                        <h4 className="font-medium text-gray-900 dark:text-white">AI-Optimized Configuration</h4>
                        {complexityAnalysis && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-leaf-500/20 border border-leaf-400/50 text-leaf-700 dark:text-leaf-300">
                            {complexityAnalysis.category}
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/50 dark:bg-black/30 backdrop-blur-sm rounded-lg p-3 border border-leaf-200 dark:border-white/10">
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
                        
                        <div className="bg-white/50 dark:bg-black/30 backdrop-blur-sm rounded-lg p-3 border border-leaf-200 dark:border-white/10">
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
                        <div className="mt-3 pt-3 border-t border-leaf-200 dark:border-leaf-700">
                          <div className="flex items-start gap-2">
                            <Zap className="w-3 h-3 text-leaf-500 mt-0.5" />
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {complexityAnalysis.explanation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center border border-gray-200 dark:border-gray-700">
                      <Brain className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Enter farm details to see AI-optimized configuration
                      </p>
                    </div>
                  )}
                </div>
              </AppleCard>
            </div>
          </AppleCardContent>
        );

      case 'grow':
        return (
          <AppleCardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <div className="p-2 bg-gradient-to-br from-harvest-400 to-harvest-600 rounded-xl">
                  <Code className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Configure Your Farm
                </h3>
              </div>
              
              {/* Show generated agent names if available */}
              {generatedAgentNames.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Auto-generated {generatedAgentNames.length} unique agents:
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {generatedAgentNames.map((name, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-800/30 text-blue-700 dark:text-blue-300 rounded-full">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-1">
                <YAMLEditor
                  value={yaml}
                  onChange={setYaml}
                  height="180px"
                />
              </div>
              
              {selectedSeed && (
                <div className="p-3 bg-leaf-50 dark:bg-leaf-900/20 rounded-xl border border-leaf-200 dark:border-leaf-800">
                  <p className="text-sm text-leaf-700 dark:text-leaf-300">
                    Using seed: <span className="font-medium">{selectedSeed.name}</span>
                  </p>
                </div>
              )}
            </div>
          </AppleCardContent>
        );
    }
  };

  return (
    <AppleCard
      variant="glass"
      padding="none"
      className={clsx('max-w-4xl w-full', className)}
    >
      {/* Close Button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Close quick task modal"
      >
        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
      </button>

      {/* Header */}
      <div className="px-8 py-6 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-leaf-400 to-leaf-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
          <Sprout className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          New Farm
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Plant your seeds and watch them grow here in your AI agent farm
        </p>
      </div>

      {/* Progress Steps */}
      <div className="px-8 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between">
          {[
            { id: 'plant', label: 'Plant', icon: Sprout },
            { id: 'plow', label: 'Configure', icon: Settings },
            { id: 'grow', label: 'Grow', icon: Sparkles }
          ].map((s, index) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => setStep(s.id as any)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-xl transition-all',
                  step === s.id
                    ? 'bg-gradient-to-r from-leaf-400 to-leaf-600 text-white shadow-md'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <s.icon className="w-4 h-4" />
                <span className="font-medium">{s.label}</span>
              </button>
              {index < 2 && (
                <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {renderStepContent()}
      </div>

      {/* Footer Actions */}
      <AppleCardFooter className="flex items-center justify-between px-10 py-4">
        <div className="flex items-center space-x-3">
          {step !== 'plant' && (
            <button
              onClick={() => setStep(step === 'grow' ? 'plow' : 'plant')}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {step === 'grow' ? (
            <button
              onClick={handleCreateFarm}
              disabled={loading || isCreating || !yaml || !farmDetails.name}
              className={clsx(
                'flex items-center space-x-2 px-6 py-2.5 rounded-xl font-medium shadow-sm transition-all',
                loading || isCreating || !yaml || !farmDetails.name
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-br from-leaf-400 to-leaf-600 text-white hover:shadow-lg'
              )}
            >
              {(loading || isCreating) ? (
                <>
                  <div className="animate-spin">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span>Planting...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Launch Farm</span>
                </>
              )}
            </button>
          ) : (
            <button 
              onClick={async () => {
                if (step === 'plant') {
                  setStep('plow');
                } else if (step === 'plow') {
                  // Generate YAML automatically when moving to grow step
                  if (!selectedSeed) {
                    await generateYamlForFarm();
                  }
                  setStep('grow');
                }
              }}
              disabled={(step === 'plant' && !farmDetails.name) || generatingYaml}
              className={clsx(
                'flex items-center justify-center space-y-2 px-6 py-2.5 rounded-xl font-medium shadow-sm transition-all',
                (step === 'plant' && !farmDetails.name) || generatingYaml
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-br from-leaf-400 to-leaf-600 text-white hover:shadow-lg'
              )}
            >
              {generatingYaml ? (
                <>
                  <div className="animate-spin">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span>Generating Configuration...</span>
                </>
              ) : (
                <>
                  <div className="flex items-center">
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4 flex items-center" />
                  </div>
                </>
              )}
            </button>
          )}
        </div>
      </AppleCardFooter>

      {/* Error Display */}
      {error && (
        <div className="mx-8 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </AppleCard>
  );
};