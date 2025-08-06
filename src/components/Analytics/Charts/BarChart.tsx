import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { useThemeStore } from '../../../store/themeStore';
import { generateChartTheme } from '../../../utils/chartHelpers';

interface BarChartData {
  label: string;
  value: number;
  color?: string;
  metadata?: any;
}

interface BarChartProps {
  data: BarChartData[];
  width?: number;
  height?: number;
  orientation?: 'vertical' | 'horizontal';
  showValues?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  unit?: string;
  onBarClick?: (data: BarChartData) => void;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 600,
  height = 400,
  orientation = 'vertical',
  showValues = false,
  showTooltip = true,
  animate = true,
  unit = '',
  onBarClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const [dimensions, setDimensions] = useState({ width, height });

  const chartTheme = generateChartTheme(primaryColor, accentColor, theme === 'dark');

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const margin = { top: 20, right: 30, bottom: 60, left: 70 };
    const innerWidth = dimensions.width - margin.left - margin.right;
    const innerHeight = dimensions.height - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    let xScale: any, yScale: any;

    if (orientation === 'vertical') {
      xScale = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([0, innerWidth])
        .padding(0.1);

      yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0])
        .nice()
        .range([innerHeight, 0]);
    } else {
      xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0])
        .nice()
        .range([0, innerWidth]);

      yScale = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([0, innerHeight])
        .padding(0.1);
    }

    // Add axes
    if (orientation === 'vertical') {
      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))
        .style('color', chartTheme.text)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');

      g.append('g')
        .call(d3.axisLeft(yScale))
        .style('color', chartTheme.text);
    } else {
      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))
        .style('color', chartTheme.text);

      g.append('g')
        .call(d3.axisLeft(yScale))
        .style('color', chartTheme.text);
    }

    // Add bars
    const bars = g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .style('cursor', onBarClick ? 'pointer' : 'default');

    if (orientation === 'vertical') {
      bars
        .attr('x', d => xScale(d.label))
        .attr('y', innerHeight)
        .attr('width', xScale.bandwidth())
        .attr('height', 0)
        .attr('fill', (d, i) => d.color || chartTheme.colors[i % chartTheme.colors.length]);

      if (animate) {
        bars.transition()
          .duration(800)
          .delay((d, i) => i * 50)
          .attr('y', d => yScale(d.value))
          .attr('height', d => innerHeight - yScale(d.value));
      } else {
        bars
          .attr('y', d => yScale(d.value))
          .attr('height', d => innerHeight - yScale(d.value));
      }
    } else {
      bars
        .attr('x', 0)
        .attr('y', d => yScale(d.label))
        .attr('width', 0)
        .attr('height', yScale.bandwidth())
        .attr('fill', (d, i) => d.color || chartTheme.colors[i % chartTheme.colors.length]);

      if (animate) {
        bars.transition()
          .duration(800)
          .delay((d, i) => i * 50)
          .attr('width', d => xScale(d.value));
      } else {
        bars.attr('width', d => xScale(d.value));
      }
    }

    // Add value labels
    if (showValues) {
      const labels = g.selectAll('.label')
        .data(data)
        .enter().append('text')
        .attr('class', 'label')
        .style('fill', chartTheme.text)
        .style('font-size', '12px')
        .style('text-anchor', 'middle')
        .style('opacity', 0);

      if (orientation === 'vertical') {
        labels
          .attr('x', d => xScale(d.label)! + xScale.bandwidth() / 2)
          .attr('y', d => yScale(d.value) - 5)
          .text(d => `${d.value.toFixed(1)}${unit}`);
      } else {
        labels
          .attr('x', d => xScale(d.value) + 5)
          .attr('y', d => yScale(d.label)! + yScale.bandwidth() / 2)
          .attr('dy', '.35em')
          .style('text-anchor', 'start')
          .text(d => `${d.value.toFixed(1)}${unit}`);
      }

      if (animate) {
        labels.transition()
          .delay(800)
          .duration(300)
          .style('opacity', 1);
      } else {
        labels.style('opacity', 1);
      }
    }

    // Hover effects removed to prevent console errors
    if (onBarClick) {
      bars.on('click', function(event, d) {
        onBarClick(d);
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
  }, [data, dimensions, orientation, showValues, showTooltip, animate, unit, chartTheme, onBarClick]);

  return (
    <div className="relative w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
};