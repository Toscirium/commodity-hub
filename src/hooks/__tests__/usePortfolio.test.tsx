import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { usePortfolio } from '@/hooks/usePortfolio'
import { createTestQueryClient } from '@/test/utils'

// Mock Supabase client (ESM-friendly — no `require`).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}))

// Unauthenticated user — exercises the guarded code paths without hitting network.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, profile: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('usePortfolio Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = createTestQueryClient()
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  it('exposes the expected API surface', () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper })
    expect(result.current).toBeDefined()
    expect(typeof result.current.addPosition).toBe('function')
  })

  it('rejects addPosition when no user is authenticated', async () => {
    const { result } = renderHook(() => usePortfolio(), { wrapper })
    await expect(
      result.current.addPosition({
        commodity_name: 'Gold',
        quantity: 10,
        entry_price: 1950,
        entry_date: '2024-01-01',
      } as Parameters<typeof result.current.addPosition>[0])
    ).rejects.toThrow(/not authenticated/i)
  })
})