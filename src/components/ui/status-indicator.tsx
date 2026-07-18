import React from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'live' | 'delayed' | 'error' | 'loading';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  size = 'md',
  showLabel = true,
  animated = true,
  className = '',
}) => {
  const statusConfig = {
    live: {
      color: 'bg-green-500',
      textColor: 'text-green-600 dark:text-green-400',
      icon: TrendingUp,
      defaultLabel: 'LIVE',
      animation: 'animate-pulse',
    },
    delayed: {
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      icon: Activity,
      defaultLabel: 'DELAYED',
      animation: 'animate-pulse',
    },
    error: {
      color: 'bg-red-500',
      textColor: 'text-red-600 dark:text-red-400',
      icon: AlertCircle,
      defaultLabel: 'ERROR',
      animation: 'animate-bounce',
    },
    loading: {
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
      icon: Activity,
      defaultLabel: 'LOADING',
      animation: 'animate-spin',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: { dot: 'w-1.5 h-1.5', text: 'text-xs', icon: 'w-3 h-3' },
    md: { dot: 'w-2 h-2', text: 'text-sm', icon: 'w-4 h-4' },
    lg: { dot: 'w-3 h-3', text: 'text-base', icon: 'w-5 h-5' },
  };

  const displayLabel = label || config.defaultLabel;

  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <div 
        className={`
          ${config.color} ${sizeClasses[size].dot} rounded-full
          ${animated ? config.animation : ''}
        `}
        aria-hidden="true"
      />
      {showLabel && (
        <>
          <span 
            className={`${config.textColor} ${sizeClasses[size].text} font-bold`}
            aria-label={`Status: ${displayLabel}`}
          >
            {displayLabel}
          </span>
          <Icon className={`${config.textColor} ${sizeClasses[size].icon}`} aria-hidden="true" />
        </>
      )}
    </div>
  );

  if (animated && status === 'live') {
    return (
      <div className="animate-pulse">
        {content}
      </div>
    );
  }

  return content;
};