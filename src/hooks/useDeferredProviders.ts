import React, { useState, useEffect } from 'react';

// Hook to defer loading of non-critical providers
export const useDeferredProviders = () => {
  const [shouldLoadProviders, setShouldLoadProviders] = useState(false);

  useEffect(() => {
    // Load non-critical providers after initial render
    const timer = setTimeout(() => {
      setShouldLoadProviders(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return shouldLoadProviders;
};