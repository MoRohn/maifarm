import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useThemeStore } from '@/store/themeStore';
import { formatCurrency } from '@/utils/format';
import type { CostBreakdown } from '@/types/analytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface CostBreakdownChartProps {
  data?: CostBreakdown;
  detailed?: boolean;
}

export const CostBreakdownChart: React.FC<CostBreakdownChartProps> = ({ 
  data,
  detailed = false 
}) => {
  const theme = useThemeStore(state => state.theme);
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const costData = data || {
    total: 1250.50,
    compute: 650.25,
    storage: 125.30,
    network: 85.15,
    api: 389.80,
    period: 'daily' as const,
    currency: 'USD'
  };

  const labels = detailed 
    ? ['Compute', 'Storage', 'Network', 'API Calls', 'Other']
    : ['Compute', 'Storage', 'Network', 'API'];

  const values = detailed
    ? [
        costData.compute,
        costData.storage,
        costData.network,
        costData.api,
        costData.total - (costData.compute + costData.storage + costData.network + costData.api)
      ]
    : [costData.compute, costData.storage, costData.network, costData.api];

  const chartData = {
    labels,
    datasets: [
      {
        label: `Costs (${costData.period})`,
        data: values,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(236, 72, 153, 0.8)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(168, 85, 247)',
          'rgb(34, 197, 94)',
          'rgb(251, 146, 60)',
          'rgb(236, 72, 153)'
        ],
        borderWidth: 2,
        borderRadius: 8
      }
    ]
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: detailed ? 'y' as const : 'x' as const,
    plugins: {
      legend: {
        display: false
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
            const value = context.parsed.y || context.parsed.x;
            const percentage = ((value / costData.total) * 100).toFixed(1);
            return [
              `${context.label}: ${formatCurrency(value)}`,
              `Percentage: ${percentage}%`
            ];
          },
          afterLabel: (context) => {
            if (context.dataIndex === 0) {
              return `Claude API calls: ${Math.floor(costData.api * 2.5)} requests`;
            }
            return '';
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: !detailed,
          color: isDarkMode ? '#374151' : '#F3F4F6'
        },
        ticks: {
          color: isDarkMode ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11
          },
          callback: function(value) {
            if (detailed) {
              return `$${value}`;
            }
            return this.getLabelForValue(value as number);
          }
        }
      },
      y: {
        grid: {
          display: detailed,
          color: isDarkMode ? '#374151' : '#F3F4F6'
        },
        ticks: {
          color: isDarkMode ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11
          },
          callback: function(value) {
            if (!detailed) {
              return `$${value}`;
            }
            return this.getLabelForValue(value as number);
          }
        }
      }
    }
  };

  return (
    <div className="h-64">
      <Bar data={chartData} options={options} />
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Total: {formatCurrency(costData.total)}
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Period: {costData.period}
        </span>
      </div>
    </div>
  );
};