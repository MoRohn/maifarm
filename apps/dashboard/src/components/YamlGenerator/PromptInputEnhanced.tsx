import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Info, Settings2, Wand2, X, CheckCircle } from 'lucide-react';
import { GeneratorMode } from '@/types/yamlGenerator';
import yamlGeneratorService from '@/services/yamlGeneratorService';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  mode: GeneratorMode;
  onEnhancePrompt?: (enhancedPrompt: string) => void;
}

const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  onGenerate,
  isGenerating,
  mode,
  onEnhancePrompt
}) => {
  const [showOptions, setShowOptions] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>('');
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [improvements, setImprovements] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [options, setOptions] = useState({
    num_agents: 3,
    complexity: 'moderate' as 'simple' | 'moderate' | 'complex',
    farm_type: 'development' as 'development' | 'review' | 'testing' | 'analysis' | 'creative',
    include_estimates: true,
    auto_dependencies: true
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onGenerate();
    }
  };

  const handleEnhance = async () => {
    if (!value.trim()) return;
    setIsEnhancing(true);
    try {
      const result = await yamlGeneratorService.enhancePrompt({
        prompt: value,
        context: options.farm_type,
        purpose: options.farm_type
      });
      if (result.success && result.enhanced_prompt) {
        setEnhancedPrompt(result.enhanced_prompt);
        setImprovements(result.improvements || []);
        setSuggestions(result.suggestions || []);
        setShowEnhanced(true);
      }
    } catch (error) {
      console.error('Enhancement failed:', error);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleUseEnhanced = () => {
    onChange(enhancedPrompt);
    if (onEnhancePrompt) {
      onEnhancePrompt(enhancedPrompt);
    }
    setShowEnhanced(false);
  };

  const placeholders = {
    guided: "Describe what you want to build, e.g., 'Create a farm for testing my React app with 4 agents'",
    freestyle: "Enter any description and I'll generate a complete YAML configuration for you",
    template: "Select a template and customize it with your requirements"
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-xl" />
        <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What would you like to build?
                </label>
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholders[mode]}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                  rows={3}
                />
              </div>

              {/* Enhanced Prompt Display */}
              <AnimatePresence>
                {showEnhanced && enhancedPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-semibold text-purple-900 dark:text-purple-100">Enhanced Prompt</h3>
                      </div>
                      <button
                        onClick={() => setShowEnhanced(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-800 rounded-md p-3">
                        <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                          {enhancedPrompt}
                        </pre>
                      </div>

                      {improvements.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                            Improvements Made:
                          </h4>
                          <ul className="space-y-1">
                            {improvements.map((improvement, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-purple-600 dark:text-purple-400">
                                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>{improvement}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {suggestions.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                            Additional Suggestions:
                          </h4>
                          <ul className="space-y-1">
                            {suggestions.map((suggestion, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-purple-600 dark:text-purple-400">
                                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleUseEnhanced}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                        >
                          Use Enhanced Prompt
                        </button>
                        <button
                          onClick={() => setShowEnhanced(false)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                        >
                          Keep Original
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Advanced Options Toggle */}
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                Advanced Options
                <motion.svg
                  animate={{ rotate: showOptions ? 180 : 0 }}
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </motion.svg>
              </button>

              {/* Advanced Options */}
              <motion.div
                initial={false}
                animate={{
                  height: showOptions ? 'auto' : 0,
                  opacity: showOptions ? 1 : 0
                }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Number of Agents
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={options.num_agents}
                      onChange={(e) => setOptions({ ...options, num_agents: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Complexity
                    </label>
                    <select
                      value={options.complexity}
                      onChange={(e) => setOptions({ ...options, complexity: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="simple">Simple</option>
                      <option value="moderate">Moderate</option>
                      <option value="complex">Complex</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Farm Type
                    </label>
                    <select
                      value={options.farm_type}
                      onChange={(e) => setOptions({ ...options, farm_type: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="development">Development</option>
                      <option value="review">Code Review</option>
                      <option value="testing">Testing</option>
                      <option value="analysis">Analysis</option>
                      <option value="creative">Creative</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.include_estimates}
                        onChange={(e) => setOptions({ ...options, include_estimates: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Time estimates</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.auto_dependencies}
                        onChange={(e) => setOptions({ ...options, auto_dependencies: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Auto dependencies</span>
                    </label>
                  </div>
                </div>
              </motion.div>

              {/* Enhance and Generate Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Info className="w-4 h-4" />
                  <span>Press ⌘+Enter to generate</span>
                </div>

                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEnhance}
                    disabled={!value.trim() || isEnhancing || isGenerating}
                    className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {isEnhancing ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        />
                        <span>Enhancing...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5" />
                        <span>Enhance</span>
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onGenerate}
                    disabled={!value.trim() || isGenerating}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Generate YAML</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      {mode === 'guided' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4"
        >
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            💡 Pro Tips:
          </h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• Click "Enhance" to let AI improve your prompt for better results</li>
            <li>• Be specific about the number of agents and their roles</li>
            <li>• Mention the technology stack for better step generation</li>
            <li>• Include the purpose (testing, development, review, etc.)</li>
            <li>• Add complexity indicators (simple, complex, comprehensive)</li>
          </ul>
        </motion.div>
      )}
    </div>
  );
};

export default PromptInput;