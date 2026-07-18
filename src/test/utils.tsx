import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'

// Test utilities
export const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

// Custom render with providers
export const renderWithProviders = (
  ui: React.ReactElement,
  options: {
    queryClient?: QueryClient
    initialEntries?: string[]
  } = {}
) => {
  const { queryClient = createTestQueryClient(), initialEntries = ['/'] } = options

  const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllTheProviders }),
  }
}

// Mock data generators
export const createMockCommodity = (overrides = {}) => ({
  id: '1',
  symbol: 'GOLD',
  name: 'Gold',
  price: 2000.50,
  change: 15.25,
  changePercent: 0.77,
  high: 2010.00,
  low: 1985.30,
  volume: 125000,
  marketCap: '5.2B',
  lastUpdated: new Date().toISOString(),
  ...overrides,
})

export const createMockUser = (overrides = {}) => ({
  id: '123',
  email: 'test@example.com',
  name: 'Test User',
  avatar: 'https://example.com/avatar.jpg',
  isPremium: false,
  createdAt: new Date().toISOString(),
  ...overrides,
})

export const createMockPortfolioPosition = (overrides = {}) => ({
  id: '1',
  commodityId: 'GOLD',
  symbol: 'GOLD',
  quantity: 10,
  avgPrice: 1950.00,
  currentPrice: 2000.50,
  totalValue: 20005.00,
  pnl: 505.00,
  pnlPercent: 2.59,
  purchaseDate: new Date('2024-01-01').toISOString(),
  ...overrides,
})

// Mock API responses
export const mockFetch = (data: any, status = 200) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response)
}

// Performance testing utilities
export const measurePerformance = async (fn: () => Promise<void> | void) => {
  const start = performance.now()
  await fn()
  const end = performance.now()
  return end - start
}

// Accessibility testing utilities
export const checkAccessibility = (element: HTMLElement): string[] => {
  const issues: string[] = []

  // Check for missing alt text on images
  const images = element.querySelectorAll('img')
  images.forEach((img, index) => {
    if (!img.hasAttribute('alt')) {
      issues.push(`Image at index ${index} is missing alt text`)
    }
  })

  // Check for missing form labels
  const inputs = element.querySelectorAll('input, textarea, select')
  inputs.forEach((input, index) => {
    const hasLabel = input.hasAttribute('aria-label') || 
                    input.hasAttribute('aria-labelledby') ||
                    element.querySelector(`label[for="${input.id}"]`)
    
    if (!hasLabel) {
      issues.push(`Input at index ${index} is missing a label`)
    }
  })

  // Check for adequate color contrast (simplified check)
  const elements = element.querySelectorAll('*')
  elements.forEach((el, index) => {
    const styles = window.getComputedStyle(el)
    const color = styles.color
    const backgroundColor = styles.backgroundColor
    
    if (color === backgroundColor) {
      issues.push(`Element at index ${index} has poor color contrast`)
    }
  })

  return issues
}

// Custom matchers
export const customMatchers = {
  toBeAccessible: (received: HTMLElement) => {
    const issues = checkAccessibility(received)
    return {
      message: () => `Expected element to be accessible, but found issues: ${issues.join(', ')}`,
      pass: issues.length === 0,
    }
  },
  
  toLoadWithinTime: (received: number, expected: number) => {
    return {
      message: () => `Expected load time to be within ${expected}ms, but was ${received}ms`,
      pass: received <= expected,
    }
  },
}

// Re-export testing library utilities
export * from '@testing-library/react'
export { userEvent, vi, screen }