import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils'

describe('Utils - Currency and Number Formatting', () => {
  describe('formatCurrency', () => {
    it('should format positive numbers correctly', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56')
      expect(formatCurrency(0)).toBe('$0.00')
      expect(formatCurrency(999999.99)).toBe('$999,999.99')
    })

    it('should format negative numbers correctly', () => {
      expect(formatCurrency(-1234.56)).toBe('-$1,234.56')
      expect(formatCurrency(-0.01)).toBe('-$0.01')
    })

    it('should handle edge cases', () => {
      expect(formatCurrency(0.001)).toBe('$0.00')
      expect(formatCurrency(1000000)).toBe('$1,000,000.00')
    })
  })

  describe('formatPercent', () => {
    it('should format percentages correctly', () => {
      expect(formatPercent(0.1234)).toBe('12.34%')
      expect(formatPercent(0)).toBe('0.00%')
      expect(formatPercent(-0.05)).toBe('-5.00%')
    })

    it('should handle large percentages', () => {
      expect(formatPercent(1.5)).toBe('150.00%')
      expect(formatPercent(10)).toBe('1,000.00%')
    })
  })

  describe('formatNumber', () => {
    it('should format numbers with commas', () => {
      expect(formatNumber(1234)).toBe('1,234')
      expect(formatNumber(1234567)).toBe('1,234,567')
      expect(formatNumber(0)).toBe('0')
    })

    it('should handle decimals', () => {
      expect(formatNumber(1234.567, 2)).toBe('1,234.57')
      expect(formatNumber(999.999, 1)).toBe('1,000.0')
    })
  })
})