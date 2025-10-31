import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Users, Cpu, HardDrive, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { farmOrchestrationService } from '@/services/farmOrchestrationService';
import { workflowEngine } from '@/services/workflowEngine';
import { predictiveAnalyticsService } from '@/services/predictiveAnalytics';
import { Farm, Agent } from '@/types';
import { getAgentsFromFarm, getAgentCount } from '@/utils/farmHelpers';
import { FarmHealthStatus } from '@/types/orchestration';
import { WorkflowExecution } from '@/types/workflow';
import { PredictiveInsight } from '@/types/reporting';
import { AgentLifecycle } from './AgentLifecycle';
import { WorkflowDesigner } from './WorkflowDesigner';

export function FarmDetails() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [health, setHealth] = useState<FarmHealthStatus | null>(null);
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'workflows' | 'insights'>('overview');

  // Helper to safely get autoScaling config
  const getAutoScalingConfig = (config: Farm['config']) => {
    const { autoScale } = config;
    if (typeof autoScale === 'object' && autoScale !== null) {
      return autoScale;
    }
    return {
      enabled: !!autoScale,
      minAgents: 1,
      maxAgents: 10
    };
  };

  useEffect(() => {
    if (farmId) {
      loadFarmData();
    }
  }, [farmId]);

  const loadFarmData = async () => {
    try {
      setLoading(true);
      const [farmData, healthData, insightsData] = await Promise.all([
        farmOrchestrationService.getFarm(farmId!),
        farmOrchestrationService.getFarmHealth(farmId!),
        predictiveAnalyticsService.analyzeFarmPerformance({ id: farmId! } as Farm)
      ]);

      if (farmData) {
        setFarm(farmData);
        // Transform health data to match FarmHealthStatus interface
        setHealth({
          farmId: farmId!,
          status: healthData.status,
          checks: {
            agentAvailability: healthData.agents.healthy > 0,
            resourceUtilization: healthData.resources.cpu < 90,
            workflowExecution: true, // Default to true for now
            connectivity: true // Default to true for now
          },
          lastChecked: new Date()
        });
        setInsights(insightsData);
      }
    } catch (error) {
      console.error('Failed to load farm data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScaleAgents = async (newCount: number) => {
    if (!farm) return;
    
    try {
      await farmOrchestrationService.scaleFarm(farm.id, newCount);
      await loadFarmData();
    } catch (error) {
      console.error('Failed to scale farm:', error);
    }
  };

  const handleTriggerFailover = async () => {
    if (!farm) return;
    
    try {
      await farmOrchestrationService.triggerFailover(farm.id);
      await loadFarmData();
    } catch (error) {
      console.error('Failed to trigger failover:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!farm) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Farm not found</p>
        <button
          onClick={() => navigate('/farms')}
          className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
        >
          Back to Farms
        </button>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
      case 'scaling':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'error':
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/farms')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.name}
            </h1>
            <div className="flex items-center space-x-2 mt-1">
              {getStatusIcon(farm.status)}
              <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {farm.status}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleTriggerFailover}
            className="px-4 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
          >
            Trigger Failover
          </button>
        </div>
      </div>

      {/* Health Status */}
      {health && (
        <div className="grid grid-cols-4 gap-4">
          <div className={`p-4 rounded-lg ${health.checks.agentAvailability ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Agent Availability</span>
              {health.checks.agentAvailability ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          
          <div className={`p-4 rounded-lg ${health.checks.resourceUtilization ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Resource Utilization</span>
              {health.checks.resourceUtilization ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          
          <div className={`p-4 rounded-lg ${health.checks.workflowExecution ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Workflow Execution</span>
              {health.checks.workflowExecution ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          
          <div className={`p-4 rounded-lg ${health.checks.connectivity ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Connectivity</span>
              {health.checks.connectivity ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {(['overview', 'agents', 'workflows', 'insights'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-medium mb-4">Farm Metrics</h3>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Total Agents</span>
                  <span className="font-medium">{getAgentCount(farm)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Active Agents</span>
                  <span className="font-medium">{getAgentsFromFarm(farm).filter(a => a.status === 'active').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Tasks Completed</span>
                  <span className="font-medium">{farm.metrics?.completedTasks || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Success Rate</span>
                  <span className="font-medium">
                    {farm.metrics && farm.metrics.totalTasks > 0 
                      ? ((farm.metrics.completedTasks / farm.metrics.totalTasks) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Resource Usage */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-medium mb-4">Resource Usage</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">CPU</span>
                    <span className="text-sm font-medium">{farm.metrics?.resourceUtilization?.cpu || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${farm.metrics?.resourceUtilization?.cpu || 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Memory</span>
                    <span className="text-sm font-medium">{farm.metrics?.resourceUtilization?.memory || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${farm.metrics?.resourceUtilization?.memory || 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Storage</span>
                    <span className="text-sm font-medium">{0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-medium mb-4">Configuration</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Auto Scaling</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Status</span>
                      <span className={getAutoScalingConfig(farm.config).enabled ? 'text-green-600' : 'text-gray-600'}>
                        {getAutoScalingConfig(farm.config).enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Min/Max Agents</span>
                      <span>{getAutoScalingConfig(farm.config).minAgents} / {getAutoScalingConfig(farm.config).maxAgents}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Failover</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Status</span>
                      <span className='text-gray-600'>
                        Disabled
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Retry Attempts</span>
                      <span>{3}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <AgentLifecycle 
            farm={farm} 
            onScaleAgents={handleScaleAgents}
            onRefresh={loadFarmData}
          />
        )}

        {activeTab === 'workflows' && (
          <WorkflowDesigner 
            farmId={farm.id}
            workflows={workflows}
            onRefresh={loadFarmData}
          />
        )}

        {activeTab === 'insights' && (
          <div className="space-y-4">
            {insights.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400">No insights available</p>
              </div>
            ) : (
              insights.map((insight) => (
                <div 
                  key={insight.id} 
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 ${
                    insight.severity === 'critical' ? 'border-red-500' :
                    insight.severity === 'high' ? 'border-orange-500' :
                    insight.severity === 'medium' ? 'border-yellow-500' :
                    'border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-lg">{insight.title}</h3>
                      <p className="text-gray-600 dark:text-gray-400 mt-1">{insight.description}</p>
                      
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Recommendations:
                        </h4>
                        <ul className="list-disc list-inside space-y-1">
                          {insight.recommendations.map((rec, recIdx) => (
                            <li key={recIdx} className="text-sm text-gray-600 dark:text-gray-400">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    <div className="ml-6 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        insight.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                        insight.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                        insight.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}>
                        {insight.severity}
                      </span>
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {insight.prediction.confidence * 100}% confidence
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}