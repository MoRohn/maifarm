import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import { useThemeStore } from '@/store/themeStore';
import { Cpu, HardDrive, Activity } from 'lucide-react';

interface ResourceData {
  label: string;
  cpu: number;
  gpu: number;
  memory: number;
}

interface CPUGPUChartProps {
  className?: string;
}

export const CPUGPUChart: React.FC<CPUGPUChartProps> = ({ className = '' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 300 });
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Generate mock data with realistic values
  const [data, setData] = useState<ResourceData[]>([]);

  useEffect(() => {
    // Generate realistic resource usage data
    const generateData = (): ResourceData[] => {
      const times = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'];
      return times.map(time => ({
        label: time,
        cpu: Math.random() * 40 + 30, // 30-70% range
        gpu: Math.random() * 60 + 20, // 20-80% range
        memory: Math.random() * 30 + 40 // 40-70% range
      }));
    };

    setData(generateData());

    // Update data every 5 seconds for real-time effect
    const interval = setInterval(() => {
      setData(generateData());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const { width } = svgRef.current.getBoundingClientRect();
        setDimensions({ width, height: 300 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!data || data.length === 0 || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create gradients
    const defs = svg.append('defs');
    
    const gradients = [
      { id: 'cpu-gradient', color1: '#3B82F6', color2: '#1E40AF' },
      { id: 'gpu-gradient', color1: '#8B5CF6', color2: '#5B21B6' },
      { id: 'memory-gradient', color1: '#10B981', color2: '#047857' }
    ];

    gradients.forEach(({ id, color1, color2 }) => {
      const gradient = defs.append('linearGradient')
        .attr('id', id)
        .attr('x1', '0%')
        .attr('x2', '0%')
        .attr('y1', '0%')
        .attr('y2', '100%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color1);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', color2);
    });

    // Scales
    const x0 = d3.scaleBand()
      .domain(data.map(d => d.label))
      .rangeRound([0, width])
      .paddingInner(0.2);

    const x1 = d3.scaleBand()
      .domain(['cpu', 'gpu', 'memory'])
      .rangeRound([0, x0.bandwidth()])
      .padding(0.05);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .nice()
      .rangeRound([height, 0]);

    // Grid lines
    const yGrid = d3.axisLeft(y)
      .tickSize(-width)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    // Bars
    const barGroups = g.selectAll('.bar-group')
      .data(data)
      .enter().append('g')
      .attr('class', 'bar-group')
      .attr('transform', d => `translate(${x0(d.label)},0)`);

    // CPU bars
    barGroups.append('rect')
      .attr('x', x1('cpu')!)
      .attr('y', height)
      .attr('width', x1.bandwidth())
      .attr('height', 0)
      .attr('fill', 'url(#cpu-gradient)')
      .attr('rx', 4)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attr('y', d => y(d.cpu))
      .attr('height', d => height - y(d.cpu));

    // GPU bars
    barGroups.append('rect')
      .attr('x', x1('gpu')!)
      .attr('y', height)
      .attr('width', x1.bandwidth())
      .attr('height', 0)
      .attr('fill', 'url(#gpu-gradient)')
      .attr('rx', 4)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100 + 50)
      .attr('y', d => y(d.gpu))
      .attr('height', d => height - y(d.gpu));

    // Memory bars
    barGroups.append('rect')
      .attr('x', x1('memory')!)
      .attr('y', height)
      .attr('width', x1.bandwidth())
      .attr('height', 0)
      .attr('fill', 'url(#memory-gradient)')
      .attr('rx', 4)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100 + 100)
      .attr('y', d => y(d.memory))
      .attr('height', d => height - y(d.memory));

    // Axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x0))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y).tickFormat(d => `${d}%`))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    // Hover effects removed to prevent console errors
  }, [data, dimensions, isDark]);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        className="overflow-visible"
      />
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">CPU Usage</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">GPU Usage</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-green-500" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Memory Usage</span>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg">
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg CPU</p>
          <p className="text-lg font-semibold text-blue-500">
            {data.length > 0 ? (data.reduce((acc, d) => acc + d.cpu, 0) / data.length).toFixed(1) : '0'}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg GPU</p>
          <p className="text-lg font-semibold text-purple-500">
            {data.length > 0 ? (data.reduce((acc, d) => acc + d.gpu, 0) / data.length).toFixed(1) : '0'}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Memory</p>
          <p className="text-lg font-semibold text-green-500">
            {data.length > 0 ? (data.reduce((acc, d) => acc + d.memory, 0) / data.length).toFixed(1) : '0'}%
          </p>
        </div>
      </div>
    </div>
  );
};