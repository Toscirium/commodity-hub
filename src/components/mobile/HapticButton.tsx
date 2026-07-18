import React from 'react';
import { useHaptics } from '@/hooks/useHaptics';
import { useIsMobile } from '@/hooks/use-mobile';

interface HapticButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  hapticType?: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

const HapticButton: React.FC<HapticButtonProps> = ({
  children,
  onClick,
  className = '',
  hapticType = 'light',
  disabled = false,
  variant = 'primary',
  size = 'md',
}) => {
  const { vibrate, vibrateSelection, vibrateSuccess, vibrateError } = useHaptics();
  const isMobile = useIsMobile();

  const handleClick = () => {
    if (disabled) return;

    // Trigger haptic feedback
    if (isMobile) {
      switch (hapticType) {
        case 'light':
          vibrate('light');
          break;
        case 'medium':
          vibrate('medium');
          break;
        case 'heavy':
          vibrate('heavy');
          break;
        case 'selection':
          vibrateSelection();
          break;
        case 'success':
          vibrateSuccess();
          break;
        case 'warning':
        case 'error':
          vibrateError();
          break;
      }
    }

    onClick?.();
  };

  const baseClasses = `
    relative inline-flex items-center justify-center
    font-medium transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    touch-manipulation
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
  `;

  const variantClasses = {
    primary: `
      bg-primary text-primary-foreground
      hover:bg-primary/90 focus:ring-primary
      shadow-lg hover:shadow-xl
    `,
    secondary: `
      bg-secondary text-secondary-foreground
      hover:bg-secondary/90 focus:ring-secondary
      shadow-md hover:shadow-lg
    `,
    ghost: `
      text-foreground hover:bg-muted
      focus:ring-muted-foreground
    `,
    outline: `
      border border-border text-foreground
      hover:bg-muted focus:ring-border
    `,
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm rounded-md min-h-[36px]',
    md: 'px-4 py-2 text-base rounded-lg min-h-[44px]',
    lg: 'px-6 py-3 text-lg rounded-xl min-h-[52px]',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} transform transition-colors duration-200`}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default HapticButton;