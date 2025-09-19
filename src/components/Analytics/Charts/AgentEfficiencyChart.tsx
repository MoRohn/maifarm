import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useThemeStore } from '@/store/themeStore';
import { AgentPerformanceMetric } from '@/types/analytics';
import { Zap, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface AgentEfficiencyChartProps {
  agents?: AgentPerformanceMetric[];
  className?: string;
}

interface EfficiencyData {
  agentId: string;
  efficiency: number;
  tasksCompleted: number;
  avgResponseTime: number;
  status: 'excellent' | 'good' | 'average' | 'poor';
}

export const AgentEfficiencyChart: React.FC<AgentEfficiencyChartProps> = ({ 
  agents = [],
  className = '' 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 250 });
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  const [data, setData] = useState<EfficiencyData[]>([]);

  useEffect(() => {
    // Generate efficiency data from agents or use mock data
    let efficiencyData: EfficiencyData[];
    
    if (agents && agents.length > 0) {
      efficiencyData = agents.slice(0, 6).map(agent => ({
        agentId: agent.agentId,
        efficiency: agent.successRate,
        tasksCompleted: agent.tasksCompleted,
        avgResponseTime: agent.averageResponseTime,
        status: agent.successRate >= 90 ? 'excellent' :
               agent.successRate >= 75 ? 'good' :
               agent.successRate >= 60 ? 'average' : 'poor'
      }));
    } else {
      // Mock data for visualization
      efficiencyData = Array.from({ length: 6 }, (_, i) => ({
        agentId: `Agent ${i + 1}`,
        efficiency: 60 + Math.random() * 35,
        tasksCompleted: Math.floor(Math.random() * 50) + 10,
        avgResponseTime: Math.floor(Math.random() * 2000) + 500,
        status: Math.random() > 0.5 ? 'excellent' : Math.random() > 0.3 ? 'good' : 'average'
      })) as EfficiencyData[];
    }

    setData(efficiencyData);
  }, [agents]);

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const { width } = svgRef.current.getBoundingClientRect();
        setDimensions({ width, height: 250 });
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

    const margin = { top: 20, right: 30, bottom: 40, left: 80 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Color scale based on efficiency
    const colorScale = (efficiency: number) => {
      if (efficiency >= 90) return '#10B981';
      if (efficiency >= 75) return '#3B82F6';
      if (efficiency >= 60) return '#F59E0B';
      return '#EF4444';
    };

    // Scales
    const x = d3.scaleLinear()
      .domain([0, 100])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.agentId))
      .range([0, height])
      .padding(0.3);

    // Grid lines
    const xGrid = d3.axisBottom(x)
      .tickSize(height)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid')
      .call(xGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    // Background bars
    g.selectAll('.bg-bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bg-bar')
      .attr('x', 0)
      .attr('y', d => y(d.agentId)!)
      .attr('width', width)
      .attr('height', y.bandwidth())
      .attr('fill', isDark ? '#374151' : '#F3F4F6')
      .attr('rx', 6)
      .style('opacity', 0.3);

    // Efficiency bars
    const bars = g.selectAll('.efficiency-bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'efficiency-bar')
      .attr('x', 0)
      .attr('y', d => y(d.agentId)!)
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('fill', d => colorScale(d.efficiency))
      .attr('rx', 6)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attr('width', d => x(d.efficiency));

    // Efficiency percentage labels
    g.selectAll('.efficiency-label')
      .data(data)
      .enter().append('text')
      .attr('class', 'efficiency-label')
      .attr('x', d => x(d.efficiency) + 5)
      .attr('y', d => y(d.agentId)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', isDark ? '#F3F4F6' : '#111827')
      .text(d => `${d.efficiency.toFixed(1)}%`)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 100 + 500)
      .style('opacity', 1);

    // Status icons
    g.selectAll('.status-icon')
      .data(data)
      .enter().append('g')
      .attr('class', 'status-icon')
      .attr('transform', d => `translate(${x(d.efficiency) - 20}, ${y(d.agentId)! + y.bandwidth() / 2})`)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 100 + 700)
      .style('opacity', 1);

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y))
      .style('color', isDark ? '#9CA3AF' : '#6B7280')
      .selectAll('text')
      .style('font-size', '11px');

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d => `${d}%`))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'chart-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', isDark ? '#1F2937' : 'white')
      .style('border', `1px solid ${isDark ? '#374151' : '#E5E7EB'}`)
      .style('border-radius', '8px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    // Hover effects removed to prevent console errors

    return () => {
      d3.select('body').selectAll('.chart-tooltip').remove();
    };
  }, [data, dimensions, isDark]);

  // Calculate average efficiency
  const avgEfficiency = data.length > 0 
    ? data.reduce((sum, d) => sum + d.efficiency, 0) / data.length 
    : 0;

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        className="overflow-visible"
      />
      
      {/* Summary */}
      <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Average Efficiency
            </span>
          </div>
          <span className={`text-sm font-bold ${
            avgEfficiency >= 75 ? 'text-green-500' : 
            avgEfficiency >= 60 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {avgEfficiency.toFixed(1)}%
          </span>
        </div>
        
        {/* Status distribution */}
        <div className="grid grid-cols-4 gap-1 text-xs mt-2">
          <div className="text-center">
            <CheckCircle className="w-3 h-3 text-green-500 mx-auto mb-1" />
            <span className="text-gray-600 dark:text-gray-400">
              {data.filter(d => d.status === 'excellent').length}
            </span>
          </div>
          <div className="text-center">
            <Zap className="w-3 h-3 text-blue-500 mx-auto mb-1" />
            <span className="text-gray-600 dark:text-gray-400">
              {data.filter(d => d.status === 'good').length}
            </span>
          </div>
          <div className="text-center">
            <Clock className="w-3 h-3 text-amber-500 mx-auto mb-1" />
            <span className="text-gray-600 dark:text-gray-400">
              {data.filter(d => d.status === 'average').length}
            </span>
          </div>
          <div className="text-center">
            <AlertCircle className="w-3 h-3 text-red-500 mx-auto mb-1" />
            <span className="text-gray-600 dark:text-gray-400">
              {data.filter(d => d.status === 'poor').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};