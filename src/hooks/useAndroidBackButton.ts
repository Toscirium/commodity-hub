import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    console.log('🚀 Setting up Android back button with priority handling...');
    
    // Method 1: Using document event listener with priority
    const handleBackButton = (event: any) => {
      console.log('🔴 BACK BUTTON EVENT TRIGGERED!');
      console.log('📍 Current path:', location.pathname);
      
      // Always prevent default behavior first
      event.detail.register(10, () => {
        console.log('🎯 Priority handler executing...');
        
        if (location.pathname !== '/') {
          console.log('🏠 Navigating to home from:', location.pathname);
          navigate('/', { replace: true });
        } else {
          console.log('🏠 Already on home - preventing app exit');
          // Do nothing - this prevents the app from closing
        }
      });
    };

    // Add document listener for ionBackButton with priority handling
    document.addEventListener('ionBackButton', handleBackButton);
    console.log('✅ ionBackButton listener with priority added');

    // Method 2: Capacitor App listener as backup
    let capacitorCleanup: (() => void) | null = null;
    
    const setupCapacitorListener = async () => {
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        try {
          const { App } = await import('@capacitor/app');
          console.log('✅ Setting up Capacitor App listener...');
          
          const listener = await App.addListener('backButton', (data) => {
            console.log('🔥 Capacitor back button triggered (backup)');
            console.log('📍 Current path:', location.pathname);
            console.log('📦 Data:', data);
            
            if (location.pathname !== '/') {
              console.log('🏠 Navigating to home via Capacitor listener');
              navigate('/', { replace: true });
            } else {
              console.log('🏠 On home - doing nothing to prevent exit');
            }
          });
          
          capacitorCleanup = () => listener.remove();
          console.log('✅ Capacitor backup listener added');
        } catch (error) {
          console.error('❌ Capacitor listener failed:', error);
        }
      }
    };

    setupCapacitorListener();

    return () => {
      console.log('🧹 Cleaning up back button listeners');
      document.removeEventListener('ionBackButton', handleBackButton);
      if (capacitorCleanup) {
        capacitorCleanup();
      }
    };
  }, [navigate, location.pathname]);
};