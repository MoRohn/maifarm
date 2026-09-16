import React, { useState } from 'react';
import { Send, Settings, Shield, Cpu, Database, Zap } from 'lucide-react';
import { YamlGenerationRequest, YamlConstraints } from '@/types/yaml';

interface PromptInputProps {
  onGenerate: (request: YamlGenerationRequest) => void;
  isGenerating: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({ onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');
  const [showConstraints, setShowConstraints] = useState(false);
  const [constraints, setConstraints] = useState<YamlConstraints>({
    maxAgents: undefined,
    requiredCapabilities: [],
    resourceLimits: {
      maxCpu: '',
      maxMemory: '',
      maxStorage: ''
    },
    complianceRequirements: []
  });

  const suggestedPrompts = [
    {
      category: "performance",
      icon: <Zap className="h-4 w-4" />,
      text: "Create a high-performance farm with auto-scaling and monitoring",
      prompt: "I need a production-ready farm configuration with auto-scaling enabled, comprehensive monitoring, and high-performance worker agents for code generation and testing"
    },
    {
      category: "security",
      icon: <Shield className="h-4 w-4" />,
      text: "Build a secure farm with compliance features",
      prompt: "Create a secure farm configuration with authentication, encryption, audit logging, and compliance with GDPR and SOC 2 standards"
    },
    {
      category: "ml",
      icon: <Cpu className="h-4 w-4" />,
      text: "Set up an ML-powered development farm",
      prompt: "Generate a farm configuration with machine learning agents for code analysis, natural language processing, and automated testing with GPU support"
    },
    {
      category: "data",
      icon: <Database className="h-4 w-4" />,
      text: "Configure a data processing farm",
      prompt: "I need a farm optimized for data processing with distributed storage, backup capabilities, and specialized data analysis agents"
    }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      const request: YamlGenerationRequest = {
        prompt: prompt.trim(),
        constraints: {
          maxAgents: constraints.maxAgents || undefined,
          requiredCapabilities: (constraints.requiredCapabilities || []).filter(cap => cap.trim()),
          resourceLimits: {
            maxCpu: constraints.resourceLimits?.maxCpu || undefined,
            maxMemory: constraints.resourceLimits?.maxMemory || undefined,
            maxStorage: constraints.resourceLimits?.maxStorage || undefined
          },
          complianceRequirements: (constraints.complianceRequirements || []).filter(req => req.trim())
        }
      };
      onGenerate(request);
    }
  };

  const handleSuggestedPrompt = (suggestedPrompt: string) => {
    setPrompt(suggestedPrompt);
  };

  const addCapability = (capability: string) => {
    if (capability && !(constraints.requiredCapabilities || []).includes(capability)) {
      setConstraints({
        ...constraints,
        requiredCapabilities: [...(constraints.requiredCapabilities || []), capability]
      });
    }
  };

  const removeCapability = (index: number) => {
    setConstraints({
      ...constraints,
      requiredCapabilities: (constraints.requiredCapabilities || []).filter((_, i) => i !== index)
    });
  };

  const addCompliance = (requirement: string) => {
    if (requirement && !(constraints.complianceRequirements || []).includes(requirement)) {
      setConstraints({
        ...constraints,
        complianceRequirements: [...(constraints.complianceRequirements || []), requirement]
      });
    }
  };

  const removeCompliance = (index: number) => {
    setConstraints({
      ...constraints,
      complianceRequirements: (constraints.complianceRequirements || []).filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Describe your farm configuration
          </label>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., I need a production-ready farm with 5 worker agents, auto-scaling, monitoring, and security features..."
              className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              rows={4}
            />
            <button
              type="button"
              onClick={() => setShowConstraints(!showConstraints)}
              className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Advanced constraints"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestedPrompts.map((suggestion, index) => (
            <button
              key={`suggestion-${suggestion.category}-${index}`}
              type="button"
              onClick={() => handleSuggestedPrompt(suggestion.prompt)}
              className="flex items-center gap-3 p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                {suggestion.icon}
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {suggestion.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showConstraints && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Advanced Constraints
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Maximum Agents
              </label>
              <input
                type="number"
                value={constraints.maxAgents || ''}
                onChange={(e) => setConstraints({
                  ...constraints,
                  maxAgents: e.target.value ? parseInt(e.target.value) : undefined
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., 10"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Required Capabilities
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCapability((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  placeholder="Press Enter to add"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(constraints.requiredCapabilities || []).map((cap, index) => (
                  <span
                    key={`capability-${cap}-${index}`}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-md"
                  >
                    {cap}
                    <button
                      type="button"
                      onClick={() => removeCapability(index)}
                      className="hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Max CPU
              </label>
              <input
                type="text"
                value={constraints.resourceLimits?.maxCpu || ''}
                onChange={(e) => setConstraints({
                  ...constraints,
                  resourceLimits: {
                    ...constraints.resourceLimits,
                    maxCpu: e.target.value
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., 4000m"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Max Memory
              </label>
              <input
                type="text"
                value={constraints.resourceLimits?.maxMemory || ''}
                onChange={(e) => setConstraints({
                  ...constraints,
                  resourceLimits: {
                    ...constraints.resourceLimits,
                    maxMemory: e.target.value
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., 8Gi"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Max Storage
              </label>
              <input
                type="text"
                value={constraints.resourceLimits?.maxStorage || ''}
                onChange={(e) => setConstraints({
                  ...constraints,
                  resourceLimits: {
                    ...constraints.resourceLimits,
                    maxStorage: e.target.value
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                placeholder="e.g., 100Gi"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Compliance Requirements
            </label>
            <div className="flex gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addCompliance(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              >
                <option value="">Select compliance requirement</option>
                <option value="GDPR">GDPR</option>
                <option value="CCPA">CCPA</option>
                <option value="SOC2">SOC 2</option>
                <option value="HIPAA">HIPAA</option>
                <option value="PCI-DSS">PCI-DSS</option>
                <option value="ISO27001">ISO 27001</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(constraints.complianceRequirements || []).map((req, index) => (
                <span
                  key={`compliance-${req}-${index}`}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs rounded-md"
                >
                  {req}
                  <button
                    type="button"
                    onClick={() => removeCompliance(index)}
                    className="hover:text-purple-900 dark:hover:text-purple-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isGenerating}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Generate YAML
            </>
          )}
        </button>
      </div>
    </div>
  );
};