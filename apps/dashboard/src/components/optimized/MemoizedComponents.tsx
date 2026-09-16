/**
 * MemoizedComponents - Performance-optimized components with React.memo
 * Prevents unnecessary re-renders for expensive components
 */

import React, { memo, useMemo, useCallback } from 'react';
import { isEqual } from 'lodash-es';

/**
 * Deep comparison function for complex props
 */
const deepCompare = <P extends Record<string, any>>(
  prevProps: P,
  nextProps: P,
  keys?: (keyof P)[]
): boolean => {
  const propsToCheck = keys || Object.keys(prevProps) as (keyof P)[];

  return propsToCheck.every(key => {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    // Fast path for primitive values
    if (prevValue === nextValue) return true;

    // Check for functions (don't deep compare)
    if (typeof prevValue === 'function' || typeof nextValue === 'function') {
      return prevValue === nextValue;
    }

    // Deep comparison for objects/arrays
    return isEqual(prevValue, nextValue);
  });
};

/**
 * HOC to create memoized component with custom comparison
 */
export function withMemoization<P extends object>(
  Component: React.ComponentType<P>,
  propsToCompare?: (keyof P)[],
  displayName?: string
): React.MemoExoticComponent<React.ComponentType<P>> {
  const MemoizedComponent = memo(Component, (prevProps, nextProps) => {
    return deepCompare(prevProps, nextProps, propsToCompare);
  });

  MemoizedComponent.displayName = displayName || `Memoized(${Component.displayName || Component.name})`;

  return MemoizedComponent;
}

/**
 * Memoized farm card component
 */
interface FarmCardProps {
  farm: {
    id: string;
    name: string;
    status: string;
    agents?: any[];
    createdAt: string;
  };
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const MemoizedFarmCard = memo<FarmCardProps>(
  ({ farm, onSelect, onDelete }) => {
    const handleSelect = useCallback(() => {
      onSelect(farm.id);
    }, [farm.id, onSelect]);

    const handleDelete = useCallback(() => {
      onDelete?.(farm.id);
    }, [farm.id, onDelete]);

    const agentCount = useMemo(() => {
      return farm.agents?.length || 0;
    }, [farm.agents?.length]);

    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-2">{farm.name}</h3>
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>Status: {farm.status}</span>
          <span>Agents: {agentCount}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSelect}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            View
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if these specific props change
    return (
      prevProps.farm.id === nextProps.farm.id &&
      prevProps.farm.name === nextProps.farm.name &&
      prevProps.farm.status === nextProps.farm.status &&
      prevProps.farm.agents?.length === nextProps.farm.agents?.length &&
      prevProps.onSelect === nextProps.onSelect &&
      prevProps.onDelete === nextProps.onDelete
    );
  }
);

MemoizedFarmCard.displayName = 'MemoizedFarmCard';

/**
 * Memoized agent status component
 */
interface AgentStatusProps {
  agent: {
    id: number;
    name: string;
    status: string;
    cpu?: number;
    memory?: number;
  };
  showMetrics?: boolean;
}

export const MemoizedAgentStatus = memo<AgentStatusProps>(
  ({ agent, showMetrics = true }) => {
    const statusColor = useMemo(() => {
      switch (agent.status) {
        case 'active':
        case 'running':
          return 'text-green-600';
        case 'error':
        case 'failed':
          return 'text-red-600';
        case 'idle':
          return 'text-gray-600';
        default:
          return 'text-yellow-600';
      }
    }, [agent.status]);

    const cpuDisplay = useMemo(() => {
      if (!showMetrics || !agent.cpu) return null;
      return `${agent.cpu.toFixed(1)}%`;
    }, [showMetrics, agent.cpu]);

    const memoryDisplay = useMemo(() => {
      if (!showMetrics || !agent.memory) return null;
      return `${agent.memory.toFixed(1)}%`;
    }, [showMetrics, agent.memory]);

    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`} />
          <span className="font-medium">{agent.name}</span>
          <span className={`text-sm ${statusColor}`}>{agent.status}</span>
        </div>
        {showMetrics && (
          <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
            {cpuDisplay && <span>CPU: {cpuDisplay}</span>}
            {memoryDisplay && <span>Memory: {memoryDisplay}</span>}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.agent.id === nextProps.agent.id &&
      prevProps.agent.status === nextProps.agent.status &&
      prevProps.agent.cpu === nextProps.agent.cpu &&
      prevProps.agent.memory === nextProps.agent.memory &&
      prevProps.showMetrics === nextProps.showMetrics
    );
  }
);

MemoizedAgentStatus.displayName = 'MemoizedAgentStatus';

/**
 * Memoized chart component wrapper
 */
interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

interface MemoizedChartProps {
  data: ChartData;
  type: 'line' | 'bar' | 'pie';
  height?: number;
  options?: any;
}

export const MemoizedChart = memo<MemoizedChartProps>(
  ({ data, type, height = 300, options }) => {
    const chartData = useMemo(() => {
      // Process chart data only when it changes
      return {
        ...data,
        datasets: data.datasets.map(dataset => ({
          ...dataset,
          backgroundColor: dataset.color || 'rgba(59, 130, 246, 0.5)',
          borderColor: dataset.color || 'rgb(59, 130, 246)',
        })),
      };
    }, [data]);

    const chartOptions = useMemo(() => {
      return {
        responsive: true,
        maintainAspectRatio: false,
        ...options,
      };
    }, [options]);

    return (
      <div style={{ height }}>
        {/* Chart implementation would go here */}
        <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800 rounded">
          <span className="text-gray-500">Chart: {type}</span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return isEqual(prevProps.data, nextProps.data) &&
           prevProps.type === nextProps.type &&
           prevProps.height === nextProps.height &&
           isEqual(prevProps.options, nextProps.options);
  }
);

MemoizedChart.displayName = 'MemoizedChart';

/**
 * Memoized terminal output line
 */
interface TerminalLineProps {
  line: string;
  lineNumber: number;
  highlighted?: boolean;
  onClick?: (lineNumber: number) => void;
}

export const MemoizedTerminalLine = memo<TerminalLineProps>(
  ({ line, lineNumber, highlighted = false, onClick }) => {
    const handleClick = useCallback(() => {
      onClick?.(lineNumber);
    }, [lineNumber, onClick]);

    return (
      <div
        className={`flex font-mono text-sm ${highlighted ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`}
        onClick={handleClick}
      >
        <span className="w-12 text-gray-500 select-none pr-4 text-right">
          {lineNumber}
        </span>
        <span className="flex-1 whitespace-pre-wrap">{line}</span>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.line === nextProps.line &&
           prevProps.lineNumber === nextProps.lineNumber &&
           prevProps.highlighted === nextProps.highlighted &&
           prevProps.onClick === nextProps.onClick;
  }
);

MemoizedTerminalLine.displayName = 'MemoizedTerminalLine';

/**
 * Memoized heavy list component
 */
interface ListItem {
  id: string;
  [key: string]: any;
}

interface MemoizedListProps<T extends ListItem> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T) => string;
  emptyMessage?: string;
}

export function MemoizedList<T extends ListItem>({
  items,
  renderItem,
  keyExtractor = (item) => item.id,
  emptyMessage = 'No items to display',
}: MemoizedListProps<T>) {
  const memoizedItems = useMemo(() => {
    return items.map((item, index) => (
      <React.Fragment key={keyExtractor(item)}>
        {renderItem(item, index)}
      </React.Fragment>
    ));
  }, [items, renderItem, keyExtractor]);

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return <>{memoizedItems}</>;
}

/**
 * Memoized form field wrapper
 */
interface FormFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'email' | 'password';
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export const MemoizedFormField = memo<FormFieldProps>(
  ({ label, value, onChange, type = 'text', placeholder, error, disabled = false }) => {
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = type === 'number' ? Number(e.target.value) : e.target.value;
      onChange(newValue);
    }, [type, onChange]);

    const inputId = useMemo(() => `field-${label.toLowerCase().replace(/\s/g, '-')}`, [label]);

    return (
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          } ${disabled ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}`}
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.label === nextProps.label &&
           prevProps.value === nextProps.value &&
           prevProps.type === nextProps.type &&
           prevProps.placeholder === nextProps.placeholder &&
           prevProps.error === nextProps.error &&
           prevProps.disabled === nextProps.disabled &&
           prevProps.onChange === nextProps.onChange;
  }
);

MemoizedFormField.displayName = 'MemoizedFormField';

/**
 * Export utility for creating memoized components
 */
export const createMemoizedComponent = <P extends object>(
  Component: React.ComponentType<P>,
  compareProps?: (prevProps: P, nextProps: P) => boolean,
  displayName?: string
): React.MemoExoticComponent<React.ComponentType<P>> => {
  const MemoComponent = memo(Component, compareProps);
  MemoComponent.displayName = displayName || `Memoized(${Component.displayName || Component.name})`;
  return MemoComponent;
};