import { describe, it, expect } from 'vitest';
import { isProviderAvailableInCountry } from '../affiliates';

// Source of truth: eToro's own country classification PDF (allowlist of
// Tier 1/2/3, everything else implicitly "Banned") layered with their
// separate "No CFDs" product restriction (AU/ES/US) — see affiliates.ts.
// https://etoropartners.com/wp-content/uploads/2024/06/countries-classification.pdf
describe('isProviderAvailableInCountry — etoro', () => {
  it('allows a Tier 1 country not on the CFD-restriction list', () => {
    expect(isProviderAvailableInCountry('etoro', 'DE')).toBe(true);
  });

  it('allows a Tier 3 country', () => {
    expect(isProviderAvailableInCountry('etoro', 'BD')).toBe(true);
  });

  it('blocks the US — not on the allowlist at all', () => {
    expect(isProviderAvailableInCountry('etoro', 'US')).toBe(false);
  });

  it('blocks Singapore — not on the allowlist, despite being a real market', () => {
    expect(isProviderAvailableInCountry('etoro', 'SG')).toBe(false);
  });

  it('blocks Australia — on the allowlist, but CFD-restricted specifically', () => {
    expect(isProviderAvailableInCountry('etoro', 'AU')).toBe(false);
  });

  it('blocks Spain — on the allowlist, but CFD-restricted specifically', () => {
    expect(isProviderAvailableInCountry('etoro', 'ES')).toBe(false);
  });

  it('is case-insensitive on the country code', () => {
    expect(isProviderAvailableInCountry('etoro', 'de')).toBe(true);
    expect(isProviderAvailableInCountry('etoro', 'us')).toBe(false);
  });

  it('fails open when the country is unknown', () => {
    expect(isProviderAvailableInCountry('etoro', null)).toBe(true);
    expect(isProviderAvailableInCountry('etoro', undefined)).toBe(true);
  });
});
