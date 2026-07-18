import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHaptics } from '@/hooks/useHaptics';

interface AppIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

const AppIcon: React.FC<AppIconProps> = ({ 
  size = 64, 
  className = '', 
  animated = false 
}) => {
  return (
    <div
      className={`relative ${className} ${animated ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    >
      <div 
        className="w-full h-full bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg"
      >
        <div className="text-white font-bold text-lg">CH</div>
      </div>
    </div>
  );
};

interface PWAInstallPromptProps {
  className?: string;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ 
  className = '' 
}) => {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [isInstalled, setIsInstalled] = React.useState(false);
  const isMobile = useIsMobile();
  const { vibrateSuccess } = useHaptics();

  React.useEffect(() => {
    // Check if app is already installed
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInWebAppiOS = (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone || isInWebAppiOS);
    };

    checkInstalled();

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after a delay if user is on mobile and app isn't installed
      if (isMobile && !isInstalled) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      vibrateSuccess();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isMobile, isInstalled, vibrateSuccess]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setShowPrompt(false);
        vibrateSuccess();
      }
    } catch (error) {
      console.error('Installation failed:', error);
    }

    setDeferredPrompt(null);
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    // Don't show again for this session
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if already installed, not mobile, or dismissed this session
  if (isInstalled || !isMobile || !showPrompt || sessionStorage.getItem('pwa-prompt-dismissed')) {
    return null;
  }

  return (
    <div
      className={`
        fixed bottom-4 left-4 right-4 z-50 
        bg-card border border-border rounded-xl shadow-lg
        p-4 animate-fade-in
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <AppIcon size={48} animated />
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1">Install Commodity Hub</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Get faster access and offline support by adding to your home screen
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium transition-colors"
            >
              Install
            </button>
            <button
              onClick={dismissPrompt}
              className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        
        <button
          onClick={dismissPrompt}
          className="p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default AppIcon;