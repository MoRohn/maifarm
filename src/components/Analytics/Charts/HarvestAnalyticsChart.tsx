import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useThemeStore } from '../../../store/themeStore';
import type { HarvestAnalytics } from '../../../types/analytics';

ChartJS.register(ArcElement, Tooltip, Legend);

interface HarvestAnalyticsChartProps {
  data?: HarvestAnalytics[];
}

export const HarvestAnalyticsChart: React.FC<HarvestAnalyticsChartProps> = ({ data }) => {
  const theme = useThemeStore(state => state.theme);
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const harvestData = data && data.length > 0 ? data : generateMockHarvestData();

  const chartData = {
    labels: harvestData.map(h => h.farmType),
    datasets: [
      {
        label: 'Total Harvests',
        data: harvestData.map(h => h.totalHarvests),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(14, 165, 233, 0.8)'
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(168, 85, 247)',
          'rgb(34, 197, 94)',
          'rgb(251, 146, 60)',
          'rgb(236, 72, 153)',
          'rgb(14, 165, 233)'
        ],
        borderWidth: 2
      }
    ]
  };

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: isDarkMode ? '#9CA3AF' : '#4B5563',
          padding: 15,
          font: {
            size: 12
          },
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels && data.datasets.length) {
              const dataset = data.datasets[0];
              const total = (dataset.data as number[]).reduce((a, b) => a + b, 0);
              return (data.labels as string[]).map((label, i) => {
                const value = dataset.data[i] as number;
                const percentage = ((value / total) * 100).toFixed(1);
                const bgColors = dataset.backgroundColor as string[];
                const borderColors = dataset.borderColor as string[];
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: bgColors?.[i] || '#ccc',
                  strokeStyle: borderColors?.[i] || '#999',
                  lineWidth: dataset.borderWidth as number,
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
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
            const label = context.label || '';
            const value = context.parsed;
            const dataset = context.dataset.data as number[];
            const total = dataset.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            
            const harvest = harvestData[context.dataIndex];
            return [
              `${label}: ${value} harvests`,
              `Percentage: ${percentage}%`,
              `Success Rate: ${((harvest.successfulHarvests / harvest.totalHarvests) * 100).toFixed(1)}%`,
              `Avg Yield: ${harvest.averageYield.toFixed(2)}`
            ];
          }
        }
      }
    }
  };

  return (
    <div className="h-64">
      <Pie data={chartData} options={options} />
    </div>
  );
};

function generateMockHarvestData(): HarvestAnalytics[] {
  return [
    {
      farmType: 'Code Review',
      totalHarvests: 145,
      successfulHarvests: 138,
      failedHarvests: 7,
      averageYield: 92.5,
      totalValue: 13500,
      efficiency: 95.2,
      timeToHarvest: 3.2
    },
    {
      farmType: 'Bug Fix',
      totalHarvests: 89,
      successfulHarvests: 82,
      failedHarvests: 7,
      averageYield: 88.3,
      totalValue: 7850,
      efficiency: 92.1,
      timeToHarvest: 5.5
    },
    {
      farmType: 'Feature Dev',
      totalHarvests: 67,
      successfulHarvests: 61,
      failedHarvests: 6,
      averageYield: 85.7,
      totalValue: 5740,
      efficiency: 91.0,
      timeToHarvest: 12.3
    },
    {
      farmType: 'Testing',
      totalHarvests: 112,
      successfulHarvests: 108,
      failedHarvests: 4,
      averageYield: 94.2,
      totalValue: 10550,
      efficiency: 96.4,
      timeToHarvest: 2.8
    },
    {
      farmType: 'Documentation',
      totalHarvests: 56,
      successfulHarvests: 55,
      failedHarvests: 1,
      averageYield: 96.8,
      totalValue: 5420,
      efficiency: 98.2,
      timeToHarvest: 1.5
    }
  ];
}