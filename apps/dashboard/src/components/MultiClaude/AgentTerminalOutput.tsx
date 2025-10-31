import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface AgentTerminalOutputProps {
  output: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const AgentTerminalOutput: React.FC<AgentTerminalOutputProps> = ({
  output,
  isExpanded,
  onToggleExpand
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleCopy = () => {
    navigator.clipboard.writeText(output.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatOutput = (line: string) => {
    // Color code different types of output
    if (line.startsWith('[ERROR]')) {
      return <span className="text-red-400">{line}</span>;
    }
    if (line.startsWith('[WARNING]')) {
      return <span className="text-yellow-400">{line}</span>;
    }
    if (line.startsWith('[SUCCESS]')) {
      return <span className="text-green-400">{line}</span>;
    }
    if (line.startsWith('[INFO]')) {
      return <span className="text-blue-400">{line}</span>;
    }
    if (line.startsWith('[STEP]')) {
      return <span className="text-purple-400 font-semibold">{line}</span>;
    }
    if (line.startsWith('>')) {
      return <span className="text-cyan-400">{line}</span>;
    }
    return <span className="text-gray-300">{line}</span>;
  };

  return (
    <div className="relative h-full bg-gray-900 dark:bg-black rounded-b-lg">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-mono text-gray-400">Terminal Output</span>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            title="Copy Output"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          
          <button
            onClick={onToggleExpand}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            title={isExpanded ? "Minimize" : "Maximize"}
          >
            {isExpanded ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={scrollRef}
        className={`overflow-y-auto overflow-x-hidden p-3 font-mono text-xs ${
          isExpanded ? 'h-96' : 'h-48'
        } transition-all duration-300`}
        style={{ 
          backgroundColor: '#0a0a0a',
          scrollbarWidth: 'thin',
          scrollbarColor: '#4b5563 #1f2937'
        }}
      >
        {output.length === 0 ? (
          <div className="text-gray-500 italic">
            Waiting for agent output...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {output.map((line, index) => (
              <motion.div
                key={`output-line-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="leading-relaxed"
              >
                <span className="text-gray-600 select-none mr-2">
                  {String(index + 1).padStart(3, '0')}
                </span>
                {formatOutput(line)}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        
        {/* Cursor */}
        {output.length > 0 && (
          <div className="inline-block w-2 h-4 bg-gray-400 animate-pulse mt-1" />
        )}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 bg-gray-800 dark:bg-gray-900 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{output.length} lines</span>
          <span className="font-mono">UTF-8</span>
        </div>
      </div>
    </div>
  );
};