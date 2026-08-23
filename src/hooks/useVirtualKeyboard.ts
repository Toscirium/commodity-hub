
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

    const viewport = window.visualViewport;
    if (!viewport) return;

    // Measure against the CURRENT layout viewport rather than a height
    // captured on mount: a baseline snapshot goes stale on rotation, on
    // split-screen resize, and when the browser's own chrome hides/shows,
    // which previously produced a phantom "keyboard" of a few hundred px.
    // `innerHeight - (visual height + offsetTop)` is whatever is covering
    // the bottom of the layout viewport — the keyboard, when there is one.
    const handleViewportChange = () => {
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
      // Small non-zero values show up from rounding and from browser UI; a
      // real keyboard is far taller than this.
      const isKeyboardVisible = covered > 150;

      setKeyboardState((current) =>
        current.isVisible === isKeyboardVisible &&
        Math.abs(current.height - covered) < 1
          ? current
          : { isVisible: isKeyboardVisible, height: isKeyboardVisible ? covered : 0 }
      );
    };

    handleViewportChange();
    viewport.addEventListener('resize', handleViewportChange);
    // Some Android builds scroll the visual viewport instead of resizing it.
    viewport.addEventListener('scroll', handleViewportChange);
    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
    };
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
