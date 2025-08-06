import React, { useState, useEffect } from 'react';
import { Settings, Download, CheckCircle, AlertCircle, Loader, HelpCircle, Terminal } from 'lucide-react';
import axios from 'axios';

interface ModelStatus {
  found: boolean;
  path?: string;
  models?: Array<{
    name: string;
    size: number;
  }>;
  error?: string;
}

interface DownloadInstructions {
  command: string;
  huggingFaceUrl?: string;
  estimatedSize: string;
  requirements: {
    diskSpace: string;
    memory: string;
  };
}

interface QwenLocalSetupProps {
  onClose?: () => void;
  onModelConfigured?: (modelName: string) => void;
}

export const QwenLocalSetup: React.FC<QwenLocalSetupProps> = ({ onClose, onModelConfigured }) => {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('7b');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [instructions, setInstructions] = useState<DownloadInstructions | null>(null);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    checkModelStatus();
    checkOllamaStatus();
  }, []);

  useEffect(() => {
    if (selectedSize) {
      fetchDownloadInstructions();
    }
  }, [selectedSize]);

  const checkModelStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/ollama/detect');
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to check model status:', error);
      setStatus({
        found: false,
        error: 'Failed to detect local models'
      });
    } finally {
      setLoading(false);
    }
  };

  const checkOllamaStatus = async () => {
    try {
      const response = await axios.get('/api/ollama/status');
      setOllamaRunning(response.data.running);
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
    }
  };

  const fetchDownloadInstructions = async () => {
    try {
      const response = await axios.get(`/api/ollama/download-instructions?size=${selectedSize}`);
      setInstructions(response.data);
    } catch (error) {
      console.error('Failed to fetch instructions:', error);
    }
  };

  const startOllama = async () => {
    try {
      setLoading(true);
      await axios.post('/api/ollama/start');
      setOllamaRunning(true);
      await checkModelStatus();
    } catch (error) {
      console.error('Failed to start Ollama:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadModel = async () => {
    if (!instructions) return;

    try {
      setDownloading(true);
      setDownloadProgress('Initializing download...');

      const eventSource = new EventSource(`/api/ollama/pull`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          setDownloadProgress(data.message);
        } else if (data.type === 'complete') {
          setDownloadProgress('Download complete!');
          eventSource.close();
          setDownloading(false);
          checkModelStatus();
          if (onModelConfigured) {
            onModelConfigured(`qwen2.5-coder:${selectedSize}`);
          }
        } else if (data.type === 'error') {
          setDownloadProgress(`Error: ${data.error}`);
          eventSource.close();
          setDownloading(false);
        }
      };

      // Start the download
      await axios.post('/api/ollama/pull', {
        modelName: `qwen2.5-coder:${selectedSize}`
      });
    } catch (error) {
      console.error('Failed to download model:', error);
      setDownloadProgress('Download failed');
      setDownloading(false);
    }
  };

  const testModel = async () => {
    try {
      setLoading(true);
      setTestResult(null);
      const response = await axios.post('/api/ollama/test', {
        prompt: 'Write a simple hello world function in Python'
      });
      setTestResult(response.data.response);
    } catch (error) {
      console.error('Failed to test model:', error);
      setTestResult('Test failed. Please ensure the model is properly installed.');
    } finally {
      setLoading(false);
    }
  };

  const modelSizes = [
    { value: '32b', label: '32B - Best Performance', memory: '32GB RAM' },
    { value: '14b', label: '14B - Balanced', memory: '16GB RAM' },
    { value: '7b', label: '7B - Recommended', memory: '8GB RAM' },
    { value: '3b', label: '3B - Lightweight', memory: '4GB RAM' },
    { value: '1.5b', label: '1.5B - Minimal', memory: '2GB RAM' },
    { value: '0.5b', label: '0.5B - Tiny', memory: '1GB RAM' }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Local Qwen Model Setup
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status Section */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          Model Status
          {loading && <Loader className="w-4 h-4 animate-spin" />}
        </h3>
        
        {status && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {status.found ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              )}
              <span className="text-sm">
                {status.found 
                  ? `Found ${status.models?.length || 0} Qwen model(s) at ${status.path}`
                  : 'No local Qwen models detected'}
              </span>
            </div>

            {status.models && status.models.length > 0 && (
              <div className="mt-2 pl-7">
                <p className="text-sm text-gray-600 dark:text-gray-400">Available models:</p>
                <ul className="list-disc list-inside text-sm">
                  {status.models.map((model, idx) => (
                    <li key={idx}>{model.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              {ollamaRunning ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="text-sm">
                Ollama service: {ollamaRunning ? 'Running' : 'Not running'}
              </span>
              {!ollamaRunning && (
                <button
                  onClick={startOllama}
                  disabled={loading}
                  className="ml-2 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  Start Ollama
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Benefits Section */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-blue-900 dark:text-blue-100">
          <HelpCircle className="w-5 h-5" />
          Why Use Local Qwen Model?
        </h3>
        <ul className="text-sm space-y-1 text-blue-800 dark:text-blue-200">
          <li>• <strong>Privacy:</strong> Your code never leaves your machine</li>
          <li>• <strong>No API costs:</strong> Completely free after initial download</li>
          <li>• <strong>Offline capability:</strong> Work without internet connection</li>
          <li>• <strong>Fast response:</strong> No network latency</li>
          <li>• <strong>Customizable:</strong> Fine-tune for your specific needs</li>
        </ul>
        <p className="text-sm mt-2 text-blue-700 dark:text-blue-300">
          Note: Claude API remains available as an alternative with your API key.
        </p>
      </div>

      {/* Download Section */}
      {!status?.found && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
          <h3 className="font-semibold mb-3">Download Qwen Model</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Select Model Size:</label>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              disabled={downloading}
            >
              {modelSizes.map(size => (
                <option key={size.value} value={size.value}>
                  {size.label} (Requires {size.memory})
                </option>
              ))}
            </select>
          </div>

          {instructions && (
            <div className="space-y-3">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded">
                <p className="text-sm font-medium mb-1">Requirements:</p>
                <ul className="text-sm text-gray-600 dark:text-gray-400">
                  <li>• Disk Space: {instructions.requirements.diskSpace}</li>
                  <li>• Memory: {instructions.requirements.memory}</li>
                </ul>
              </div>

              <div className="p-3 bg-gray-900 text-gray-100 rounded font-mono text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wide">Terminal Command</span>
                </div>
                <code>{instructions.command}</code>
              </div>

              <button
                onClick={downloadModel}
                disabled={downloading || !ollamaRunning}
                className="w-full py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {downloading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Model
                  </>
                )}
              </button>

              {downloadProgress && (
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded">
                  <p className="text-sm font-mono">{downloadProgress}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Test Section */}
      {status?.found && ollamaRunning && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
          <h3 className="font-semibold mb-3">Test Model</h3>
          <button
            onClick={testModel}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Run Test Prompt'}
          </button>
          
          {testResult && (
            <div className="mt-3 p-3 bg-gray-900 text-gray-100 rounded font-mono text-sm whitespace-pre-wrap">
              {testResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
};