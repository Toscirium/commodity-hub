import React from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  priority?: boolean;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  sizes?: string;
  onLoad?: () => void;
  onError?: () => void;
}

// WebP support detection
const supportsWebP = (() => {
  if (typeof window === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
})();

// Generate optimized image URL with quality and format
const getOptimizedImageUrl = (src: string, quality = 80, format?: 'webp' | 'jpeg'): string => {
  // For external images, return as-is (in real app, you'd use a service like Cloudinary)
  if (src.startsWith('http')) {
    return src;
  }

  // For local images, apply format conversion if supported
  if (format === 'webp' && supportsWebP) {
    return src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  }

  return src;
};

// Generate responsive image sizes
const generateSrcSet = (src: string, sizes: number[]): string => {
  return sizes
    .map(size => `${getOptimizedImageUrl(src)} ${size}w`)
    .join(', ');
};

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  quality = 80,
  priority = false,
  placeholder = 'empty',
  blurDataURL,
  sizes,
  onLoad,
  onError,
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isError, setIsError] = React.useState(false);
  const [currentSrc, setCurrentSrc] = React.useState<string | null>(priority ? src : null);

  const { elementRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '50px',
    threshold: 0.1,
    triggerOnce: true,
  });

  // Load image when in viewport or if priority
  React.useEffect(() => {
    if ((isIntersecting || priority) && !currentSrc && !isError) {
      setCurrentSrc(getOptimizedImageUrl(src, quality, supportsWebP ? 'webp' : undefined));
    }
  }, [isIntersecting, priority, src, quality, currentSrc, isError]);

  const handleLoad = React.useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = React.useCallback(() => {
    setIsError(true);
    onError?.();
  }, [onError]);

  const imageStyle: React.CSSProperties = {
    width: width ? `${width}px` : undefined,
    height: height ? `${height}px` : undefined,
  };

  return (
    <div
      ref={elementRef as React.RefObject<HTMLDivElement>}
      className={`relative overflow-hidden ${className}`}
      style={imageStyle}
    >
      {/* Blur placeholder */}
      {placeholder === 'blur' && blurDataURL && !isLoaded && !isError && (
        <img
          src={blurDataURL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-sm scale-105"
          aria-hidden="true"
        />
      )}

      {/* Loading skeleton */}
      {!isLoaded && !isError && placeholder === 'empty' && (
        <div className="absolute inset-0 w-full h-full bg-muted animate-pulse" />
      )}

      {/* Error state */}
      {isError && (
        <div className="absolute inset-0 w-full h-full bg-muted/50 flex items-center justify-center">
          <div className="text-center space-y-2">
            <svg className="w-8 h-8 mx-auto text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-muted-foreground">Image unavailable</p>
          </div>
        </div>
      )}

      {/* Actual optimized image */}
      {currentSrc && !isError && (
        <img
          src={currentSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
          onLoad={handleLoad}
          onError={handleError}
          style={imageStyle}
        />
      )}
    </div>
  );
};

// Progressive image loader for large images
export const ProgressiveImage: React.FC<OptimizedImageProps & { 
  lowQualitySrc?: string;
}> = ({
  src,
  lowQualitySrc,
  alt,
  className = '',
  onLoad,
  onError,
  ...props
}) => {
  const [lowQualityLoaded, setLowQualityLoaded] = React.useState(false);
  const [highQualityLoaded, setHighQualityLoaded] = React.useState(false);

  const handleLowQualityLoad = React.useCallback(() => {
    setLowQualityLoaded(true);
  }, []);

  const handleHighQualityLoad = React.useCallback(() => {
    setHighQualityLoaded(true);
    onLoad?.();
  }, [onLoad]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Low quality placeholder */}
      {lowQualitySrc && (
        <img
          src={lowQualitySrc}
          alt={alt}
          className={`absolute inset-0 w-full h-full object-cover filter blur-sm transition-opacity duration-300 ${
            lowQualityLoaded && !highQualityLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLowQualityLoad}
          loading="eager"
        />
      )}

      {/* High quality image */}
      <OptimizedImage
        src={src}
        alt={alt}
        className="relative z-10"
        onLoad={handleHighQualityLoad}
        onError={onError}
        {...props}
      />
    </div>
  );
};

export default OptimizedImage;