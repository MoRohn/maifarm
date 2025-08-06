import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import { useThemeStore } from '../../../store/themeStore';

interface FarmCreationData {
  date: Date;
  farms: number;
  agents: number;
  success: number;
  failed: number;
}

interface FarmCreationChartProps {
  data?: FarmCreationData[];
  height?: number;
  className?: string;
}

export const FarmCreationChart: React.FC<FarmCreationChartProps> = ({
  data = [],
  height = 300,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    // Generate mock data if none provided
    const chartData = data.length > 0 ? data : generateMockData();

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 80, bottom: 40, left: 50 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(chartData, d => Math.max(d.farms, d.agents)) || 10])
      .nice()
      .range([chartHeight, 0]);

    // Line generators
    const farmLine = d3.line<FarmCreationData>()
      .x(d => x(d.date))
      .y(d => y(d.farms))
      .curve(d3.curveMonotoneX);

    const agentLine = d3.line<FarmCreationData>()
      .x(d => x(d.date))
      .y(d => y(d.agents))
      .curve(d3.curveMonotoneX);

    // Grid
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .tickSize(-chartHeight)
        .tickFormat(() => '')
        .ticks(6))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .tickSize(-width)
        .tickFormat(() => '')
        .ticks(5))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    // Draw areas
    const farmArea = d3.area<FarmCreationData>()
      .x(d => x(d.date))
      .y0(chartHeight)
      .y1(d => y(d.farms))
      .curve(d3.curveMonotoneX);

    const agentArea = d3.area<FarmCreationData>()
      .x(d => x(d.date))
      .y0(chartHeight)
      .y1(d => y(d.agents))
      .curve(d3.curveMonotoneX);

    // Farm area and line
    g.append('path')
      .datum(chartData)
      .attr('fill', 'url(#farm-gradient)')
      .attr('d', farmArea)
      .style('opacity', 0.3);

    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 2.5)
      .attr('d', farmLine);

    // Agent area and line
    g.append('path')
      .datum(chartData)
      .attr('fill', 'url(#agent-gradient)')
      .attr('d', agentArea)
      .style('opacity', 0.3);

    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#8B5CF6')
      .attr('stroke-width', 2.5)
      .attr('d', agentLine);

    // Success rate dots
    g.selectAll('.success-dot')
      .data(chartData)
      .enter().append('circle')
      .attr('class', 'success-dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.success))
      .attr('r', 3)
      .attr('fill', '#10B981')
      .style('opacity', 0.8);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .ticks(6)
        .tickFormat(d => d3.timeFormat('%b %d')(d as Date)))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    g.append('g')
      .call(d3.axisLeft(y)
        .ticks(5))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(${width - 100}, 0)`);

    const legendItems = [
      { label: 'Farms', color: '#3B82F6' },
      { label: 'Agents', color: '#8B5CF6' },
      { label: 'Success', color: '#10B981' }
    ];

    legendItems.forEach((item, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`);

      legendRow.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', item.color)
        .attr('rx', 2);

      legendRow.append('text')
        .attr('x', 18)
        .attr('y', 9)
        .text(item.label)
        .style('font-size', '12px')
        .style('fill', isDark ? '#9CA3AF' : '#6B7280');
    });

    // Gradients
    const defs = svg.append('defs');
    
    const farmGradient = defs.append('linearGradient')
      .attr('id', 'farm-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', chartHeight);
    
    farmGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3B82F6')
      .attr('stop-opacity', 0.8);
    
    farmGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3B82F6')
      .attr('stop-opacity', 0.1);

    const agentGradient = defs.append('linearGradient')
      .attr('id', 'agent-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', chartHeight);
    
    agentGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#8B5CF6')
      .attr('stop-opacity', 0.8);
    
    agentGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#8B5CF6')
      .attr('stop-opacity', 0.1);
  }, [data, height, isDark]);

  const generateMockData = (): FarmCreationData[] => {
    const days = 7;
    const data: FarmCreationData[] = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      data.push({
        date,
        farms: Math.floor(Math.random() * 10) + 5,
        agents: Math.floor(Math.random() * 30) + 10,
        success: Math.floor(Math.random() * 8) + 3,
        failed: Math.floor(Math.random() * 3)
      });
    }
    
    return data;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`relative ${className}`}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        className="overflow-visible"
      />
    </motion.div>
  );
};