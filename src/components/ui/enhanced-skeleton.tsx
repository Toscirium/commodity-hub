import React from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}) => {
  const baseClasses = 'bg-muted rounded';
  
  const variantClasses = {
    text: 'h-4',
    circular: 'rounded-full',
    rectangular: 'rounded',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'shimmer',
    none: '',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${animationClasses[animation]}
        ${className}
      `}
      style={style}
    />
  );
};

interface SkeletonCardProps {
  showImage?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  showActions?: boolean;
  lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  showImage = true,
  showTitle = true,
  showDescription = true,
  showActions = false,
  lines = 2,
}) => {
  return (
    <div className="p-4 space-y-4 bg-card rounded-lg border border-border/50">
      {showImage && (
        <Skeleton variant="rectangular" className="w-full h-48" />
      )}
      
      <div className="space-y-3">
        {showTitle && (
          <Skeleton variant="text" className="w-3/4 h-6" />
        )}
        
        {showDescription && (
          <div className="space-y-2">
            {Array.from({ length: lines }).map((_, index) => (
              <Skeleton 
                key={index}
                variant="text" 
                className={`${index === lines - 1 ? 'w-1/2' : 'w-full'} h-4`} 
              />
            ))}
          </div>
        )}
        
        {showActions && (
          <div className="flex gap-2 pt-2">
            <Skeleton variant="rectangular" className="w-20 h-8" />
            <Skeleton variant="rectangular" className="w-16 h-8" />
          </div>
        )}
      </div>
    </div>
  );
};

interface LazySkeletonProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
}

export const LazySkeleton: React.FC<LazySkeletonProps> = ({
  children,
  fallback = <SkeletonCard />,
  rootMargin = '100px',
  threshold = 0.1,
  className = '',
}) => {
  const { elementRef, isIntersecting } = useIntersectionObserver({
    rootMargin,
    threshold,
    triggerOnce: true,
  });

  return (
    <div ref={elementRef as React.RefObject<HTMLDivElement>} className={className}>
      {isIntersecting ? children : fallback}
    </div>
  );
};