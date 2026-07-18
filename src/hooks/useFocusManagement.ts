import React from 'react';
import { useLocation } from 'react-router-dom';

interface FocusOptions {
  preventScroll?: boolean;
  restoreFocus?: boolean;
}

export const useFocusManagement = () => {
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const location = useLocation();

  // Store the previously focused element
  const storePreviousFocus = React.useCallback(() => {
    if (document.activeElement && document.activeElement !== document.body) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, []);

  // Restore focus to the previously focused element
  const restorePreviousFocus = React.useCallback((options: FocusOptions = {}) => {
    if (previousFocusRef.current && options.restoreFocus !== false) {
      previousFocusRef.current.focus({ 
        preventScroll: options.preventScroll 
      });
    }
  }, []);

  // Focus the first focusable element in a container
  const focusFirst = React.useCallback((container?: HTMLElement | null, options: FocusOptions = {}) => {
    const focusableElements = getFocusableElements(container || document.body);
    if (focusableElements.length > 0) {
      focusableElements[0].focus({ 
        preventScroll: options.preventScroll 
      });
    }
  }, []);

  // Focus the last focusable element in a container
  const focusLast = React.useCallback((container?: HTMLElement | null, options: FocusOptions = {}) => {
    const focusableElements = getFocusableElements(container || document.body);
    if (focusableElements.length > 0) {
      focusableElements[focusableElements.length - 1].focus({ 
        preventScroll: options.preventScroll 
      });
    }
  }, []);

  // Focus an element by selector or element reference
  const focusElement = React.useCallback((target: string | HTMLElement | null, options: FocusOptions = {}) => {
    let element: HTMLElement | null = null;
    
    if (typeof target === 'string') {
      element = document.querySelector(target) as HTMLElement;
    } else {
      element = target;
    }

    if (element && typeof element.focus === 'function') {
      element.focus({ 
        preventScroll: options.preventScroll 
      });
    }
  }, []);

  // Trap focus within a container (useful for modals, dialogs)
  const trapFocus = React.useCallback((container: HTMLElement) => {
    const focusableElements = getFocusableElements(container);
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    
    // Focus the first element initially
    firstElement.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Handle focus on route changes
  React.useEffect(() => {
    // Focus the main content area or first heading on route change
    const mainContent = document.querySelector('main') || 
                       document.querySelector('[role="main"]') || 
                       document.querySelector('h1');
    
    if (mainContent) {
      // Add tabindex if not naturally focusable
      if (!mainContent.hasAttribute('tabindex')) {
        mainContent.setAttribute('tabindex', '-1');
      }
      (mainContent as HTMLElement).focus({ preventScroll: false });
    }
  }, [location.pathname]);

  // Skip link functionality
  const createSkipLink = React.useCallback((targetSelector: string, text: string = 'Skip to main content') => {
    let skipLink = document.querySelector('#skip-link') as HTMLAnchorElement;
    
    if (!skipLink) {
      skipLink = document.createElement('a');
      skipLink.id = 'skip-link';
      skipLink.href = targetSelector;
      skipLink.textContent = text;
      skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring';
      
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(targetSelector) as HTMLElement;
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus();
        }
      });
      
      document.body.insertBefore(skipLink, document.body.firstChild);
    }
    
    return skipLink;
  }, []);

  return {
    storePreviousFocus,
    restorePreviousFocus,
    focusFirst,
    focusLast,
    focusElement,
    trapFocus,
    createSkipLink
  };
};

// Helper function to get all focusable elements
const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    'audio[controls]',
    'video[controls]',
    'summary',
    'iframe'
  ].join(', ');

  const elements = Array.from(container.querySelectorAll(focusableSelectors)) as HTMLElement[];
  
  return elements.filter(element => {
    return element.offsetWidth > 0 && 
           element.offsetHeight > 0 && 
           !element.hasAttribute('hidden') &&
           getComputedStyle(element).visibility !== 'hidden';
  });
};