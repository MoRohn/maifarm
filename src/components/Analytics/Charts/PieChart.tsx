import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { useThemeStore } from '@/store/themeStore';
import { generateChartTheme } from '@/utils/chartHelpers';

interface PieChartData {
  label: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieChartData[];
  width?: number;
  height?: number;
  innerRadius?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  onSliceClick?: (data: PieChartData) => void;
}

export const PieChart: React.FC<PieChartProps> = ({
  data,
  width = 400,
  height = 400,
  innerRadius = 0,
  showLabels = true,
  showTooltip = true,
  animate = true,
  onSliceClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const [dimensions, setDimensions] = useState({ width, height });

  const chartTheme = generateChartTheme(primaryColor, accentColor, theme === 'dark');

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const radius = Math.min(dimensions.width, dimensions.height) / 2 - 40;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    const g = svg.append('g')
      .attr('transform', `translate(${dimensions.width / 2},${dimensions.height / 2})`);

    // Create pie generator
    const pie = d3.pie<PieChartData>()
      .value(d => d.value)
      .sort(null);

    // Create arc generator
    const arc = d3.arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    // Create label arc generator
    const labelArc = d3.arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.6);

    // Add slices
    const slices = g.selectAll('.slice')
      .data(pie(data))
      .enter().append('g')
      .attr('class', 'slice');

    const paths = slices.append('path')
      .attr('fill', (d, i) => d.data.color || chartTheme.colors[i % chartTheme.colors.length])
      .style('cursor', onSliceClick ? 'pointer' : 'default')
      .style('opacity', 0.9);

    if (animate) {
      paths
        .transition()
        .duration(800)
        .attrTween('d', function(d) {
          const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
          return function(t) {
            return arc(interpolate(t))!;
          };
        });
    } else {
      paths.attr('d', arc);
    }

    // Add labels
    if (showLabels) {
      const labels = slices.append('text')
        .attr('transform', d => `translate(${labelArc.centroid(d)})`)
        .attr('dy', '.35em')
        .style('text-anchor', 'middle')
        .style('fill', chartTheme.text)
        .style('font-size', '12px')
        .style('opacity', 0);

      labels.text(d => {
        const percentValue = ((d.endAngle - d.startAngle) / (2 * Math.PI) * 100);
        const percent = percentValue.toFixed(1);
        return percentValue > 5 ? `${percent}%` : '';
      });

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
    if (onSliceClick) {
      paths.on('click', function(event, d) {
        onSliceClick(d.data);
      });
    }

    // Add legend
    const legendSpacing = 20;
    const legend = svg.append('g')
      .attr('transform', `translate(${dimensions.width - 150}, 20)`);

    const legendItems = legend.selectAll('.legend-item')
      .data(data)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * legendSpacing})`);

    legendItems.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', (d, i) => d.color || chartTheme.colors[i % chartTheme.colors.length]);

    legendItems.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('fill', chartTheme.text)
      .style('font-size', '12px')
      .text(d => d.label);

    // Handle resize
    const handleResize = () => {
      if (svgRef.current) {
        const { width: newWidth, height: newHeight } = svgRef.current.getBoundingClientRect();
        setDimensions({ width: newWidth, height: newHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data, dimensions, innerRadius, showLabels, showTooltip, animate, chartTheme, onSliceClick]);

  return (
    <div className="relative">
      <svg ref={svgRef} />
    </div>
  );
};