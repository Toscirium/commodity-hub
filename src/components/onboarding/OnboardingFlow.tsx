import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  BookOpen, 
  Settings, 
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  content: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(new Set());

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Commodity Hub',
      description: 'Live commodity prices, charts, and market insights — all in one app.',
      icon: Sparkles,
      content: (
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto w-24 h-24 bg-gradient-to-r from-primary to-primary/70 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <p className="text-muted-foreground">
              Track real-time prices for oil, gold, grains, metals, and more — with expert market insights.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-medium">Live Prices</h4>
              <p className="text-sm text-muted-foreground">Energy, metals, grains, softs</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-medium">Market Insights</h4>
              <p className="text-sm text-muted-foreground">Expert analysis & news</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dashboard',
      title: 'Explore Your Dashboard',
      description: 'Your central hub for monitoring commodity markets at a glance.',
      icon: TrendingUp,
      content: (
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-muted/20">
            <h4 className="font-medium mb-2">Key Features:</h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Interactive price charts with technical indicators
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Multi-currency pricing (USD, EUR, CNY, INR)
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Real-time commodity news and sentiment
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Custom watchlists and price alerts
              </li>
            </ul>
          </div>
          <Badge variant="secondary" className="w-fit">
            Pro Tip: Use keyboard shortcuts (?) for faster navigation
          </Badge>
        </div>
      )
    },
    {
      id: 'features',
      title: 'Powerful Features',
      description: 'Advanced tools for commodity market research and analysis.',
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium">Market Screener</h4>
                <p className="text-sm text-muted-foreground">Filter and compare commodities across categories</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <div className="w-8 h-8 rounded bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-medium">Learning Hub</h4>
                <p className="text-sm text-muted-foreground">Educational resources on commodity markets</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <div className="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-medium">Premium Commodities</h4>
                <p className="text-sm text-muted-foreground">Unlock 60+ specialty markets with a subscription</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'settings',
      title: 'Customize Your Experience',
      description: 'Set up your preferences for the best experience.',
      icon: Settings,
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <h4 className="font-medium">Theme Preference</h4>
                <p className="text-sm text-muted-foreground">Choose between light and dark mode</p>
              </div>
              <Badge variant="outline">Auto-detected</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <h4 className="font-medium">Currency Preference</h4>
                <p className="text-sm text-muted-foreground">View prices in USD, EUR, CNY, or INR</p>
              </div>
              <Badge variant="secondary">Optional</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <h4 className="font-medium">Notifications</h4>
                <p className="text-sm text-muted-foreground">Get alerts for price movements</p>
              </div>
              <Badge variant="secondary">Recommended</Badge>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm text-center">
              You can always change these settings later in your profile
            </p>
          </div>
        </div>
      ),
      action: {
        label: 'Configure Settings',
        onClick: () => {
          // Navigate to settings or open settings modal
          console.log('Navigate to settings');
        }
      }
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      setCurrentStep(currentStep + 1);
    } else {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;
  const currentStepData = steps[currentStep];
  const IconComponent = currentStepData.icon;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-scale-in">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline">
                Step {currentStep + 1} of {steps.length}
              </Badge>
              <Button variant="ghost" size="sm" onClick={onSkip}>
                Skip Tour
              </Button>
            </div>
            
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <IconComponent className="w-8 h-8 text-primary" />
            </div>
            
            <CardTitle className="text-2xl">{currentStepData.title}</CardTitle>
            <p className="text-muted-foreground">{currentStepData.description}</p>
          </CardHeader>

          <CardContent className="pb-8">
            <div key={currentStep} className="animate-fade-in">
              {currentStepData.content}
            </div>

            <div className="flex items-center justify-between mt-8 pt-6 border-t">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              <div className="flex gap-2">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentStep
                        ? 'bg-primary'
                        : completedSteps.has(index)
                        ? 'bg-primary/60'
                        : 'bg-muted'
                    }`}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                {currentStepData.action && (
                  <Button
                    variant="outline"
                    onClick={currentStepData.action.onClick}
                  >
                    {currentStepData.action.label}
                  </Button>
                )}
                <Button onClick={nextStep} className="flex items-center gap-2">
                  {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingFlow;