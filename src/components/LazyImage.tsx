import React from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { Skeleton } from '@/components/ui/enhanced-skeleton';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  width?: number;
  height?: number;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  placeholder,
  onLoad,
  onError,
  width,
  height,
}) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);

  const { elementRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '100px', // Load images when they're 100px away from viewport
    threshold: 0.1,
    triggerOnce: true,
  });

  // Start loading the image when it enters viewport
  React.useEffect(() => {
    if (isIntersecting && !imageSrc && !imageError) {
      setImageSrc(src);
    }
  }, [isIntersecting, src, imageSrc, imageError]);

  const handleLoad = () => {
    setImageLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
    onError?.();
  };

  const imageStyle: React.CSSProperties = {};
  if (width) imageStyle.width = width;
  if (height) imageStyle.height = height;

  return (
    <div 
      ref={elementRef as React.RefObject<HTMLDivElement>} 
      className={`relative overflow-hidden ${className}`}
      style={imageStyle}
    >
      {/* Show skeleton while not loaded */}
      {!imageLoaded && !imageError && (
        <Skeleton
          variant="rectangular"
          className="absolute inset-0 w-full h-full"
          animation="pulse"
        />
      )}

      {/* Show placeholder on error */}
      {imageError && (
        <div className="absolute inset-0 w-full h-full bg-muted/50 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 mx-auto bg-muted rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground">Image failed to load</p>
          </div>
        </div>
      )}

      {/* Actual image */}
      {imageSrc && !imageError && (
        <img
          src={imageSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Placeholder content */}
      {placeholder && !imageSrc && !imageError && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/30">
          <span className="text-sm text-muted-foreground">{placeholder}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(LazyImage);