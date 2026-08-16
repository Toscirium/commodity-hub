import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import TradeCTA from '../TradeCTA';

let mockTier: 'free' | 'premium' | 'pro' = 'free';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, tier: mockTier }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: vi.fn() }) },
}));

// Premium/Pro subscribers already get an "ad-free experience" per the
// paywall's own copy — this affiliate referral CTA is the closest thing to
// an ad in the product, so it should disappear once someone's paying.
describe('TradeCTA — tier gating', () => {
  beforeEach(() => {
    mockTier = 'free';
  });

  it('renders the broker CTA for a free-tier user', () => {
    renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    expect(screen.getByText(/Trade on eToro/i)).toBeInTheDocument();
  });

  it('renders nothing for a premium subscriber', () => {
    mockTier = 'premium';
    const { container } = renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a pro subscriber', () => {
    mockTier = 'pro';
    const { container } = renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    expect(container).toBeEmptyDOMElement();
  });
});
