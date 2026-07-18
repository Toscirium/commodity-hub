import React from 'react';

interface LoadingState {
  [key: string]: boolean;
}

interface LoadingContextType {
  isLoading: (key: string) => boolean;
  setLoading: (key: string, loading: boolean) => void;
  startLoading: (key: string) => void;
  stopLoading: (key: string) => void;
  clearAllLoading: () => void;
  globalLoading: boolean;
}

const LoadingContext = React.createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = React.useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loadingStates, setLoadingStates] = React.useState<LoadingState>({});

  const isLoading = React.useCallback((key: string): boolean => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  const setLoading = React.useCallback((key: string, loading: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: loading
    }));
  }, []);

  const startLoading = React.useCallback((key: string) => {
    setLoading(key, true);
  }, [setLoading]);

  const stopLoading = React.useCallback((key: string) => {
    setLoading(key, false);
  }, [setLoading]);

  const clearAllLoading = React.useCallback(() => {
    setLoadingStates({});
  }, []);

  const globalLoading = Object.values(loadingStates).some(loading => loading);

  const value: LoadingContextType = {
    isLoading,
    setLoading,
    startLoading,
    stopLoading,
    clearAllLoading,
    globalLoading
  };

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
};

// HOC for automatic loading state management
export const withLoading = (loadingKey: string) => {
  return <P extends object>(Component: React.ComponentType<P>) => {
    const WrappedComponent = (props: P) => {
      const { startLoading, stopLoading } = useLoading();

      React.useEffect(() => {
        startLoading(loadingKey);
        return () => stopLoading(loadingKey);
      }, [startLoading, stopLoading]);

      return React.createElement(Component, props);
    };

    WrappedComponent.displayName = `withLoading(${Component.displayName || Component.name})`;
    return WrappedComponent;
  };
};