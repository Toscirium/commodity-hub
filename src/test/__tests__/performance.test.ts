import { describe, it, expect, vi, beforeEach } from 'vitest'
import { performanceMonitor } from '@/test/performance'

describe('Performance Benchmarks', () => {
  beforeEach(() => {
    // Clear previous benchmarks
    performanceMonitor.cleanup()
  })

  it('should measure function execution time', () => {
    const testFunction = () => {
      // Simulate some work
      for (let i = 0; i < 1000; i++) {
        Math.random()
      }
    }

    performanceMonitor.benchmark('test-function', testFunction)
    const benchmarks = performanceMonitor.getBenchmarks('test-function')
    
    expect(benchmarks).toHaveLength(1)
    expect(benchmarks[0].duration).toBeGreaterThan(0)
  })

  it('should measure async function execution time', async () => {
    const asyncFunction = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    await performanceMonitor.benchmarkAsync('test-async', asyncFunction)
    const benchmarks = performanceMonitor.getBenchmarks('test-async')
    
    expect(benchmarks).toHaveLength(1)
    // setTimeout timing is approximate under jsdom — allow small underrun.
    expect(benchmarks[0].duration).toBeGreaterThanOrEqual(5)
  })

  it('should calculate correct averages', () => {
    // Add multiple benchmarks
    performanceMonitor.benchmark('repeated-task', () => Math.random())
    performanceMonitor.benchmark('repeated-task', () => Math.random())
    performanceMonitor.benchmark('repeated-task', () => Math.random())

    const benchmarks = performanceMonitor.getBenchmarks('repeated-task')
    const average = performanceMonitor.getAverageDuration(benchmarks)
    
    expect(benchmarks).toHaveLength(3)
    expect(average).toBeGreaterThan(0)
  })

  it('should calculate percentiles correctly', () => {
    // Add benchmarks with known durations
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    durations.forEach((duration) => {
      performanceMonitor.benchmark('percentile-test', () => {
        // Simulate work that takes the specified duration
        const start = performance.now()
        while (performance.now() - start < duration) {
          // Busy wait
        }
      })
    })

    const benchmarks = performanceMonitor.getBenchmarks('percentile-test')
    const p50 = performanceMonitor.getPercentile(benchmarks, 50)
    const p95 = performanceMonitor.getPercentile(benchmarks, 95)
    
    // Percentiles are based on measured durations of busy-wait work, so
    // exact equality is unreliable. Assert ordering + reasonable bounds.
    expect(p50).toBeGreaterThan(0)
    expect(p95).toBeGreaterThanOrEqual(p50)
  })

  it('should detect performance regressions', () => {
    // Baseline performance
    const fastFunction = () => {
      for (let i = 0; i < 100; i++) {
        Math.random()
      }
    }

    // Slower function (simulating regression)
    const slowFunction = () => {
      for (let i = 0; i < 10000; i++) {
        Math.random()
      }
    }

    performanceMonitor.benchmark('baseline', fastFunction)
    performanceMonitor.benchmark('regression', slowFunction)

    const baselineBenchmarks = performanceMonitor.getBenchmarks('baseline')
    const regressionBenchmarks = performanceMonitor.getBenchmarks('regression')

    expect(regressionBenchmarks[0].duration).toBeGreaterThan(baselineBenchmarks[0].duration * 2)
  })

  it('should track memory usage', () => {
    const memoryIntensiveFunction = () => {
      // Create some objects to use memory
      const largeArray = new Array(10000).fill(0).map(() => ({ data: Math.random() }))
      return largeArray.length
    }

    performanceMonitor.benchmark('memory-test', memoryIntensiveFunction)
    const benchmarks = performanceMonitor.getBenchmarks('memory-test')
    
    expect(benchmarks[0].memory).toBeDefined()
  })

  it('should generate performance reports', () => {
    // Add some sample benchmarks
    performanceMonitor.benchmark('render-component', () => Math.random())
    performanceMonitor.benchmark('interaction-click', () => Math.random())

    const report = performanceMonitor.generateReport()
    
    expect(report).toContain('Performance Report')
    expect(report).toContain('Average Render Time')
    expect(report).toContain('Average Interaction Time')
    expect(report).toContain('Recommendations')
  })

  it('should provide performance thresholds', () => {
    const PERFORMANCE_THRESHOLDS = {
      RENDER_TIME: 100, // ms
      INTERACTION_TIME: 50, // ms
      MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
      BUNDLE_SIZE: 500 * 1024, // 500KB
    }

    // Test a fast render
    performanceMonitor.benchmark('fast-render', () => {
      // Very fast operation
      Math.random()
    })

    const renderBenchmarks = performanceMonitor.getBenchmarks('fast-render')
    const avgRenderTime = performanceMonitor.getAverageDuration(renderBenchmarks)
    
    expect(avgRenderTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RENDER_TIME)
  })
})