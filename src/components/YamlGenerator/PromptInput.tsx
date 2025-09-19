import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Info, Settings2 } from 'lucide-react';
import { GeneratorMode } from '@/types/yamlGenerator';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  mode: GeneratorMode;
}

const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  onGenerate,
  isGenerating,
  mode
}) => {
  const [showOptions, setShowOptions] = useState(false);
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

              {/* Generate Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Info className="w-4 h-4" />
                  <span>Press ⌘+Enter to generate</span>
                </div>

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