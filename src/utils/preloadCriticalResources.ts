// Preload critical resources for faster app startup
export const preloadCriticalResources = () => {
  // Preload critical fonts
  const preloadFont = (href: string) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    document.head.appendChild(link);
  };

  // Preload critical images
  const preloadImage = (src: string) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  };

  // Preload critical API endpoints
  const preloadAPI = (url: string) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };

  // Add DNS prefetch for external APIs
  const addDNSPrefetch = (hostname: string) => {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = hostname;
    document.head.appendChild(link);
  };

  // Execute preloading
  try {
    // DNS prefetch for external APIs
    addDNSPrefetch('//api.commoditypriceapi.com');
    addDNSPrefetch('//www.alphavantage.co');
    addDNSPrefetch('//fonts.googleapis.com');
    addDNSPrefetch('//fonts.gstatic.com');
    
    // Preload critical fonts (if using custom fonts)
    // preloadFont('/fonts/inter-var.woff2');
    
    // Preload app icon
    preloadImage('/icon-192.png');
    
  } catch (error) {
    console.warn('Failed to preload some resources:', error);
  }
};

// Initialize resource hints immediately
export const initializeResourceHints = () => {
  if (typeof window !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preloadCriticalResources);
  } else {
    preloadCriticalResources();
  }
};