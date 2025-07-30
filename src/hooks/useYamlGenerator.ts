import { useState, useCallback, useEffect } from 'react';
import yamlGeneratorService from '../services/yamlGeneratorService';
import {
  GeneratorMode,
  GeneratorState,
  YamlConfig,
  ValidationResult,
  GenerationResponse
} from '../types/yamlGenerator';

export const useYamlGenerator = () => {
  const [state, setState] = useState<GeneratorState>({
    mode: 'guided',
    currentPrompt: '',
    generatedYaml: undefined,
    rawYaml: '',
    isGenerating: false,
    isValidating: false,
    validationResult: undefined,
    selectedTemplate: undefined,
    history: []
  });

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('yamlGeneratorHistory');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setState(prev => ({ ...prev, history }));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (state.history.length > 0) {
      localStorage.setItem('yamlGeneratorHistory', JSON.stringify(state.history.slice(0, 20)));
    }
  }, [state.history]);

  const setMode = useCallback((mode: GeneratorMode) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  const setCurrentPrompt = useCallback((prompt: string) => {
    setState(prev => ({ ...prev, currentPrompt: prompt }));
  }, []);

  const generateYaml = useCallback(async (prompt: string, options?: any) => {
    setState(prev => ({ ...prev, isGenerating: true, validationResult: undefined }));

    try {
      const response = await yamlGeneratorService.generateYaml({
        prompt,
        options: {
          ...options,
          include_estimates: true,
          auto_dependencies: true
        }
      });

      if (response.success && response.yaml) {
        setState(prev => ({
          ...prev,
          generatedYaml: response.yaml,
          rawYaml: response.raw_yaml || '',
          isGenerating: false,
          history: [response, ...prev.history].slice(0, 20)
        }));

        // Auto-validate after generation
        if (response.raw_yaml) {
          validateYaml(response.raw_yaml);
        }
      } else {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          validationResult: {
            valid: false,
            errors: [{ field: 'generation', message: response.error || 'Failed to generate YAML' }],
            warnings: [],
            suggestions: []
          }
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        validationResult: {
          valid: false,
          errors: [{ field: 'generation', message: 'An error occurred while generating YAML' }],
          warnings: [],
          suggestions: []
        }
      }));
    }
  }, []);

  const validateYaml = useCallback(async (yaml: string) => {
    setState(prev => ({ ...prev, isValidating: true }));

    try {
      const result = await yamlGeneratorService.validateYaml(yaml);
      setState(prev => ({
        ...prev,
        isValidating: false,
        validationResult: result
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isValidating: false,
        validationResult: {
          valid: false,
          errors: [{ field: 'validation', message: 'Failed to validate YAML' }],
          warnings: [],
          suggestions: []
        }
      }));
    }
  }, []);

  const saveYaml = useCallback(async (config: YamlConfig, filename: string) => {
    try {
      const result = await yamlGeneratorService.saveYaml(config, filename);
      if (result.success) {
        // Show success notification
        console.log('YAML saved successfully:', result.path);
      } else {
        console.error('Failed to save YAML:', result.error);
      }
      return result;
    } catch (error) {
      console.error('Error saving YAML:', error);
      return { success: false, error: 'Failed to save YAML' };
    }
  }, []);

  const clearGeneration = useCallback(() => {
    setState(prev => ({
      ...prev,
      generatedYaml: undefined,
      rawYaml: '',
      validationResult: undefined
    }));
  }, []);

  return {
    // State
    mode: state.mode,
    currentPrompt: state.currentPrompt,
    generatedYaml: state.generatedYaml,
    rawYaml: state.rawYaml,
    isGenerating: state.isGenerating,
    isValidating: state.isValidating,
    validationResult: state.validationResult,
    selectedTemplate: state.selectedTemplate,
    history: state.history,

    // Actions
    setMode,
    setCurrentPrompt,
    generateYaml,
    validateYaml,
    saveYaml,
    clearGeneration
  };
};