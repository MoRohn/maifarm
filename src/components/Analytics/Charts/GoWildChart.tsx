import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import { useThemeStore } from '../../../store/themeStore';
import { Sparkles, TrendingUp, Zap, Target } from 'lucide-react';

interface GoWildMetric {
  timestamp: Date;
  exploration: number;
  creativity: number;
  discoveries: number;
  efficiency: number;
  boundaries: {
    min: number;
    max: number;
  };
}

interface GoWildChartProps {
  data?: GoWildMetric[];
  height?: number;
  className?: string;
}

export const GoWildChart: React.FC<GoWildChartProps> = ({
  data = [],
  height = 350,
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

    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.timestamp) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0]);

    // Create gradients
    const defs = svg.append('defs');

    // Exploration gradient
    const explorationGradient = defs.append('linearGradient')
      .attr('id', 'exploration-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    
    explorationGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#A855F7')
      .attr('stop-opacity', 0.8);
    
    explorationGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#A855F7')
      .attr('stop-opacity', 0.1);

    // Creativity gradient
    const creativityGradient = defs.append('linearGradient')
      .attr('id', 'creativity-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    
    creativityGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#EC4899')
      .attr('stop-opacity', 0.8);
    
    creativityGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#EC4899')
      .attr('stop-opacity', 0.1);

    // Draw boundary area
    const boundaryArea = d3.area<GoWildMetric>()
      .x(d => x(d.timestamp))
      .y0(d => y(d.boundaries.min))
      .y1(d => y(d.boundaries.max))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(chartData)
      .attr('fill', isDark ? '#374151' : '#E5E7EB')
      .attr('opacity', 0.2)
      .attr('d', boundaryArea);

    // Line generators
    const explorationLine = d3.line<GoWildMetric>()
      .x(d => x(d.timestamp))
      .y(d => y(d.exploration))
      .curve(d3.curveMonotoneX);

    const creativityLine = d3.line<GoWildMetric>()
      .x(d => x(d.timestamp))
      .y(d => y(d.creativity))
      .curve(d3.curveMonotoneX);

    const efficiencyLine = d3.line<GoWildMetric>()
      .x(d => x(d.timestamp))
      .y(d => y(d.efficiency))
      .curve(d3.curveMonotoneX);

    // Draw lines
    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#A855F7')
      .attr('stroke-width', 2.5)
      .attr('d', explorationLine)
      .attr('class', 'exploration-line');

    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#EC4899')
      .attr('stroke-width', 2.5)
      .attr('d', creativityLine)
      .attr('class', 'creativity-line');

    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#10B981')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('d', efficiencyLine)
      .attr('class', 'efficiency-line');

    // Discovery markers
    g.selectAll('.discovery-marker')
      .data(chartData.filter(d => d.discoveries > 0))
      .enter().append('circle')
      .attr('class', 'discovery-marker')
      .attr('cx', d => x(d.timestamp))
      .attr('cy', d => y(d.exploration))
      .attr('r', d => Math.sqrt(d.discoveries) * 3)
      .attr('fill', '#FCD34D')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 2)
      .style('opacity', 0.8);

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

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .ticks(6)
        .tickFormat(d => d3.timeFormat('%H:%M')(d as Date)))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    g.append('g')
      .call(d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d => `${d}%`))
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    // Y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (chartHeight / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('fill', isDark ? '#9CA3AF' : '#6B7280')
      .style('font-size', '12px')
      .text('Metric Value (%)');

    // Interactive tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'gowild-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', isDark ? '#1F2937' : 'white')
      .style('border', `1px solid ${isDark ? '#374151' : '#E5E7EB'}`)
      .style('border-radius', '8px')
      .style('padding', '12px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.1)');

    // Hover interactions
    g.append('rect')
      .attr('width', width)
      .attr('height', chartHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event);
        const x0 = x.invert(mouseX);
        
        const bisect = d3.bisector((d: GoWildMetric) => d.timestamp).left;
        const i = bisect(chartData, x0, 1);
        const d0 = chartData[i - 1];
        const d1 = chartData[i];
        
        if (d0 && d1) {
          const d = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;
          
          const tooltipHtml = `
            <div style="color: ${isDark ? '#F3F4F6' : '#111827'}">
              <strong>${d3.timeFormat('%H:%M:%S')(d.timestamp)}</strong><br/>
              <div style="margin-top: 4px;">
                <span style="color: #A855F7">● Exploration:</span> <strong>${d.exploration.toFixed(1)}%</strong><br/>
                <span style="color: #EC4899">● Creativity:</span> <strong>${d.creativity.toFixed(1)}%</strong><br/>
                <span style="color: #10B981">● Efficiency:</span> <strong>${d.efficiency.toFixed(1)}%</strong><br/>
                <span style="color: #F59E0B">★ Discoveries:</span> <strong>${d.discoveries}</strong><br/>
                <span style="color: #6B7280">▬ Boundaries:</span> <strong>${d.boundaries.min}-${d.boundaries.max}%</strong>
              </div>
            </div>
          `;
          
          tooltip.transition().duration(200).style('opacity', 0.9);
          tooltip.html(tooltipHtml)
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`);
        }
      })
      .on('mouseout', () => {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => {
      d3.select('body').selectAll('.gowild-tooltip').remove();
    };
  }, [data, height, isDark]);

  const generateMockData = (): GoWildMetric[] => {
    const points = 24;
    const data: GoWildMetric[] = [];
    const now = new Date();
    
    for (let i = 0; i < points; i++) {
      const timestamp = new Date(now.getTime() - (points - i) * 15 * 60 * 1000);
      const exploration = 30 + Math.random() * 50 + Math.sin(i / 3) * 10;
      const creativity = 40 + Math.random() * 40 + Math.cos(i / 4) * 15;
      
      data.push({
        timestamp,
        exploration: Math.max(0, Math.min(100, exploration)),
        creativity: Math.max(0, Math.min(100, creativity)),
        discoveries: Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0,
        efficiency: 50 + Math.random() * 30,
        boundaries: {
          min: 20 + Math.random() * 10,
          max: 70 + Math.random() * 20
        }
      });
    }
    
    return data;
  };

  // Calculate summary stats
  const currentData = data.length > 0 ? data : generateMockData();
  const latestMetric = currentData[currentData.length - 1] || null;
  const avgExploration = currentData.reduce((sum, d) => sum + d.exploration, 0) / currentData.length;
  const totalDiscoveries = currentData.reduce((sum, d) => sum + d.discoveries, 0);

  return (
    <div className={`relative ${className}`}>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Exploration</span>
          </div>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
            {latestMetric ? `${latestMetric.exploration.toFixed(1)}%` : '—'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-pink-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Creativity</span>
          </div>
          <p className="text-lg font-bold text-pink-600 dark:text-pink-400">
            {latestMetric ? `${latestMetric.creativity.toFixed(1)}%` : '—'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Discoveries</span>
          </div>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
            {totalDiscoveries}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Efficiency</span>
          </div>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">
            {latestMetric ? `${latestMetric.efficiency.toFixed(1)}%` : '—'}
          </p>
        </motion.div>
      </div>

      {/* Chart */}
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

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-purple-500" />
          <span className="text-gray-600 dark:text-gray-400">Exploration</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-pink-500" />
          <span className="text-gray-600 dark:text-gray-400">Creativity</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-green-500" style={{ borderTop: '2px dashed' }} />
          <span className="text-gray-600 dark:text-gray-400">Efficiency</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="text-gray-600 dark:text-gray-400">Discoveries</span>
        </div>
      </div>
    </div>
  );
};