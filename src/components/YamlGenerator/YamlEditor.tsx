import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, CheckCircle } from 'lucide-react';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: () => void;
}

const YamlEditor: React.FC<YamlEditorProps> = ({ value, onChange, onValidate }) => {
  const [copied, setCopied] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      // Auto-resize textarea
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(400, textareaRef.current.scrollHeight)}px`;
    }
  }, [value]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab key handling for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      // Reset cursor position
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
    
    // Validate on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onValidate) {
      e.preventDefault();
      onValidate();
    }
  };

  const getLineNumbers = () => {
    const lines = value.split('\n');
    return lines.map((_, index) => index + 1).join('\n');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative bg-gray-900 rounded-xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="ml-3 text-sm text-gray-400 font-mono">config.yaml</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          {copied ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Editor */}
      <div className="relative flex">
        {/* Line Numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gray-850 border-r border-gray-800">
          <pre className="p-4 text-gray-500 text-sm font-mono text-right select-none">
            {getLineNumbers()}
          </pre>
        </div>

        {/* Code Editor */}
        <div className="flex-1 pl-12">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-4 bg-transparent text-gray-300 font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
            placeholder="# Enter your YAML configuration here..."
            style={{ minHeight: '400px' }}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>YAML</span>
          <span>{value.split('\n').length} lines</span>
          <span>{value.length} characters</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Press ⌘+Enter to validate</span>
        </div>
      </div>

      {/* Syntax Highlighting Overlay (simplified) */}
      <style jsx>{`
        textarea {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          line-height: 1.5;
          tab-size: 2;
        }
        
        /* Custom scrollbar for dark theme */
        textarea::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        
        textarea::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        
        textarea::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
        }
        
        textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </motion.div>
  );
};

export default YamlEditor;