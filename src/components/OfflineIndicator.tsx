import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

interface OfflineIndicatorProps {
  className?: string;
  showWhenOnline?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  className = "", 
  showWhenOnline = false 
}) => {
  const { isOnline, isOffline } = useOfflineStatus();

  if (isOnline && !showWhenOnline) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isOffline ? (
        <>
          <WifiOff className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Offline</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-500">Online</span>
        </>
      )}
    </div>
  );
};