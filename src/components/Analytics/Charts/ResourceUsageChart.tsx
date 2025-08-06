import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useThemeStore } from '../../../store/themeStore';
import type { ResourceUtilization } from '../../../types/analytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface ResourceUsageChartProps {
  data?: ResourceUtilization;
}

export const ResourceUsageChart: React.FC<ResourceUsageChartProps> = ({ data }) => {
  const theme = useThemeStore(state => state.theme);
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const resourceData = data || {
    cpu: 65,
    memory: 72,
    storage: 45,
    network: 38,
    timestamp: new Date()
  };

  const chartData: any = {
    labels: ['CPU', 'Memory', 'Storage', 'Network'],
    datasets: [
      {
        label: 'Current Usage',
        data: [
          resourceData.cpu,
          resourceData.memory,
          resourceData.storage,
          resourceData.network
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(168, 85, 247)',
          'rgb(34, 197, 94)',
          'rgb(251, 146, 60)'
        ],
        borderWidth: 2,
        borderRadius: 8
      },
      {
        label: 'Threshold',
        data: [80, 80, 80, 80],
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 2,
        borderDash: [5, 5],
        borderRadius: 8,
        type: 'line' as const
      }
    ]
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
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
            size: 12,
            weight: 500
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
      <Bar data={chartData} options={options as ChartOptions<'bar'>} />
    </div>
  );
};