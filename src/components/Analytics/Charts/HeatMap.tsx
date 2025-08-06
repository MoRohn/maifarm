import React, { useMemo } from 'react';
import { useThemeStore } from '../../../store/themeStore';

interface HeatMapProps {
  data: Array<{
    x: string;
    y: string;
    value: number;
  }>;
  width?: number;
  height?: number;
  colorScale?: {
    min: string;
    max: string;
  };
  showValues?: boolean;
  title?: string;
}

export const HeatMap: React.FC<HeatMapProps> = ({
  data,
  width = 600,
  height = 400,
  colorScale = { min: '#EFF6FF', max: '#1E40AF' },
  showValues = true,
  title
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const { xLabels, yLabels, matrix, maxValue, minValue } = useMemo(() => {
    const xSet = new Set(data.map(d => d.x));
    const ySet = new Set(data.map(d => d.y));
    const xLabels = Array.from(xSet);
    const yLabels = Array.from(ySet);
    
    const matrix: number[][] = [];
    let maxValue = -Infinity;
    let minValue = Infinity;
    
    yLabels.forEach((y, yIndex) => {
      matrix[yIndex] = [];
      xLabels.forEach((x, xIndex) => {
        const point = data.find(d => d.x === x && d.y === y);
        const value = point ? point.value : 0;
        matrix[yIndex][xIndex] = value;
        maxValue = Math.max(maxValue, value);
        minValue = Math.min(minValue, value);
      });
    });
    
    return { xLabels, yLabels, matrix, maxValue, minValue };
  }, [data]);

  const cellWidth = (width - 100) / xLabels.length;
  const cellHeight = (height - 100) / yLabels.length;

  const getColor = (value: number): string => {
    const normalized = (value - minValue) / (maxValue - minValue);
    
    // Parse colors
    const minColor = colorScale.min;
    const maxColor = colorScale.max;
    
    // Simple color interpolation (assumes hex colors)
    const r1 = parseInt(minColor.slice(1, 3), 16);
    const g1 = parseInt(minColor.slice(3, 5), 16);
    const b1 = parseInt(minColor.slice(5, 7), 16);
    
    const r2 = parseInt(maxColor.slice(1, 3), 16);
    const g2 = parseInt(maxColor.slice(3, 5), 16);
    const b2 = parseInt(maxColor.slice(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * normalized);
    const g = Math.round(g1 + (g2 - g1) * normalized);
    const b = Math.round(b1 + (b2 - b1) * normalized);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const getTextColor = (value: number): string => {
    const normalized = (value - minValue) / (maxValue - minValue);
    return normalized > 0.5 ? '#FFFFFF' : '#000000';
  };

  return (
    <div className="heat-map-container">
      {title && (
        <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{title}</h4>
      )}
      <svg width={width} height={height}>
        {/* Background */}
        <rect
          width={width}
          height={height}
          fill={isDark ? '#1F2937' : '#FFFFFF'}
          rx={8}
        />
        
        {/* Y-axis labels */}
        {yLabels.map((label, index) => (
          <text
            key={`y-${index}`}
            x={90}
            y={80 + index * cellHeight + cellHeight / 2}
            textAnchor="end"
            fontSize="12"
            fill={isDark ? '#9CA3AF' : '#4B5563'}
            dominantBaseline="middle"
          >
            {label}
          </text>
        ))}
        
        {/* X-axis labels */}
        {xLabels.map((label, index) => (
          <text
            key={`x-${index}`}
            x={100 + index * cellWidth + cellWidth / 2}
            y={height - 20}
            textAnchor="middle"
            fontSize="12"
            fill={isDark ? '#9CA3AF' : '#4B5563'}
          >
            {label}
          </text>
        ))}
        
        {/* Heat map cells */}
        {matrix.map((row, yIndex) => 
          row.map((value, xIndex) => (
            <g key={`cell-${yIndex}-${xIndex}`}>
              <rect
                x={100 + xIndex * cellWidth}
                y={60 + yIndex * cellHeight}
                width={cellWidth - 2}
                height={cellHeight - 2}
                fill={getColor(value)}
                rx={2}
                className="transition-all hover:opacity-80"
              />
              {showValues && (
                <text
                  x={100 + xIndex * cellWidth + cellWidth / 2}
                  y={60 + yIndex * cellHeight + cellHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill={getTextColor(value)}
                  fontWeight="500"
                >
                  {value.toFixed(0)}
                </text>
              )}
            </g>
          ))
        )}
        
        {/* Color scale legend */}
        <defs>
          <linearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colorScale.min} />
            <stop offset="100%" stopColor={colorScale.max} />
          </linearGradient>
        </defs>
        
        <rect
          x={width - 150}
          y={20}
          width={100}
          height={15}
          fill="url(#colorGradient)"
          rx={2}
        />
        
        <text
          x={width - 155}
          y={30}
          textAnchor="end"
          fontSize="10"
          fill={isDark ? '#9CA3AF' : '#4B5563'}
        >
          {minValue.toFixed(0)}
        </text>
        
        <text
          x={width - 45}
          y={30}
          textAnchor="start"
          fontSize="10"
          fill={isDark ? '#9CA3AF' : '#4B5563'}
        >
          {maxValue.toFixed(0)}
        </text>
      </svg>
    </div>
  );
};