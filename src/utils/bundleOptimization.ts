/**
 * Bundle size optimization utilities
 */

import React from 'react';

// Lazy load heavy components
export const lazyImport = <T extends Record<string, any>>(
  importFn: () => Promise<T>,
  namedExport?: keyof T
) => {
  return React.lazy(() =>
    importFn().then((module) => ({
      default: namedExport ? module[namedExport] : module.default,
    }))
  );
};

// Code splitting helpers
export const loadChunk = async <T>(
  importFn: () => Promise<T>,
  fallback?: T
): Promise<T> => {
  try {
    return await importFn();
  } catch (error) {
    console.warn('Failed to load chunk:', error);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
};

// Dynamic imports for heavy libraries
export const loadChartLibrary = () => 
  import('recharts').catch(() => {
    console.warn('Failed to load chart library');
    return null;
  });

export const loadDateLibrary = () =>
  import('date-fns').catch(() => {
    console.warn('Failed to load date library');
    return null;
  });

// Resource optimization
export const preloadCriticalResources = () => {
  // Preload critical CSS
  const criticalCSS = document.createElement('link');
  criticalCSS.rel = 'preload';
  criticalCSS.as = 'style';
  criticalCSS.href = '/src/index.css';
  document.head.appendChild(criticalCSS);

  // Preload critical fonts
  const font = document.createElement('link');
  font.rel = 'preload';
  font.as = 'font';
  font.type = 'font/woff2';
  font.crossOrigin = 'anonymous';
  font.href = '/fonts/inter-var.woff2';
  document.head.appendChild(font);
};

// Bundle analyzer data
export const getBundleInfo = () => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  
  return {
    scripts: scripts.map(s => ({
      src: (s as HTMLScriptElement).src,
      async: (s as HTMLScriptElement).async,
      defer: (s as HTMLScriptElement).defer
    })),
    styles: styles.map(s => ({
      href: (s as HTMLLinkElement).href,
      media: (s as HTMLLinkElement).media
    })),
    totalScripts: scripts.length,
    totalStyles: styles.length
  };
};

// Tree shaking helpers
export const importOnlyUsed = {
  // Import only needed date-fns functions
  format: () => import('date-fns/format'),
  parseISO: () => import('date-fns/parseISO'),
  
  // Import only needed chart components
  LineChart: () => import('recharts').then(m => ({ default: m.LineChart })),
  BarChart: () => import('recharts').then(m => ({ default: m.BarChart })),
};

// Webpack bundle optimization hints
export const optimizationHints = {
  // Mark heavy dependencies for split chunks
  vendor: ['react', 'react-dom', 'react-router-dom'],
  charts: ['recharts', 'victory'],
  ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
  
  // Recommended chunk sizes
  minChunkSize: 20000, // 20KB
  maxChunkSize: 244000, // 244KB
  
  // Critical resources that should be inlined
  critical: ['/src/index.css', '/src/main.tsx'],
};