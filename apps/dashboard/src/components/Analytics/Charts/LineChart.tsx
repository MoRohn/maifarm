import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TimeSeriesData, MetricDataPoint } from '@/types/analytics';
import { formatAxisDate, getChartDomain, generateChartTheme } from '@/utils/chartHelpers';
import { useThemeStore } from '@/store/themeStore';

interface LineChartProps {
  data: TimeSeriesData[];
  width?: number;
  height?: number;
  showLegend?: boolean;
  showTooltip?: boolean;
  showGrid?: boolean;
  animate?: boolean;
  timeRange?: 'hour' | 'day' | 'week' | 'month';
  onDataPointClick?: (_seriesLabel: string, _dataPoint: MetricDataPoint) => void;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 800,
  height = 400,
  showLegend = true,
  showTooltip = true,
  showGrid = true,
  animate = true,
  timeRange = 'day',
  onDataPointClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const [dimensions, setDimensions] = useState({ width, height });

  const chartTheme = generateChartTheme(primaryColor, accentColor, theme === 'dark');

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const margin = { top: 20, right: showLegend ? 150 : 50, bottom: 50, left: 70 };
    const innerWidth = dimensions.width - margin.left - margin.right;
    const innerHeight = dimensions.height - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get all data points
    const allDataPoints = data.flatMap(series => series.data);
    
    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(allDataPoints, d => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    const yDomain = getChartDomain(allDataPoints);
    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range([innerHeight, 0]);

    // Add grid
    if (showGrid) {
      // X grid
      g.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3)
        .style('stroke', chartTheme.grid);

      // Y grid
      g.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3)
        .style('stroke', chartTheme.grid);
    }

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat(d => formatAxisDate(d as Date, timeRange))
      )
      .style('color', chartTheme.text);

    g.append('g')
      .call(d3.axisLeft(yScale))
      .style('color', chartTheme.text);

    // Add axis labels
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (innerHeight / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('fill', chartTheme.text)
      .text('Value');

    // Create line generator
    const line = d3.line<MetricDataPoint>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Add lines
    data.forEach((series, index) => {
      const path = g.append('path')
        .datum(series.data)
        .attr('fill', 'none')
        .attr('stroke', series.color || chartTheme.colors[index % chartTheme.colors.length])
        .attr('stroke-width', 2)
        .attr('d', line);

      if (animate) {
        const totalLength = path.node()?.getTotalLength() || 0;
        path
          .attr('stroke-dasharray', totalLength + ' ' + totalLength)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(1500)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      }

      // Add dots
      const dots = g.selectAll(`.dot-${index}`)
        .data(series.data)
        .enter().append('circle')
        .attr('class', `dot-${index}`)
        .attr('cx', (d: any) => xScale(d.timestamp))
        .attr('cy', (d: any) => yScale(d.value))
        .attr('r', 0)
        .attr('fill', series.color || chartTheme.colors[index % chartTheme.colors.length])
        .style('cursor', 'pointer');

      if (animate) {
        dots.transition()
          .delay((d, i) => i * 20)
          .duration(300)
          .attr('r', 4);
      } else {
        dots.attr('r', 4);
      }

      // Hover effects removed to prevent console errors
      if (onDataPointClick) {
        dots.on('click', function(event, d) {
          onDataPointClick(series.label, d as any);
        });
      }
    });

    // Add legend
    if (showLegend) {
      const legend = g.append('g')
        .attr('transform', `translate(${innerWidth + 20}, 20)`);

      data.forEach((series, index) => {
        const legendRow = legend.append('g')
          .attr('transform', `translate(0, ${index * 20})`);

        legendRow.append('rect')
          .attr('width', 10)
          .attr('height', 10)
          .attr('fill', series.color || chartTheme.colors[index % chartTheme.colors.length]);

        legendRow.append('text')
          .attr('x', 15)
          .attr('y', 9)
          .style('font-size', '12px')
          .style('fill', chartTheme.text)
          .text(series.label);
      });
    }

    // Handle resize
    const handleResize = () => {
      if (svgRef.current) {
        const { width: newWidth } = svgRef.current.getBoundingClientRect();
        setDimensions({ width: newWidth, height });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data, dimensions, showLegend, showGrid, animate, timeRange, chartTheme, showTooltip, onDataPointClick]);

  return (
    <div className="relative w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
};