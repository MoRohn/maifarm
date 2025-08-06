import React, { useMemo } from 'react';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import { PipelineStage } from '../../types/monitoring';
import { CheckCircle, Clock, AlertCircle, Circle } from 'lucide-react';

interface StageProgressProps {
  stageName: string;
  stage: PipelineStage;
  isActive: boolean;
}

const StageProgress: React.FC<StageProgressProps> = ({ stageName, stage, isActive }) => {
  const getStageIcon = () => {
    switch (stage.status) {
      case 'complete':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-6 h-6 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      default:
        return <Circle className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStageColor = () => {
    switch (stage.status) {
      case 'complete': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const formatStageName = (name: string) => {
    return name.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getDuration = () => {
    if (stage.startTime && stage.endTime) {
      const start = new Date(stage.startTime).getTime();
      const end = new Date(stage.endTime).getTime();
      const duration = Math.round((end - start) / 1000);
      return `${duration}s`;
    }
    return null;
  };

  return (
    <div className={`relative ${isActive ? 'scale-105' : ''} transition-transform`}>
      <div className="flex items-center space-x-3 p-4 bg-white rounded-lg shadow-sm border-2 border-transparent hover:border-blue-200 transition-colors">
        {getStageIcon()}
        
        <div className="flex-1">
          <h4 className="font-semibold text-gray-800">{formatStageName(stageName)}</h4>
          
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{stage.status === 'pending' ? 'Waiting...' : `${stage.progress}%`}</span>
              {getDuration() && <span>{getDuration()}</span>}
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getStageColor()}`}
                style={{ width: `${stage.progress}%` }}
              />
            </div>
          </div>

          {stage.outputs && stage.outputs.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              <p className="font-medium">Outputs:</p>
              <ul className="list-disc list-inside">
                {stage.outputs.slice(0, 2).map((output, idx) => (
                  <li key={idx} className="truncate">{output}</li>
                ))}
                {stage.outputs.length > 2 && (
                  <li className="text-gray-500">+{stage.outputs.length - 2} more</li>
                )}
              </ul>
            </div>
          )}

          {stage.error && (
            <p className="mt-2 text-xs text-red-600 font-medium">{stage.error}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const PipelineProgress: React.FC = () => {
  const { pipelineStages, projectStatus } = useInfogWebSocket();

  const overallProgress = useMemo(() => {
    const stages = Object.values(pipelineStages);
    if (stages.length === 0) return 0;
    
    const totalProgress = stages.reduce((sum, stage) => sum + stage.progress, 0);
    return Math.round(totalProgress / stages.length);
  }, [pipelineStages]);

  const activeStage = useMemo(() => {
    return Object.entries(pipelineStages).find(
      ([_, stage]) => stage.status === 'in_progress'
    )?.[0] || null;
  }, [pipelineStages]);

  const getProjectStatusColor = () => {
    switch (projectStatus) {
      case 'complete': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'initializing': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Pipeline Progress</h2>
            <p className="text-sm text-gray-600 mt-1">
              Trump Infographic generation pipeline
            </p>
          </div>
          
          <div className="text-right">
            <p className={`text-lg font-semibold capitalize ${getProjectStatusColor()}`}>
              {projectStatus}
            </p>
            <p className="text-2xl font-bold text-gray-800">{overallProgress}%</p>
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(pipelineStages).map(([stageName, stage]) => (
          <div key={stageName} className="relative">
            <StageProgress 
              stageName={stageName}
              stage={stage}
              isActive={stageName === activeStage}
            />
            
            {/* Connection line between stages */}
            {stageName !== 'output_assembly' && (
              <div className="absolute left-1/2 transform -translate-x-1/2 w-0.5 h-4 bg-gray-300" 
                   style={{ bottom: '-1rem' }} />
            )}
          </div>
        ))}
      </div>

      {projectStatus === 'complete' && (
        <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-md">
          <p className="text-sm font-medium">
            🎉 Infographic generation complete! Check the outputs in the final assembly.
          </p>
        </div>
      )}

      {projectStatus === 'error' && (
        <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
          <p className="text-sm font-medium">
            ⚠️ Pipeline encountered an error. Check agent logs for details.
          </p>
        </div>
      )}
    </div>
  );
};