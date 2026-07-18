import React from 'react';
import { TrendingUp, Zap, BarChart3, Coins } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
  isVisible: boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete, isVisible }) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  
  const steps = [
    { icon: TrendingUp, text: "Loading Markets", color: "text-blue-500" },
    { icon: BarChart3, text: "Preparing Charts", color: "text-green-500" },
    { icon: Coins, text: "Fetching Prices", color: "text-yellow-500" },
    { icon: Zap, text: "Ready to Trade", color: "text-purple-500" },
  ];

  React.useEffect(() => {
    if (!isVisible) return;

    const timer = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= steps.length - 1) {
          clearInterval(timer);
          setTimeout(onComplete, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    return () => clearInterval(timer);
  }, [isVisible, onComplete, steps.length]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary via-primary/90 to-primary/80 animate-fade-in">
      {/* App Logo */}
      <div className="mb-8 animate-scale-in">
        <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/30">
          <TrendingUp className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* App Name */}
      <h1 className="text-3xl font-bold text-white mb-12 text-center animate-fade-in-up">
        Commodity Hub
      </h1>

      {/* Loading Steps */}
      <div className="flex flex-col items-center space-y-6">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          
          return (
            <div
              key={index}
              className={`flex items-center space-x-4 transition-all duration-300 ${
                isActive || isCompleted ? 'opacity-100' : 'opacity-30'
              } ${isActive ? 'scale-110' : 'scale-100'}`}
            >
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center
                ${isCompleted ? 'bg-green-500' : isActive ? 'bg-white/20' : 'bg-white/10'}
                transition-all duration-300
              `}>
                <StepIcon className={`
                  w-4 h-4 
                  ${isCompleted ? 'text-white' : isActive ? step.color : 'text-white/50'}
                  ${isActive ? 'animate-pulse' : ''}
                `} />
              </div>
              <span className={`
                text-sm font-medium
                ${isActive ? 'text-white' : 'text-white/70'}
                transition-colors duration-300
              `}>
                {step.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="mt-8 w-48 h-1 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Loading Text */}
      <p className="mt-4 text-white/70 text-xs animate-fade-in">
        Powered by real-time market data
      </p>
    </div>
  );
};

export default SplashScreen;