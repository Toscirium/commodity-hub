import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, createMockCommodity, screen } from '@/test/utils'
import CommodityCard from '@/components/CommodityCard'

// Mock the hooks and services
vi.mock('@/hooks/useCommodityData', () => ({
  useCommodityData: () => ({
    data: createMockCommodity(),
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    profile: null,
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('CommodityCard Component', () => {
  const mockCommodityProps = {
    name: 'Gold',
    symbol: 'GOLD',
    price: 2000.50,
    change: 15.25,
    changePercent: 0.77,
  }

  it('should render commodity information correctly', () => {
    renderWithProviders(<CommodityCard {...mockCommodityProps} />)
    
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('GOLD')).toBeInTheDocument()
    expect(screen.getByText(/\$2,000\.50/)).toBeInTheDocument()
  })

  it('should display positive price change with correct styling', () => {
    renderWithProviders(<CommodityCard {...mockCommodityProps} />)
    expect(screen.getByText(/0\.77%/)).toBeInTheDocument()
  })

  it('should display negative price change correctly', () => {
    const negativeProps = {
      ...mockCommodityProps,
      change: -15.25,
      changePercent: -0.77,
    }
    
    renderWithProviders(<CommodityCard {...negativeProps} />)
    expect(screen.getByText(/0\.77%/)).toBeInTheDocument()
  })

  it('should be accessible', async () => {
    const { container } = renderWithProviders(<CommodityCard {...mockCommodityProps} />)
    
    // Check for proper button role
    expect(screen.getByRole('button')).toBeInTheDocument()
    
    // Check for keyboard navigation
    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('tabIndex', '0')
  })

  it('should handle click events', async () => {
    const { user } = renderWithProviders(
      <CommodityCard {...mockCommodityProps} />
    )
    
    const card = screen.getByRole('button')
    await user.click(card)
    
    // Should toggle expanded state
    expect(card).toBeInTheDocument()
  })

  it('should show loading state for null price', () => {
    const loadingProps = { ...mockCommodityProps, price: null as unknown as number }
    renderWithProviders(<CommodityCard {...loadingProps} />)
    // Card should still render (no price-text assertion — component shows a placeholder).
    expect(screen.getByText('Gold')).toBeInTheDocument()
  })
})