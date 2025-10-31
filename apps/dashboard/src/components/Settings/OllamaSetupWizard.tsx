import React, { useState } from 'react';
import { X, Terminal, Download, CheckCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';

interface OllamaSetupWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

const OllamaSetupWizard: React.FC<OllamaSetupWizardProps> = ({ onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const getOSCommand = () => {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) {
      return {
        install: 'brew install ollama',
        start: 'ollama serve',
        pull: 'ollama pull qwen2.5-coder:7b',
        test: 'ollama run qwen2.5-coder:7b "Write hello world in Python"'
      };
    } else if (platform.includes('win')) {
      return {
        install: 'Download from https://ollama.ai/download/windows',
        start: 'ollama serve',
        pull: 'ollama pull qwen2.5-coder:7b',
        test: 'ollama run qwen2.5-coder:7b "Write hello world in Python"'
      };
    } else {
      return {
        install: 'curl -fsSL https://ollama.ai/install.sh | sh',
        start: 'ollama serve',
        pull: 'ollama pull qwen2.5-coder:7b',
        test: 'ollama run qwen2.5-coder:7b "Write hello world in Python"'
      };
    }
  };

  const commands = getOSCommand();

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(text);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const steps = [
    {
      title: 'Install Ollama',
      description: 'First, you need to install Ollama on your system.',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ollama is required to run Qwen models locally. It's a lightweight tool that manages and runs large language models.
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Installation Command</span>
              <button
                onClick={() => copyToClipboard(commands.install)}
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                {copiedCommand === commands.install ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
              {commands.install}
            </code>
          </div>

          {commands.install.includes('https://') && (
            <a
              href="https://ollama.ai/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Download from Ollama website
            </a>
          )}

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div className="ml-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Installation may take a few minutes. Please wait for it to complete before proceeding.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Start Ollama Service',
      description: 'Start the Ollama service to enable model management.',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ollama needs to be running in the background to manage and serve models.
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Command</span>
              <button
                onClick={() => copyToClipboard(commands.start)}
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                {copiedCommand === commands.start ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
              {commands.start}
            </code>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Run this command in a separate terminal window and keep it running.</p>
            <p className="mt-2">You should see output like:</p>
            <pre className="mt-2 bg-black text-green-400 p-3 rounded text-xs">
              Ollama is running on http://localhost:11434
            </pre>
          </div>
        </div>
      )
    },
    {
      title: 'Download Qwen Model',
      description: 'Download the Qwen Coder model for local code generation.',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Now we'll download the Qwen2.5 Coder model. This is optimized for code generation tasks.
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Pull Command</span>
              <button
                onClick={() => copyToClipboard(commands.pull)}
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                {copiedCommand === commands.pull ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
              {commands.pull}
            </code>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Model Sizes:</h4>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• <strong>qwen2.5-coder:1.5b</strong> - ~1GB (lightweight, 8GB RAM)</li>
              <li>• <strong>qwen2.5-coder:7b</strong> - ~4.7GB (balanced, 16GB RAM) ✓</li>
              <li>• <strong>qwen2.5-coder:32b</strong> - ~19GB (best performance, 32GB RAM)</li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex">
              <Terminal className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="ml-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Download may take 5-15 minutes depending on your internet speed.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Test Installation',
      description: 'Verify that everything is working correctly.',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Let's test the Qwen model to ensure it's working properly.
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Test Command</span>
              <button
                onClick={() => copyToClipboard(commands.test)}
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                {copiedCommand === commands.test ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
              {commands.test}
            </code>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>If successful, you should see Python code like:</p>
            <pre className="mt-2 bg-black text-green-400 p-3 rounded text-xs">
{`def hello_world():
    print("Hello, World!")

hello_world()`}
            </pre>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="ml-3">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Once you see the output, Ollama and Qwen are ready to use!
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Ollama Setup Wizard
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`flex-1 h-2 rounded ${
                  index <= currentStep
                    ? 'bg-indigo-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Step {currentStep + 1} of {steps.length}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {steps[currentStep].title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {steps[currentStep].description}
          </p>
          {steps[currentStep].content}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          {currentStep === steps.length - 1 ? (
            <button
              onClick={onComplete}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Complete Setup
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OllamaSetupWizard;