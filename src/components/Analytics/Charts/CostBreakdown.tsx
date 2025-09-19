import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { useThemeStore } from '@/store/themeStore';
import { generateChartTheme } from '@/utils/chartHelpers';
import { DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CostData {
  category: string;
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
}

interface CostBreakdownProps {
  estimatedCosts?: {
    hourly: string;
    daily: string;
    monthly: string;
  };
  className?: string;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({ 
  estimatedCosts,
  className = '' 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 250 });
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Memoize chartTheme to prevent infinite re-renders
  const chartTheme = useMemo(() => 
    generateChartTheme(primaryColor, accentColor, isDark),
    [primaryColor, accentColor, isDark]
  );

  // Generate cost breakdown data
  const [data, setData] = useState<CostData[]>([]);

  useEffect(() => {
    // Calculate cost breakdown (using Claude Code pricing estimates)
    const baseHourly = parseFloat(estimatedCosts?.hourly || '5.00');
    
    const costData: CostData[] = [
      {
        category: 'API Calls',
        current: baseHourly * 0.4,
        previous: baseHourly * 0.35,
        trend: 'up'
      },
      {
        category: 'Compute',
        current: baseHourly * 0.3,
        previous: baseHourly * 0.32,
        trend: 'down'
      },
      {
        category: 'Storage',
        current: baseHourly * 0.15,
        previous: baseHourly * 0.15,
        trend: 'stable'
      },
      {
        category: 'Network',
        current: baseHourly * 0.1,
        previous: baseHourly * 0.12,
        trend: 'down'
      },
      {
        category: 'Other',
        current: baseHourly * 0.05,
        previous: baseHourly * 0.06,
        trend: 'down'
      }
    ];

    setData(costData);
  }, [estimatedCosts]);

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const { width } = svgRef.current.getBoundingClientRect();
        if (width > 0) {
          setDimensions({ width, height: 250 });
        }
      }
    };

    // Initial update with a small delay to ensure DOM is ready
    setTimeout(updateDimensions, 100);
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!data || data.length === 0 || dimensions.width === 0) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 60, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create gradients
    const defs = svg.append('defs');
    
    const gradient = defs.append('linearGradient')
      .attr('id', 'cost-gradient')
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '0%')
      .attr('y2', '100%');
    
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', chartTheme.primary || '#3B82F6')
      .attr('stop-opacity', 1);
    
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', chartTheme.accent || '#8B5CF6')
      .attr('stop-opacity', 1);

    // Scales
    const x = d3.scaleBand()
      .domain(data.map(d => d.category))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(d.current, d.previous)) || 10])
      .nice()
      .range([height, 0]);

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
      .style('stroke', chartTheme.grid);

    // Bars
    g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.category)!)
      .attr('y', height)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('fill', 'url(#cost-gradient)')
      .attr('rx', 6)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .attr('y', d => y(d.current))
      .attr('height', d => height - y(d.current));

    // Previous period line
    const line = d3.line<CostData>()
      .x(d => (x(d.category)! + x.bandwidth() / 2))
      .y(d => y(d.previous))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', chartTheme.text)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('d', line)
      .style('opacity', 0)
      .transition()
      .duration(1500)
      .delay(500)
      .style('opacity', 0.5);

    // Trend indicators
    g.selectAll('.trend')
      .data(data)
      .enter().append('g')
      .attr('class', 'trend')
      .attr('transform', d => `translate(${x(d.category)! + x.bandwidth() / 2},${y(d.current) - 15})`)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 100 + 1000)
      .style('opacity', 1);

    // Value labels
    g.selectAll('.value-label')
      .data(data)
      .enter().append('text')
      .attr('class', 'value-label')
      .attr('x', d => x(d.category)! + x.bandwidth() / 2)
      .attr('y', d => y(d.current) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', chartTheme.text)
      .text(d => `$${d.current.toFixed(2)}`)
      .style('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 100 + 1000)
      .style('opacity', 1);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .style('color', chartTheme.text)
      .selectAll('text')
      .style('text-anchor', 'middle')
      .attr('dy', '1em');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `$${d}`))
      .style('color', chartTheme.text);

    // Hover effects removed to prevent console errors
  }, [data, dimensions, chartTheme]);

  // Calculate totals
  const totalCurrent = data.reduce((sum, d) => sum + d.current, 0);
  const totalPrevious = data.reduce((sum, d) => sum + d.previous, 0);
  const totalChange = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious * 100) : 0;

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        className="overflow-visible"
      />
      
      {/* Summary Stats */}
      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Total Cost</span>
          <div className="flex items-center gap-1">
            {totalChange > 0 ? (
              <TrendingUp className="w-3 h-3 text-red-500" />
            ) : totalChange < 0 ? (
              <TrendingDown className="w-3 h-3 text-green-500" />
            ) : (
              <Minus className="w-3 h-3 text-gray-500" />
            )}
            <span className={`text-xs font-medium ${
              totalChange > 0 ? 'text-red-500' : totalChange < 0 ? 'text-green-500' : 'text-gray-500'
            }`}>
              {Math.abs(totalChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
            ${totalCurrent.toFixed(2)}
          </span>
          <span className="text-xs text-gray-500">per hour</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Daily:</span>
            <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
              ${(totalCurrent * 24).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Monthly:</span>
            <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
              ${(totalCurrent * 24 * 30).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};