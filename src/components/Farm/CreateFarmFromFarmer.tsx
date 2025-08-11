import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft,
  ArrowRight,
  Rocket, 
  CheckCircle, 
  AlertCircle,
  Wand2,
  Users,
  Clock,
  Settings,
  Code,
  Sparkles,
  User
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmerTemplate } from '../../types/farmers';
import { api } from '../../services/apiClient';
import { toast } from 'react-hot-toast';
import { YAMLDisplay } from './YAMLDisplay';

interface FarmCreationState {
  farmerTemplate: FarmerTemplate;
  suggestedName: string;
  suggestedDescription: string;
  maxAgents: number;
}

interface UserInputs {
  farmName: string;
  description: string;
  customPrompt: string;
  maxAgents: number;
  timeout: number;
}

export const CreateFarmFromFarmer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FarmCreationState;

  // Redirect if no farmer template provided
  useEffect(() => {
    if (!state?.farmerTemplate) {
      toast.error('No farmer template selected');
      navigate('/farmers');
    }
  }, [state, navigate]);

  const [step, setStep] = useState<'details' | 'config' | 'review'>('details');
  const [loading, setLoading] = useState(false);
  const [generatedYaml, setGeneratedYaml] = useState<string>('');
  const [yamlGenerating, setYamlGenerating] = useState(false);

  const [inputs, setInputs] = useState<UserInputs>({
    farmName: state?.suggestedName || '',
    description: state?.suggestedDescription || '',
    customPrompt: '',
    maxAgents: state?.maxAgents || 3,
    timeout: 3600
  });

  const farmerTemplate = state?.farmerTemplate;

  const handleInputChange = (field: keyof UserInputs, value: string | number) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const generateYaml = async () => {
    if (!farmerTemplate) return;
    
    setYamlGenerating(true);
    try {
      const response = await api.farmers.generateYaml(farmerTemplate.id, {
        farmName: inputs.farmName,
        description: inputs.description,
        customPrompt: inputs.customPrompt,
        maxAgents: inputs.maxAgents,
        timeout: inputs.timeout
      });

      if (response.data.success) {
        setGeneratedYaml(response.data.yaml);
        toast.success('YAML configuration generated!');
      } else {
        throw new Error(response.data.error || 'Failed to generate YAML');
      }
    } catch (error) {
      console.error('YAML generation failed:', error);
      toast.error('Failed to generate configuration. Please try again.');
      // Fallback to farmer's original YAML with basic substitution
      if (farmerTemplate.yaml_content) {
        const fallbackYaml = farmerTemplate.yaml_content
          .replace(/\{\{FARM_NAME\}\}/g, inputs.farmName)
          .replace(/\{\{FARM_DESCRIPTION\}\}/g, inputs.description)
          .replace(/\{\{USER_PROMPT\}\}/g, inputs.customPrompt || 'Please help me with my task.');
        setGeneratedYaml(fallbackYaml);
      }
    } finally {
      setYamlGenerating(false);
    }
  };

  const handleNext = async () => {
    if (step === 'details') {
      if (!inputs.farmName.trim()) {
        toast.error('Please enter a farm name');
        return;
      }
      setStep('config');
    } else if (step === 'config') {
      setStep('review');
      if (!generatedYaml) {
        await generateYaml();
      }
    }
  };

  const handleBack = () => {
    if (step === 'config') {
      setStep('details');
    } else if (step === 'review') {
      setStep('config');
    }
  };

  const handleLaunch = async () => {
    if (!farmerTemplate || !generatedYaml) return;
    
    setLoading(true);
    try {
      const response = await api.farmers.launch(farmerTemplate.id, {
        farmName: inputs.farmName,
        description: inputs.description,
        userPrompt: inputs.customPrompt,
        maxAgents: inputs.maxAgents,
        yamlContent: generatedYaml
      });

      if (response.data.success) {
        const { farmId } = response.data.data;
        toast.success(`Farm "${inputs.farmName}" launched successfully!`);
        
        // Navigate to the harvest page for this specific farm
        navigate(`/harvests/${farmId}`, {
          state: {
            farmId,
            farmerTemplate: farmerTemplate,
            justLaunched: true
          }
        });
      } else {
        throw new Error(response.data.error || 'Failed to launch farm');
      }
    } catch (error) {
      console.error('Farm launch failed:', error);
      toast.error('Failed to launch farm. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!farmerTemplate) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/farmers')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Farmers</span>
          </button>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
              <span className="text-lg">{farmerTemplate.agents[0]?.emoji || '🌾'}</span>
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                {farmerTemplate.title}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            {(['details', 'config', 'review'] as const).map((s, index) => (
              <React.Fragment key={s}>
                <div className={clsx(
                  'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
                  step === s 
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : index < (['details', 'config', 'review'].indexOf(step))
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-gray-300 text-gray-400'
                )}>
                  {index < (['details', 'config', 'review'].indexOf(step)) ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {index < 2 && (
                  <div className={clsx(
                    'w-12 h-0.5 transition-colors',
                    index < (['details', 'config', 'review'].indexOf(step))
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  )} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            {step === 'details' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Farm Details
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Farm Name *
                    </label>
                    <input
                      type="text"
                      value={inputs.farmName}
                      onChange={(e) => handleInputChange('farmName', e.target.value)}
                      placeholder="Enter your farm name..."
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={inputs.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Describe what you want this farm to accomplish..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Custom Instructions (Optional)
                    </label>
                    <textarea
                      value={inputs.customPrompt}
                      onChange={(e) => handleInputChange('customPrompt', e.target.value)}
                      placeholder="Any specific instructions or goals for the agents..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 'config' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Configuration
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Number of Agents
                    </label>
                    <div className="flex items-center space-x-4">
                      <Users className="w-5 h-5 text-gray-400" />
                      <input
                        type="range"
                        min="1"
                        max="8"
                        value={inputs.maxAgents}
                        onChange={(e) => handleInputChange('maxAgents', parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white w-8">
                        {inputs.maxAgents}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Timeout (seconds)
                    </label>
                    <div className="flex items-center space-x-4">
                      <Clock className="w-5 h-5 text-gray-400" />
                      <select
                        value={inputs.timeout}
                        onChange={(e) => handleInputChange('timeout', parseInt(e.target.value))}
                        className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value={1800}>30 minutes</option>
                        <option value={3600}>1 hour</option>
                        <option value={7200}>2 hours</option>
                        <option value={14400}>4 hours</option>
                      </select>
                    </div>
                  </div>

                  {/* Farmer Template Preview */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Farmer Template: {farmerTemplate.title}
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Agents:</span>
                        <div className="mt-1">
                          {farmerTemplate.agents.map((agent, i) => (
                            <div key={i} className="flex items-center space-x-2">
                              <span>{agent.emoji}</span>
                              <span className="text-gray-700 dark:text-gray-300">{agent.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Category:</span>
                        <p className="text-gray-700 dark:text-gray-300 capitalize">{farmerTemplate.category}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'review' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Review & Launch
                </h2>
                
                <div className="space-y-6">
                  {/* Farm Summary */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                      {inputs.farmName}
                    </h3>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                      {inputs.description}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-blue-600 dark:text-blue-400">
                      <span>{inputs.maxAgents} agents</span>
                      <span>{Math.floor(inputs.timeout / 3600)}h timeout</span>
                      <span>Using {farmerTemplate.title}</span>
                    </div>
                  </div>

                  {/* YAML Configuration */}
                  {yamlGenerating ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="flex items-center space-x-3">
                        <Wand2 className="w-5 h-5 animate-spin text-blue-500" />
                        <span className="text-gray-600 dark:text-gray-400">
                          Generating custom configuration...
                        </span>
                      </div>
                    </div>
                  ) : generatedYaml ? (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Generated Configuration
                      </h4>
                      <YAMLDisplay yaml={generatedYaml} farmName={inputs.farmName} />
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleBack}
                disabled={step === 'details'}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors',
                  step === 'details'
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                )}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              {step === 'review' ? (
                <button
                  onClick={handleLaunch}
                  disabled={loading || yamlGenerating || !generatedYaml}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  {loading ? (
                    <Wand2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Rocket className="w-5 h-5" />
                  )}
                  <span>{loading ? 'Launching...' : 'Launch Farm'}</span>
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <span>Next</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};