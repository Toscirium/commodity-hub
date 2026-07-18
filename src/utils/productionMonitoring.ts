// Production monitoring configuration
import { monitoring } from './monitoring';

interface AlertConfig {
  errorThreshold: number;
  responseTimeThreshold: number;
  alertWebhook?: string;
}

class ProductionMonitoring {
  private config: AlertConfig;
  private alertsSent: Set<string> = new Set();

  constructor(config: AlertConfig) {
    this.config = config;
    this.setupProductionAlerts();
  }

  private setupProductionAlerts() {
    // Monitor critical metrics every minute
    setInterval(() => {
      this.checkSystemHealth();
    }, 60000);

    // API performance monitoring
    setInterval(() => {
      this.checkApiPerformance();
    }, 120000);
  }

  private async checkSystemHealth() {
    const report = monitoring.getPerformanceReport();
    
    // Check error rate
    if (report.errorCount > this.config.errorThreshold) {
      await this.sendAlert('HIGH_ERROR_RATE', {
        errorCount: report.errorCount,
        threshold: this.config.errorThreshold
      });
    }

    // Check slow API calls
    if (report.slowApiCalls > 5) {
      await this.sendAlert('SLOW_API_PERFORMANCE', {
        slowCalls: report.slowApiCalls,
        avgResponseTime: report.averageApiResponseTime
      });
    }
  }

  private async checkApiPerformance() {
    const report = monitoring.getPerformanceReport();
    
    if (report.averageApiResponseTime > this.config.responseTimeThreshold) {
      await this.sendAlert('API_RESPONSE_SLOW', {
        currentAverage: report.averageApiResponseTime,
        threshold: this.config.responseTimeThreshold
      });
    }
  }

  private async sendAlert(alertType: string, data: any) {
    const alertKey = `${alertType}_${Date.now()}`;
    
    // Prevent duplicate alerts within 15 minutes
    if (this.alertsSent.has(alertType)) {
      return;
    }

    this.alertsSent.add(alertType);
    setTimeout(() => this.alertsSent.delete(alertType), 900000); // 15 minutes

    console.error(`🚨 PRODUCTION ALERT: ${alertType}`, data);

    // Send to external monitoring service
    if (this.config.alertWebhook) {
      try {
        await fetch(this.config.alertWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertType,
            data,
            timestamp: new Date().toISOString(),
            environment: 'production'
          })
        });
      } catch (error) {
        console.error('Failed to send alert:', error);
      }
    }
  }

  // Health check endpoint data
  getHealthStatus() {
    const report = monitoring.getPerformanceReport();
    const recentErrors = monitoring.getErrors().filter(
      e => Date.now() - e.timestamp < 300000 // Last 5 minutes
    );

    return {
      status: recentErrors.length < this.config.errorThreshold ? 'healthy' : 'degraded',
      uptime: performance.now(),
      errorCount: recentErrors.length,
      averageResponseTime: report.averageApiResponseTime,
      slowApiCalls: report.slowApiCalls,
      lastCheck: new Date().toISOString()
    };
  }
}

// Production configuration
export const productionMonitoring = new ProductionMonitoring({
  errorThreshold: 10, // Max 10 errors per 5 minutes
  responseTimeThreshold: 3000, // 3 seconds max average response time
  // alertWebhook: 'https://your-monitoring-service.com/alerts' // Configure in production
});

export default productionMonitoring;