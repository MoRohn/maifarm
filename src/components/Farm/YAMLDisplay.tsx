import React from 'react';
import { motion } from 'framer-motion';
import { Copy, Download, FileCode, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';

interface YAMLDisplayProps {
  yaml: string;
  farmName: string;
  className?: string;
}

export const YAMLDisplay: React.FC<YAMLDisplayProps> = ({ yaml, farmName, className }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    toast.success('YAML copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${farmName.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('YAML file downloaded');
  };

  // Parse YAML for formatted display
  const formatYAML = (yamlString: string) => {
    const lines = yamlString.split('\n');
    return lines.map((line, index) => {
      const indent = line.search(/\S/);
      const isKey = line.includes(':') && !line.trim().startsWith('-');
      const isArrayItem = line.trim().startsWith('-');
      const isComment = line.trim().startsWith('#');
      
      return (
        <div key={index} className="font-mono text-sm leading-relaxed">
          <span style={{ marginLeft: `${indent * 0.5}rem` }}>
            {isComment ? (
              <span className="text-gray-500 dark:text-gray-400">{line}</span>
            ) : isKey ? (
              <>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  {line.split(':')[0].trim()}
                </span>
                <span className="text-gray-600 dark:text-gray-400">:</span>
                <span className="text-green-600 dark:text-green-400">
                  {line.split(':').slice(1).join(':').trim()}
                </span>
              </>
            ) : isArrayItem ? (
              <>
                <span className="text-purple-600 dark:text-purple-400">-</span>
                <span className="text-gray-800 dark:text-gray-200 ml-2">
                  {line.substring(line.indexOf('-') + 1).trim()}
                </span>
              </>
            ) : (
              <span className="text-gray-800 dark:text-gray-200">{line}</span>
            )}
          </span>
        </div>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('space-y-4', className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-apple">
            <FileCode className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white">
              YAML Configuration
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Auto-generated farm configuration
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCopy}
            className={clsx(
              'flex items-center space-x-2 px-3 py-1.5 rounded-apple text-sm font-medium transition-all',
              copied
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            )}
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 rounded-apple text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </motion.button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 rounded-apple p-6 border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <div className="space-y-1">
          {formatYAML(yaml)}
        </div>
      </div>

      <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-apple">
        <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Configuration validated successfully
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Your farm configuration has been generated based on your specifications and is ready to deploy.
          </p>
        </div>
      </div>
    </motion.div>
  );
};