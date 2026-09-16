import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Sparkles, Rocket, Beaker } from 'lucide-react';

interface BoundaryControlsProps {
  onBoundaryChange: (boundaries: ExplorationBoundaries) => void;
  currentBoundaries: ExplorationBoundaries;
  isExploring: boolean;
}

export interface ExplorationBoundaries {
  creativityLevel: number; // 0-100
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'wild';
  explorationDepth: number; // 1-10
  timeLimit: number; // minutes
  taskGeneration: {
    maxTasks: number;
    allowParallel: boolean;
    requireApproval: boolean;
  };
  constraints: {
    stayOnTopic: boolean;
    respectArchitecture: boolean;
    maintainTests: boolean;
    documentChanges: boolean;
  };
}

const riskProfiles = {
  conservative: {
    label: 'Conservative',
    icon: ShieldCheck,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    description: 'Stays within defined parameters, minimal risk'
  },
  moderate: {
    label: 'Moderate',
    icon: Beaker,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    description: 'Balanced exploration with calculated risks'
  },
  aggressive: {
    label: 'Aggressive',
    icon: Sparkles,
    color: 'text-burnt-600',
    bgColor: 'bg-burnt-50',
    borderColor: 'border-burnt-200',
    description: 'Pushes boundaries, explores novel solutions'
  },
  wild: {
    label: 'Go Wild!',
    icon: Rocket,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    description: 'Unrestricted creativity, maximum exploration'
  }
};

export const BoundaryControls: React.FC<BoundaryControlsProps> = ({
  onBoundaryChange,
  currentBoundaries,
  isExploring
}) => {
  const [boundaries, setBoundaries] = useState<ExplorationBoundaries>(currentBoundaries);

  const handleChange = (updates: Partial<ExplorationBoundaries>) => {
    const newBoundaries = { ...boundaries, ...updates };
    setBoundaries(newBoundaries);
    onBoundaryChange(newBoundaries);
  };

  const handleTaskGenerationChange = (updates: Partial<ExplorationBoundaries['taskGeneration']>) => {
    handleChange({
      taskGeneration: { ...boundaries.taskGeneration, ...updates }
    });
  };

  const handleConstraintsChange = (updates: Partial<ExplorationBoundaries['constraints']>) => {
    handleChange({
      constraints: { ...boundaries.constraints, ...updates }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 space-y-6"
    >
      <div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Exploration Boundaries
        </h3>
        
        {/* Risk Tolerance Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Risk Tolerance
          </label>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(riskProfiles).map(([key, profile]) => {
              const Icon = profile.icon;
              const isSelected = boundaries.riskTolerance === key;
              
              return (
                <button
                  key={key}
                  onClick={() => handleChange({ riskTolerance: key as ExplorationBoundaries['riskTolerance'] })}
                  disabled={isExploring}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all duration-200
                    ${isSelected 
                      ? `${profile.borderColor} ${profile.bgColor}` 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                    ${isExploring ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-6 h-6 ${isSelected ? profile.color : 'text-gray-400'}`} />
                    <div className="text-left">
                      <p className={`font-medium ${isSelected ? profile.color : 'text-gray-700 dark:text-gray-300'}`}>
                        {profile.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {profile.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Creativity Level Slider */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Creativity Level
            </label>
            <span className="text-sm font-semibold text-burnt-600 dark:text-burnt-400">
              {boundaries.creativityLevel}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={boundaries.creativityLevel}
            onChange={(e) => handleChange({ creativityLevel: parseInt(e.target.value) })}
            disabled={isExploring}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 
                     disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${boundaries.creativityLevel}%, #e5e7eb ${boundaries.creativityLevel}%, #e5e7eb 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Safe</span>
            <span>Balanced</span>
            <span>Creative</span>
            <span>Experimental</span>
          </div>
        </div>

        {/* Exploration Depth */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Exploration Depth
            </label>
            <span className="text-sm font-semibold text-burnt-600 dark:text-burnt-400">
              Level {boundaries.explorationDepth}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={boundaries.explorationDepth}
            onChange={(e) => handleChange({ explorationDepth: parseInt(e.target.value) })}
            disabled={isExploring}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Time Limit */}
        <div className="mt-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Time Limit (minutes)
          </label>
          <div className="mt-2 flex items-center space-x-3">
            <input
              type="number"
              min="5"
              max="120"
              value={boundaries.timeLimit}
              onChange={(e) => handleChange({ timeLimit: parseInt(e.target.value) })}
              disabled={isExploring}
              className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {boundaries.timeLimit === 120 ? 'No limit' : `${boundaries.timeLimit} minutes`}
            </span>
          </div>
        </div>

        {/* Task Generation Settings */}
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Task Generation
          </h4>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Max concurrent tasks</span>
              <input
                type="number"
                min="1"
                max="10"
                value={boundaries.taskGeneration.maxTasks}
                onChange={(e) => handleTaskGenerationChange({ maxTasks: parseInt(e.target.value) })}
                disabled={isExploring}
                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={boundaries.taskGeneration.allowParallel}
                onChange={(e) => handleTaskGenerationChange({ allowParallel: e.target.checked })}
                disabled={isExploring}
                className="w-4 h-4 text-burnt-600 rounded focus:ring-burnt-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Allow parallel exploration</span>
            </label>
            
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={boundaries.taskGeneration.requireApproval}
                onChange={(e) => handleTaskGenerationChange({ requireApproval: e.target.checked })}
                disabled={isExploring}
                className="w-4 h-4 text-burnt-600 rounded focus:ring-burnt-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Require approval for new tasks</span>
            </label>
          </div>
        </div>

        {/* Safety Constraints */}
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Safety Constraints
          </h4>
          
          <div className="space-y-2">
            {Object.entries({
              stayOnTopic: 'Stay within project scope',
              respectArchitecture: 'Respect existing architecture',
              maintainTests: 'Maintain test coverage',
              documentChanges: 'Document all changes'
            }).map(([key, label]) => (
              <label key={key} className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={boundaries.constraints[key as keyof ExplorationBoundaries['constraints']]}
                  onChange={(e) => handleConstraintsChange({ [key]: e.target.checked })}
                  disabled={isExploring}
                  className="w-4 h-4 text-burnt-600 rounded focus:ring-burnt-500
                           disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};