import React, { useState } from 'react';
import { Sliders, Shield, Target, Sparkles, Brain } from 'lucide-react';
import { GoWildConfig } from '@/types/goWild';

interface CreativityControlsProps {
  config: GoWildConfig;
  onUpdate: (config: GoWildConfig) => void;
  disabled?: boolean;
}

const CreativityControls: React.FC<CreativityControlsProps> = ({
  config,
  onUpdate,
  disabled = false
}) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleUpdate = (updates: Partial<GoWildConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onUpdate(newConfig);
  };

  const handleBoundaryUpdate = (updates: Partial<GoWildConfig['boundaries']>) => {
    handleUpdate({
      boundaries: { ...localConfig.boundaries, ...updates }
    });
  };

  const creativityDescriptions = [
    { min: 0, max: 20, label: 'Conservative', color: 'blue' },
    { min: 20, max: 40, label: 'Balanced', color: 'green' },
    { min: 40, max: 60, label: 'Creative', color: 'yellow' },
    { min: 60, max: 80, label: 'Adventurous', color: 'orange' },
    { min: 80, max: 100, label: 'Wild', color: 'red' }
  ];

  const getCurrentCreativityLabel = () => {
    const level = localConfig.creativityLevel;
    return creativityDescriptions.find(d => level >= d.min && level < d.max) || creativityDescriptions[4];
  };

  const creativityLabel = getCurrentCreativityLabel();

  return (
    <div className="space-y-6">
      {/* Creativity Level */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <label className="text-sm font-medium text-gray-900 dark:text-white">
              Creativity Level
            </label>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${
            creativityLabel.color === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
            creativityLabel.color === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
            creativityLabel.color === 'yellow' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
            creativityLabel.color === 'orange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' :
            'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            {creativityLabel.label} ({localConfig.creativityLevel}%)
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="100"
            value={localConfig.creativityLevel}
            onChange={(e) => handleUpdate({ creativityLevel: parseInt(e.target.value) })}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #10b981 25%, #eab308 50%, #f97316 75%, #ef4444 100%)`
            }}
          />
          <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>Conservative</span>
            <span>Wild</span>
          </div>
        </div>
      </div>

      {/* Exploration Depth */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <label className="text-sm font-medium text-gray-900 dark:text-white">
              Exploration Depth
            </label>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Level {localConfig.explorationDepth}
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          value={localConfig.explorationDepth}
          onChange={(e) => handleUpdate({ explorationDepth: parseInt(e.target.value) })}
          disabled={disabled}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          How deep agents can explore before backtracking
        </p>
      </div>

      {/* Thinking Depth */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <label className="text-sm font-medium text-gray-900 dark:text-white">
              Thinking Depth
            </label>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {localConfig.thinkingLevel === 'none' && 'None'}
            {localConfig.thinkingLevel === 'basic' && 'Basic (think)'}
            {localConfig.thinkingLevel === 'moderate' && 'Moderate (think hard)'}
            {localConfig.thinkingLevel === 'deep' && 'Deep (think harder)'}
            {localConfig.thinkingLevel === 'ultra' && 'Ultra (ultrathink)'}
            {!localConfig.thinkingLevel && 'Auto'}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="4"
            value={
              localConfig.thinkingLevel === 'none' ? 0 :
              localConfig.thinkingLevel === 'basic' ? 1 :
              localConfig.thinkingLevel === 'moderate' ? 2 :
              localConfig.thinkingLevel === 'deep' ? 3 :
              localConfig.thinkingLevel === 'ultra' ? 4 : 1
            }
            onChange={(e) => {
              const levels = ['none', 'basic', 'moderate', 'deep', 'ultra'] as const;
              handleUpdate({ thinkingLevel: levels[parseInt(e.target.value)] as typeof levels[number] });
            }}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>None</span>
            <span>Basic</span>
            <span>Moderate</span>
            <span>Deep</span>
            <span>Ultra</span>
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            <strong>Thinking depth</strong> determines how thoroughly Claude analyzes problems:
          </p>
          <ul className="mt-1 text-xs text-blue-600 dark:text-blue-300 space-y-1">
            <li>• <strong>None:</strong> Quick responses, minimal analysis</li>
            <li>• <strong>Basic:</strong> Standard reasoning (+2s)</li>
            <li>• <strong>Moderate:</strong> Enhanced analysis (+5s)</li>
            <li>• <strong>Deep:</strong> Thorough exploration (+10s)</li>
            <li>• <strong>Ultra:</strong> Maximum computation (+20s)</li>
          </ul>
          <p className="mt-2 text-xs text-blue-600 dark:text-blue-300 italic">
            Higher levels produce better quality but take longer. Auto-selects based on task complexity.
          </p>
        </div>
      </div>

      {/* Focus Areas */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-900 dark:text-white">
          Focus Areas (Optional)
        </label>
        <input
          type="text"
          placeholder="e.g., performance optimization, UI improvements"
          value={localConfig.focusAreas.join(', ')}
          onChange={(e) => handleUpdate({
            focusAreas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          disabled={disabled}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Advanced Settings */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Sliders className="w-4 h-4" />
          <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Settings</span>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Boundaries
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localConfig.boundaries.allowExternalAPIs}
                  onChange={(e) => handleBoundaryUpdate({ allowExternalAPIs: e.target.checked })}
                  disabled={disabled}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Allow External API Calls
                </span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localConfig.boundaries.allowFileSystem}
                  onChange={(e) => handleBoundaryUpdate({ allowFileSystem: e.target.checked })}
                  disabled={disabled}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Allow File System Access
                </span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localConfig.boundaries.allowNetworkRequests}
                  onChange={(e) => handleBoundaryUpdate({ allowNetworkRequests: e.target.checked })}
                  disabled={disabled}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Allow Network Requests
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Restricted Domains
              </label>
              <textarea
                placeholder="One domain per line"
                value={localConfig.boundaries.restrictedDomains.join('\n')}
                onChange={(e) => handleBoundaryUpdate({
                  restrictedDomains: e.target.value.split('\n').filter(Boolean)
                })}
                disabled={disabled}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #a855f7;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #a855f7;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-webkit-slider-track {
          background: transparent;
        }

        .slider::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export { CreativityControls };
export default CreativityControls;