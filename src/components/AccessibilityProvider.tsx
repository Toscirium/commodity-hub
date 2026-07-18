import React from 'react';
import { useFocusManagement } from '@/hooks/useFocusManagement';
import { 
  announceToScreenReader, 
  setupHighContrastMode, 
  setupReducedMotion 
} from '@/utils/accessibility';

interface AccessibilityContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  focusManagement: ReturnType<typeof useFocusManagement>;
}

const AccessibilityContext = React.createContext<AccessibilityContextType | null>(null);

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const focusManagement = useFocusManagement();

  React.useEffect(() => {
    // Set up accessibility features
    setupHighContrastMode();
    setupReducedMotion();

    // Create skip link
    focusManagement.createSkipLink('#main-content', 'Skip to main content');

    // Add ARIA live region for announcements
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('class', 'sr-only');
    liveRegion.id = 'live-region';
    document.body.appendChild(liveRegion);

    // Cleanup
    return () => {
      const existingLiveRegion = document.getElementById('live-region');
      if (existingLiveRegion) {
        document.body.removeChild(existingLiveRegion);
      }
    };
  }, [focusManagement]);

  const contextValue: AccessibilityContextType = {
    announce: announceToScreenReader,
    focusManagement
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextType => {
  const context = React.useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};