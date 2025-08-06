import React, { useEffect, useRef, useMemo } from 'react';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Activity, Cpu, HardDrive, Network } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, unit, icon, color }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
          {icon}
        </div>
        <span className="text-2xl font-bold text-gray-800">
          {typeof value === 'number' ? value.toFixed(1) : value}{unit}
        </span>
      </div>
      <p className="text-sm text-gray-600">{title}</p>
    </div>
  );
};

export const MetricsCharts: React.FC = () => {
  const { metrics, agentStates } = useInfogWebSocket();
  const metricsHistoryRef = useRef<any[]>([]);

  // Update metrics history
  useEffect(() => {
    const currentMetrics = {
      timestamp: new Date().toISOString(),
      ...metrics.systemMetrics
    };
    
    metricsHistoryRef.current = [
      ...metricsHistoryRef.current.slice(-29), // Keep last 30 data points
      currentMetrics
    ];
  }, [metrics]);

  // Pipeline stage durations chart data
  const stageDurationsData = useMemo(() => ({
    labels: Object.keys(metrics.pipelineMetrics.stageDurations || {}).map(stage =>
      stage.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    ),
    datasets: [{
      label: 'Duration (seconds)',
      data: Object.values(metrics.pipelineMetrics.stageDurations || {}),
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(147, 51, 234, 0.8)'
      ],
      borderColor: [
        'rgb(59, 130, 246)',
        'rgb(16, 185, 129)',
        'rgb(251, 146, 60)',
        'rgb(147, 51, 234)'
      ],
      borderWidth: 1
    }]
  }), [metrics.pipelineMetrics.stageDurations]);

  // Quality metrics doughnut chart
  const qualityMetricsData = useMemo(() => ({
    labels: ['Data Accuracy', 'Design Quality', 'Output Completeness', 'Validation Pass Rate'],
    datasets: [{
      data: [
        metrics.qualityMetrics.dataAccuracy,
        metrics.qualityMetrics.designQualityScore,
        metrics.qualityMetrics.outputCompleteness,
        metrics.qualityMetrics.validationPassRate
      ],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(147, 51, 234, 0.8)'
      ],
      borderColor: [
        'rgb(34, 197, 94)',
        'rgb(59, 130, 246)',
        'rgb(251, 146, 60)',
        'rgb(147, 51, 234)'
      ],
      borderWidth: 1
    }]
  }), [metrics.qualityMetrics]);

  // System metrics line chart
  const systemMetricsData = useMemo(() => {
    const labels = metricsHistoryRef.current.map((_, idx) => 
      idx === metricsHistoryRef.current.length - 1 ? 'Now' : `-${metricsHistoryRef.current.length - idx - 1}m`
    );

    return {
      labels,
      datasets: [
        {
          label: 'CPU Usage (%)',
          data: metricsHistoryRef.current.map(m => m.cpuUsage || 0),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Memory Usage (%)',
          data: metricsHistoryRef.current.map(m => m.memoryUsage || 0),
          borderColor: 'rgb(251, 146, 60)',
          backgroundColor: 'rgba(251, 146, 60, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
  }, [metricsHistoryRef.current.length]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const
      }
    }
  };

  const activeAgentCount = Object.values(agentStates).filter(
    agent => agent.status !== 'disconnected' && agent.status !== 'shutdown'
  ).length;

  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">System Metrics</h2>
        <p className="text-sm text-gray-600">Real-time performance and quality metrics</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Agents"
          value={activeAgentCount}
          icon={<Activity className="w-5 h-5 text-blue-600" />}
          color="bg-blue-600"
        />
        <MetricCard
          title="CPU Usage"
          value={metrics.systemMetrics.cpuUsage}
          unit="%"
          icon={<Cpu className="w-5 h-5 text-green-600" />}
          color="bg-green-600"
        />
        <MetricCard
          title="Memory Usage"
          value={metrics.systemMetrics.memoryUsage}
          unit="%"
          icon={<HardDrive className="w-5 h-5 text-orange-600" />}
          color="bg-orange-600"
        />
        <MetricCard
          title="Network Latency"
          value={metrics.systemMetrics.networkLatency}
          unit="ms"
          icon={<Network className="w-5 h-5 text-purple-600" />}
          color="bg-purple-600"
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System metrics over time */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">System Performance</h3>
          <div className="h-64">
            <Line data={systemMetricsData} options={chartOptions} />
          </div>
        </div>

        {/* Quality metrics */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Quality Metrics</h3>
          <div className="h-64">
            <Doughnut data={qualityMetricsData} options={doughnutOptions} />
          </div>
        </div>

        {/* Pipeline stage durations */}
        <div className="bg-white rounded-lg shadow-sm p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Pipeline Stage Durations</h3>
          <div className="h-48">
            <Bar data={stageDurationsData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Pipeline metrics summary */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Pipeline Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Throughput</p>
            <p className="text-xl font-bold text-gray-800">
              {metrics.pipelineMetrics.throughput.toFixed(2)}/min
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Success Rate</p>
            <p className="text-xl font-bold text-gray-800">
              {(metrics.pipelineMetrics.successRate * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Queue Depth</p>
            <p className="text-xl font-bold text-gray-800">
              {metrics.pipelineMetrics.queueDepth}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Completion</p>
            <p className="text-xl font-bold text-gray-800">
              {(metrics.pipelineMetrics.avgCompletionTime / 60).toFixed(1)}m
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};