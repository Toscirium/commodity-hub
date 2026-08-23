import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import TradeCTA from '../TradeCTA';

let mockTier: 'free' | 'premium' | 'pro' = 'free';
let mockCountry: string | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, tier: mockTier }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: vi.fn() }),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { country: mockCountry }, error: null })),
    },
  },
}));

// Premium/Pro subscribers already get an "ad-free experience" per the
// paywall's own copy — this affiliate referral CTA is the closest thing to
// an ad in the product, so it should disappear once someone's paying.
describe('TradeCTA — tier gating', () => {
  beforeEach(() => {
    mockTier = 'free';
    mockCountry = null;
  });

  it('renders the broker CTA for a free-tier user', async () => {
    renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    expect(await screen.findByText(/Trade on eToro/i)).toBeInTheDocument();
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

// eToro's own compliance guidelines prohibit CFD promotion to US/AU/ES
// residents (https://etoropartners.com/compliance-guidelines/) — the CTA
// must actually disappear for those visitors, not just carry a disclaimer.
describe('TradeCTA — country gating', () => {
  beforeEach(() => {
    mockTier = 'free';
  });

  it('renders nothing for a visitor detected in a restricted country', async () => {
    mockCountry = 'US';
    const { container } = renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders the CTA for a visitor detected in an eToro-approved country', async () => {
    mockCountry = 'DE';
    renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    expect(await screen.findByText(/Trade on eToro/i)).toBeInTheDocument();
  });

  it('renders nothing for a visitor in a country eToro does not list as approved at all (e.g. Singapore)', async () => {
    mockCountry = 'SG';
    const { container } = renderWithProviders(<TradeCTA symbol="GOLD" commodityName="Gold" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
