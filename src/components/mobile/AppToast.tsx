import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useHaptics } from '@/hooks/useHaptics';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppToastProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
  onClose: (id: string) => void;
  position?: 'top' | 'bottom';
}

const AppToast: React.FC<AppToastProps> = ({
  id,
  type,
  title,
  description,
  duration = 4000,
  onClose,
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = React.useState(true);
  const { vibrateSuccess, vibrateError, vibrate } = useHaptics();
  const isMobile = useIsMobile();

  React.useEffect(() => {
    // Trigger haptic feedback based on toast type
    if (isMobile) {
      switch (type) {
        case 'success':
          vibrateSuccess();
          break;
        case 'error':
          vibrateError();
          break;
        case 'warning':
          vibrate('medium');
          break;
        case 'info':
          vibrate('light');
          break;
      }
    }

    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [type, duration, isMobile]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(id), 200);
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800';
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`
        ${getStyles()}
        border rounded-lg p-4 shadow-lg backdrop-blur-sm
        max-w-sm w-full pointer-events-auto
        ${isMobile ? 'mx-4' : ''}
        animate-slide-in-right
      `}
      style={{
        animation: `slideInRight 0.3s ease-out`
      }}
    >
      <div className="flex items-start gap-3">
        {getIcon()}
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {title}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">
              {description}
            </p>
          )}
        </div>

        <button
          onClick={handleClose}
          className="p-1 rounded-full hover:bg-background/50 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-1 bg-primary/30 rounded-b-lg"
        style={{
          width: '100%',
          animation: `shrinkWidth ${duration / 1000}s linear forwards`
        }}
      />
    </div>
  );
};

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

interface AppToastProviderProps {
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

export const AppToastProvider: React.FC<AppToastProviderProps> = ({ 
  children, 
  position = 'top' 
}) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Expose toast functions globally
  React.useEffect(() => {
    (window as any).showToast = addToast;
  }, []);

  return (
    <>
      {children}
      
      {/* Toast Container */}
      <div className={`
        fixed z-50 pointer-events-none
        ${position === 'top' 
          ? 'top-4 right-4' 
          : 'bottom-4 right-4'
        }
        flex flex-col gap-2
      `}>
        {toasts.map((toast) => (
          <AppToast
            key={toast.id}
            {...toast}
            onClose={removeToast}
            position={position}
          />
        ))}
      </div>
    </>
  );
};

// Hook to use toast
export const useAppToast = () => {
  const showToast = (toast: Omit<Toast, 'id'>) => {
    if ((window as any).showToast) {
      (window as any).showToast(toast);
    }
  };

  return {
    success: (title: string, description?: string) => 
      showToast({ type: 'success', title, description }),
    error: (title: string, description?: string) => 
      showToast({ type: 'error', title, description }),
    warning: (title: string, description?: string) => 
      showToast({ type: 'warning', title, description }),
    info: (title: string, description?: string) => 
      showToast({ type: 'info', title, description }),
  };
};

export default AppToast;