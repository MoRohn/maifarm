import { useState } from 'react';
import { Play, Pause, RotateCcw, Plus, GitBranch, Clock, CheckCircle, XCircle } from 'lucide-react';
import { WorkflowExecution } from '@/types/workflow';
import { workflowEngine } from '@/services/workflowEngine';

interface WorkflowDesignerProps {
  farmId: string;
  workflows: WorkflowExecution[];
  onRefresh: () => Promise<void>;
}

export function WorkflowDesigner({ farmId, workflows, onRefresh }: WorkflowDesignerProps) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecuteWorkflow = async (workflowId: string) => {
    setIsExecuting(true);
    try {
      await workflowEngine.executeWorkflow(workflowId, {
        farmId: farmId
      });
      await onRefresh();
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusIcon = (status: WorkflowExecution['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'active':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'cancelled':
        return <Pause className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: WorkflowExecution['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'active':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    }
  };

  const availableWorkflows = [
    {
      id: 'ci-cd-pipeline',
      name: 'CI/CD Pipeline',
      description: 'Standard CI/CD workflow for code deployment',
      icon: <GitBranch className="h-5 w-5" />
    }
  ];

  return (
    <div className="space-y-6">
      {/* Available Workflows */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Available Workflows</h3>
          <button className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Create Workflow
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {availableWorkflows.map((workflow) => (
            <div 
              key={workflow.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors cursor-pointer"
              onClick={() => setSelectedWorkflow(workflow.id)}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg">
                  {workflow.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{workflow.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {workflow.description}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecuteWorkflow(workflow.id);
                    }}
                    disabled={isExecuting}
                    className="mt-3 px-3 py-1 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isExecuting ? (
                      <>
                        <RotateCcw className="inline-block h-3 w-3 mr-1 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="inline-block h-3 w-3 mr-1" />
                        Execute
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Executions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Recent Executions</h3>
        </div>
        
        {workflows.length === 0 ? (
          <div className="p-12 text-center">
            <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No workflow executions yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Execute a workflow to see its progress here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {workflows.map((execution) => (
              <div key={execution.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(execution.status)}
                      <div>
                        <h4 className="font-medium">
                          {execution.workflowId} - {execution.id.slice(0, 8)}
                        </h4>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(execution.status)}`}>
                          {execution.status}
                        </span>
                      </div>
                    </div>
                    
                    {execution.nodeExecutions.find(n => n.status === 'active') && (
                      <div className="mt-3">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Current Step: <span className="font-medium">{execution.nodeExecutions.find(n => n.status === 'active')?.nodeId || 'Initializing...'}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-3 flex items-center space-x-6">
                      <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Started</div>
                        <div className="text-sm font-medium">
                          {new Date(execution.startTime).toLocaleString()}
                        </div>
                      </div>
                      {execution.endTime && (
                        <div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Completed</div>
                          <div className="text-sm font-medium">
                            {new Date(execution.endTime).toLocaleString()}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
                        <div className="text-sm font-medium">
                          {execution.endTime
                            ? `${Math.round((new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) / 1000)}s`
                            : 'Running...'}
                        </div>
                      </div>
                    </div>
                    
                    {execution.errors && execution.errors.length > 0 && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <div className="text-sm text-red-800 dark:text-red-400">
                          <span className="font-medium">Error:</span> {execution.errors[0].message}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-6">
                    {execution.status === 'active' && (
                      <button
                        onClick={() => workflowEngine.cancelExecution?.(execution.id)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Step Progress */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Progress</span>
                    <span className="font-medium">
                      {execution.nodeExecutions.filter(s => s.status === 'completed').length} / {execution.nodeExecutions.length} steps
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(execution.nodeExecutions.filter(s => s.status === 'completed').length / execution.nodeExecutions.length) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}