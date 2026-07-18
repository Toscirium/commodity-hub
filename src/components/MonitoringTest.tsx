import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useMonitoring } from '@/services/monitoringService';
import { usePerformanceMonitoring } from '@/hooks/usePerformanceMonitoring';

export function MonitoringTest() {
  const analytics = useAnalytics();
  const monitoring = useMonitoring();
  
  usePerformanceMonitoring({
    componentName: 'MonitoringTest',
    trackRenders: true,
    trackMounts: true
  });

  const handleTestError = () => {
    monitoring.reportError(new Error('Test error for monitoring'));
  };

  const handleTestEvent = () => {
    analytics.trackCustomEvent('test_button_click', {
      component: 'MonitoringTest',
      timestamp: Date.now()
    });
  };

  const handleTestPerformance = () => {
    const testFunction = monitoring.measurePerformance(() => {
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 100) {
        // Busy wait for 100ms
      }
    }, 'test_performance');
    
    testFunction();
  };

  const handleViewSessionData = () => {
    const sessionData = monitoring.getSessionData();
    console.log('Session Data:', sessionData);
    analytics.trackCustomEvent('view_session_data', sessionData);
  };

  const handleForceFlush = () => {
    monitoring.forceFlush();
    analytics.trackCustomEvent('force_flush_monitoring');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Monitoring & Analytics Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={handleTestError} variant="destructive" className="w-full">
          Test Error Reporting
        </Button>
        
        <Button onClick={handleTestEvent} variant="default" className="w-full">
          Test Event Tracking
        </Button>
        
        <Button onClick={handleTestPerformance} variant="secondary" className="w-full">
          Test Performance Monitoring
        </Button>
        
        <Button onClick={handleViewSessionData} variant="outline" className="w-full">
          View Session Data
        </Button>
        
        <Button onClick={handleForceFlush} variant="outline" className="w-full">
          Force Flush Data
        </Button>
      </CardContent>
    </Card>
  );
}