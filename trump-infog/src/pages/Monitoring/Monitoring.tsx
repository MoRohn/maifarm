import React, { useState } from 'react';
import { AgentStatusBoard } from '../../components/Monitoring/AgentStatusBoard';
import { PipelineProgress } from '../../components/Monitoring/PipelineProgress';
import { MetricsCharts } from '../../components/Monitoring/MetricsCharts';
import { CommunicationFlow } from '../../components/Monitoring/CommunicationFlow';
import { LogViewer } from '../../components/Monitoring/LogViewer';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

type TabType = 'overview' | 'agents' | 'pipeline' | 'metrics' | 'communication' | 'logs';

export const Monitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const { connectionState, activeAlerts, resolveAlert } = useInfogWebSocket();

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'agents', label: 'Agents', icon: '🤖' },
    { id: 'pipeline', label: 'Pipeline', icon: '⚙️' },
    { id: 'metrics', label: 'Metrics', icon: '📈' },
    { id: 'communication', label: 'Communication', icon: '🔗' },
    { id: 'logs', label: 'Logs', icon: '📝' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AgentStatusBoard />
              <PipelineProgress />
            </div>
            {activeAlerts.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Active Alerts</h2>
                <div className="space-y-2">
                  {activeAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border flex items-start justify-between ${
                        alert.severity === 'critical' ? 'bg-red-50 border-red-300' :
                        alert.severity === 'high' ? 'bg-orange-50 border-orange-300' :
                        alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-300' :
                        'bg-blue-50 border-blue-300'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <AlertCircle className={`w-5 h-5 flex-shrink-0 ${
                          alert.severity === 'critical' ? 'text-red-600' :
                          alert.severity === 'high' ? 'text-orange-600' :
                          alert.severity === 'medium' ? 'text-yellow-600' :
                          'text-blue-600'
                        }`} />
                        <div>
                          <h4 className="font-semibold text-gray-800">{alert.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'agents':
        return <AgentStatusBoard />;
      case 'pipeline':
        return <PipelineProgress />;
      case 'metrics':
        return <MetricsCharts />;
      case 'communication':
        return <CommunicationFlow />;
      case 'logs':
        return <LogViewer />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Trump Infographic Monitoring
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time monitoring of the multi-agent infographic generation system
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    connectionState.status === 'connected' ? 'bg-green-500 animate-pulse' :
                    connectionState.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    connectionState.status === 'reconnecting' ? 'bg-orange-500 animate-pulse' :
                    'bg-red-500'
                  }`} />
                  <span className="text-sm text-gray-600 capitalize">
                    {connectionState.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab navigation */}
        <div className="flex space-x-1 mb-6 bg-gray-200 p-1 rounded-lg">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {renderTabContent()}
      </div>
    </div>
  );
};