import { format } from 'date-fns';
import { TimeSeriesData, MetricDataPoint } from '../types/analytics';

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  colors: string[];
  primary: string;
  accent: string;
}

// Generate chart theme based on primary and accent colors
export const generateChartTheme = (primary: string, accent: string, isDark: boolean): ChartTheme => {
  const baseColors = interpolateColors(primary, accent, 8);
  
  // Fallback to default colors if interpolation fails
  const fallbackColors = isDark ? darkChartTheme.colors : defaultChartTheme.colors;
  
  return {
    background: 'transparent',
    text: isDark ? '#9CA3AF' : '#6B7280',
    grid: isDark ? '#374151' : '#E5E7EB',
    primary: primary || '#3B82F6',
    accent: accent || '#8B5CF6',
    colors: baseColors.length >= 8 ? baseColors : fallbackColors,
  };
};

export const defaultChartTheme: ChartTheme = {
  background: 'transparent',
  text: '#6B7280',
  grid: '#E5E7EB',
  primary: '#3B82F6',
  accent: '#8B5CF6',
  colors: [
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#06B6D4', // Cyan
    '#EC4899', // Pink
    '#F97316', // Orange
  ],
};

export const darkChartTheme: ChartTheme = {
  background: 'transparent',
  text: '#9CA3AF',
  grid: '#374151',
  primary: '#60A5FA',
  accent: '#A78BFA',
  colors: [
    '#60A5FA', // Blue
    '#A78BFA', // Purple
    '#34D399', // Green
    '#FBBF24', // Amber
    '#F87171', // Red
    '#22D3EE', // Cyan
    '#F472B6', // Pink
    '#FB923C', // Orange
  ],
};

export function formatAxisDate(date: Date | string, range: 'hour' | 'day' | 'week' | 'month'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  switch (range) {
    case 'hour':
      return format(d, 'HH:mm');
    case 'day':
      return format(d, 'MMM dd');
    case 'week':
      return format(d, 'MMM dd');
    case 'month':
      return format(d, 'MMM yyyy');
    default:
      return format(d, 'MMM dd');
  }
}

export function getChartDomain(data: MetricDataPoint[], padding: number = 0.1): [number, number] {
  if (data.length === 0) return [0, 100];
  
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  return [
    Math.max(0, min - range * padding),
    max + range * padding,
  ];
}

export function interpolateColors(color1: string, color2: string, steps: number): string[] {
  const colors: string[] = [];
  
  // Convert hex to RGB
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return [color1, color2];
  
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * t);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * t);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * t);
    colors.push(rgbToHex(r, g, b));
  }
  
  return colors;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function generateGradient(color: string, opacity: number = 0.1): string {
  return `linear-gradient(to bottom, ${color}${Math.round(opacity * 255).toString(16)}, transparent)`;
}

export function getResponsiveChartHeight(width: number): number {
  if (width < 640) return 300; // Mobile
  if (width < 1024) return 400; // Tablet
  return 500; // Desktop
}

export function prepareLineChartData(
  series: TimeSeriesData[],
  smoothing: boolean = false
): any[] {
  if (series.length === 0) return [];
  
  // Find all unique timestamps
  const allTimestamps = new Set<number>();
  series.forEach(s => {
    s.data.forEach(d => allTimestamps.add(d.timestamp.getTime()));
  });
  
  // Sort timestamps
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
  
  // Create data points for each timestamp
  return sortedTimestamps.map(timestamp => {
    const dataPoint: any = { timestamp: new Date(timestamp) };
    
    series.forEach(s => {
      const point = s.data.find(d => d.timestamp.getTime() === timestamp);
      dataPoint[s.label] = point ? point.value : null;
    });
    
    return dataPoint;
  });
}

export function preparePieChartData(
  data: Record<string, number>,
  threshold: number = 0.01
): any[] {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  const chartData: any[] = [];
  let otherValue = 0;
  
  Object.entries(data).forEach(([name, value]) => {
    const percentage = value / total;
    if (percentage >= threshold) {
      chartData.push({
        name,
        value,
        percentage: percentage * 100,
      });
    } else {
      otherValue += value;
    }
  });
  
  if (otherValue > 0) {
    chartData.push({
      name: 'Other',
      value: otherValue,
      percentage: (otherValue / total) * 100,
    });
  }
  
  return chartData.sort((a, b) => b.value - a.value);
}

export function prepareHeatmapData(
  data: number[][],
  xLabels: string[],
  yLabels: string[]
): any[] {
  const heatmapData: any[] = [];
  
  data.forEach((row, yIndex) => {
    row.forEach((value, xIndex) => {
      heatmapData.push({
        x: xIndex,
        y: yIndex,
        value,
        xLabel: xLabels[xIndex],
        yLabel: yLabels[yIndex],
      });
    });
  });
  
  return heatmapData;
}

export function calculateTrendLine(data: MetricDataPoint[]): MetricDataPoint[] {
  if (data.length < 2) return [];
  
  // Simple linear regression
  const n = data.length;
  const xValues = data.map((_, i) => i);
  const yValues = data.map(d => d.value);
  
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return data.map((point, i) => ({
    timestamp: point.timestamp,
    value: slope * i + intercept,
    metadata: { trendLine: true },
  }));
}

export function getChartAnimationConfig(enabled: boolean = true): any {
  if (!enabled) return false;
  
  return {
    duration: 1000,
    easing: 'ease-in-out',
    onLoad: { duration: 500 },
    onUpdate: { duration: 300 },
  };
}

export function exportChartAsSVG(chartRef: any, filename: string): void {
  if (!chartRef || !chartRef.container) return;
  
  const svg = chartRef.container.querySelector('svg');
  if (!svg) return;
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportChartAsPNG(chartRef: any, filename: string): void {
  if (!chartRef || !chartRef.container) return;
  
  const svg = chartRef.container.querySelector('svg');
  if (!svg) return;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    });
  };
  
  img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
}