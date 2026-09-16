import React from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface OnboardingStep {
  id: string
  label: string
  completed: boolean
  current: boolean
}

interface OnboardingProgressBarProps {
  steps: OnboardingStep[]
  currentStep: number
  className?: string
}

export const OnboardingProgressBar: React.FC<OnboardingProgressBarProps> = ({
  steps,
  currentStep,
  className = ''
}) => {
  return (
    <div className={`w-full px-4 py-6 ${className}`}>
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-700" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-green-500 transition-all duration-500"
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />

        {/* Steps */}
        <div className="relative flex justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep
            const isCurrent = index === currentStep
            const isUpcoming = index > currentStep

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex flex-col items-center"
              >
                {/* Step Circle */}
                <div
                  className={`
                    relative z-10 w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-300 border-2
                    ${isCompleted
                      ? 'bg-green-500 border-green-500'
                      : isCurrent
                      ? 'bg-gray-800 border-green-500 animate-pulse'
                      : 'bg-gray-800 border-gray-600'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <span
                      className={`
                        text-sm font-semibold
                        ${isCurrent ? 'text-green-400' : 'text-gray-400'}
                      `}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Step Label */}
                <span
                  className={`
                    mt-2 text-xs font-medium text-center max-w-[80px]
                    ${isCompleted
                      ? 'text-green-400'
                      : isCurrent
                      ? 'text-white'
                      : 'text-gray-500'
                    }
                  `}
                >
                  {step.label}
                </span>

                {/* Current Step Indicator */}
                {isCurrent && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute -bottom-8 text-xs text-green-400 font-medium"
                  >
                    Current Step
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default OnboardingProgressBar