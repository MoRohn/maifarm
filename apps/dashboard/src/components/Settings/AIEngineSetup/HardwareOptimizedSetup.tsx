import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Cpu,
  HardDrive,
  Zap,
  Check,
  RefreshCw,
  Download,
  Settings,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { useHardwareStore, formatBytes, getPerformanceBadgeColor, getComputeScoreColor } from '@/store/hardwareStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { toast } from 'react-hot-toast'

export const HardwareOptimizedSetup: React.FC = () => {
  const {
    capabilities,
    recommendation,
    installedModel,
    isInstalled,
    isInstalling,
    installationProgress,
    loading,
    error,
    detectHardware,
    getRecommendation,
    reinstall,
    clearError,
    // New resilience features
    retryCount,
    circuitBreakerOpen,
    healthStatus,
    resetCircuitBreaker,
    checkHealth
  } = useHardwareStore()

  const [showDetails, setShowDetails] = useState(false)
  const hasDetectedRef = React.useRef(false)

  useEffect(() => {
    // Detect hardware on mount if not already done
    if (!capabilities && !hasDetectedRef.current && !circuitBreakerOpen && !loading) {
      hasDetectedRef.current = true
      console.log('[HardwareOptimizedSetup] Initiating hardware detection on mount')
      detectHardware(false) // Use cached data if available
        .catch(err => {
          console.error('[HardwareOptimizedSetup] Initial hardware detection failed:', err)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Health check on mount
  useEffect(() => {
    checkHealth()
    const interval = setInterval(() => {
      checkHealth()
    }, 60000) // Check every minute

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReinstall = async () => {
    if (window.confirm('This will reinstall GPT-OSS with the recommended model for your hardware. Continue?')) {
      await reinstall()
    }
  }

  const handleDetectAndRecommend = async () => {
    await detectHardware(true) // Force fresh detection
    await getRecommendation()
  }

  const handleRetryWithReset = async () => {
    resetCircuitBreaker()
    clearError()
    await detectHardware(true)
  }

  const getHealthStatusColor = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'text-green-500'
      case 'degraded':
        return 'text-yellow-500'
      case 'unavailable':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Health Status */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Hardware-Optimized Setup
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Automatic GPT-OSS configuration based on your system capabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${getHealthStatusColor()}`}>
            {healthStatus.toUpperCase()}
          </span>
          {circuitBreakerOpen && (
            <span className="text-xs font-medium text-orange-500">CIRCUIT OPEN</span>
          )}
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
        >
          <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Detecting hardware capabilities...
          </p>
        </motion.div>
      )}

      {/* Error Display with Enhanced Actions */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
        >
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">{error}</p>
            {circuitBreakerOpen && (
              <div className="flex gap-2">
                <button
                  onClick={handleRetryWithReset}
                  className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline"
                >
                  Reset & Retry
                </button>
              </div>
            )}
          </div>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-600 transition-colors"
          >
            ×
          </button>
        </motion.div>
      )}

      {/* Installation Status */}
      {isInstalled && installedModel ? (
        <GlassCard className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  GPT-OSS Installed
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Ready to use locally
                </p>
              </div>
            </div>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleReinstall}
              disabled={isInstalling}
              className="bg-gradient-to-r from-emerald-500 to-green-600"
            >
              <RefreshCw className="h-4 w-4" />
              Reinstall
            </GlassButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Model</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {installedModel.recommendation.modelName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {installedModel.recommendation.modelSize} • {installedModel.recommendation.quantization || 'Full Precision'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Backend</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white uppercase">
                {installedModel.recommendation.backend}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {installedModel.recommendation.backend === 'vllm' ? 'GPU-Optimized' : 'CPU/Apple Silicon'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Performance</p>
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${getPerformanceBadgeColor(installedModel.recommendation.performanceCategory)} text-white`}>
                  {installedModel.recommendation.performanceCategory}
                </span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Context Window</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {installedModel.recommendation.contextWindow.toLocaleString()} tokens
              </p>
            </div>
          </div>

          {installedModel.modelPath && (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-mono break-all">
                {installedModel.modelPath}
              </p>
            </div>
          )}
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <div className="text-center py-8">
            <div className="inline-flex p-3 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
              <Download className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              GPT-OSS Not Installed
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Set up a local AI model optimized for your hardware
            </p>
            <GlassButton
              variant="primary"
              onClick={() => window.location.href = '/onboarding'}
              className="bg-gradient-to-r from-emerald-500 to-green-600"
            >
              Run Setup Wizard
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {/* Hardware Capabilities - Read-Only Info Section */}
      <div className="relative p-6 bg-slate-50/50 dark:bg-slate-800/30 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl">
        {/* Read-only indicator badge */}
        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Auto-Detected
          </span>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg">
              <Cpu className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                Device Capabilities
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                System hardware information (read-only)
              </p>
            </div>
          </div>
          {showDetails ? (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {capabilities ? (
                <div className="space-y-4">
                  {/* Compute Score */}
                  <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Compute Score</span>
                      <span className={`text-2xl font-bold ${getComputeScoreColor(capabilities.computeScore)}`}>
                        {capabilities.computeScore}/100
                      </span>
                    </div>
                  </div>

                  {/* CPU */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">CPU</p>
                    <p className="text-sm text-gray-900 dark:text-white mb-1">{capabilities.cpu.model}</p>
                    <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>{capabilities.cpu.cores} cores</span>
                      <span>{capabilities.cpu.frequency.toFixed(1)} GHz</span>
                      <span className="capitalize">{capabilities.cpu.vendor}</span>
                    </div>
                  </div>

                  {/* GPU */}
                  {capabilities.gpu ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">GPU</p>
                      <p className="text-sm text-gray-900 dark:text-white mb-1">{capabilities.gpu.name}</p>
                      <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                        <span>{capabilities.gpu.vramGB} GB VRAM</span>
                        <span className="capitalize">{capabilities.gpu.vendor}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No dedicated GPU detected</p>
                    </div>
                  )}

                  {/* Memory */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-semibold">Memory</p>
                    <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Total: {formatBytes(capabilities.memory.totalGB * 1024 * 1024 * 1024)}</span>
                      <span>Available: {formatBytes(capabilities.memory.availableGB * 1024 * 1024 * 1024)}</span>
                    </div>
                  </div>

                  <GlassButton
                    variant="ghost"
                    onClick={handleDetectAndRecommend}
                    disabled={loading}
                    className="w-full"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Re-detect Hardware
                  </GlassButton>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Hardware not yet detected
                  </p>
                  <GlassButton
                    variant="primary"
                    onClick={detectHardware}
                    disabled={loading}
                  >
                    <Cpu className="h-4 w-4" />
                    Detect Hardware
                  </GlassButton>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recommended Model (if not installed) */}
      {!isInstalled && recommendation && (
        <GlassCard className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recommended Model
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Optimized for your hardware
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                {recommendation.modelName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {recommendation.modelSize} • {recommendation.backend.toUpperCase()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Download Size</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {recommendation.downloadSizeGB.toFixed(1)} GB
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Estimated RAM</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {recommendation.estimatedRAM} GB
                </p>
              </div>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {recommendation.reason}
              </p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
