import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useThemeStore } from '../../../store/themeStore';
import type { FarmPerformanceMetric } from '../../../types/analytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface FarmPerformanceChartProps {
  data?: FarmPerformanceMetric[];
  detailed?: boolean;
}

export const FarmPerformanceChart: React.FC<FarmPerformanceChartProps> = ({ 
  data = [],
  detailed = false 
}) => {
  const theme = useThemeStore(state => state.theme);
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Generate mock data if no data is provided
  const chartData = data.length > 0 ? data : generateMockData();

  const labels = chartData.map(d => 
    new Date(d.timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  );

  const datasets = detailed ? [
    {
      label: 'Efficiency',
      data: chartData.map(d => d.efficiency),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    },
    {
      label: 'Throughput',
      data: chartData.map(d => d.throughput),
      borderColor: 'rgb(168, 85, 247)',
      backgroundColor: 'rgba(168, 85, 247, 0.1)',
      tension: 0.4,
      fill: true
    },
    {
      label: 'Uptime',
      data: chartData.map(d => d.uptime),
      borderColor: 'rgb(34, 197, 94)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      tension: 0.4,
      fill: true
    }
  ] : [
    {
      label: 'Overall Performance',
      data: chartData.map(d => d.efficiency),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    }
  ];

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: detailed,
        position: 'top' as const,
        labels: {
          color: isDarkMode ? '#9CA3AF' : '#4B5563',
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
        titleColor: isDarkMode ? '#F9FAFB' : '#111827',
        bodyColor: isDarkMode ? '#D1D5DB' : '#4B5563',
        borderColor: isDarkMode ? '#374151' : '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: isDarkMode ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11
          }
        }
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: isDarkMode ? '#374151' : '#F3F4F6'
        },
        ticks: {
          color: isDarkMode ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11
          },
          callback: (value) => `${value}%`
        }
      }
    }
  };

  return (
    <div className="h-64">
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
};

function generateMockData(): FarmPerformanceMetric[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const timestamp = new Date(now.getTime() - (11 - i) * 5 * 60 * 1000);
    return {
      farmId: 'farm-1',
      farmName: 'Main Farm',
      status: 'active' as const,
      efficiency: 75 + Math.random() * 20,
      throughput: 80 + Math.random() * 15,
      uptime: 95 + Math.random() * 5,
      errorRate: Math.random() * 5,
      avgResponseTime: 100 + Math.random() * 50,
      totalTasks: Math.floor(100 + Math.random() * 50),
      completedTasks: Math.floor(80 + Math.random() * 40),
      timestamp
    };
  });
}