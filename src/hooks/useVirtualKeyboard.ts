
import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface VirtualKeyboardState {
  isVisible: boolean;
  height: number;
}

export const useVirtualKeyboard = () => {
  const isMobile = useIsMobile();
  const [keyboardState, setKeyboardState] = React.useState<VirtualKeyboardState>({
    isVisible: false,
    height: 0,
  });

  React.useEffect(() => {
    if (!isMobile) return;

    const initialViewportHeight = window.visualViewport?.height || window.innerHeight;
    
    const handleViewportChange = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      // Threshold to detect keyboard (usually > 150px difference)
      const isKeyboardVisible = heightDifference > 150;
      
      setKeyboardState({
        isVisible: isKeyboardVisible,
        height: isKeyboardVisible ? heightDifference : 0,
      });
    };

    // Listen for visual viewport changes (better than resize for mobile)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportChange);
      };
    } else {
      // Fallback for browsers without visual viewport API
      window.addEventListener('resize', handleViewportChange);
      return () => {
        window.removeEventListener('resize', handleViewportChange);
      };
    }
  }, [isMobile]);

  return keyboardState;
};

interface KeyboardAwareContainerProps {
  children: React.ReactNode;
  adjustHeight?: boolean;
  className?: string;
}

export const KeyboardAwareContainer: React.FC<KeyboardAwareContainerProps> = ({
  children,
  adjustHeight = true,
  className = '',
}) => {
  const keyboard = useVirtualKeyboard();
  const isMobile = useIsMobile();

  if (!isMobile) {
    return React.createElement('div', { className }, children);
  }

  return React.createElement(
    'div',
    {
      className: `transition-all duration-300 ${className}`,
      style: {
        paddingBottom: adjustHeight && keyboard.isVisible ? keyboard.height : 0,
      },
    },
    children
  );
};
