import React from 'react';
import { YAMLTemplate } from '@/types';

interface YamlTemplatesProps {
  onSelectTemplate: (template: YAMLTemplate) => void;
}

export const YamlTemplates: React.FC<YamlTemplatesProps> = ({ onSelectTemplate }) => {
  const templates: YAMLTemplate[] = [
    {
      id: '1',
      name: 'Basic Development Farm',
      description: 'A simple farm for development and testing',
      category: 'Development',
      yaml: `# Basic Development Farm
agents:
  - type: builder
    count: 2
    capabilities:
      - code
      - test
  - type: reviewer
    count: 1
    capabilities:
      - review
      - feedback`,
      parameters: [],
      popularity: 100,
      aiGenerated: false
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <div
          key={template.id}
          className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={() => onSelectTemplate(template)}
        >
          <h3 className="font-medium text-gray-900 dark:text-white">{template.name}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{template.description}</p>
          <span className="text-xs text-gray-500 mt-2 inline-block">{template.category}</span>
        </div>
      ))}
    </div>
  );
};