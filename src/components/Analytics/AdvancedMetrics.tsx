import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { Tooltip, useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { 
  TrendingUp, 
  Activity, 
  Zap, 
  Users,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';

interface MetricData {
  timestamp: Date;
  value: number;
  label?: string;
}

interface AdvancedMetricsProps {
  data: {
    performance: MetricData[];
    resources: MetricData[];
    efficiency: MetricData[];
    errors: MetricData[];
  };
  className?: string;
}

const MetricCard: React.FC<{
  title: string;
  value: string;
  change: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'red';
}> = ({ title, value, change, icon: Icon, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={clsx('p-3 rounded-apple', colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <span className={clsx(
          'text-sm font-medium',
          change.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}>
          {change}
        </span>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {value}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
    </motion.div>
  );
};

const LineChart: React.FC<{
  data: MetricData[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}> = ({ data, width, height, margin = { top: 20, right: 20, bottom: 40, left: 60 } }) => {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<MetricData>();

  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: d3.extent(data, d => d.timestamp) as [Date, Date],
    range: [0, xMax],
  });

  const yScale = scaleLinear({
    domain: [0, d3.max(data, d => d.value) as number],
    range: [yMax, 0],
    nice: true,
  });

  const handleTooltip = (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
    const { x } = localPoint(event) || { x: 0 };
    const x0 = xScale.invert(x - margin.left);
    const index = d3.bisector<MetricData, Date>(d => d.timestamp).left(data, x0, 1);
    const d0 = data[index - 1];
    const d1 = data[index];
    let d = d0;
    if (d1) {
      d = x0.valueOf() - d0.timestamp.valueOf() > d1.timestamp.valueOf() - x0.valueOf() ? d1 : d0;
    }
    showTooltip({
      tooltipData: d,
      tooltipLeft: xScale(d.timestamp) + margin.left,
      tooltipTop: yScale(d.value) + margin.top,
    });
  };

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <AxisBottom
            scale={xScale}
            top={yMax}
            stroke="#e5e7eb"
            tickStroke="#e5e7eb"
            tickLabelProps={() => ({
              fill: '#6b7280',
              fontSize: 11,
              textAnchor: 'middle',
            })}
            tickFormat={(d) => format(d as Date, 'HH:mm')}
          />
          <AxisLeft
            scale={yScale}
            stroke="#e5e7eb"
            tickStroke="#e5e7eb"
            tickLabelProps={() => ({
              fill: '#6b7280',
              fontSize: 11,
              textAnchor: 'end',
              dy: '0.33em',
            })}
          />
          <LinePath
            data={data}
            x={(d: MetricData) => xScale(d.timestamp)}
            y={(d: MetricData) => yScale(d.value)}
            stroke="rgb(99, 102, 241)"
            strokeWidth={2}
            curve={curveMonotoneX}
          />
          <rect
            width={xMax}
            height={yMax}
            fill="transparent"
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={hideTooltip}
          />
          {tooltipOpen && tooltipData && (
            <circle
              cx={xScale(tooltipData.timestamp)}
              cy={yScale(tooltipData.value)}
              r={4}
              fill="rgb(99, 102, 241)"
            />
          )}
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <Tooltip
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '8px 12px',
            fontSize: '12px',
            borderRadius: '4px',
            pointerEvents: 'none',
          }}
        >
          <div>
            <strong>{tooltipData.value.toFixed(2)}</strong>
            <div>{format(tooltipData.timestamp, 'HH:mm:ss')}</div>
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export const AdvancedMetrics: React.FC<AdvancedMetricsProps> = ({ data, className }) => {
  const [selectedMetric, setSelectedMetric] = useState<'performance' | 'resources' | 'efficiency' | 'errors'>('performance');
  const chartRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        setDimensions({
          width: chartRef.current.clientWidth,
          height: 400,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const metrics = [
    { key: 'performance', label: 'Performance', icon: TrendingUp, color: 'blue' as const },
    { key: 'resources', label: 'Resources', icon: Activity, color: 'green' as const },
    { key: 'efficiency', label: 'Efficiency', icon: Zap, color: 'purple' as const },
    { key: 'errors', label: 'Errors', icon: AlertCircle, color: 'red' as const },
  ];

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Avg Response Time"
          value="245ms"
          change="-12%"
          icon={Clock}
          color="blue"
        />
        <MetricCard
          title="Active Agents"
          value="28"
          change="+8"
          icon={Users}
          color="green"
        />
        <MetricCard
          title="Task Success Rate"
          value="98.2%"
          change="+2.3%"
          icon={CheckCircle}
          color="purple"
        />
        <MetricCard
          title="Error Rate"
          value="0.4%"
          change="-0.2%"
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* Chart Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Real-time Metrics
          </h3>
          <div className="flex items-center space-x-2">
            {metrics.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key as any)}
                className={clsx(
                  'flex items-center space-x-2 px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
                  selectedMetric === key
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={chartRef} className="w-full">
          <LineChart
            data={data[selectedMetric]}
            width={dimensions.width}
            height={dimensions.height}
          />
        </div>
      </motion.div>
    </div>
  );
};