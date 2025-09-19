import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Server,
  Shield,
  Activity,
  Zap,
  Box,
  Settings
} from 'lucide-react'
import { FarmTemplate, FarmSetupRequest, FarmSetupProgress } from '@/types/orchestration'
import { useOrchestrationStore } from '@/store/orchestrationStore'
import { farmOrchestrator } from '@/services/orchestration/farmOrchestrator'
import toast from 'react-hot-toast'

interface FarmSetupWizardProps {
  onComplete: (farmId: string) => void
  onCancel: () => void
}

const steps = [
  { id: 'template', label: 'Choose Template', icon: Box },
  { id: 'basics', label: 'Basic Configuration', icon: Settings },
  { id: 'agents', label: 'Agent Configuration', icon: Server },
  { id: 'security', label: 'Security Settings', icon: Shield },
  { id: 'monitoring', label: 'Monitoring Setup', icon: Activity },
  { id: 'review', label: 'Review & Launch', icon: Zap }
]

export const FarmSetupWizard: React.FC<FarmSetupWizardProps> = ({ onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [setupData, setSetupData] = useState<Partial<FarmSetupRequest>>({
    autoStart: true
  })
  const [selectedTemplate, setSelectedTemplate] = useState<FarmTemplate | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { templates, setupProgress, setSetupProgress } = useOrchestrationStore()

  useEffect(() => {
    // Load templates
    const loadTemplates = async () => {
      const farmTemplates = farmOrchestrator.getTemplates()
      useOrchestrationStore.getState().setTemplates(farmTemplates)
    }
    loadTemplates()
  }, [])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleTemplateSelect = (template: FarmTemplate) => {
    setSelectedTemplate(template)
    setSetupData({
      ...setupData,
      templateId: template.id
    })
  }

  const handleSubmit = async () => {
    if (!setupData.name || !setupData.templateId) {
      toast.error('Please complete all required fields')
      return
    }

    setIsSubmitting(true)
    
    try {
      const farm = await farmOrchestrator.setupFarm(setupData as FarmSetupRequest)
      toast.success('Farm created successfully!')
      onComplete(farm.id)
    } catch (error) {
      toast.error(`Failed to create farm: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setIsSubmitting(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <TemplateSelection templates={templates} onSelect={handleTemplateSelect} selected={selectedTemplate} />
      case 1:
        return <BasicConfiguration data={setupData} onChange={setSetupData} />
      case 2:
        return <AgentConfiguration template={selectedTemplate} data={setupData} onChange={setSetupData} />
      case 3:
        return <SecurityConfiguration template={selectedTemplate} data={setupData} onChange={setSetupData} />
      case 4:
        return <MonitoringConfiguration template={selectedTemplate} data={setupData} onChange={setSetupData} />
      case 5:
        return <ReviewAndLaunch template={selectedTemplate} data={setupData} />
      default:
        return null
    }
  }

  if (setupProgress) {
    return <SetupProgressView progress={setupProgress} />
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Create New Farm</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Follow the wizard to set up your AI agent farm
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            
            return (
              <div key={step.id} className="flex-1 relative">
                <div className="flex items-center">
                  <div
                    className={`
                      w-12 h-12 rounded-full flex items-center justify-center transition-colors
                      ${isActive ? 'bg-emerald-500 text-white' : ''}
                      ${isCompleted ? 'bg-emerald-600 text-white' : ''}
                      ${!isActive && !isCompleted ? 'bg-gray-200 dark:bg-gray-700 text-gray-500' : ''}
                    `}
                  >
                    {isCompleted ? <Check className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`
                        flex-1 h-1 mx-2 transition-colors
                        ${isCompleted ? 'bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700'}
                      `}
                    />
                  )}
                </div>
                <div className="mt-2">
                  <p className={`text-sm ${isActive ? 'font-medium' : ''}`}>
                    {step.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 min-h-[400px]"
        >
          {renderStepContent()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={currentStep === 0 ? onCancel : handlePrevious}
          className="px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          {currentStep === 0 ? 'Cancel' : 'Previous'}
        </button>

        <button
          onClick={currentStep === steps.length - 1 ? handleSubmit : handleNext}
          disabled={isSubmitting || (currentStep === 0 && !selectedTemplate)}
          className={`
            px-6 py-3 rounded-lg transition-colors flex items-center
            ${currentStep === steps.length - 1
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {currentStep === steps.length - 1 ? (
            isSubmitting ? 'Creating...' : 'Create Farm'
          ) : (
            'Next'
          )}
          <ChevronRight className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  )
}

// Template Selection Component
const TemplateSelection: React.FC<{
  templates: FarmTemplate[]
  onSelect: (template: FarmTemplate) => void
  selected: FarmTemplate | null
}> = ({ templates, onSelect, selected }) => {
  const templateIcons = {
    development: Box,
    production: Server,
    research: Activity,
    custom: Settings
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Choose a Farm Template</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select a pre-configured template that best matches your needs
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => {
          const Icon = templateIcons[template.type] || Box
          const isSelected = selected?.id === template.id
          
          return (
            <motion.div
              key={template.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(template)}
              className={`
                p-6 rounded-lg border-2 cursor-pointer transition-colors
                ${isSelected
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              <div className="flex items-start">
                <div className={`
                  p-3 rounded-lg mr-4
                  ${isSelected ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-gray-100 dark:bg-gray-800'}
                `}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">{template.name}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      {template.configuration.agents.reduce((sum, a) => sum + a.count, 0)} agents
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      {template.configuration.resources.totalCpu} CPUs
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      {template.configuration.resources.totalMemory} RAM
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// Basic Configuration Component
const BasicConfiguration: React.FC<{
  data: Partial<FarmSetupRequest>
  onChange: (data: Partial<FarmSetupRequest>) => void
}> = ({ data, onChange }) => {
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Basic Configuration</h3>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Farm Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.name || ''}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Enter farm name"
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">
            Description
          </label>
          <textarea
            value={data.description || ''}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            placeholder="Enter farm description (optional)"
            rows={3}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={data.autoStart ?? true}
              onChange={(e) => onChange({ ...data, autoStart: e.target.checked })}
              className="mr-3 w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
            />
            <span className="text-sm font-medium">
              Start farm automatically after creation
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

// Agent Configuration Component (simplified for brevity)
const AgentConfiguration: React.FC<{
  template: FarmTemplate | null
  data: Partial<FarmSetupRequest>
  onChange: (data: Partial<FarmSetupRequest>) => void
}> = ({ template }) => {
  if (!template) return null
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Agent Configuration</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Review and customize agent settings for your farm
      </p>
      
      <div className="space-y-4">
        {template.configuration.agents.map((agent, index) => (
          <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium">{agent.type}</h4>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {agent.count} instances
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>CPU: {agent.resources.cpu} cores</p>
              <p>Memory: {agent.resources.memory}</p>
              <p>Capabilities: {agent.capabilities.join(', ')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Security Configuration Component (simplified)
const SecurityConfiguration: React.FC<{
  template: FarmTemplate | null
  data: Partial<FarmSetupRequest>
  onChange: (data: Partial<FarmSetupRequest>) => void
}> = ({ template }) => {
  if (!template) return null
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Security Settings</h3>
      <div className="space-y-4">
        <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <Shield className="w-5 h-5 mr-3 text-emerald-600" />
          <div>
            <p className="font-medium">Authentication</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {template.configuration.security.authentication.required ? 'Required' : 'Optional'}
              {template.configuration.security.authentication.methods.length > 0 &&
                ` (${template.configuration.security.authentication.methods.join(', ')})`
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <Shield className="w-5 h-5 mr-3 text-emerald-600" />
          <div>
            <p className="font-medium">Encryption</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {template.configuration.security.encryption.atRest && 'At Rest '}
              {template.configuration.security.encryption.inTransit && 'In Transit'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Monitoring Configuration Component (simplified)
const MonitoringConfiguration: React.FC<{
  template: FarmTemplate | null
  data: Partial<FarmSetupRequest>
  onChange: (data: Partial<FarmSetupRequest>) => void
}> = ({ template }) => {
  if (!template) return null
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Monitoring Setup</h3>
      <div className="space-y-4">
        <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <Activity className="w-5 h-5 mr-3 text-emerald-600" />
          <div>
            <p className="font-medium">Metrics Collection</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {template.configuration.monitoring.metricsEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <AlertCircle className="w-5 h-5 mr-3 text-emerald-600" />
          <div>
            <p className="font-medium">Alerting</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {template.configuration.monitoring.alerting.enabled ? 'Enabled' : 'Disabled'}
              {template.configuration.monitoring.alerting.channels.length > 0 &&
                ` (${template.configuration.monitoring.alerting.channels.map(c => c.type).join(', ')})`
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Review and Launch Component
const ReviewAndLaunch: React.FC<{
  template: FarmTemplate | null
  data: Partial<FarmSetupRequest>
}> = ({ template, data }) => {
  if (!template) return null
  
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Review & Launch</h3>
      <div className="space-y-6">
        <div>
          <h4 className="font-medium mb-2">Farm Details</h4>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
            <p><span className="text-gray-600 dark:text-gray-400">Name:</span> {data.name}</p>
            <p><span className="text-gray-600 dark:text-gray-400">Template:</span> {template.name}</p>
            <p><span className="text-gray-600 dark:text-gray-400">Type:</span> {template.type}</p>
            {data.description && (
              <p><span className="text-gray-600 dark:text-gray-400">Description:</span> {data.description}</p>
            )}
          </div>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">Resources</h4>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
            <p><span className="text-gray-600 dark:text-gray-400">Total Agents:</span> {template.configuration.agents.reduce((sum, a) => sum + a.count, 0)}</p>
            <p><span className="text-gray-600 dark:text-gray-400">CPU:</span> {template.configuration.resources.totalCpu} cores</p>
            <p><span className="text-gray-600 dark:text-gray-400">Memory:</span> {template.configuration.resources.totalMemory}</p>
            <p><span className="text-gray-600 dark:text-gray-400">Storage:</span> {template.configuration.resources.totalStorage}</p>
          </div>
        </div>
        
        <div className="flex items-center p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
          <Check className="w-5 h-5 mr-3 text-emerald-600" />
          <p className="text-sm">
            Your farm will be created and {data.autoStart ? 'started automatically' : 'remain stopped until you start it manually'}.
          </p>
        </div>
      </div>
    </div>
  )
}

// Setup Progress View
const SetupProgressView: React.FC<{ progress: FarmSetupProgress }> = ({ progress }) => {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h3 className="text-2xl font-bold mb-6">Setting up your farm...</h3>
        
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">{progress.currentStep}</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">{progress.progress}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-600"
              initial={{ width: 0 }}
              animate={{ width: `${progress.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        
        <div className="space-y-3">
          {progress.steps.map((step, index) => (
            <div key={index} className="flex items-center">
              {step.status === 'completed' && <Check className="w-5 h-5 text-emerald-600 mr-3" />}
              {step.status === 'active' && <div className="w-5 h-5 mr-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />}
              {step.status === 'pending' && <div className="w-5 h-5 mr-3 border-2 border-gray-300 rounded-full" />}
              {step.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-500 mr-3" />}
              
              <span className={`text-sm ${step.status === 'active' ? 'font-medium' : ''}`}>
                {step.name}
              </span>
            </div>
          ))}
        </div>
        
        {progress.error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-950 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {progress.error}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}