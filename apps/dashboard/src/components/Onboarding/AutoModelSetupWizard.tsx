import React, { useEffect, useState } from 'react';
import { useHardwareStore, formatBytes, formatTime, getPerformanceBadgeColor, getComputeScoreColor } from '../../store/hardwareStore';
import { useModelInstallation } from '../../hooks/useModelInstallation';

interface AutoModelSetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 'detecting' | 'recommendation' | 'installing' | 'complete' | 'error';

export const AutoModelSetupWizard: React.FC<AutoModelSetupWizardProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('detecting');
  const {
    capabilities,
    recommendation,
    installationProgress,
    isInstalling,
    error,
    loading,
    detectHardware,
    getRecommendation,
    startInstallation,
    clearError,
  } = useHardwareStore();

  // Use WebSocket listener
  useModelInstallation();

  // Auto-detect hardware on mount
  useEffect(() => {
    const init = async () => {
      try {
        await detectHardware();
        await getRecommendation();
        setCurrentStep('recommendation');
      } catch (error) {
        console.error('Auto-detection failed:', error);
        setCurrentStep('error');
      }
    };

    init();
  }, [detectHardware, getRecommendation]);

  // Handle installation progress
  useEffect(() => {
    if (!installationProgress) return;

    if (installationProgress.status === 'complete') {
      setCurrentStep('complete');
    } else if (installationProgress.status === 'error') {
      setCurrentStep('error');
    } else if (isInstalling) {
      setCurrentStep('installing');
    }
  }, [installationProgress, isInstalling]);

  const handleInstall = async () => {
    clearError();
    await startInstallation();
  };

  const handleSkip = () => {
    // Save that user skipped setup
    localStorage.setItem('gpt-oss-setup-skipped', 'true');
    onSkip();
  };

  const handleComplete = () => {
    localStorage.setItem('gpt-oss-setup-completed', 'true');
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-t-lg">
          <h2 className="text-2xl font-bold mb-2">Optimize Your AI Setup</h2>
          <p className="text-blue-100">
            We'll automatically configure the best local AI model for your hardware
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep === 'detecting' && (
            <DetectingStep loading={loading} capabilities={capabilities} />
          )}

          {currentStep === 'recommendation' && (
            <RecommendationStep
              capabilities={capabilities}
              recommendation={recommendation}
              onInstall={handleInstall}
              onSkip={handleSkip}
              loading={loading}
            />
          )}

          {currentStep === 'installing' && (
            <InstallingStep
              progress={installationProgress}
              recommendation={recommendation}
            />
          )}

          {currentStep === 'complete' && (
            <CompleteStep
              recommendation={recommendation}
              onContinue={handleComplete}
            />
          )}

          {currentStep === 'error' && (
            <ErrorStep
              error={error || installationProgress?.error}
              onRetry={handleInstall}
              onSkip={handleSkip}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Detecting Hardware Step
const DetectingStep: React.FC<{ loading: boolean; capabilities: any }> = ({ loading, capabilities }) => (
  <div className="text-center py-12">
    <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
    <h3 className="text-xl font-semibold mb-2">Analyzing Your Hardware</h3>
    <p className="text-gray-600 dark:text-gray-400">
      Detecting CPU, GPU, and memory specifications...
    </p>
    {capabilities && (
      <div className="mt-4 text-sm text-gray-500">
        Found: {capabilities.cpu.cores} CPU cores, {capabilities.memory.totalGB}GB RAM
        {capabilities.gpu && `, ${capabilities.gpu.name}`}
      </div>
    )}
  </div>
);

// Recommendation Step
const RecommendationStep: React.FC<{
  capabilities: any;
  recommendation: any;
  onInstall: () => void;
  onSkip: () => void;
  loading: boolean;
}> = ({ capabilities, recommendation, onInstall, onSkip, loading }) => {
  if (!capabilities || !recommendation) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
        <p>Generating recommendation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hardware Summary */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-3 flex items-center">
          <span className="mr-2">💻</span>
          Your Hardware
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600 dark:text-gray-400">CPU</p>
            <p className="font-medium">{capabilities.cpu.model}</p>
            <p className="text-xs text-gray-500">{capabilities.cpu.cores} cores @ {capabilities.cpu.frequency.toFixed(1)} GHz</p>
          </div>
          {capabilities.gpu && (
            <div>
              <p className="text-gray-600 dark:text-gray-400">GPU</p>
              <p className="font-medium">{capabilities.gpu.name}</p>
              <p className="text-xs text-gray-500">{capabilities.gpu.vramGB}GB VRAM</p>
            </div>
          )}
          <div>
            <p className="text-gray-600 dark:text-gray-400">Memory</p>
            <p className="font-medium">{capabilities.memory.totalGB}GB RAM</p>
            <p className="text-xs text-gray-500">{capabilities.memory.availableGB}GB available</p>
          </div>
          <div>
            <p className="text-gray-600 dark:text-gray-400">Compute Score</p>
            <p className={`font-bold text-2xl ${getComputeScoreColor(capabilities.computeScore)}`}>
              {capabilities.computeScore}
            </p>
            <p className="text-xs text-gray-500">out of 100</p>
          </div>
        </div>
      </div>

      {/* Recommended Model */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6 border-2 border-blue-200 dark:border-blue-700">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center">
            <span className="mr-2">🎯</span>
            Recommended Model
          </h3>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getPerformanceBadgeColor(recommendation.performanceCategory)}`}>
            {recommendation.performanceCategory.toUpperCase()}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {recommendation.modelName.split('/').pop()}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {recommendation.modelSize} parameters • {recommendation.quantization} quantization
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <p className="text-gray-600 dark:text-gray-400 text-xs">Backend</p>
              <p className="font-semibold">{recommendation.backend === 'vllm' ? 'vLLM (GPU)' : 'llama-cpp'}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <p className="text-gray-600 dark:text-gray-400 text-xs">Context Window</p>
              <p className="font-semibold">{(recommendation.contextWindow / 1000).toFixed(0)}K tokens</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <p className="text-gray-600 dark:text-gray-400 text-xs">Download Size</p>
              <p className="font-semibold">{recommendation.downloadSizeGB.toFixed(1)} GB</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded p-3">
              <p className="text-gray-600 dark:text-gray-400 text-xs">Memory Usage</p>
              <p className="font-semibold">{recommendation.estimatedRAM} GB</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded p-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold">Why this model:</span> {recommendation.reason}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onInstall}
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Starting Installation...' : 'Install Now (Free)'}
        </button>
        <button
          onClick={onSkip}
          className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Skip
        </button>
      </div>

      <p className="text-xs text-center text-gray-500">
        Installation runs in the background. You can continue using MaiFarm while it completes.
      </p>
    </div>
  );
};

// Installing Step
const InstallingStep: React.FC<{ progress: any; recommendation: any }> = ({ progress, recommendation }) => {
  if (!progress) return null;

  const statusIcons = {
    detecting: '🔍',
    downloading: '⬇️',
    installing: '⚙️',
    configuring: '🔧',
    complete: '✅',
    error: '❌',
  };

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce">
          {statusIcons[progress.status as keyof typeof statusIcons] || '⚙️'}
        </div>
        <h3 className="text-2xl font-bold mb-2">Installing {recommendation?.modelName.split('/').pop()}</h3>
        <p className="text-gray-600 dark:text-gray-400">{progress.phase}</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-gray-600 dark:text-gray-400">{progress.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-full transition-all duration-500 ease-out"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      </div>

      {/* Download Progress (if downloading) */}
      {progress.status === 'downloading' && progress.downloadedBytes && progress.totalBytes && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Downloaded</span>
            <span className="font-mono">{formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}</span>
          </div>
          {progress.estimatedTimeRemaining && (
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Time remaining</span>
              <span>{formatTime(progress.estimatedTimeRemaining)}</span>
            </div>
          )}
        </div>
      )}

      {/* Installation Phases */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <h4 className="font-semibold mb-3 text-sm">Installation Phases</h4>
        <div className="space-y-2 text-sm">
          {[
            { phase: 'detecting', label: 'Hardware Detection', range: '0-10%' },
            { phase: 'downloading', label: 'Model Download', range: '10-50%' },
            { phase: 'installing', label: 'Dependencies', range: '50-90%' },
            { phase: 'configuring', label: 'Configuration', range: '90-100%' },
          ].map((item) => (
            <div
              key={item.phase}
              className={`flex items-center ${
                progress.status === item.phase ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500'
              }`}
            >
              <span className="mr-2">{progress.status === item.phase ? '▶' : '○'}</span>
              <span className="flex-1">{item.label}</span>
              <span className="text-xs">{item.range}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-gray-500">
        This may take 5-20 minutes depending on your internet speed and model size.
      </p>
    </div>
  );
};

// Complete Step
const CompleteStep: React.FC<{ recommendation: any; onContinue: () => void }> = ({ recommendation, onContinue }) => (
  <div className="text-center py-12 space-y-6">
    <div className="text-8xl animate-bounce">🎉</div>
    <div>
      <h3 className="text-3xl font-bold mb-2">Setup Complete!</h3>
      <p className="text-gray-600 dark:text-gray-400 text-lg">
        {recommendation?.modelName.split('/').pop()} is ready to use
      </p>
    </div>

    <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg p-6 max-w-md mx-auto">
      <h4 className="font-semibold mb-3">What's Next?</h4>
      <ul className="text-left space-y-2 text-sm">
        <li className="flex items-start">
          <span className="mr-2">✓</span>
          <span>Your AI model is configured and ready</span>
        </li>
        <li className="flex items-start">
          <span className="mr-2">✓</span>
          <span>100% free and runs completely on your device</span>
        </li>
        <li className="flex items-start">
          <span className="mr-2">✓</span>
          <span>No API keys required, fully private</span>
        </li>
        <li className="flex items-start">
          <span className="mr-2">✓</span>
          <span>Create farms using GPT-OSS as your provider</span>
        </li>
      </ul>
    </div>

    <button
      onClick={onContinue}
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors text-lg"
    >
      Start Using MaiFarm
    </button>
  </div>
);

// Error Step
const ErrorStep: React.FC<{ error?: string | null; onRetry: () => void; onSkip: () => void }> = ({ error, onRetry, onSkip }) => (
  <div className="text-center py-12 space-y-6">
    <div className="text-6xl">⚠️</div>
    <div>
      <h3 className="text-2xl font-bold mb-2">Installation Failed</h3>
      <p className="text-gray-600 dark:text-gray-400">
        {error || 'An error occurred during installation'}
      </p>
    </div>

    <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-lg p-4 max-w-md mx-auto text-left">
      <h4 className="font-semibold mb-2">Common Issues:</h4>
      <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
        <li>• Check your internet connection</li>
        <li>• Ensure you have enough disk space</li>
        <li>• Verify Python 3 is installed</li>
        <li>• Check file permissions for ~/.maifarm</li>
      </ul>
    </div>

    <div className="flex gap-3 justify-center">
      <button
        onClick={onRetry}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        Try Again
      </button>
      <button
        onClick={onSkip}
        className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Skip for Now
      </button>
    </div>
  </div>
);

export default AutoModelSetupWizard;
