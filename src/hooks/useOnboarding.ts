
import React from 'react';

const ONBOARDING_KEY = 'commodityflow_onboarding_completed';
const ONBOARDING_VERSION = '1.0';

interface OnboardingState {
  isFirstTime: boolean;
  showOnboarding: boolean;
  currentStep: number;
  hasCompletedOnboarding: boolean;
}

export const useOnboarding = () => {
  const [state, setState] = React.useState<OnboardingState>({
    isFirstTime: true,
    showOnboarding: false,
    currentStep: 0,
    hasCompletedOnboarding: false,
  });

  React.useEffect(() => {
    const completedVersion = localStorage.getItem(ONBOARDING_KEY);
    const hasCompleted = completedVersion === ONBOARDING_VERSION;
    
    setState(prev => ({
      ...prev,
      isFirstTime: !hasCompleted,
      showOnboarding: !hasCompleted,
      hasCompletedOnboarding: hasCompleted,
    }));
  }, []);

  const startOnboarding = () => {
    setState(prev => ({
      ...prev,
      showOnboarding: true,
      currentStep: 0,
    }));
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, ONBOARDING_VERSION);
    setState(prev => ({
      ...prev,
      showOnboarding: false,
      hasCompletedOnboarding: true,
      isFirstTime: false,
    }));
  };

  const skipOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, ONBOARDING_VERSION);
    setState(prev => ({
      ...prev,
      showOnboarding: false,
      hasCompletedOnboarding: true,
      isFirstTime: false,
    }));
  };

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setState({
      isFirstTime: true,
      showOnboarding: true,
      currentStep: 0,
      hasCompletedOnboarding: false,
    });
  };

  return {
    ...state,
    startOnboarding,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
  };
};
