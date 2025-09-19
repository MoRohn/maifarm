import React, { useState } from 'react';
import { Sparkles, Wand2, AlertCircle, Copy, Download, Save } from 'lucide-react';
import { YamlEditor } from './YamlEditor';
import { PromptInput } from './PromptInput';
import { YamlTemplates } from './YamlTemplates';
import yamlGeneratorService from '@/services/yamlGeneratorService';
import { YamlGenerationRequest, YamlGenerationResponse, YamlValidationResult } from '@/types/yaml';
import { YAMLTemplate } from '@/types';
import toast from 'react-hot-toast';

export const YamlGenerator: React.FC = () => {
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResponse, setGenerationResponse] = useState<YamlGenerationResponse | null>(null);
  const [validationResult, setValidationResult] = useState<YamlValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'templates'>('generate');

  const handleGenerate = async (request: YamlGenerationRequest) => {
    setIsGenerating(true);
    try {
      const response = await yamlGeneratorService.generateYaml(request);
      setGeneratedYaml(response.yaml || '');
      setGenerationResponse({
        ...response,
        metadata: response.metadata || {},
        validation: response.validation || { valid: true, errors: [], warnings: [] }
      });
      setValidationResult(response.validation || { valid: true, errors: [], warnings: [] });
      toast.success('YAML configuration generated successfully!');
    } catch (error) {
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTemplateSelect = async (template: YAMLTemplate) => {
    try {
      setGeneratedYaml(template.yaml);
      toast.success('Template applied successfully!');
    } catch (error) {
      toast.error(`Template application failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleYamlChange = (newYaml: string) => {
    setGeneratedYaml(newYaml);
  };

  const handleValidation = (result: YamlValidationResult) => {
    setValidationResult(result);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedYaml);
    toast.success('YAML copied to clipboard!');
  };

  const downloadYaml = () => {
    const blob = new Blob([generatedYaml], { type: 'application/x-yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'farm-config.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('YAML downloaded!');
  };

  const saveConfiguration = () => {
    // This would integrate with the version control system
    toast.success('Configuration saved!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  AI-Powered YAML Generator
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Generate farm configurations using natural language
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('generate')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'generate'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  Generate
                </div>
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'templates'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Templates
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'generate' ? (
            <PromptInput onGenerate={handleGenerate} isGenerating={isGenerating} />
          ) : (
            <YamlTemplates onSelectTemplate={handleTemplateSelect} />
          )}
        </div>
      </div>

      {generatedYaml && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Generated Configuration
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Copy to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={downloadYaml}
                    className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Download YAML"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={saveConfiguration}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4">
              <YamlEditor
                value={generatedYaml}
                onChange={handleYamlChange}
                onValidation={handleValidation}
                height="400px"
              />
            </div>
          </div>

          {generationResponse && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Generation Metadata
                </h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Model</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{generationResponse.metadata.model}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Generation Time</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {generationResponse.metadata.generationTime}ms
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Tokens Used</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {generationResponse.metadata.tokensUsed.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Confidence</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${generationResponse.metadata.confidence * 100}%` }}
                          />
                        </div>
                        <span>{Math.round(generationResponse.metadata.confidence * 100)}%</span>
                      </div>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  AI Suggestions
                </h3>
                {generationResponse.suggestions.length > 0 ? (
                  <ul className="space-y-2">
                    {generationResponse.suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No additional suggestions. Your configuration looks good!
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};