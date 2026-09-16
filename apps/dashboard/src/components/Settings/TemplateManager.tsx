import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Download, 
  Upload, 
  Star, 
  Trash2, 
  Edit, 
  Copy,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfigTemplate } from '@/types/settings';

const mockTemplates: ConfigTemplate[] = [
  {
    id: '1',
    name: 'Code Review Farm',
    description: 'Optimized settings for comprehensive code review with multiple agents',
    category: 'farm',
    config: {
      agents: 3,
      steps: ['lint', 'test', 'review'],
      settings: {
        notifications: { farmComplete: true, agentError: true },
        performance: { maxConcurrentAgents: 3 }
      }
    },
    isDefault: true,
    createdBy: 'system',
    createdAt: '2024-01-15',
    tags: ['code-review', 'quality', 'multi-agent']
  },
  {
    id: '2',
    name: 'Performance Optimizer',
    description: 'Settings focused on maximum performance and minimal resource usage',
    category: 'workflow',
    config: {
      settings: {
        performance: {
          animationsEnabled: false,
          hardwareAcceleration: true,
          lowPowerMode: false
        },
        storage: {
          cacheEnabled: true,
          maxCacheSize: 500
        }
      }
    },
    isDefault: false,
    createdBy: 'user',
    createdAt: '2024-02-01',
    tags: ['performance', 'optimization']
  },
  {
    id: '3',
    name: 'AI Explorer',
    description: 'Maximize AI capabilities with creative settings for exploration',
    category: 'agent',
    config: {
      aiAssistant: {
        enabled: true,
        suggestions: true,
        autoOptimize: true,
        creativityLevel: 85,
        learningEnabled: true
      }
    },
    isDefault: false,
    createdBy: 'ai',
    createdAt: '2024-02-10',
    tags: ['ai', 'creative', 'exploration']
  }
];

const TemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<ConfigTemplate[]>(mockTemplates);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleApplyTemplate = (template: ConfigTemplate) => {
    // Apply template settings
    console.log('Applying template:', template);
    // Show success notification
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleDuplicateTemplate = (template: ConfigTemplate) => {
    const newTemplate = {
      ...template,
      id: Date.now().toString(),
      name: `${template.name} (Copy)`,
      isDefault: false,
      createdBy: 'user',
      createdAt: new Date().toISOString()
    };
    setTemplates(prev => [...prev, newTemplate]);
  };

  const handleExportTemplate = (template: ConfigTemplate) => {
    const dataStr = JSON.stringify(template, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${template.name.toLowerCase().replace(/\s+/g, '-')}-template.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Configuration Templates
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Save and manage configuration templates for quick setup.
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Categories</option>
            <option value="farm">Farm</option>
            <option value="agent">Agent</option>
            <option value="workflow">Workflow</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4">
        <AnimatePresence>
          {filteredTemplates.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                No templates found. Create your first template to get started.
              </p>
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <motion.div
                key={template.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {template.name}
                      </h4>
                      {template.isDefault && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                          Default
                        </span>
                      )}
                      {template.createdBy === 'ai' && (
                        <Sparkles className="w-4 h-4 text-purple-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Category: {template.category}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Created: {new Date(template.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {template.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleApplyTemplate(template)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Apply Template"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicateTemplate(template)}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Duplicate Template"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleExportTemplate(template)}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Export Template"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    {!template.isDefault && (
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* AI Suggestion */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">
              AI Template Suggestions
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Based on your usage patterns, MaiFarm AI recommends creating a template for your most common workflow: 
              "TypeScript Debugging Farm" with 2 agents focusing on error detection and fix suggestions.
            </p>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Create Suggested Template
            </button>
          </div>
        </div>
      </div>

      {/* Import Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">Import Template</h4>
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Drop a template file here or click to browse
          </p>
          <input
            type="file"
            accept=".json"
            className="hidden"
            id="template-upload"
            onChange={(e) => {
              // Handle file upload
              console.log('File uploaded:', e.target.files?.[0]);
            }}
          />
          <label
            htmlFor="template-upload"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
          >
            Browse Files
          </label>
        </div>
      </div>
    </div>
  );
};

export default TemplateManager;