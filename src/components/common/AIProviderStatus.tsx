import React from 'react';
import { Bot, Cpu, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface AIProviderStatusProps {
  provider: 'claude' | 'openai';
  status?: 'active' | 'inactive' | 'error';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AIProviderStatus: React.FC<AIProviderStatusProps> = ({
  provider,
  status = 'active',
  showLabel = true,
  size = 'md',
  className
}) => {
  const providerConfig = {
    claude: {
      name: 'Claude Code',
      icon: Bot,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    openai: {
      name: 'OpenAI GPT-4',
      icon: Cpu,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    }
  };

  const sizeConfig = {
    sm: {
      icon: 'w-4 h-4',
      text: 'text-xs',
      padding: 'px-2 py-1',
      dot: 'w-2 h-2'
    },
    md: {
      icon: 'w-5 h-5',
      text: 'text-sm',
      padding: 'px-3 py-1.5',
      dot: 'w-2.5 h-2.5'
    },
    lg: {
      icon: 'w-6 h-6',
      text: 'text-base',
      padding: 'px-4 py-2',
      dot: 'w-3 h-3'
    }
  };

  const config = providerConfig[provider];
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  const statusColor = {
    active: 'bg-green-500',
    inactive: 'bg-gray-400',
    error: 'bg-red-500'
  };

  return (
    <div className={clsx(
      'inline-flex items-center space-x-2 rounded-full',
      config.bgColor,
      sizes.padding,
      className
    )}>
      <div className="relative">
        <Icon className={clsx(sizes.icon, config.color)} />
        {status === 'error' && (
          <AlertCircle className={clsx(
            'absolute -top-1 -right-1 w-3 h-3 text-red-500',
            size === 'sm' && 'w-2.5 h-2.5'
          )} />
        )}
      </div>
      
      {showLabel && (
        <span className={clsx(sizes.text, 'font-medium', config.color)}>
          {config.name}
        </span>
      )}

      <div className={clsx(
        'rounded-full animate-pulse',
        sizes.dot,
        statusColor[status]
      )} />
    </div>
  );
};