import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../services/apiClient';

/**
 * Hardware Store with Advanced Resilience Features
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Persistent caching across sessions
 * - Circuit breaker pattern
 * - Health check monitoring
 * - Graceful degradation
 */

// Circuit breaker state
let circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
let failureCount = 0;
let lastFailureTime = 0;
const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT = 30000; // 30 seconds

// Types from backend
export interface CPUInfo {
  model: string;
  cores: number;
  threads: number;
  architecture: string;
  frequency: number;
  vendor: 'intel' | 'amd' | 'apple' | 'unknown';
  isAppleSilicon: boolean;
}

export interface GPUInfo {
  name: string;
  vramGB: number;
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  computeCapability?: string;
  cudaCores?: number;
  metalSupport?: boolean;
}

export interface MemoryInfo {
  totalGB: number;
  availableGB: number;
  swapGB: number;
}

export interface HardwareCapabilities {
  cpu: CPUInfo;
  gpu: GPUInfo | null;
  memory: MemoryInfo;
  platform: string;
  arch: string;
  hasNvidiaGPU: boolean;
  hasAMDGPU: boolean;
  hasAppleSilicon: boolean;
  computeScore: number;
  timestamp: string;
}

export interface ModelRecommendation {
  modelName: string;
  modelSize: string;
  quantization: string;
  backend: 'vllm' | 'llama-cpp';
  estimatedVRAM: number;
  estimatedRAM: number;
  contextWindow: number;
  downloadURL?: string;
  downloadSizeGB: number;
  recommendationScore: number;
  performanceCategory: 'optimal' | 'good' | 'acceptable' | 'minimal';
  reason: string;
}

export interface InstallationProgress {
  status: 'detecting' | 'downloading' | 'installing' | 'configuring' | 'complete' | 'error';
  phase: string;
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  currentFile?: string;
  error?: string;
  recommendation?: ModelRecommendation;
  capabilities?: HardwareCapabilities;
  installPath?: string;
  estimatedTimeRemaining?: number;
}

export interface InstalledModelInfo {
  recommendation: ModelRecommendation;
  modelPath?: string;
  installedAt: string;
}

interface HardwareStore {
  // State
  capabilities: HardwareCapabilities | null;
  recommendation: ModelRecommendation | null;
  installationProgress: InstallationProgress | null;
  isInstalled: boolean;
  isInstalling: boolean;
  installedModel: InstalledModelInfo | null;
  error: string | null;
  loading: boolean;

  // New: Resilience state
  lastSuccessfulFetch: number | null;
  retryCount: number;
  circuitBreakerOpen: boolean;
  healthStatus: 'healthy' | 'degraded' | 'unavailable';

  // Actions
  detectHardware: (force?: boolean) => Promise<void>;
  getRecommendation: () => Promise<void>;
  startInstallation: () => Promise<void>;
  checkInstallationStatus: () => Promise<void>;
  reinstall: () => Promise<void>;
  updateProgress: (progress: InstallationProgress) => void;
  clearError: () => void;
  reset: () => void;

  // New: Resilience actions
  checkHealth: () => Promise<boolean>;
  resetCircuitBreaker: () => void;
}

const initialState = {
  capabilities: null,
  recommendation: null,
  installationProgress: null,
  isInstalled: false,
  isInstalling: false,
  installedModel: null,
  error: null,
  loading: false,
  lastSuccessfulFetch: null,
  retryCount: 0,
  circuitBreakerOpen: false,
  healthStatus: 'healthy' as const,
};


/**
 * Check if circuit breaker allows requests
 */
function canMakeRequest(): boolean {
  if (circuitBreakerState === 'CLOSED') {
    return true;
  }

  if (circuitBreakerState === 'OPEN') {
    const now = Date.now();
    if (now - lastFailureTime > RESET_TIMEOUT) {
      circuitBreakerState = 'HALF_OPEN';
      console.info('[HardwareStore] Circuit breaker half-open, allowing test request');
      return true;
    }
    return false;
  }

  // HALF_OPEN state allows one request
  return true;
}

export const useHardwareStore = create<HardwareStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      /**
       * Check health of hardware detection service
       */
      checkHealth: async (): Promise<boolean> => {
        try {
          const response = await apiClient.get('/auto-model-setup/status', {
            timeout: 5000
          });

          const isHealthy = response.data.success;
          set({
            healthStatus: isHealthy ? 'healthy' : 'degraded'
          });

          return isHealthy;
        } catch (error) {
          set({ healthStatus: 'unavailable' });
          return false;
        }
      },

      /**
       * Reset circuit breaker manually
       */
      resetCircuitBreaker: () => {
        circuitBreakerState = 'CLOSED';
        failureCount = 0;
        set({ circuitBreakerOpen: false, error: null });
        console.info('[HardwareStore] Circuit breaker manually reset');
      },

      /**
       * Detect hardware capabilities with resilience
       */
      detectHardware: async (force: boolean = false) => {
        // Check if we have cached data and force is false
        if (!force && get().capabilities && get().lastSuccessfulFetch) {
          const cacheAge = Date.now() - get().lastSuccessfulFetch!;
          if (cacheAge < 300000) { // 5 minute cache (increased from 1 minute)
            console.debug('[HardwareStore] Using cached hardware capabilities');
            return;
          }
        }

        // Check circuit breaker
        if (!canMakeRequest()) {
          set({
            error: 'Service temporarily unavailable. Please try again in a moment.',
            circuitBreakerOpen: true
          });
          return;
        }

        set({ loading: true, error: null, retryCount: 0 });

        try {
          // Use longer timeout for hardware detection (can involve shell commands)
          const response = await apiClient.get('/auto-model-setup/hardware', {
            timeout: 15000 // 15 seconds should be sufficient for most systems
          });

          if (!response.data.success) {
            throw new Error(response.data.error || 'Hardware detection failed');
          }

          // Success - reset circuit breaker
          failureCount = 0;
          if (circuitBreakerState !== 'CLOSED') {
            circuitBreakerState = 'CLOSED';
            console.info('[HardwareStore] Circuit breaker closed after successful hardware detection');
          }

          set({
            capabilities: response.data.capabilities,
            loading: false,
            lastSuccessfulFetch: Date.now(),
            healthStatus: 'healthy',
            circuitBreakerOpen: false,
            retryCount: 0
          });
        } catch (error) {
          let errorMessage = 'Failed to detect hardware';

          if (error instanceof Error) {
            if (error.message.includes('Network Error') || error.message.includes('ECONNREFUSED')) {
              errorMessage = 'Cannot connect to MaiFarm backend. Please ensure the server is running with "npm run start"';
              set({ healthStatus: 'unavailable' });
            } else if (error.message.includes('timeout')) {
              errorMessage = 'Hardware detection timed out. Using default configuration. Your system may still work with GPT-OSS.';
              set({ healthStatus: 'degraded' });
            } else if (error.message.includes('Command timeout')) {
              errorMessage = 'System command timed out during hardware detection. GPT-OSS will use safe default settings.';
              set({ healthStatus: 'degraded' });
            } else {
              errorMessage = `Hardware detection issue: ${error.message}. Default model will be recommended.`;
            }
          }

          console.error('[HardwareStore] Hardware detection failed:', error);

          // Record failure for circuit breaker
          failureCount++;
          if (failureCount >= FAILURE_THRESHOLD) {
            circuitBreakerState = 'OPEN';
            lastFailureTime = Date.now();
          }

          set({
            error: errorMessage,
            loading: false,
            circuitBreakerOpen: circuitBreakerState === 'OPEN'
          });
        }
      },

  /**
   * Get model recommendation based on hardware
   */
  getRecommendation: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/auto-model-setup/recommend');

      if (response.data.success) {
        set({
          recommendation: response.data.recommendation,
          loading: false,
        });
      } else {
        throw new Error('Failed to get recommendation');
      }
    } catch (error) {
      let errorMessage = 'Failed to get recommendation';

      // Provide helpful error message if backend is not running
      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Cannot connect to MaiFarm backend. Please ensure the server is running with "npm run start"';
        } else {
          errorMessage = error.message;
        }
      }

      console.error('Recommendation error:', error);
      set({
        error: errorMessage,
        loading: false,
      });
    }
  },

  /**
   * Start automatic model installation
   */
  startInstallation: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/auto-model-setup/install');

      if (response.data.success) {
        set({
          isInstalling: true,
          installationProgress: response.data.progress,
          loading: false,
        });
      } else {
        throw new Error(response.data.error || 'Failed to start installation');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start installation';
      console.error('Installation error:', error);
      set({
        error: errorMessage,
        loading: false,
        isInstalling: false,
      });
    }
  },

  /**
   * Check installation status
   */
  checkInstallationStatus: async () => {
    try {
      const response = await apiClient.get('/auto-model-setup/status');

      if (response.data.success) {
        set({
          isInstalled: response.data.isInstalled,
          isInstalling: response.data.isInstalling,
          installedModel: response.data.installedModel,
          installationProgress: response.data.progress,
        });

        // If installation completed, clear installing flag
        if (response.data.isInstalled && get().isInstalling) {
          set({ isInstalling: false });
        }
      }
    } catch (error) {
      console.error('Status check error:', error);
      // Don't set error for status checks - non-critical
    }
  },

  /**
   * Reinstall with different configuration
   */
  reinstall: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/auto-model-setup/reinstall');

      if (response.data.success) {
        set({
          isInstalling: true,
          installationProgress: response.data.progress,
          loading: false,
        });
      } else {
        throw new Error(response.data.error || 'Failed to start reinstallation');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start reinstallation';
      console.error('Reinstallation error:', error);
      set({
        error: errorMessage,
        loading: false,
        isInstalling: false,
      });
    }
  },

  /**
   * Update installation progress (called by WebSocket listener)
   */
  updateProgress: (progress: InstallationProgress) => {
    set({
      installationProgress: progress,
      isInstalling: progress.status !== 'complete' && progress.status !== 'error',
    });

    // If installation completed successfully
    if (progress.status === 'complete') {
      set({
        isInstalled: true,
        isInstalling: false,
      });

      // Refresh installation status to get installed model info
      get().checkInstallationStatus();
    }

    // If installation failed
    if (progress.status === 'error') {
      set({
        error: progress.error || 'Installation failed',
        isInstalling: false,
      });
    }
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Reset store to initial state
   */
  reset: () => {
    circuitBreakerState = 'CLOSED';
    failureCount = 0;
    set(initialState);
  },
    }),
    {
      name: 'hardware-store',
      partialize: (state) => ({
        capabilities: state.capabilities,
        recommendation: state.recommendation,
        lastSuccessfulFetch: state.lastSuccessfulFetch,
        isInstalled: state.isInstalled,
        installedModel: state.installedModel
      })
    }
  )
);

// Helper functions for formatting
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export const getPerformanceBadgeColor = (category: string): string => {
  switch (category) {
    case 'optimal':
      return 'bg-green-500';
    case 'good':
      return 'bg-blue-500';
    case 'acceptable':
      return 'bg-yellow-500';
    case 'minimal':
      return 'bg-gray-500';
    default:
      return 'bg-gray-400';
  }
};

export const getComputeScoreColor = (score: number): string => {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-blue-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-gray-500';
};
