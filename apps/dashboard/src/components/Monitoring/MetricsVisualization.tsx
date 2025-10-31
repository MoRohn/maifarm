import React, { useEffect, useState, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useWebSocketStore } from '@/store/websocketStore';
import * as d3 from 'd3';

interface MetricData {
  timestamp: number;
  value: number;
}

interface Metric {
  name: string;
  displayName: string;
  unit: string;
  color: string;
  data: MetricData[];
  currentValue: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

export const MetricsVisualization: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([
    {
      name: 'cpu_usage',
      displayName: 'CPU Usage',
      unit: '%',
      color: '#10b981',
      data: [],
      currentValue: 0,
      trend: 'stable',
      changePercent: 0
    },
    {
      name: 'memory_usage',
      displayName: 'Memory Usage',
      unit: '%',
      color: '#3b82f6',
      data: [],
      currentValue: 0,
      trend: 'stable',
      changePercent: 0
    },
    {
      name: 'active_farms',
      displayName: 'Active Farms',
      unit: '',
      color: '#f59e0b',
      data: [],
      currentValue: 0,
      trend: 'stable',
      changePercent: 0
    },
    {
      name: 'task_throughput',
      displayName: 'Task Throughput',
      unit: '/min',
      color: '#8b5cf6',
      data: [],
      currentValue: 0,
      trend: 'stable',
      changePercent: 0
    }
  ]);

  const svgRefs = useRef<{ [key: string]: SVGSVGElement | null }>({});
  const { addMessageHandler, removeMessageHandler } = useWebSocketStore();

  useEffect(() => {
    const handleMetricUpdate = (message: any) => {
      if (message.type === 'monitoring:metrics:update') {
        const { metricName, value, timestamp } = message.payload;
        
        setMetrics(prev => prev.map(metric => {
          if (metric.name === metricName) {
            const newData = [...metric.data, { timestamp, value }].slice(-60); // Keep last 60 points
            
            // Calculate trend
            const oldValue = metric.data.length > 10 ? metric.data[metric.data.length - 10].value : value;
            const changePercent = oldValue !== 0 ? ((value - oldValue) / oldValue) * 100 : 0;
            const trend = changePercent > 1 ? 'up' : changePercent < -1 ? 'down' : 'stable';
            
            return {
              ...metric,
              data: newData,
              currentValue: value,
              trend,
              changePercent: Math.abs(changePercent)
            };
          }
          return metric;
        }));
      }
    };

    addMessageHandler('metrics', handleMetricUpdate);
    
    // Simulate real-time data for demo
    const interval = setInterval(() => {
      const timestamp = Date.now();
      setMetrics(prev => prev.map(metric => {
        let value: number;
        switch (metric.name) {
          case 'cpu_usage':
            value = 30 + Math.random() * 40;
            break;
          case 'memory_usage':
            value = 50 + Math.random() * 30;
            break;
          case 'active_farms':
            value = Math.floor(5 + Math.random() * 10);
            break;
          case 'task_throughput':
            value = Math.floor(100 + Math.random() * 50);
            break;
          default:
            value = 0;
        }

        const newData = [...metric.data, { timestamp, value }].slice(-60);
        const oldValue = metric.data.length > 10 ? metric.data[metric.data.length - 10].value : value;
        const changePercent = oldValue !== 0 ? ((value - oldValue) / oldValue) * 100 : 0;
        const trend = changePercent > 1 ? 'up' : changePercent < -1 ? 'down' : 'stable';

        return {
          ...metric,
          data: newData,
          currentValue: value,
          trend,
          changePercent: Math.abs(changePercent)
        };
      }));
    }, 2000);

    return () => {
      removeMessageHandler('metrics', handleMetricUpdate);
      clearInterval(interval);
    };
  }, [addMessageHandler, removeMessageHandler]);

  useEffect(() => {
    metrics.forEach(metric => {
      const svg = d3.select(svgRefs.current[metric.name]);
      if (!svg.node() || metric.data.length < 2) return;

      svg.selectAll('*').remove();

      const margin = { top: 10, right: 10, bottom: 20, left: 30 };
      const width = 300 - margin.left - margin.right;
      const height = 100 - margin.top - margin.bottom;

      const g = svg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      const x = d3.scaleTime()
        .domain(d3.extent(metric.data, d => d.timestamp) as [number, number])
        .range([0, width]);

      const y = d3.scaleLinear()
        .domain(d3.extent(metric.data, d => d.value) as [number, number])
        .nice()
        .range([height, 0]);

      const line = d3.line<MetricData>()
        .x(d => x(d.timestamp))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX);

      const area = d3.area<MetricData>()
        .x(d => x(d.timestamp))
        .y0(height)
        .y1(d => y(d.value))
        .curve(d3.curveMonotoneX);

      // Add gradient
      const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', `gradient-${metric.name}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', height);

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', metric.color)
        .attr('stop-opacity', 0.3);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', metric.color)
        .attr('stop-opacity', 0);

      // Add area
      g.append('path')
        .datum(metric.data)
        .attr('fill', `url(#gradient-${metric.name})`)
        .attr('d', area);

      // Add line
      g.append('path')
        .datum(metric.data)
        .attr('fill', 'none')
        .attr('stroke', metric.color)
        .attr('stroke-width', 2)
        .attr('d', line);

      // Add axes
      g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(3).tickFormat(d => d3.timeFormat('%H:%M')(new Date(d as number))))
        .attr('class', 'text-xs text-gray-500');

      g.append('g')
        .call(d3.axisLeft(y).ticks(3))
        .attr('class', 'text-xs text-gray-500');
    });
  }, [metrics]);

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-gray-600 dark:text-gray-400" />
        <h2 className="text-xl font-semibold">Real-time Metrics</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {metrics.map(metric => (
          <div key={metric.name} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {metric.displayName}
                </h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold" style={{ color: metric.color }}>
                    {metric.currentValue.toFixed(metric.unit === '%' ? 1 : 0)}
                  </span>
                  <span className="text-sm text-gray-500">{metric.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {getTrendIcon(metric.trend)}
                <span className={`text-sm ${
                  metric.trend === 'up' ? 'text-green-500' : 
                  metric.trend === 'down' ? 'text-red-500' : 
                  'text-gray-500'
                }`}>
                  {metric.changePercent.toFixed(1)}%
                </span>
              </div>
            </div>
            
            <div className="h-24 -mx-2">
              <svg
                ref={el => svgRefs.current[metric.name] = el}
                className="w-full h-full"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};