import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Cpu,
  HardDrive,
  Network,
  Users,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { Farm, FarmMetrics as FarmMetricsType } from '../../types';
import { format } from 'date-fns';

interface FarmMetricsProps {
  farm: Farm;
  historicalData?: {
    timestamp: Date;
    metrics: FarmMetricsType;
  }[];
  className?: string;
}

export const FarmMetrics: React.FC<FarmMetricsProps> = ({ 
  farm, 
  historicalData = [],
  className 
}) => {
  const taskStatusData = useMemo(() => [
    { name: 'Completed', value: farm.metrics.completedTasks, color: '#10b981' },
    { name: 'Failed', value: farm.metrics.failedTasks, color: '#ef4444' },
    { name: 'In Progress', value: farm.metrics.totalTasks - farm.metrics.completedTasks - farm.metrics.failedTasks, color: '#3b82f6' }
  ], [farm.metrics]);

  const resourceData = useMemo(() => 
    historicalData.slice(-20).map(item => ({
      time: format(item.timestamp, 'HH:mm'),
      cpu: item.metrics.resourceUsage.cpu,
      memory: item.metrics.resourceUsage.memory,
      network: item.metrics.resourceUsage.network
    })), [historicalData]);

  const efficiencyTrend = useMemo(() => {
    if (historicalData.length < 2) return 0;
    const recent = historicalData[historicalData.length - 1].metrics.efficiency;
    const previous = historicalData[historicalData.length - 2].metrics.efficiency;
    return recent - previous;
  }, [historicalData]);

  const MetricCard = ({ 
    title, 
    value, 
    unit = '', 
    icon: Icon, 
    trend, 
    color = 'primary' 
  }: {
    title: string;
    value: string | number;
    unit?: string;
    icon: React.FC<any>;
    trend?: number;
    color?: 'primary' | 'green' | 'blue' | 'purple' | 'yellow' | 'red';
  }) => {
    const colorClasses = {
      primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
      green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    };

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="bg-white dark:bg-gray-900 rounded-apple-lg p-4 shadow-apple border border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between mb-2">
          <div className={clsx('p-2 rounded-apple', colorClasses[color])}>
            <Icon className="w-5 h-5" />
          </div>
          {trend !== undefined && (
            <div className={clsx(
              'flex items-center space-x-1 text-sm',
              trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {trend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</h3>
        <p className="text-2xl font-semibold text-gray-900 dark:text-white">
          {value}{unit}
        </p>
      </motion.div>
    );
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Task Completion"
          value={farm.metrics.completedTasks}
          unit={`/${farm.metrics.totalTasks}`}
          icon={CheckCircle}
          color="green"
          trend={5.2}
        />
        <MetricCard
          title="Avg Completion Time"
          value={(farm.metrics.avgCompletionTime / 1000).toFixed(1)}
          unit="s"
          icon={Clock}
          color="blue"
          trend={-2.3}
        />
        <MetricCard
          title="Efficiency Score"
          value={farm.metrics.efficiency}
          unit="%"
          icon={TrendingUp}
          color="purple"
          trend={efficiencyTrend}
        />
        <MetricCard
          title="Collaboration Score"
          value={farm.metrics.collaborationScore}
          unit="/100"
          icon={Users}
          color="primary"
          trend={3.1}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resource Usage Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 shadow-apple border border-gray-200 dark:border-gray-800"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Resource Usage
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={resourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(17, 24, 39, 0.9)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="cpu"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
                name="CPU %"
              />
              <Area
                type="monotone"
                dataKey="memory"
                stackId="1"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
                name="Memory %"
              />
              <Area
                type="monotone"
                dataKey="network"
                stackId="1"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.6}
                name="Network MB/s"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Task Status Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 shadow-apple border border-gray-200 dark:border-gray-800"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Task Distribution
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={taskStatusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {taskStatusData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(17, 24, 39, 0.9)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Legend
                verticalAlign="middle"
                align="right"
                layout="vertical"
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Real-time Resource Monitors */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 shadow-apple border border-gray-200 dark:border-gray-800"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Live Resource Monitoring
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ResourceGauge
            label="CPU Usage"
            value={farm.metrics.resourceUsage.cpu}
            icon={Cpu}
            color="blue"
          />
          <ResourceGauge
            label="Memory Usage"
            value={farm.metrics.resourceUsage.memory}
            icon={HardDrive}
            color="green"
          />
          <ResourceGauge
            label="Network I/O"
            value={farm.metrics.resourceUsage.network}
            icon={Network}
            color="purple"
            unit="MB/s"
          />
        </div>
      </motion.div>
    </div>
  );
};

const ResourceGauge: React.FC<{
  label: string;
  value: number;
  icon: React.FC<any>;
  color: 'blue' | 'green' | 'purple';
  unit?: string;
}> = ({ label, value, icon: Icon, color, unit = '%' }) => {
  const colorMap = {
    blue: '#3b82f6',
    green: '#10b981',
    purple: '#8b5cf6'
  };

  const isHighUsage = unit === '%' && value > 80;
  const isMediumUsage = unit === '%' && value > 60;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        {value.toFixed(1)}{unit}
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <motion.div
          className={clsx(
            'h-2 rounded-full transition-all duration-300',
            isHighUsage ? 'bg-red-500' : isMediumUsage ? 'bg-yellow-500' : ''
          )}
          style={{ 
            width: unit === '%' ? `${value}%` : '100%',
            backgroundColor: !isHighUsage && !isMediumUsage ? colorMap[color] : undefined
          }}
          initial={{ width: 0 }}
          animate={{ width: unit === '%' ? `${value}%` : '100%' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};