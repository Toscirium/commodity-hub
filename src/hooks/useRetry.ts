
import React from 'react';
import { useToast } from '@/hooks/use-toast';

interface UseRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number) => void;
  onMaxRetriesReached?: () => void;
}

interface UseRetryReturn<T> {
  execute: (fn: () => Promise<T>) => Promise<T>;
  isRetrying: boolean;
  retryCount: number;
  reset: () => void;
}

export function useRetry<T = any>(options: UseRetryOptions = {}): UseRetryReturn<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    onRetry,
    onMaxRetriesReached,
  } = options;

  const [isRetrying, setIsRetrying] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const { toast } = useToast();

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const execute = React.useCallback(async (fn: () => Promise<T>): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          setIsRetrying(true);
          const delay = exponentialBackoff 
            ? retryDelay * Math.pow(2, attempt - 1)
            : retryDelay;
          
          await sleep(delay);
          onRetry?.(attempt);
        }

        setRetryCount(attempt);
        const result = await fn();
        setIsRetrying(false);
        setRetryCount(0);
        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxRetries) {
          setIsRetrying(false);
          onMaxRetriesReached?.();
          
          toast({
            title: "Operation Failed",
            description: `Failed after ${maxRetries + 1} attempts. Please try again later.`,
            variant: "destructive",
          });
          
          throw lastError;
        }
      }
    }
    
    throw lastError!;
  }, [maxRetries, retryDelay, exponentialBackoff, onRetry, onMaxRetriesReached, toast]);

  const reset = React.useCallback(() => {
    setIsRetrying(false);
    setRetryCount(0);
  }, []);

  return {
    execute,
    isRetrying,
    retryCount,
    reset,
  };
}
