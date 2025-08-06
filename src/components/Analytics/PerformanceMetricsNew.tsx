import { useEffect, useState } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PerformanceMetrics as PerformanceMetricsType } from '../../types/reporting';
import { predictiveAnalyticsService } from '../../services/predictiveAnalytics';

interface PerformanceMetricsProps {
  metrics: PerformanceMetricsType;
  timeframe: string;
}

export function PerformanceMetrics({ metrics, timeframe }: PerformanceMetricsProps) {
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<number[]>([]);

  useEffect(() => {
    generateHistoricalData();
    loadForecast();
  }, [timeframe]);

  const generateHistoricalData = () => {
    const points = timeframe === '1h' ? 12 : timeframe === '24h' ? 24 : timeframe === '7d' ? 7 : 30;
    const data = Array.from({ length: points }, (_, i) => {
      const timestamp = new Date();
      if (timeframe === '1h') {
        timestamp.setMinutes(timestamp.getMinutes() - (points - i) * 5);
      } else if (timeframe === '24h') {
        timestamp.setHours(timestamp.getHours() - (points - i));
      } else {
        timestamp.setDate(timestamp.getDate() - (points - i));
      }

      return {
        time: timestamp.toLocaleString([], { 
          hour: '2-digit', 
          minute: timeframe === '1h' ? '2-digit' : undefined,
          day: timeframe !== '1h' && timeframe !== '24h' ? '2-digit' : undefined,
          month: timeframe !== '1h' && timeframe !== '24h' ? 'short' : undefined
        }),
        tasks: Math.floor(Math.random() * 100 + 50),
        cpu: Math.random() * 30 + 50,
        memory: Math.random() * 20 + 60,
        responseTime: Math.random() * 50 + 150,
        errorRate: Math.random() * 5
      };
    });
    setHistoricalData(data);
  };

  const loadForecast = async () => {
    const forecast = await predictiveAnalyticsService.generateForecast(
      'performance',
      'cpu_usage',
      12
    );
    setForecastData(forecast);
  };

  const pieData = [
    { name: 'Completed', value: metrics.taskMetrics.completed, color: '#10b981' },
    { name: 'Failed', value: metrics.taskMetrics.failed, color: '#ef4444' },
    { name: 'In Progress', value: metrics.taskMetrics.total - metrics.taskMetrics.completed - metrics.taskMetrics.failed, color: '#3b82f6' }
  ];

  const resourceData = [
    { name: 'CPU', current: metrics.resourceMetrics.avgCpu, peak: metrics.resourceMetrics.peakCpu },
    { name: 'Memory', current: metrics.resourceMetrics.avgMemory, peak: metrics.resourceMetrics.peakMemory }
  ];

  return (
    <div className="space-y-6">
      {/* Task Performance Over Time */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Task Performance Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={historicalData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                border: '1px solid #e5e7eb',
                borderRadius: '6px'
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="tasks" 
              stroke="#10b981" 
              strokeWidth={2} 
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Tasks Completed"
            />
            <Line 
              type="monotone" 
              dataKey="responseTime" 
              stroke="#3b82f6" 
              strokeWidth={2} 
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              name="Response Time (ms)"
              yAxisId="right"
            />
            <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Resource Utilization */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Resource Utilization</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="cpu" 
                stackId="1" 
                stroke="#10b981" 
                fill="#10b981" 
                fillOpacity={0.6}
                name="CPU %"
              />
              <Area 
                type="monotone" 
                dataKey="memory" 
                stackId="1" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.6}
                name="Memory %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Task Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Task Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resource Comparison */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Average vs Peak Resource Usage</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={resourceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip />
            <Legend />
            <Bar dataKey="current" fill="#10b981" name="Average" />
            <Bar dataKey="peak" fill="#ef4444" name="Peak" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Task Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Total Tasks</dt>
              <dd className="font-medium">{metrics.taskMetrics.total.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
              <dd className="font-medium text-green-600">{metrics.taskMetrics.completed.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Failed</dt>
              <dd className="font-medium text-red-600">{metrics.taskMetrics.failed.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Avg Duration</dt>
              <dd className="font-medium">{metrics.taskMetrics.avgDuration}ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Throughput</dt>
              <dd className="font-medium">{metrics.taskMetrics.throughput}/min</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Agent Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Total Agents</dt>
              <dd className="font-medium">{metrics.agentMetrics.totalAgents}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Avg Utilization</dt>
              <dd className="font-medium">{metrics.agentMetrics.avgUtilization}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Avg Response Time</dt>
              <dd className="font-medium">{metrics.agentMetrics.avgResponseTime}ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Error Rate</dt>
              <dd className="font-medium text-red-600">{metrics.agentMetrics.errorRate}%</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Cost Metrics</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Total Cost</dt>
              <dd className="font-medium">${metrics.costMetrics.totalCost.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Cost per Task</dt>
              <dd className="font-medium">${metrics.costMetrics.costPerTask.toFixed(3)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Cost per Hour</dt>
              <dd className="font-medium">${metrics.costMetrics.costPerHour.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Daily Cost</dt>
              <dd className="font-medium">${(metrics.costMetrics.costPerHour * 24).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Monthly Projection</dt>
              <dd className="font-medium">${(metrics.costMetrics.costPerHour * 24 * 30).toFixed(0)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}