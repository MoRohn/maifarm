import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  Paperclip,
  FileText,
  Layers,
  GitBranch,
  Workflow
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
import DOMPurify from 'dompurify';

// Farm Creator Theme Colors - Navy Blue for structured productivity
const farmTheme = {
  primary: '#5a6ef2', // navy-500
  primaryDark: '#4149e6', // navy-600
  primaryLight: '#7c93f8', // navy-400
  accent: '#a5b4fc', // indigo-300
  secondary: '#3538cc', // navy-700
  gradient: {
    from: '#0f172a', // slate-900
    via: '#1e1b4b', // indigo-950
    to: '#2d31a5', // navy-800
  },
  glow: 'rgba(90, 110, 242, 0.4)',
  cardBg: 'rgba(15, 23, 42, 0.7)', // slate-900/70
  cardBorder: 'rgba(90, 110, 242, 0.25)',
};

// Farm type suggestions
const farmTypeSuggestions = [
  { icon: Layers, title: 'Sequential', description: 'Tasks run one after another', value: 'sequential' as const },
  { icon: GitBranch, title: 'Collaborative', description: 'Agents work together', value: 'collaborative' as const },
  { icon: Workflow, title: 'Autonomous', description: 'Self-directed exploration', value: 'autonomous' as const },
];

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

  // Use ref for synchronous double-submit prevention (prevents race condition)
  const isCreatingRef = useRef(false);
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

  // Incubation state - separate from config to avoid type conflicts
  const [autoIncubate, setAutoIncubate] = useState(true);
  
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
      // UX FIX: Notify user when using defaults due to API failure
      console.warn('Task complexity analysis failed, using defaults:', error);

      // Use intelligent defaults if analysis fails
      const defaultAgents = farmDetails.type === 'collaborative' ? 4 : 3;
      const defaultTimeout = 1800; // 30 minutes

      setConfig(prev => ({
        ...prev,
        maxAgents: defaultAgents,
        timeout: defaultTimeout
      }));

      // UX FIX: Show subtle toast so user knows recommendations are defaults
      toast('Using default configuration', {
        icon: 'ℹ️',
        duration: 3000,
        style: { background: '#f0f9ff', color: '#0369a1' }
      });
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

      // FIX: Add timeout wrapper to prevent frozen UI on slow networks
      const timeoutMs = 30000; // 30 second timeout
      const generatePromise = yamlGeneratorService.generateYaml({
        prompt,
        mode: 'freestyle',
        options: {
          num_agents: config.maxAgents,
          complexity: 'moderate'
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YAML generation timed out')), timeoutMs)
      );

      const response = await Promise.race([generatePromise, timeoutPromise]);

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
    // Prevent double submission with synchronous ref check (fixes race condition)
    if (isCreatingRef.current || isCreating) {
      return;
    }

    // Set ref immediately (synchronous) to block rapid clicks
    isCreatingRef.current = true;

    console.log('[DEBUG] Farm creation started');
    console.log('[DEBUG] farmDetails:', farmDetails);
    console.log('[DEBUG] config:', config);
    console.log('[DEBUG] attachedFiles:', attachedFiles.length);

    setIsCreating(true);
    setError(null);
    
    // Sanitize inputs to prevent XSS attacks
    const sanitizedName = DOMPurify.sanitize(farmDetails.name.trim(), {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: []
    });

    const sanitizedDescription = DOMPurify.sanitize(farmDetails.description?.trim() || '', {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: []
    });

    // Pre-validation checks
    if (!sanitizedName || sanitizedName.length === 0) {
      setError('Farm name is required');
      toast.error('Please enter a farm name');
      setIsCreating(false);
      isCreatingRef.current = false;
      return;
    }

    // Validate description length
    if (!sanitizedDescription || sanitizedDescription.length < 5) {
      setError('Description must be at least 5 characters');
      toast.error('Please provide at least 5 characters to describe your farm', {
        icon: '⚠️',
        duration: 3000
      });
      setIsCreating(false);
      isCreatingRef.current = false;
      return;
    }

    if (sanitizedName.length > 100) {
      setError('Farm name must be less than 100 characters');
      toast.error('Farm name is too long');
      setIsCreating(false);
      isCreatingRef.current = false;
      return;
    }

    // Validate YAML
    const yamlValidation = validateYaml(yaml);
    if (!yamlValidation.valid) {
      setError(`YAML validation failed: ${yamlValidation.errors.join(', ')}`);
      toast.error('Please fix YAML configuration errors');
      setIsCreating(false);
      isCreatingRef.current = false;
      return;
    }

    // Validate seed name if saving as seed
    if (saveAsSeed) {
      if (!seedName || seedName.trim().length === 0) {
        setError('Seed name is required when saving as seed');
        toast.error('Please enter a seed name');
        setIsCreating(false);
        isCreatingRef.current = false;
        return;
      }
      if (seedName.length > 50) {
        setError('Seed name must be less than 50 characters');
        toast.error('Seed name is too long');
        setIsCreating(false);
        isCreatingRef.current = false;
        return;
      }
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Prepare form data with sanitized inputs
      const farmData: any = {
        name: sanitizedName,
        description: sanitizedDescription,
        type: farmDetails.type,
        provider: selectedProvider,
        config: {
          ...config,
          yaml
        },
        autoIncubate, // Include incubation preference
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
        // Refetch farm to get actual status instead of assuming state
        await fetchFarms();
      }
      
      // Optionally save as seed
      if (saveAsSeed && seedName) {
        try {
          // Sanitize seed name
          const sanitizedSeedName = DOMPurify.sanitize(seedName.trim(), {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: []
          });

          const seedResponse = await api.seeds.create({
            name: sanitizedSeedName,
            description: sanitizedDescription,
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
      isCreatingRef.current = false; // Reset ref in finally block
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
            <h3 className="text-lg font-semibold text-white">
              Plant Your Seeds
            </h3>

            {/* Farm Name */}
            <div>
              <label htmlFor="farm-name" className="block text-sm font-medium mb-2 text-white">
                Farm Name <span className="text-red-400" aria-label="required">*</span>
              </label>
              <div className="relative">
                <input
                  id="farm-name"
                  type="text"
                  value={farmDetails.name}
                  onChange={(e) => setFarmDetails({ ...farmDetails, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/40 transition-all"
                  style={{
                    backgroundColor: farmTheme.cardBg,
                    borderColor: farmDetails.name.length > 0 && farmDetails.name.length < 5 ? '#FBBF24' : farmDetails.name ? farmTheme.primary : farmTheme.cardBorder,
                    border: '1px solid',
                    outline: 'none',
                  }}
                  placeholder="My Awesome Farm"
                  required
                  aria-required="true"
                  aria-invalid={farmDetails.name.length > 0 && farmDetails.name.length < 5}
                  aria-describedby={farmDetails.name.length > 0 && farmDetails.name.length < 5 ? 'farm-name-error farm-name-count' : 'farm-name-count'}
                  onFocus={(e) => {
                    e.target.style.borderColor = farmTheme.primary;
                    e.target.style.boxShadow = `0 0 0 3px ${farmTheme.glow}`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = farmDetails.name.length > 0 && farmDetails.name.length < 5 ? '#FBBF24' : farmDetails.name ? farmTheme.primary : farmTheme.cardBorder;
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {farmDetails.name.length > 0 && (
                  <div id="farm-name-count" className="absolute bottom-3 right-3 text-xs" aria-live="polite">
                    <span style={{ color: farmDetails.name.length < 5 ? '#FBBF24' : farmTheme.accent }}>
                      {farmDetails.name.length}/5
                    </span>
                  </div>
                )}
              </div>
              {farmDetails.name.length > 0 && farmDetails.name.length < 5 && (
                <p id="farm-name-error" className="mt-1 text-xs" style={{ color: '#FBBF24' }} role="alert" aria-live="polite">
                  Please add {5 - farmDetails.name.length} more character{5 - farmDetails.name.length !== 1 ? 's' : ''} for a better name
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="farm-description" className="block text-sm font-medium mb-2 text-white">
                Description <span className="text-red-400" aria-label="required">*</span>
              </label>
              <div className="relative">
                <textarea
                  id="farm-description"
                  value={farmDetails.description}
                  onChange={(e) => setFarmDetails({ ...farmDetails, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/40 resize-none transition-all"
                  style={{
                    backgroundColor: farmTheme.cardBg,
                    borderColor: farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 ? '#FBBF24' : farmDetails.description ? farmTheme.primary : farmTheme.cardBorder,
                    border: '1px solid',
                    outline: 'none',
                  }}
                  rows={3}
                  placeholder="Describe what this farm will do..."
                  required
                  aria-required="true"
                  aria-invalid={farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5}
                  aria-describedby={farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 ? 'farm-desc-error farm-desc-count' : 'farm-desc-count'}
                  onFocus={(e) => {
                    e.target.style.borderColor = farmTheme.primary;
                    e.target.style.boxShadow = `0 0 0 3px ${farmTheme.glow}`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 ? '#FBBF24' : farmDetails.description ? farmTheme.primary : farmTheme.cardBorder;
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {farmDetails.description.trim().length > 0 && (
                  <div id="farm-desc-count" className="absolute bottom-3 right-3 text-xs" aria-live="polite">
                    <span style={{ color: farmDetails.description.trim().length < 5 ? '#FBBF24' : farmTheme.accent }}>
                      {farmDetails.description.trim().length}/5
                    </span>
                  </div>
                )}
              </div>
              {farmDetails.description.trim().length > 0 && farmDetails.description.trim().length < 5 && (
                <p id="farm-desc-error" className="mt-1 text-xs" style={{ color: '#FBBF24' }} role="alert" aria-live="polite">
                  Please add {5 - farmDetails.description.trim().length} more character{5 - farmDetails.description.trim().length !== 1 ? 's' : ''} for a better description
                </p>
              )}
            </div>

            {/* Farm Type - Themed Cards */}
            <div>
              <label className="block text-sm font-medium mb-3 text-white">
                Farm Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                {farmTypeSuggestions.map((suggestion) => {
                  const IconComponent = suggestion.icon;
                  const isSelected = farmDetails.type === suggestion.value;
                  return (
                    <motion.button
                      key={suggestion.value}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFarmDetails({ ...farmDetails, type: suggestion.value })}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: isSelected ? 'rgba(90, 110, 242, 0.3)' : farmTheme.cardBg,
                        borderColor: isSelected ? farmTheme.primary : farmTheme.cardBorder,
                        border: isSelected ? '2px solid' : '1px solid',
                        boxShadow: isSelected ? `0 0 20px ${farmTheme.glow}` : 'none',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <IconComponent
                          className="w-5 h-5"
                          style={{ color: isSelected ? farmTheme.primaryLight : farmTheme.accent }}
                        />
                      </div>
                      <h4 className="font-semibold text-white text-sm mb-1">{suggestion.title}</h4>
                      <p className="text-xs opacity-70 text-white">{suggestion.description}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Attachments Section */}
            <div
              className="p-4 rounded-xl"
              style={{
                backgroundColor: farmTheme.cardBg,
                borderColor: farmTheme.cardBorder,
                border: '1px solid',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-white">Attachments</span>
                  <span className="text-xs opacity-50 text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    Optional
                  </span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: farmTheme.primary }}
                  onClick={() => document.getElementById('farm-file-input')?.click()}
                >
                  <span className="text-white text-lg">+</span>
                </motion.button>
              </div>
              <div className="text-center py-4">
                <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-40 text-white" />
                <p className="text-sm opacity-60 text-white">No files attached</p>
                <p className="text-xs opacity-40 text-white mt-1">Drag files or click + to add</p>
              </div>
              <input
                id="farm-file-input"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setAttachedFiles(prev => [...prev, ...files].slice(0, 10));
                }}
              />
              {attachedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-sm text-white truncate">{file.name}</span>
                      <button
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Seeds Section */}
            <div className="pt-6 border-t" style={{ borderColor: farmTheme.cardBorder }}>
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
            <h3 className="text-lg font-semibold text-white">
              Plow the Field
            </h3>

            <div className="space-y-4">
              {/* Auto-scaling Toggle */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <div>
                  <h4 className="font-medium text-white">Auto-scaling</h4>
                  <p className="text-sm opacity-60 text-white">
                    Automatically scale agents based on workload
                  </p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, autoScale: !config.autoScale })}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  style={{
                    backgroundColor: config.autoScale ? farmTheme.primary : 'rgba(255,255,255,0.2)',
                  }}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    style={{
                      transform: config.autoScale ? 'translateX(22px)' : 'translateX(4px)',
                    }}
                  />
                </button>
              </div>

              {/* Agent Configuration Display */}
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <h4 className="font-medium text-white mb-3 flex items-center space-x-2">
                  <Cpu className="w-5 h-5" style={{ color: farmTheme.primary }} />
                  <span>Agent Configuration</span>
                </h4>
                <div className="space-y-4">
                  {/* AI-Optimized Configuration Display */}
                  {(farmDetails.name || farmDetails.description) && (
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: `linear-gradient(135deg, rgba(90, 110, 242, 0.15) 0%, rgba(45, 49, 165, 0.15) 100%)`,
                        borderColor: 'rgba(90, 110, 242, 0.3)',
                        border: '1px solid',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="w-5 h-5" style={{ color: farmTheme.primaryLight }} />
                        <h4 className="font-medium text-white">AI-Optimized Configuration</h4>
                        {complexityAnalysis && (
                          <span
                            className="ml-auto text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(90, 110, 242, 0.3)', color: farmTheme.accent }}
                          >
                            {complexityAnalysis.category}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div
                          className="rounded-lg p-3"
                          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4" style={{ color: farmTheme.accent }} />
                            <span className="text-xs opacity-60 text-white">Optimal Agents</span>
                          </div>
                          <p className="text-2xl font-bold text-white">
                            {config.maxAgents}
                          </p>
                          <p className="text-xs opacity-50 text-white mt-1">
                            {farmDetails.type === 'collaborative' ? 'Collaborative agents' : 'Sequential workflow'}
                          </p>
                        </div>

                        <div
                          className="rounded-lg p-3"
                          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4" style={{ color: farmTheme.accent }} />
                            <span className="text-xs opacity-60 text-white">Runtime Limit</span>
                          </div>
                          <p className="text-2xl font-bold text-white">
                            {formatTimeout(config.timeout || 300)}
                          </p>
                          <p className="text-xs opacity-50 text-white mt-1">
                            Auto-adjusted for task
                          </p>
                        </div>
                      </div>

                      {complexityAnalysis && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(90, 110, 242, 0.3)' }}>
                          <div className="flex items-start gap-2">
                            <Zap className="w-3 h-3 mt-0.5" style={{ color: farmTheme.primary }} />
                            <p className="text-xs opacity-70 text-white">
                              {complexityAnalysis.explanation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!farmDetails.name && !farmDetails.description && (
                    <div
                      className="rounded-xl p-4 text-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                    >
                      <Brain className="w-8 h-8 mx-auto mb-2" style={{ color: farmTheme.accent }} />
                      <p className="text-sm opacity-60 text-white">
                        Enter farm details to see AI-optimized configuration
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Engine Section */}
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <h4 className="text-sm font-medium text-white mb-3">
                  AI Engine
                </h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: 'rgba(90, 110, 242, 0.2)' }}
                    >
                      {selectedProvider === 'claude' ? (
                        <Cpu className="w-5 h-5" style={{ color: farmTheme.primary }} />
                      ) : selectedProvider === 'openai' ? (
                        <Brain className="w-5 h-5" style={{ color: farmTheme.primary }} />
                      ) : (
                        <Sparkles className="w-5 h-5" style={{ color: farmTheme.primary }} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {selectedProvider === 'claude' ? 'Claude Code' : 'OpenAI GPT-4'}
                      </p>
                      <p className="text-sm opacity-60 text-white">
                        Default AI engine from settings
                      </p>
                    </div>
                  </div>
                  <a
                    href="/settings?tab=ai"
                    className="text-sm hover:underline"
                    style={{ color: farmTheme.primaryLight }}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/settings?tab=ai');
                    }}
                  >
                    Change in Settings
                  </a>
                </div>
              </div>

              {/* Go Wild Mode Toggle */}
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-medium text-white">Go Wild Mode</h4>
                    <p className="text-sm opacity-60 text-white">
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
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{
                      backgroundColor: config.goWildMode?.enabled ? farmTheme.primary : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                      style={{
                        transform: config.goWildMode?.enabled ? 'translateX(22px)' : 'translateX(4px)',
                      }}
                    />
                  </button>
                </div>

                {config.goWildMode?.enabled && (
                  <div className="space-y-4 pl-4">
                    <div>
                      <label id="creativity-level-label" htmlFor="creativity-level" className="block text-sm font-medium text-white mb-2">
                        Creativity Level
                      </label>
                      <input
                        id="creativity-level"
                        type="range"
                        min="1"
                        max="5"
                        value={config.goWildMode.creativityLevel}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          const safeValue = Math.min(5, Math.max(1, value)) as 1 | 2 | 3 | 4 | 5;
                          setConfig({
                            ...config,
                            goWildMode: {
                              ...config.goWildMode!,
                              creativityLevel: safeValue
                            }
                          });
                        }}
                        className="w-full"
                        style={{ accentColor: farmTheme.primary }}
                        aria-labelledby="creativity-level-label"
                        aria-valuemin={1}
                        aria-valuemax={5}
                        aria-valuenow={config.goWildMode.creativityLevel}
                        aria-valuetext={config.goWildMode.creativityLevel <= 2 ? 'Conservative' : config.goWildMode.creativityLevel === 3 ? 'Balanced' : 'Creative'}
                      />
                      <div className="flex justify-between text-xs opacity-50 text-white mt-1" aria-hidden="true">
                        <span>Conservative</span>
                        <span>Balanced</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-Incubation Toggle */}
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-white flex items-center space-x-2">
                      <Sparkles className="w-4 h-4" style={{ color: '#FBBF24' }} />
                      <span>Auto-incubate after completion</span>
                    </h4>
                    <p className="text-sm opacity-60 text-white mt-1">
                      Automatically evolve farm outputs through AI-powered incubation
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoIncubate(!autoIncubate)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{
                      backgroundColor: autoIncubate ? farmTheme.primary : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                      style={{
                        transform: autoIncubate ? 'translateX(22px)' : 'translateX(4px)',
                      }}
                    />
                  </button>
                </div>

                {autoIncubate && (
                  <div
                    className="mt-4 rounded-lg p-3 text-sm"
                    style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#FDE68A' }}
                  >
                    <p className="flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#FBBF24' }} />
                      <span>
                        After harvest, your farm will automatically incubate through 5 evolutionary stages to enhance outputs and create a new generation.
                      </span>
                    </p>
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
            <h3 className="text-lg font-semibold text-white">
              Watch It Grow
            </h3>

            <div className="space-y-6">
              {/* Farm Summary Card */}
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <h4 className="font-medium text-white mb-3">
                  Farm Summary
                </h4>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="opacity-60 text-white mb-1">Name</dt>
                    <dd className="text-white font-medium">
                      {farmDetails.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-60 text-white mb-1">Type</dt>
                    <dd className="text-white font-medium capitalize">
                      {farmDetails.type}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-60 text-white mb-1">AI Engine</dt>
                    <dd className="text-white font-medium capitalize">
                      {selectedProvider === 'claude' ? 'Claude Code' : 'OpenAI GPT-4'}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-60 text-white mb-1">Max Agents</dt>
                    <dd className="text-white font-medium">
                      {config.maxAgents}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-60 text-white mb-1">Auto-scaling</dt>
                    <dd className="text-white font-medium">
                      {config.autoScale ? 'Enabled' : 'Disabled'}
                    </dd>
                  </div>
                  <div>
                    <dt className="opacity-60 text-white mb-1 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3" style={{ color: '#FBBF24' }} />
                      <span>Auto-incubate</span>
                    </dt>
                    <dd className="text-white font-medium">
                      {autoIncubate ? 'Enabled' : 'Disabled'}
                    </dd>
                  </div>
                  {farmDetails.description && (
                    <div className="col-span-2">
                      <dt className="opacity-60 text-white mb-1">Description</dt>
                      <dd className="text-white">
                        {farmDetails.description}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {isGeneratingYaml ? (
                <div
                  className="h-64 flex flex-col items-center justify-center space-y-4 rounded-xl"
                  style={{
                    backgroundColor: farmTheme.cardBg,
                    borderColor: farmTheme.cardBorder,
                    border: '2px dashed',
                  }}
                >
                  <div className="relative">
                    <Sparkles className="w-12 h-12 animate-pulse" style={{ color: farmTheme.primary }} />
                    <div className="absolute inset-0 animate-spin">
                      <div
                        className="h-12 w-12 rounded-full border-3"
                        style={{
                          borderColor: farmTheme.primary,
                          borderTopColor: 'transparent',
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-base font-medium text-white">
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
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: farmTheme.cardBg,
                  borderColor: farmTheme.cardBorder,
                  border: '1px solid',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-white">Save as Seed</h4>
                    <p className="text-sm opacity-60 text-white">
                      Save this configuration for future use
                    </p>
                  </div>
                  <button
                    onClick={() => setSaveAsSeed(!saveAsSeed)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{
                      backgroundColor: saveAsSeed ? farmTheme.primary : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                      style={{
                        transform: saveAsSeed ? 'translateX(22px)' : 'translateX(4px)',
                      }}
                    />
                  </button>
                </div>

                {saveAsSeed && (
                  <div className="mt-3">
                    <label htmlFor="seed-name" className="sr-only">
                      Seed name
                    </label>
                    <input
                      id="seed-name"
                      type="text"
                      value={seedName}
                      onChange={(e) => setSeedName(e.target.value)}
                      placeholder="Enter seed name..."
                      aria-required="true"
                      aria-invalid={saveAsSeed && seedName.length === 0}
                      aria-describedby="seed-name-hint"
                      className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-white/40"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderColor: farmTheme.cardBorder,
                        border: '1px solid',
                      }}
                    />
                    <span id="seed-name-hint" className="sr-only">
                      Enter a name for your reusable seed configuration
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start space-x-2 p-4 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    border: '1px solid',
                  }}
                  role="alert"
                  aria-live="assertive"
                >
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-300">
                      Error Creating Farm
                    </p>
                    <p className="text-sm text-red-400 mt-1">
                      {error}
                    </p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="p-1 rounded transition-colors"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4 text-red-400" aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div
      className={clsx('rounded-2xl shadow-2xl overflow-hidden', className)}
      style={{
        background: `linear-gradient(135deg, ${farmTheme.gradient.from} 0%, ${farmTheme.gradient.via} 50%, ${farmTheme.gradient.to} 100%)`,
        border: `1px solid ${farmTheme.cardBorder}`,
      }}
    >
      {/* Subtle inner glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: `inset 0 1px 1px rgba(255,255,255,0.1), 0 0 60px ${farmTheme.glow}`,
        }}
      />

      {/* Header */}
      <div className="relative px-6 py-5 border-b" style={{ borderColor: farmTheme.cardBorder }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Animated icon container */}
            <motion.div
              className="relative p-3 rounded-xl"
              style={{ backgroundColor: 'rgba(90, 110, 242, 0.2)' }}
              animate={{
                boxShadow: [
                  `0 0 20px ${farmTheme.glow}`,
                  `0 0 30px ${farmTheme.glow}`,
                  `0 0 20px ${farmTheme.glow}`,
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sprout className="w-7 h-7" style={{ color: farmTheme.primary }} />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                New Farm
              </h2>
              <p className="text-sm" style={{ color: farmTheme.accent }}>
                1-6 hrs · Multi-Agent Collaboration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all hover:scale-110"
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: farmTheme.accent
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="relative px-6 py-4 border-b" style={{ borderColor: farmTheme.cardBorder }}>
        <div className="flex items-center justify-between">
          {(['plant', 'plow', 'grow'] as const).map((stepName, index) => (
            <React.Fragment key={stepName}>
              <button
                onClick={() => setStep(stepName)}
                className="flex items-center space-x-2"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all"
                  style={{
                    borderColor: step === stepName ? farmTheme.primary : 'rgba(255,255,255,0.2)',
                    backgroundColor: step === stepName ? farmTheme.primary : 'transparent',
                    color: step === stepName ? 'white' : 'rgba(255,255,255,0.5)',
                    boxShadow: step === stepName ? `0 0 15px ${farmTheme.glow}` : 'none',
                  }}
                >
                  {index + 1}
                </div>
                <span
                  className="text-sm font-medium capitalize"
                  style={{ color: step === stepName ? 'white' : 'rgba(255,255,255,0.5)' }}
                >
                  {stepName}
                </span>
              </button>
              {index < 2 && (
                <div
                  className="flex-1 h-0.5 mx-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentContainerRef}
        className="relative p-6 max-h-[70vh] overflow-y-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        {renderStep()}
      </div>

      {/* Footer */}
      <div className="relative px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: farmTheme.cardBorder }}>
        <button
          onClick={() => {
            const steps = ['plant', 'plow', 'grow'] as const;
            const currentIndex = steps.indexOf(step);
            if (currentIndex > 0) {
              setStep(steps[currentIndex - 1]);
            }
          }}
          className="px-4 py-2 rounded-lg transition-all"
          style={{
            color: step === 'plant' ? 'rgba(255,255,255,0.3)' : farmTheme.accent,
            cursor: step === 'plant' ? 'not-allowed' : 'pointer',
          }}
          disabled={step === 'plant'}
        >
          Previous
        </button>

        <div className="flex items-center space-x-3">
          {step === 'grow' ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateFarm}
              disabled={loading || isCreating || !yaml || !farmDetails.name}
              aria-busy={loading || isCreating}
              aria-disabled={loading || isCreating || !yaml || !farmDetails.name}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                backgroundColor: (loading || isCreating || !yaml || !farmDetails.name) ? 'rgba(255,255,255,0.1)' : farmTheme.primary,
                color: (loading || isCreating || !yaml || !farmDetails.name) ? 'rgba(255,255,255,0.4)' : 'white',
                cursor: (loading || isCreating || !yaml || !farmDetails.name) ? 'not-allowed' : 'pointer',
                boxShadow: (loading || isCreating || !yaml || !farmDetails.name) ? 'none' : `0 4px 20px ${farmTheme.glow}`,
                // @ts-ignore
                '--tw-ring-color': farmTheme.primary,
              }}
            >
              {(loading || isCreating) ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" aria-hidden="true" />
                  <span>Creating Farm...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Create Farm</span>
                </>
              )}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const steps = ['plant', 'plow', 'grow'] as const;
                const currentIndex = steps.indexOf(step);
                if (currentIndex < steps.length - 1) {
                  setStep(steps[currentIndex + 1]);
                }
              }}
              className="px-6 py-2.5 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: (step === 'plant' && !farmDetails.name) ? 'rgba(255,255,255,0.1)' : farmTheme.primary,
                color: (step === 'plant' && !farmDetails.name) ? 'rgba(255,255,255,0.4)' : 'white',
                cursor: (step === 'plant' && !farmDetails.name) ? 'not-allowed' : 'pointer',
                boxShadow: (step === 'plant' && !farmDetails.name) ? 'none' : `0 4px 15px ${farmTheme.glow}`,
              }}
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