import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Command, 
  History, 
  ChevronUp, 
  ChevronDown,
  Zap,
  FileCode,
  X
} from 'lucide-react';

interface TerminalControlsProps {
  onSendCommand: (command: string) => Promise<any>;
  currentCommand: string;
  onCommandChange: (command: string) => void;
  commandHistory: string[];
  onNavigateHistory: (direction: 'up' | 'down') => void;
  suggestions: string[];
  isExecuting: boolean;
  placeholder?: string;
  showTemplates?: boolean;
}

export const TerminalControls: React.FC<TerminalControlsProps> = ({
  onSendCommand,
  currentCommand,
  onCommandChange,
  commandHistory,
  onNavigateHistory,
  suggestions,
  isExecuting,
  placeholder = "Enter command...",
  showTemplates = true
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplatesView, setShowTemplatesView] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Command templates
  const commandTemplates = {
    'System': [
      'ps aux | grep claude',
      'top -p $(pgrep claude)',
      'df -h',
      'free -h',
      'uptime',
      'netstat -tulpn'
    ],
    'Git': [
      'git status',
      'git log --oneline -10',
      'git diff',
      'git add .',
      'git commit -m "Update"',
      'git pull origin main'
    ],
    'Node.js': [
      'npm install',
      'npm run build',
      'npm run test',
      'npm run dev',
      'npm audit',
      'node --version'
    ],
    'File Operations': [
      'ls -la',
      'pwd',
      'find . -name "*.js" -type f',
      'grep -r "TODO" .',
      'tail -f *.log',
      'du -h --max-depth=1'
    ]
  };

  // Handle command submission
  const handleSendCommand = async () => {
    if (!currentCommand.trim() || isExecuting) return;
    
    try {
      await onSendCommand(currentCommand.trim());
      setShowSuggestions(false);
      setShowHistory(false);
    } catch (error) {
      console.error('Error sending command:', error);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        onCommandChange(suggestions[selectedSuggestion]);
        setShowSuggestions(false);
      } else {
        handleSendCommand();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedSuggestion(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
      } else {
        onNavigateHistory('up');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedSuggestion(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
      } else {
        onNavigateHistory('down');
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowHistory(false);
      setShowTemplatesView(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        onCommandChange(suggestions[0]);
        setShowSuggestions(false);
      }
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onCommandChange(value);
    
    if (value.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
      setSelectedSuggestion(0);
    } else {
      setShowSuggestions(false);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: string) => {
    onCommandChange(template);
    setShowTemplatesView(false);
    inputRef.current?.focus();
  };

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      {/* Main command input */}
      <div className="relative">
        <div className="flex items-center space-x-3">
          <span className="text-green-400 font-mono text-lg">$</span>
          
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-gray-900 text-gray-300 font-mono text-sm outline-none placeholder-gray-600 px-3 py-2 rounded border border-gray-700 focus:border-blue-600 transition-colors pr-10"
              disabled={isExecuting}
            />
            
            {/* Clear button */}
            {currentCommand && (
              <button
                onClick={() => onCommandChange('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            {/* Templates */}
            {showTemplates && (
              <button
                onClick={() => setShowTemplatesView(!showTemplatesView)}
                className={`p-2 rounded transition-colors ${
                  showTemplatesView ? 'bg-purple-600 text-white' : 'hover:bg-gray-700 text-gray-400'
                }`}
                title="Command Templates"
              >
                <FileCode className="w-4 h-4" />
              </button>
            )}

            {/* History */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded transition-colors ${
                showHistory ? 'bg-yellow-600 text-white' : 'hover:bg-gray-700 text-gray-400'
              }`}
              title="Command History"
              disabled={commandHistory.length === 0}
            >
              <History className="w-4 h-4" />
            </button>

            {/* Send */}
            <button
              onClick={handleSendCommand}
              disabled={!currentCommand.trim() || isExecuting}
              className={`p-2 rounded transition-colors flex items-center space-x-1 ${
                currentCommand.trim() && !isExecuting
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
              title="Send Command (Enter)"
            >
              {isExecuting ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-8 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onCommandChange(suggestion);
                    setShowSuggestions(false);
                  }}
                  className={`w-full text-left px-3 py-2 font-mono text-sm transition-colors ${
                    index === selectedSuggestion
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {showHistory && commandHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 bg-gray-700 rounded-lg border border-gray-600 overflow-hidden"
          >
            <div className="px-3 py-2 bg-gray-800 border-b border-gray-600 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">Command History</span>
              <span className="text-xs text-gray-500">{commandHistory.length} commands</span>
            </div>
            <div className="max-h-32 overflow-y-auto">
              {commandHistory.slice(-10).reverse().map((command, index) => (
                <button
                  key={index}
                  onClick={() => {
                    onCommandChange(command);
                    setShowHistory(false);
                  }}
                  className="w-full text-left px-3 py-1.5 font-mono text-xs text-gray-300 hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                >
                  {command}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Templates panel */}
      <AnimatePresence>
        {showTemplatesView && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 bg-gray-700 rounded-lg border border-gray-600 overflow-hidden"
          >
            <div className="px-3 py-2 bg-gray-800 border-b border-gray-600">
              <span className="text-xs font-medium text-gray-300">Command Templates</span>
            </div>
            <div className="p-3 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(commandTemplates).map(([category, commands]) => (
                  <div key={category}>
                    <h4 className="text-xs font-medium text-gray-400 mb-2">{category}</h4>
                    <div className="space-y-1">
                      {commands.map((command, index) => (
                        <button
                          key={index}
                          onClick={() => handleTemplateSelect(command)}
                          className="w-full text-left px-2 py-1 font-mono text-xs text-gray-300 hover:bg-gray-600 rounded transition-colors"
                          title={command}
                        >
                          <span className="truncate block">{command}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help text */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <span>↑↓ Navigate history/suggestions</span>
          <span>Tab: Autocomplete</span>
          <span>Enter: Send</span>
          <span>Esc: Close panels</span>
        </div>
        {commandHistory.length > 0 && (
          <span>{commandHistory.length} commands in history</span>
        )}
      </div>
    </div>
  );
};