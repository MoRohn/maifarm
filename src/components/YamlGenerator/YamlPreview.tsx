import React from 'react';
import { motion } from 'framer-motion';
import { FileCode, Clock, Tag, GitBranch, Layers, Users, Cpu } from 'lucide-react';
import { YamlConfig } from '../../types/yamlGenerator';

interface YamlPreviewProps {
  yaml: YamlConfig | undefined;
  rawYaml: string;
  isGenerating: boolean;
}

const YamlPreview: React.FC<YamlPreviewProps> = ({ yaml, rawYaml, isGenerating }) => {
  if (isGenerating) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12">
        <div className="flex flex-col items-center justify-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full"
          />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
            Generating YAML configuration...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI is analyzing your prompt and creating the perfect structure
          </p>
        </div>
      </div>
    );
  }

  if (!yaml) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto">
            <FileCode className="w-10 h-10 text-gray-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
              No YAML generated yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Enter a prompt and click Generate to create your YAML configuration
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalTime = yaml.steps.reduce((sum, step) => sum + (step.estimated_time || 15), 0);
  const hours = Math.floor(totalTime / 60);
  const minutes = totalTime % 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{yaml.name}</h2>
            {yaml.description && (
              <p className="mt-2 text-blue-100">{yaml.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">
              {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
            </span>
          </div>
        </div>

        {/* Metadata */}
        {yaml.metadata && (
          <div className="mt-4 flex flex-wrap gap-2">
            {yaml.metadata.purpose && (
              <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-xs">
                <Tag className="w-3 h-3" />
                {yaml.metadata.purpose}
              </span>
            )}
            {yaml.metadata.num_agents && (
              <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-xs">
                <Layers className="w-3 h-3" />
                {yaml.metadata.num_agents} agents
              </span>
            )}
            {yaml.metadata.complexity && (
              <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-xs">
                <GitBranch className="w-3 h-3" />
                {yaml.metadata.complexity}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Agents */}
      {yaml.agents && yaml.agents.length > 0 && (
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agents ({yaml.agents.length})
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {yaml.agents.map((agent, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {agent.name}
                    </h4>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                    {agent.type}
                  </span>
                </div>
                {agent.role && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {agent.role}
                  </p>
                )}
                {agent.specialization && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 italic mb-2">
                    {agent.specialization}
                  </p>
                )}
                {agent.capabilities && agent.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.capabilities.slice(0, 3).map((cap, capIndex) => (
                      <span
                        key={capIndex}
                        className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                      >
                        {cap}
                      </span>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        +{agent.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Initial Prompt */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
          Initial Prompt
        </h3>
        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {yaml.initial_prompt}
        </p>
      </div>

      {/* Steps */}
      <div className="p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
          Build Steps ({yaml.steps.length})
        </h3>
        <div className="space-y-4">
          {yaml.steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative pl-8"
            >
              {/* Step Number */}
              <div className="absolute left-0 top-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-bold">
                {step.number}
              </div>

              {/* Step Content */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-800 dark:text-gray-200 font-medium">
                      {step.description || step.content.split('\n')[0]}
                    </p>
                    {step.description && step.content !== step.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {step.content}
                      </p>
                    )}
                  </div>
                  {step.estimated_time && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 ml-4">
                      <Clock className="w-3 h-3" />
                      <span>{step.estimated_time}m</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {step.tags && step.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {step.tags.map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="inline-block px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Dependencies */}
                {step.dependencies && step.dependencies.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Depends on: {step.dependencies.join(', ')}
                  </div>
                )}
              </div>

              {/* Connection Line */}
              {index < yaml.steps.length - 1 && (
                <div className="absolute left-3 top-8 bottom-0 w-px bg-gray-300 dark:bg-gray-700" />
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Raw YAML Preview */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
          Raw YAML
        </h3>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-gray-300 font-mono">
            <code>{rawYaml.slice(0, 500)}...</code>
          </pre>
        </div>
      </div>
    </motion.div>
  );
};

export default YamlPreview;