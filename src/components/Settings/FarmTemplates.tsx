import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  DocumentDuplicateIcon,
  PlusIcon,
  SparklesIcon,
  ClockIcon,
  UserGroupIcon,
  StarIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { useUserStore } from '../../store/userStore';
import { FarmTemplate } from '../../types/settings';

const defaultTemplates: FarmTemplate[] = [
  {
    id: '1',
    name: 'Code Review Assistant',
    description: 'Multi-agent code review with comprehensive analysis',
    icon: '🔍',
    agents: 3,
    steps: ['Analyze code structure', 'Check for bugs', 'Suggest improvements', 'Generate report'],
    estimatedTime: '15-20 minutes',
    tags: ['code-review', 'quality', 'automated'],
    yamlConfig: `name: Code Review Assistant
agents: 3
steps:
  - name: Analyze Structure
    agent: 0
    prompt: "Analyze the code structure and architecture"
  - name: Bug Detection
    agent: 1
    prompt: "Scan for potential bugs and security issues"
  - name: Improvements
    agent: 2
    prompt: "Suggest performance and code quality improvements"`,
    popularity: 89,
    aiGenerated: false
  },
  {
    id: '2',
    name: 'Full-Stack Application',
    description: 'Build a complete web application with frontend and backend',
    icon: '🚀',
    agents: 5,
    steps: ['Design UI/UX', 'Create frontend', 'Build API', 'Setup database', 'Deploy'],
    estimatedTime: '2-3 hours',
    tags: ['development', 'full-stack', 'web'],
    yamlConfig: `name: Full-Stack Application
agents: 5
steps:
  - name: UI/UX Design
    agent: 0
    prompt: "Design the user interface and experience"
  - name: Frontend Development
    agent: 1
    prompt: "Build the React frontend application"
  - name: API Development
    agent: 2
    prompt: "Create RESTful API endpoints"
  - name: Database Setup
    agent: 3
    prompt: "Design and implement database schema"
  - name: Deployment
    agent: 4
    prompt: "Deploy application to cloud platform"`,
    popularity: 95,
    aiGenerated: false
  }
];

export const FarmTemplates: React.FC = () => {
  const { preferences, updatePreferences } = useUserStore();
  const [templates, setTemplates] = useState<FarmTemplate[]>([
    ...defaultTemplates,
    ...(preferences?.farmTemplates || [])
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState<FarmTemplate | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const toggleFavorite = (templateId: string) => {
    setFavorites(prev => 
      prev.includes(templateId) 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

  const deleteTemplate = (templateId: string) => {
    const updated = templates.filter(t => t.id !== templateId);
    setTemplates(updated);
    updatePreferences({ 
      farmTemplates: updated.filter(t => !defaultTemplates.find(dt => dt.id === t.id))
    });
  };

  const applyTemplate = (template: FarmTemplate) => {
    // In real app, this would apply the template to create a new farm
    console.log('Applying template:', template);
    setSelectedTemplate(template);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Farm Templates
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Pre-configured templates for common farm setups
          </p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors duration-200">
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Template
        </button>
      </div>

      {/* AI Suggestion Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700"
      >
        <div className="flex items-center space-x-3">
          <SparklesIcon className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
              AI Template Suggestions Available
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
              Based on your usage patterns, we recommend trying the "API Testing Suite" template
            </p>
          </div>
          <button className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300">
            View
          </button>
        </div>
      </motion.div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map((template) => {
          const isFavorite = favorites.includes(template.id);
          const isCustom = !defaultTemplates.find(dt => dt.id === template.id);
          
          return (
            <motion.div
              key={template.id}
              whileHover={{ scale: 1.02 }}
              className="relative p-6 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 cursor-pointer"
              onClick={() => applyTemplate(template)}
            >
              {/* Favorite Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(template.id);
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-yellow-500 transition-colors"
              >
                {isFavorite ? (
                  <StarIconSolid className="w-5 h-5 text-yellow-500" />
                ) : (
                  <StarIcon className="w-5 h-5" />
                )}
              </button>

              {/* Template Content */}
              <div className="flex items-start space-x-4">
                <div className="text-3xl">{template.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">
                      {template.name}
                    </h4>
                    {template.aiGenerated && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                        <SparklesIcon className="w-3 h-3 mr-1" />
                        AI
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {template.description}
                  </p>

                  {/* Metadata */}
                  <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <UserGroupIcon className="w-4 h-4" />
                      <span>{template.agents} agents</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <ClockIcon className="w-4 h-4" />
                      <span>{template.estimatedTime}</span>
                    </div>
                    {template.popularity && (
                      <div className="flex items-center space-x-1">
                        <StarIcon className="w-4 h-4" />
                        <span>{template.popularity}% popularity</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-3 mt-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        applyTemplate(template);
                      }}
                      className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      Use Template
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTemplate(template);
                      }}
                      className="text-sm font-medium text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      Preview
                    </button>
                    {isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(template.id);
                        }}
                        className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Template Preview Modal */}
      {selectedTemplate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedTemplate(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {selectedTemplate.name}
            </h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Steps
                </h4>
                <ol className="list-decimal list-inside space-y-1">
                  {selectedTemplate.steps.map((step, index) => (
                    <li key={`step-${index}`} className="text-sm text-gray-600 dark:text-gray-400">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  YAML Configuration
                </h4>
                <pre className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                  {selectedTemplate.yamlConfig}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  applyTemplate(selectedTemplate);
                  setSelectedTemplate(null);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200 font-medium"
              >
                Use This Template
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default FarmTemplates;