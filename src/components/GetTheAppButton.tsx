import React from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';
import { PLAY_STORE_URL } from '@/config/playStore';
import { monitoringService } from '@/services/monitoringService';

/**
 * "Get it on Google Play" — web only. Hidden inside the native app itself
 * (no point telling someone who already has it to go install it).
 */
const GetTheAppButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isNative } = usePlatform();
  if (isNative) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        monitoringService.trackUserEvent('get_the_app_cta_tapped', { source: 'dashboard_header' });
        window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
      }}
    >
      <Smartphone className="w-3.5 h-3.5 sm:mr-1.5" />
      <span className="hidden sm:inline">Get the app</span>
    </Button>
  );
};

export default GetTheAppButton;
