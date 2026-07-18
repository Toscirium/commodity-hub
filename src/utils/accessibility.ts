// Screen reader announcements
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.setAttribute('class', 'sr-only');
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

// Generate unique IDs for form controls
export const generateId = (prefix: string = 'element'): string => {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
};

// Check if user prefers reduced motion
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Check if user prefers high contrast
export const prefersHighContrast = (): boolean => {
  return window.matchMedia('(prefers-contrast: high)').matches;
};

// Check color scheme preference
export const getColorSchemePreference = (): 'light' | 'dark' | 'no-preference' => {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'no-preference';
};

// ARIA label helpers
export const getAriaLabel = (label: string, description?: string): Record<string, string> => {
  const attrs: Record<string, string> = {
    'aria-label': label
  };
  
  if (description) {
    const descriptionId = generateId('description');
    attrs['aria-describedby'] = descriptionId;
    
    // Create description element if it doesn't exist
    setTimeout(() => {
      if (!document.getElementById(descriptionId)) {
        const descElement = document.createElement('div');
        descElement.id = descriptionId;
        descElement.className = 'sr-only';
        descElement.textContent = description;
        document.body.appendChild(descElement);
      }
    }, 0);
  }
  
  return attrs;
};

// Enhanced button accessibility
export const getButtonProps = (
  label: string,
  options: {
    description?: string;
    pressed?: boolean;
    expanded?: boolean;
    controls?: string;
    disabled?: boolean;
  } = {}
): Record<string, any> => {
  const props: Record<string, any> = {
    'aria-label': label,
    role: 'button',
    tabIndex: options.disabled ? -1 : 0
  };

  if (options.description) {
    const descriptionId = generateId('button-desc');
    props['aria-describedby'] = descriptionId;
  }

  if (typeof options.pressed === 'boolean') {
    props['aria-pressed'] = options.pressed;
  }

  if (typeof options.expanded === 'boolean') {
    props['aria-expanded'] = options.expanded;
  }

  if (options.controls) {
    props['aria-controls'] = options.controls;
  }

  if (options.disabled) {
    props['aria-disabled'] = true;
    props.disabled = true;
  }

  return props;
};

// Form field accessibility helpers
export const getFormFieldProps = (
  label: string,
  options: {
    required?: boolean;
    invalid?: boolean;
    description?: string;
    errorMessage?: string;
  } = {}
): {
  field: Record<string, any>;
  label: Record<string, any>;
  description?: Record<string, any>;
  error?: Record<string, any>;
} => {
  const fieldId = generateId('field');
  const labelId = generateId('label');
  const descriptionId = options.description ? generateId('description') : undefined;
  const errorId = options.errorMessage ? generateId('error') : undefined;

  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ');

  return {
    field: {
      id: fieldId,
      'aria-labelledby': labelId,
      'aria-describedby': describedBy || undefined,
      'aria-required': options.required || undefined,
      'aria-invalid': options.invalid || undefined
    },
    label: {
      id: labelId,
      htmlFor: fieldId
    },
    description: descriptionId ? {
      id: descriptionId,
      'aria-hidden': false
    } : undefined,
    error: errorId ? {
      id: errorId,
      role: 'alert',
      'aria-live': 'polite'
    } : undefined
  };
};

// Landmark region helpers
export const getLandmarkProps = (
  type: 'main' | 'navigation' | 'banner' | 'contentinfo' | 'complementary' | 'search',
  label?: string
): Record<string, string> => {
  const props: Record<string, string> = {
    role: type === 'main' ? 'main' : 
          type === 'navigation' ? 'navigation' :
          type === 'banner' ? 'banner' :
          type === 'contentinfo' ? 'contentinfo' :
          type === 'complementary' ? 'complementary' :
          type === 'search' ? 'search' : type
  };

  if (label) {
    props['aria-label'] = label;
  }

  return props;
};

// Table accessibility helpers
export const getTableProps = (caption?: string) => {
  return {
    table: {
      role: 'table',
      'aria-label': caption
    },
    caption: caption ? {
      className: 'sr-only'
    } : undefined
  };
};

// Modal/Dialog accessibility helpers
export const getDialogProps = (
  title: string,
  options: {
    describedBy?: string;
    modal?: boolean;
  } = {}
) => {
  return {
    role: 'dialog',
    'aria-label': title,
    'aria-describedby': options.describedBy,
    'aria-modal': options.modal !== false
  };
};

// Keyboard navigation helpers
export const handleKeyboardNavigation = (
  event: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number
): number => {
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault();
      return (currentIndex + 1) % items.length;
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault();
      return currentIndex === 0 ? items.length - 1 : currentIndex - 1;
    case 'Home':
      event.preventDefault();
      return 0;
    case 'End':
      event.preventDefault();
      return items.length - 1;
    default:
      return currentIndex;
  }
};

// High contrast mode detection and handling
export const setupHighContrastMode = () => {
  const checkHighContrast = () => {
    const isHighContrast = prefersHighContrast();
    document.documentElement.classList.toggle('high-contrast', isHighContrast);
  };

  // Initial check
  checkHighContrast();

  // Listen for changes
  window.matchMedia('(prefers-contrast: high)').addEventListener('change', checkHighContrast);
};

// Reduced motion setup
export const setupReducedMotion = () => {
  const checkReducedMotion = () => {
    const isReducedMotion = prefersReducedMotion();
    document.documentElement.classList.toggle('reduce-motion', isReducedMotion);
  };

  // Initial check
  checkReducedMotion();

  // Listen for changes
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', checkReducedMotion);
};