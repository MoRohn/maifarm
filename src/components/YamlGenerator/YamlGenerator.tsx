import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Code, CheckCircle, AlertCircle, Download, Save, RefreshCw } from 'lucide-react';
import PromptInput from './PromptInputEnhanced';
import YamlPreview from './YamlPreview';
import YamlEditor from './YamlEditor';
import AIProviderSelector, { type AIProvider } from '../common/AIProviderSelector';
import { useYamlGenerator } from '../../hooks/useYamlGenerator';
import { GeneratorMode } from '../../types/yamlGenerator';

const YamlGenerator: React.FC = () => {
  const {
    mode,
    setMode,
    currentPrompt,
    setCurrentPrompt,
    generatedYaml,
    rawYaml,
    isGenerating,
    isValidating,
    validationResult,
    generateYaml,
    validateYaml,
    saveYaml,
    history
  } = useYamlGenerator();

  const [showEditor, setShowEditor] = useState(false);
  const [editedYaml, setEditedYaml] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude');

  const handleGenerate = useCallback(async () => {
    await generateYaml(currentPrompt, { provider: selectedProvider });
  }, [currentPrompt, selectedProvider, generateYaml]);

  const handleValidate = useCallback(async () => {
    const yamlToValidate = showEditor ? editedYaml : rawYaml;
    await validateYaml(yamlToValidate);
  }, [showEditor, editedYaml, rawYaml, validateYaml]);

  const handleSave = useCallback(async () => {
    if (generatedYaml) {
      const filename = `${generatedYaml.name}.yaml`;
      await saveYaml(generatedYaml, filename);
    }
  }, [generatedYaml, saveYaml]);

  const handleDownload = useCallback(() => {
    const yamlContent = showEditor ? editedYaml : rawYaml;
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedYaml ? `${generatedYaml.name}.yaml` : 'generated.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [showEditor, editedYaml, rawYaml, generatedYaml]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 mb-4"
        >
          <Sparkles className="w-8 h-8 text-blue-500" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AI-Powered YAML Generator
          </h1>
        </motion.div>
        <p className="text-gray-600 dark:text-gray-400">
          Generate structured YAML configurations from simple natural language prompts
        </p>
      </div>

      {/* Mode Selector */}
      <div className="flex justify-center gap-2">
        {(['guided', 'freestyle', 'template'] as GeneratorMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              mode === m
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Panel - Input */}
        <div className="space-y-4">
          <PromptInput
            value={currentPrompt}
            onChange={setCurrentPrompt}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            mode={mode}
          />

          {/* AI Provider Selection */}
          <AIProviderSelector
            value={selectedProvider}
            onChange={setSelectedProvider}
            showDetails={false}
            disabled={isGenerating}
            className="mb-4"
          />

          {/* Quick Examples */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quick Examples:
            </h3>
            <div className="space-y-2">
              {[
                'Create a farm for code review with 3 agents',
                'Build a testing farm with 5 agents for React app',
                'Set up a debugging farm to fix TypeScript errors',
                'Create an analysis farm for performance optimization'
              ].map((example, index) => (
                <button
                  key={`example-${example.substring(0, 20).replace(/\s/g, '-')}`}
                  onClick={() => setCurrentPrompt(example)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline text-left"
                >
                  → {example}
                </button>
              ))}
            </div>
          </div>

          {/* Validation Result */}
          <AnimatePresence>
            {validationResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`rounded-lg p-4 ${
                  validationResult.valid
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${
                      validationResult.valid
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}>
                      {validationResult.valid ? 'YAML is valid!' : 'Validation errors found'}
                    </p>
                    {validationResult.errors.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {validationResult.errors.map((error, index) => (
                          <li key={`error-${error.field}-${index}`} className="text-sm text-red-600 dark:text-red-400">
                            • {error.field}: {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {validationResult.suggestions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Suggestions:
                        </p>
                        <ul className="mt-1 space-y-1">
                          {validationResult.suggestions.map((suggestion, index) => (
                            <li key={`suggestion-${suggestion.substring(0, 20).replace(/\s/g, '-')}-${index}`} className="text-sm text-gray-600 dark:text-gray-400">
                              • {suggestion}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel - Preview/Editor */}
        <div className="space-y-4">
          {/* Toggle Editor/Preview */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditor(false)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !showEditor
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => {
                  setShowEditor(true);
                  setEditedYaml(rawYaml);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  showEditor
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Code className="w-4 h-4 inline mr-1" />
                Edit
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleValidate}
                disabled={!rawYaml || isValidating}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  'Validate'
                )}
              </button>
              <button
                onClick={handleDownload}
                disabled={!rawYaml}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={!generatedYaml}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {showEditor ? (
              <YamlEditor
                key="editor"
                value={editedYaml}
                onChange={setEditedYaml}
                onValidate={handleValidate}
              />
            ) : (
              <YamlPreview
                key="preview"
                yaml={generatedYaml}
                rawYaml={rawYaml}
                isGenerating={isGenerating}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent Generations
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.slice(0, 6).map((item, index) => (
              <motion.div
                key={`history-${item.timestamp}-${index}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if (item.yaml) {
                    setCurrentPrompt('');
                    // Load the historical YAML
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {item.yaml?.name || 'Unnamed Farm'}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {item.yaml?.steps.length || 0} steps
                    </p>
                  </div>
                  {item.success ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default YamlGenerator;