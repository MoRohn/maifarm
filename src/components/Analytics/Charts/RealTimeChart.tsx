import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';
import { TimeSeriesData, MetricDataPoint } from '../../../types/analytics';
import { useThemeStore } from '../../../store/themeStore';

interface RealTimeChartProps {
  data: TimeSeriesData | TimeSeriesData[];
  height?: number;
  showLegend?: boolean;
  animated?: boolean;
  className?: string;
}

export const RealTimeChart: React.FC<RealTimeChartProps> = ({
  data,
  height = 400,
  showLegend = true,
  animated = true,
  className = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const { width } = svgRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

  useEffect(() => {
    if (!data || dimensions.width === 0) return;
    
    // Handle both single and multiple time series
    const seriesArray = Array.isArray(data) ? data : [data];
    if (seriesArray.length === 0 || !seriesArray[0].data || seriesArray[0].data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = dimensions.width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create gradients for each line
    const defs = svg.append('defs');
    
    const gradientColors = [
      { id: 'gradient-blue', start: '#3B82F6', end: '#60A5FA' },
      { id: 'gradient-purple', start: '#8B5CF6', end: '#A78BFA' },
      { id: 'gradient-green', start: '#10B981', end: '#34D399' },
      { id: 'gradient-amber', start: '#F59E0B', end: '#FCD34D' }
    ];

    gradientColors.forEach(({ id, start, end }) => {
      const gradient = defs.append('linearGradient')
        .attr('id', id)
        .attr('x1', '0%')
        .attr('x2', '0%')
        .attr('y1', '0%')
        .attr('y2', '100%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', start)
        .attr('stop-opacity', 0.8);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', end)
        .attr('stop-opacity', 0.1);
    });

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get all data points from all series
    const allDataPoints = seriesArray.flatMap(s => s.data);
    
    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(allDataPoints, d => d.timestamp) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allDataPoints, d => d.value) || 100])
      .nice()
      .range([chartHeight, 0]);

    // Grid lines
    const xGrid = d3.axisBottom(xScale)
      .tickSize(-chartHeight)
      .tickFormat(() => '')
      .ticks(6);

    const yGrid = d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat(() => '')
      .ticks(5);

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3)
      .style('stroke', isDark ? '#4B5563' : '#E5E7EB');

    // Line generators
    const line = d3.line<MetricDataPoint>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const area = d3.area<MetricDataPoint>()
      .x(d => xScale(d.timestamp))
      .y0(chartHeight)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Draw areas and lines for each series
    seriesArray.forEach((series, idx) => {
      const seriesColor = series.color || ['#3B82F6', '#8B5CF6', '#10B981'][idx % 3];
      const gradientId = `gradient-${idx}`;
      
      // Draw area
      g.append('path')
        .datum(series.data)
        .attr('fill', `url(#${gradientId})`)
        .attr('d', area)
        .style('opacity', 0)
        .transition()
        .duration(animated ? 1000 : 0)
        .style('opacity', 0.3);

      // Draw line
      const path = g.append('path')
        .datum(series.data)
        .attr('fill', 'none')
        .attr('stroke', seriesColor)
        .attr('stroke-width', 2.5)
        .attr('d', line)
        .style('stroke-dasharray', series.isDashed ? '5,5' : 'none');

      if (animated) {
        const totalLength = path.node()?.getTotalLength() || 0;
        path
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(2000)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      }
    });

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat(d => d3.timeFormat('%H:%M')(d as Date));

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${d}`);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .style('color', isDark ? '#9CA3AF' : '#6B7280');

    g.append('g')
      .call(yAxis)
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

    // Interactive overlay
    g.append('rect')
      .attr('width', width)
      .attr('height', chartHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event);
        const x0 = xScale.invert(mouseX);
        
        let tooltipHtml = `<div style="color: ${isDark ? '#F3F4F6' : '#111827'}"><strong>${d3.timeFormat('%H:%M:%S')(x0)}</strong><br/>`;
        
        seriesArray.forEach((series) => {
          const bisect = d3.bisector((d: MetricDataPoint) => d.timestamp).left;
          const i = bisect(series.data, x0, 1);
          const d0 = series.data[i - 1];
          const d1 = series.data[i];
          
          if (d0 && d1) {
            const d = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;
            tooltipHtml += `${series.label}: <strong>${d.value.toFixed(2)}</strong><br/>`;
          }
        });
        
        tooltipHtml += '</div>';
        
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(tooltipHtml)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', () => {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => {
      d3.select('body').selectAll('.chart-tooltip').remove();
    };
  }, [data, dimensions, height, animated, isDark]);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        className="overflow-visible"
      />
      {showLegend && (
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Throughput</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Success Rate</span>
          </div>
        </div>
      )}
    </div>
  );
};