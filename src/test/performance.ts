import React from 'react'

export interface PerformanceBenchmark {
  name: string
  duration: number
  memory?: number
  timestamp: number
}

export interface PerformanceMetrics {
  renderTime: number
  interactionTime: number
  memoryUsage: number
  bundleSize: number
  networkRequests: number
}

class PerformanceMonitor {
  private benchmarks: PerformanceBenchmark[] = []
  private observers: PerformanceObserver[] = []

  constructor() {
    this.setupObservers()
  }

  private setupObservers() {
    // Observe Long Tasks
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.addBenchmark({
            name: 'long-task',
            duration: entry.duration,
            timestamp: entry.startTime,
          })
        }
      })
      
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] })
        this.observers.push(longTaskObserver)
      } catch (e) {
        console.warn('Long task observation not supported')
      }

      // Observe Navigation Timing
      const navigationObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const nav = entry as PerformanceNavigationTiming
          this.addBenchmark({
            name: 'navigation',
            duration: nav.loadEventEnd - nav.fetchStart,
            timestamp: nav.fetchStart,
          })
        }
      })
      
      try {
        navigationObserver.observe({ entryTypes: ['navigation'] })
        this.observers.push(navigationObserver)
      } catch (e) {
        console.warn('Navigation observation not supported')
      }
    }
  }

  benchmark<T>(name: string, fn: () => T): T {
    const start = performance.now()
    const memoryBefore = this.getMemoryUsage()
    
    const result = fn()
    
    const end = performance.now()
    const memoryAfter = this.getMemoryUsage()
    
    this.addBenchmark({
      name,
      duration: end - start,
      memory: memoryAfter - memoryBefore,
      timestamp: start,
    })
    
    return result
  }

  async benchmarkAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    const memoryBefore = this.getMemoryUsage()
    
    const result = await fn()
    
    const end = performance.now()
    const memoryAfter = this.getMemoryUsage()
    
    this.addBenchmark({
      name,
      duration: end - start,
      memory: memoryAfter - memoryBefore,
      timestamp: start,
    })
    
    return result
  }

  measureRenderTime(componentName: string, renderFn: () => void) {
    return this.benchmark(`render-${componentName}`, renderFn)
  }

  measureInteractionTime(interactionName: string, interactionFn: () => void) {
    return this.benchmark(`interaction-${interactionName}`, interactionFn)
  }

  measureApiCall(endpoint: string, apiFn: () => Promise<any>) {
    return this.benchmarkAsync(`api-${endpoint}`, apiFn)
  }

  getMetrics(): PerformanceMetrics {
    const renderBenchmarks = this.benchmarks.filter(b => b.name.startsWith('render-'))
    const interactionBenchmarks = this.benchmarks.filter(b => b.name.startsWith('interaction-'))
    
    return {
      renderTime: this.getAverageDuration(renderBenchmarks),
      interactionTime: this.getAverageDuration(interactionBenchmarks),
      memoryUsage: this.getCurrentMemoryUsage(),
      bundleSize: this.getBundleSize(),
      networkRequests: this.getNetworkRequestCount(),
    }
  }

  getBenchmarks(name?: string): PerformanceBenchmark[] {
    if (name) {
      return this.benchmarks.filter(b => b.name === name)
    }
    return [...this.benchmarks]
  }

  getBenchmarksByPattern(pattern: RegExp): PerformanceBenchmark[] {
    return this.benchmarks.filter(b => pattern.test(b.name))
  }

  getAverageDuration(benchmarks: PerformanceBenchmark[]): number {
    if (benchmarks.length === 0) return 0
    const total = benchmarks.reduce((sum, b) => sum + b.duration, 0)
    return total / benchmarks.length
  }

  getPercentile(benchmarks: PerformanceBenchmark[], percentile: number): number {
    if (benchmarks.length === 0) return 0
    const sorted = benchmarks.map(b => b.duration).sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index] || 0
  }

  generateReport(): string {
    const metrics = this.getMetrics()
    const renderP95 = this.getPercentile(
      this.getBenchmarksByPattern(/^render-/), 
      95
    )
    const interactionP95 = this.getPercentile(
      this.getBenchmarksByPattern(/^interaction-/), 
      95
    )

    return `
Performance Report
==================
Average Render Time: ${metrics.renderTime.toFixed(2)}ms
P95 Render Time: ${renderP95.toFixed(2)}ms
Average Interaction Time: ${metrics.interactionTime.toFixed(2)}ms
P95 Interaction Time: ${interactionP95.toFixed(2)}ms
Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB
Bundle Size: ${(metrics.bundleSize / 1024).toFixed(2)}KB
Network Requests: ${metrics.networkRequests}

Recommendations:
${this.generateRecommendations(metrics)}
    `.trim()
  }

  private addBenchmark(benchmark: PerformanceBenchmark) {
    this.benchmarks.push(benchmark)
    
    // Keep only last 1000 benchmarks to prevent memory leaks
    if (this.benchmarks.length > 1000) {
      this.benchmarks = this.benchmarks.slice(-1000)
    }
  }

  private getMemoryUsage(): number {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
      return (window.performance as any).memory.usedJSHeapSize
    }
    return 0
  }

  private getCurrentMemoryUsage(): number {
    return this.getMemoryUsage()
  }

  private getBundleSize(): number {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      const jsResources = resources.filter(r => r.name.includes('.js'))
      return jsResources.reduce((total, resource) => total + (resource.transferSize || 0), 0)
    }
    return 0
  }

  private getNetworkRequestCount(): number {
    if (typeof window !== 'undefined' && 'performance' in window) {
      return performance.getEntriesByType('resource').length
    }
    return 0
  }

  private generateRecommendations(metrics: PerformanceMetrics): string {
    const recommendations: string[] = []

    if (metrics.renderTime > 100) {
      recommendations.push('• Consider optimizing component render times (target: <100ms)')
    }

    if (metrics.interactionTime > 50) {
      recommendations.push('• Optimize user interaction responsiveness (target: <50ms)')
    }

    if (metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
      recommendations.push('• Memory usage is high, check for memory leaks')
    }

    if (metrics.bundleSize > 500 * 1024) { // 500KB
      recommendations.push('• Bundle size is large, consider code splitting')
    }

    if (metrics.networkRequests > 50) {
      recommendations.push('• High number of network requests, consider bundling or caching')
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '• Performance looks good!'
  }

  cleanup() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
    this.benchmarks = []
  }
}

export const performanceMonitor = new PerformanceMonitor()

// React component performance testing utilities
export const withPerformanceMonitoring = <P extends object>(
  Component: React.ComponentType<P>,
  name: string
) => {
  const PerformanceWrapper = (props: P) => {
    const startTime = performance.now()
    
    React.useEffect(() => {
      const endTime = performance.now()
      performanceMonitor.benchmark(`component-${name}`, () => {
        return endTime - startTime
      })
    })

    return React.createElement(Component, props)
  }

  PerformanceWrapper.displayName = `withPerformanceMonitoring(${name})`
  return PerformanceWrapper
}

// Performance testing for React hooks
export const usePerformanceTest = (name: string, dependencies: any[] = []) => {
  React.useEffect(() => {
    const start = performance.now()
    
    return () => {
      const end = performance.now()
      performanceMonitor.benchmark(`hook-${name}`, () => {
        return end - start
      })
    }
  }, dependencies)
}
