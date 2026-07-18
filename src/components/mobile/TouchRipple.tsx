import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface TouchRippleProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  rippleColor?: string;
}

export const TouchRipple: React.FC<TouchRippleProps> = ({
  children,
  className = '',
  disabled = false,
  rippleColor = 'rgba(255, 255, 255, 0.3)',
}) => {
  const isMobile = useIsMobile();
  const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const createRipple = React.useCallback((event: React.TouchEvent | React.MouseEvent) => {
    if (disabled || !isMobile) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ('touches' in event ? event.touches[0].clientX : event.clientX) - rect.left;
    const y = ('touches' in event ? event.touches[0].clientY : event.clientY) - rect.top;

    const newRipple = {
      id: Date.now(),
      x,
      y,
    };

    setRipples(prev => [...prev, newRipple]);

    // Remove ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
  }, [disabled, isMobile]);

  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onTouchStart={createRipple}
      onMouseDown={createRipple}
    >
      {children}
      
      {/* Ripple effects */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none animate-ping"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
            backgroundColor: rippleColor,
            animationDuration: '600ms',
            animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      ))}
    </div>
  );
};