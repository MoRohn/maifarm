import React from 'react';
import { Server, Zap, Shield, Eye } from 'lucide-react';
import { FarmTemplate } from '@/types/orchestration';

interface FarmTemplateSelectorProps {
  templates: FarmTemplate[];
  selectedTemplate: FarmTemplate | null;
  onSelectTemplate: (template: FarmTemplate) => void;
}

const FarmTemplateSelector: React.FC<FarmTemplateSelectorProps> = ({
  templates,
  selectedTemplate,
  onSelectTemplate
}) => {
  const getTemplateIcon = (template: FarmTemplate) => {
    switch (template.type) {
      case 'development':
        return <Server className="h-8 w-8 text-blue-500" />;
      case 'production':
        return <Zap className="h-8 w-8 text-green-500" />;
      case 'research':
        return <Eye className="h-8 w-8 text-purple-500" />;
      default:
        return <Shield className="h-8 w-8 text-gray-500" />;
    }
  };

  const getTemplateStats = (template: FarmTemplate) => {
    const totalAgents = template.configuration.agents.reduce((sum, a) => sum + a.count, 0);
    const totalCpu = template.configuration.resources.totalCpu;
    const totalMemory = template.configuration.resources.totalMemory;
    
    return { totalAgents, totalCpu, totalMemory };
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {templates.map((template) => {
        const stats = getTemplateStats(template);
        const isSelected = selectedTemplate?.id === template.id;

        return (
          <div
            key={template.id}
            onClick={() => onSelectTemplate(template)}
            className={`
              border-2 rounded-lg p-4 cursor-pointer transition-all
              ${isSelected 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }
            `}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {getTemplateIcon(template)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{template.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Agents:</span>
                    <span className="font-medium">{stats.totalAgents}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CPU:</span>
                    <span className="font-medium">{stats.totalCpu} cores</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Memory:</span>
                    <span className="font-medium">{stats.totalMemory}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {template.metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {template.configuration.monitoring.alerting.enabled && (
                  <div className="mt-2 text-xs text-green-600 flex items-center space-x-1">
                    <Shield className="h-3 w-3" />
                    <span>Production monitoring enabled</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Custom template option */}
      <div
        onClick={() => onSelectTemplate(null as any)}
        className={`
          border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all
          ${!selectedTemplate 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
        `}
      >
        <div className="text-center py-8">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Custom Configuration</h3>
          <p className="text-sm text-gray-600 mt-1">
            Start with a blank slate and configure everything yourself
          </p>
        </div>
      </div>
    </div>
  );
};

export default FarmTemplateSelector;