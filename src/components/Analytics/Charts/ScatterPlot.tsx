import React, { useMemo } from 'react';
import { useThemeStore } from '../../../store/themeStore';

interface DataPoint {
  x: number;
  y: number;
  label?: string;
  size?: number;
  color?: string;
}

interface ScatterPlotProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  showTrendLine?: boolean;
  animate?: boolean;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  width = 600,
  height = 400,
  xLabel = 'X Axis',
  yLabel = 'Y Axis',
  showTrendLine = false,
  animate = true
}) => {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const margin = { top: 40, right: 40, bottom: 60, left: 60 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const { xScale, yScale, trendLine } = useMemo(() => {
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    
    const xPadding = (xMax - xMin) * 0.1;
    const yPadding = (yMax - yMin) * 0.1;
    
    const xScale = (value: number) => 
      ((value - (xMin - xPadding)) / ((xMax + xPadding) - (xMin - xPadding))) * plotWidth;
    
    const yScale = (value: number) => 
      plotHeight - ((value - (yMin - yPadding)) / ((yMax + yPadding) - (yMin - yPadding))) * plotHeight;
    
    // Calculate trend line using simple linear regression
    let trendLine = null;
    if (showTrendLine && data.length > 1) {
      const n = data.length;
      const sumX = data.reduce((sum, d) => sum + d.x, 0);
      const sumY = data.reduce((sum, d) => sum + d.y, 0);
      const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0);
      const sumXX = data.reduce((sum, d) => sum + d.x * d.x, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      const x1 = xMin - xPadding;
      const x2 = xMax + xPadding;
      const y1 = slope * x1 + intercept;
      const y2 = slope * x2 + intercept;
      
      trendLine = { x1, y1, x2, y2 };
    }
    
    return { xScale, yScale, trendLine };
  }, [data, plotWidth, plotHeight, showTrendLine]);

  // Generate axis ticks
  const xTicks = useMemo(() => {
    const xValues = data.map(d => d.x);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const tickCount = 5;
    const tickStep = (xMax - xMin) / (tickCount - 1);
    
    return Array.from({ length: tickCount }, (_, i) => xMin + i * tickStep);
  }, [data]);

  const yTicks = useMemo(() => {
    const yValues = data.map(d => d.y);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const tickCount = 5;
    const tickStep = (yMax - yMin) / (tickCount - 1);
    
    return Array.from({ length: tickCount }, (_, i) => yMin + i * tickStep);
  }, [data]);

  return (
    <div className="scatter-plot-container">
      <svg width={width} height={height}>
        {/* Background */}
        <rect
          width={width}
          height={height}
          fill={isDark ? '#1F2937' : '#FFFFFF'}
          rx={8}
        />
        
        {/* Plot area */}
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines */}
          {xTicks.map((tick, index) => (
            <line
              key={`x-grid-${index}`}
              x1={xScale(tick)}
              y1={0}
              x2={xScale(tick)}
              y2={plotHeight}
              stroke={isDark ? '#374151' : '#E5E7EB'}
              strokeDasharray="2,2"
            />
          ))}
          
          {yTicks.map((tick, index) => (
            <line
              key={`y-grid-${index}`}
              x1={0}
              y1={yScale(tick)}
              x2={plotWidth}
              y2={yScale(tick)}
              stroke={isDark ? '#374151' : '#E5E7EB'}
              strokeDasharray="2,2"
            />
          ))}
          
          {/* Axes */}
          <line
            x1={0}
            y1={plotHeight}
            x2={plotWidth}
            y2={plotHeight}
            stroke={isDark ? '#6B7280' : '#9CA3AF'}
            strokeWidth={2}
          />
          
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={plotHeight}
            stroke={isDark ? '#6B7280' : '#9CA3AF'}
            strokeWidth={2}
          />
          
          {/* X-axis ticks and labels */}
          {xTicks.map((tick, index) => (
            <g key={`x-tick-${index}`}>
              <line
                x1={xScale(tick)}
                y1={plotHeight}
                x2={xScale(tick)}
                y2={plotHeight + 5}
                stroke={isDark ? '#6B7280' : '#9CA3AF'}
              />
              <text
                x={xScale(tick)}
                y={plotHeight + 20}
                textAnchor="middle"
                fontSize="12"
                fill={isDark ? '#9CA3AF' : '#4B5563'}
              >
                {tick.toFixed(1)}
              </text>
            </g>
          ))}
          
          {/* Y-axis ticks and labels */}
          {yTicks.map((tick, index) => (
            <g key={`y-tick-${index}`}>
              <line
                x1={-5}
                y1={yScale(tick)}
                x2={0}
                y2={yScale(tick)}
                stroke={isDark ? '#6B7280' : '#9CA3AF'}
              />
              <text
                x={-10}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
                fill={isDark ? '#9CA3AF' : '#4B5563'}
              >
                {tick.toFixed(1)}
              </text>
            </g>
          ))}
          
          {/* Trend line */}
          {showTrendLine && trendLine && (
            <line
              x1={xScale(trendLine.x1)}
              y1={yScale(trendLine.y1)}
              x2={xScale(trendLine.x2)}
              y2={yScale(trendLine.y2)}
              stroke="#EF4444"
              strokeWidth={2}
              strokeDasharray="5,5"
              opacity={0.7}
            />
          )}
          
          {/* Data points */}
          {data.map((point, index) => (
            <g key={`point-${index}`}>
              <circle
                cx={xScale(point.x)}
                cy={yScale(point.y)}
                r={point.size || 5}
                fill={point.color || '#3B82F6'}
                opacity={0.8}
                className={animate ? 'transition-all hover:opacity-100' : ''}
                style={animate ? {
                  animation: `fadeIn 0.5s ease-out ${index * 0.05}s both`
                } : {}}
              >
                {point.label && <title>{point.label}</title>}
              </circle>
              {point.label && (
                <text
                  x={xScale(point.x)}
                  y={yScale(point.y) - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill={isDark ? '#D1D5DB' : '#374151'}
                  opacity={0}
                  className="transition-opacity hover:opacity-100"
                >
                  {point.label}
                </text>
              )}
            </g>
          ))}
          
          {/* Axis labels */}
          <text
            x={plotWidth / 2}
            y={plotHeight + 45}
            textAnchor="middle"
            fontSize="14"
            fill={isDark ? '#D1D5DB' : '#374151'}
            fontWeight="500"
          >
            {xLabel}
          </text>
          
          <text
            x={-plotHeight / 2}
            y={-40}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize="14"
            fill={isDark ? '#D1D5DB' : '#374151'}
            fontWeight="500"
          >
            {yLabel}
          </text>
        </g>
      </svg>
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0);
          }
          to {
            opacity: 0.8;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};