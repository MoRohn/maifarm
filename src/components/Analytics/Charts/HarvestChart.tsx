import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { useThemeStore } from '../../../store/themeStore';
import { useFarmStore } from '../../../store/farmStore';
import { generateChartTheme } from '../../../utils/chartHelpers';
import { Package, TrendingUp, Clock, CheckCircle } from 'lucide-react';

interface HarvestData {
  category: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}

interface HarvestChartProps {
  className?: string;
}

export const HarvestChart: React.FC<HarvestChartProps> = ({ className = '' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 250 });
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const farms = useFarmStore((state) => state.farms);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Memoize chartTheme to prevent infinite re-renders
  const chartTheme = useMemo(() => 
    generateChartTheme(primaryColor, accentColor, isDark),
    [primaryColor, accentColor, isDark]
  );

  // Calculate harvest data from farms - initialize with demo data
  const [data, setData] = useState<HarvestData[]>([
    {
      category: 'Completed',
      value: 12,
      color: '#10B981',
      icon: <CheckCircle className="w-4 h-4" />
    },
    {
      category: 'Running',
      value: 8,
      color: '#3B82F6',
      icon: <TrendingUp className="w-4 h-4" />
    },
    {
      category: 'Pending',
      value: 5,
      color: '#F59E0B',
      icon: <Clock className="w-4 h-4" />
    },
    {
      category: 'Failed',
      value: 2,
      color: '#EF4444',
      icon: <Package className="w-4 h-4" />
    }
  ]);

  useEffect(() => {
    // Calculate harvest analytics from farms
    const completed = farms.filter(f => f.status === 'completed').length;
    const running = farms.filter(f => f.status === 'active').length;
    const pending = farms.filter(f => f.status === 'paused').length;
    const failed = farms.filter(f => f.status === 'failed').length;
    
    // Use demo data if no farms exist
    const hasRealData = farms.length > 0;
    
    const harvestData: HarvestData[] = [
      {
        category: 'Completed',
        value: hasRealData ? completed : 12,
        color: chartTheme.colors?.[2] || '#10B981',
        icon: <CheckCircle className="w-4 h-4" />
      },
      {
        category: 'Running',
        value: hasRealData ? running : 8,
        color: chartTheme.primary || '#3B82F6',
        icon: <TrendingUp className="w-4 h-4" />
      },
      {
        category: 'Pending',
        value: hasRealData ? pending : 5,
        color: chartTheme.colors?.[3] || '#F59E0B',
        icon: <Clock className="w-4 h-4" />
      },
      {
        category: 'Failed',
        value: hasRealData ? failed : 2,
        color: chartTheme.colors?.[4] || '#EF4444',
        icon: <Package className="w-4 h-4" />
      }
    ];
    
    // Don't filter out zero values for demo data
    const filteredData = hasRealData 
      ? harvestData.filter(d => d.value > 0)
      : harvestData; // Show all demo data even if value is 0

    setData(filteredData);
  }, [farms.length, chartTheme]); // Use farms.length instead of farms to avoid deep comparison

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
    // Always try to render if we have any dimension
    if (!svgRef.current || dimensions.width === 0) {
      console.log('HarvestChart: Waiting for dimensions', { width: dimensions.width });
      return;
    }
    
    // Use empty data array if no data yet (will show empty chart)
    const chartData = data && data.length > 0 ? data : [];

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    // If no data, show a message
    if (chartData.length === 0) {
      svg.append('text')
        .attr('x', dimensions.width / 2)
        .attr('y', dimensions.height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', chartTheme.text)
        .style('font-size', '14px')
        .text('No harvest data available');
      return;
    }

    const width = dimensions.width;
    const height = dimensions.height;
    const radius = Math.min(width, height) / 2 - 20;

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Create pie layout
    const pie = d3.pie<HarvestData>()
      .value(d => d.value)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<HarvestData>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius);

    const arcHover = d3.arc<d3.PieArcDatum<HarvestData>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 1.05);

    // Create gradients
    const defs = svg.append('defs');
    chartData.forEach((d, i) => {
      const gradient = defs.append('radialGradient')
        .attr('id', `harvest-gradient-${i}`)
        .attr('cx', '50%')
        .attr('cy', '50%')
        .attr('r', '50%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', d.color || chartTheme.primary)
        .attr('stop-opacity', 0.8);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', d.color || chartTheme.primary)
        .attr('stop-opacity', 1);
    });

    // Draw pie slices
    const slices = g.selectAll('.slice')
      .data(pie(chartData))
      .enter().append('g')
      .attr('class', 'slice');

    slices.append('path')
      .attr('d', arc)
      .attr('fill', (_, i) => `url(#harvest-gradient-${i})`)
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .delay((_, i) => i * 100)
      .style('opacity', 1)
      .attrTween('d', function(d) {
        const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function(t) {
          return arc(interpolate(t))!;
        };
      });

    // Hover effects removed to prevent console errors

    // Center text
    const total = data.reduce((sum, d) => sum + d.value, 0);
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', chartTheme.text)
      .text(total);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .style('font-size', '12px')
      .style('fill', chartTheme.text)
      .text('Total Harvests');

  }, [data, dimensions, chartTheme]);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        className="overflow-visible"
      />
      
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {item.category}: {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};