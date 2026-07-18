import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface PriceChangeIndicatorProps {
  change: number;
  changePercent: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showPercentage?: boolean;
  animated?: boolean;
  className?: string;
}

export const PriceChangeIndicator: React.FC<PriceChangeIndicatorProps> = ({
  change,
  changePercent,
  size = 'md',
  showIcon = true,
  showPercentage = true,
  animated = true,
  className = '',
}) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  const isNeutral = change === 0;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const getColorClasses = () => {
    if (isPositive) {
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800';
    }
    if (isNegative) {
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800';
    }
    return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-950/20 dark:text-gray-400 dark:border-gray-800';
  };

  const getIcon = () => {
    if (isPositive) return <ArrowUp className={iconSizes[size]} />;
    if (isNegative) return <ArrowDown className={iconSizes[size]} />;
    return <Minus className={iconSizes[size]} />;
  };

  const formatChange = (value: number) => {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}`;
  };

  const formatPercentage = (value: number) => {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  };

  const content = (
    <div className={`
      inline-flex items-center gap-1 rounded-full border font-semibold transition-all duration-200
      ${sizeClasses[size]}
      ${getColorClasses()}
      ${className}
    `}>
      {showIcon && getIcon()}
      <span className="number-display">
        {formatChange(change)}
        {showPercentage && ` (${formatPercentage(changePercent)})`}
      </span>
    </div>
  );

  if (animated) {
    return (
      <div className="animate-scale-in">
        {content}
      </div>
    );
  }

  return content;
};