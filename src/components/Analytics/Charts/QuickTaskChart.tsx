import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import { useThemeStore } from '../../../store/themeStore';
import { Clock, CheckCircle2, XCircle, AlertCircle, Zap } from 'lucide-react';

interface QuickTaskData {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  status: 'completed' | 'failed' | 'in-progress';
  duration: number; // in seconds
  category: string;
  efficiency: number; // 0-100
}

interface QuickTaskChartProps {
  data?: QuickTaskData[];
  height?: number;
  className?: string;
}

export const QuickTaskChart: React.FC<QuickTaskChartProps> = ({
  data = [],
  height = 400,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (!svgRef.current) return;

    // Generate mock data if none provided
    const chartData = data.length > 0 ? data : generateMockData();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 120, bottom: 60, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Group data by category
    const categories = Array.from(new Set(chartData.map(d => d.category)));
    const categoryColors = d3.scaleOrdinal()
      .domain(categories)
      .range(['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444']);

    // Create timeline view
    const timeExtent = d3.extent(chartData, d => d.startTime) as [Date, Date];
    const x = d3.scaleTime()
      .domain(timeExtent)
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(chartData.map(d => d.id))
      .range([0, chartHeight])
      .padding(0.1);

    // Draw tasks as bars
    const taskBars = g.selectAll('.task-bar')
      .data(chartData)
      .enter().append('g')
      .attr('class', 'task-bar');

    // Task rectangles
    taskBars.append('rect')
      .attr('x', d => x(d.startTime))
      .attr('y', d => y(d.id)!)
      .attr('width', d => Math.max(1, x(d.endTime) - x(d.startTime)))
      .attr('height', y.bandwidth())
      .attr('fill', d => categoryColors(d.category) as string)
      .attr('opacity', d => d.status === 'failed' ? 0.5 : 0.8)
      .attr('rx', 4)
      .attr('ry', 4);

    // Status icons
    taskBars.append('text')
      .attr('x', d => x(d.endTime) + 5)
      .attr('y', d => y(d.id)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .text(d => {
        if (d.status === 'completed') return '✓';
        if (d.status === 'failed') return '✕';
        return '⋯';
      })
      .attr('fill', d => {
        if (d.status === 'completed') return '#10B981';
        if (d.status === 'failed') return '#EF4444';
        return '#F59E0B';
      });

    // Task names
    taskBars.append('text')
      .attr('x', d => x(d.startTime) + 5)
      .attr('y', d => y(d.id)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('font-size', '11px')
      .attr('fill', 'white')
      .text(d => d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name);

    // Efficiency indicator
    taskBars.append('rect')
      .attr('x', d => x(d.startTime))
      .attr('y', d => y(d.id)! + y.bandwidth() - 3)
      .attr('width', d => (Math.max(1, x(d.endTime) - x(d.startTime))) * (d.efficiency / 100))
      .attr('height', 3)
      .attr('fill', d => d.efficiency > 75 ? '#10B981' : d.efficiency > 50 ? '#F59E0B' : '#EF4444')
      .attr('opacity', 0.9);

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .tickSize(-chartHeight)
        .tickFormat(() => '')
        .ticks(8))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .ticks(8)
        .tickFormat(d => d3.timeFormat('%H:%M')(d as Date)))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    // Category legend
    const legend = g.append('g')
      .attr('transform', `translate(${width + 10}, 0)`);

    categories.forEach((category, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`);

      legendRow.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', categoryColors(category) as string)
        .attr('rx', 2);

      legendRow.append('text')
        .attr('x', 18)
        .attr('y', 9)
        .text(category)
        .style('font-size', '11px')
        .style('fill', isDark ? '#9CA3AF' : '#6B7280');
    });

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'quicktask-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', isDark ? '#1F2937' : 'white')
      .style('border', `1px solid ${isDark ? '#374151' : '#E5E7EB'}`)
      .style('border-radius', '8px')
      .style('padding', '12px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    taskBars
      .on('mouseover', function(event, d) {
        const taskData = d as QuickTaskData;
        const tooltipHtml = `
          <div style="color: ${isDark ? '#F3F4F6' : '#111827'}">
            <strong>${taskData.name}</strong><br/>
            <div style="margin-top: 4px;">
              <span style="color: #6B7280">Category:</span> ${taskData.category}<br/>
              <span style="color: #6B7280">Duration:</span> ${formatDuration(taskData.duration)}<br/>
              <span style="color: #6B7280">Efficiency:</span> ${taskData.efficiency}%<br/>
              <span style="color: #6B7280">Status:</span> 
              <span style="color: ${taskData.status === 'completed' ? '#10B981' : taskData.status === 'failed' ? '#EF4444' : '#F59E0B'}">
                ${taskData.status}
              </span>
            </div>
          </div>
        `;
        
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(tooltipHtml)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', () => {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => {
      d3.select('body').selectAll('.quicktask-tooltip').remove();
    };
  }, [data, height, isDark]);

  const generateMockData = (): QuickTaskData[] => {
    const categories = ['Analysis', 'Generation', 'Optimization', 'Testing', 'Deployment'];
    const tasks: QuickTaskData[] = [];
    const now = new Date();
    let currentTime = new Date(now.getTime() - 3 * 60 * 60 * 1000); // Start 3 hours ago

    for (let i = 0; i < 15; i++) {
      const duration = Math.floor(Math.random() * 600) + 60; // 1-10 minutes
      const startTime = new Date(currentTime);
      const endTime = new Date(currentTime.getTime() + duration * 1000);
      
      tasks.push({
        id: `task-${i}`,
        name: `Quick Task ${i + 1}`,
        startTime,
        endTime,
        status: Math.random() > 0.8 ? 'failed' : Math.random() > 0.2 ? 'completed' : 'in-progress',
        duration,
        category: categories[Math.floor(Math.random() * categories.length)],
        efficiency: Math.floor(Math.random() * 50) + 50
      });
      
      currentTime = new Date(endTime.getTime() + Math.random() * 10 * 60 * 1000); // Gap between tasks
    }

    return tasks;
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Calculate summary stats
  const currentData = data.length > 0 ? data : generateMockData();
  const completedTasks = currentData.filter(d => d.status === 'completed').length;
  const failedTasks = currentData.filter(d => d.status === 'failed').length;
  const inProgressTasks = currentData.filter(d => d.status === 'in-progress').length;
  const avgDuration = currentData.reduce((sum, d) => sum + d.duration, 0) / currentData.length;
  const avgEfficiency = currentData.reduce((sum, d) => sum + d.efficiency, 0) / currentData.length;

  return (
    <div className={`relative ${className}`}>
      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Completed</span>
          </div>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            {completedTasks}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Failed</span>
          </div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">
            {failedTasks}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">In Progress</span>
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
            {inProgressTasks}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Avg Duration</span>
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {formatDuration(Math.floor(avgDuration))}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Efficiency</span>
          </div>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {avgEfficiency.toFixed(0)}%
          </p>
        </motion.div>
      </div>

      {/* Timeline Chart */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          className="overflow-visible"
        />
      </motion.div>

      {/* Info Text */}
      <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Timeline view shows task execution with efficiency indicators at the bottom of each bar
      </div>
    </div>
  );
};