/**
 * Affiliate referral configuration for the "Trade" hub. Commodity Hub does not
 * execute trades, hold funds, or store broker credentials — every CTA here
 * deep-links out to an independent, regulated third party. Revenue comes from
 * referral commission (CPA / rev-share), not from spreads or commissions on
 * the trade itself.
 *
 * eToro is the only live partner right now (approved as of Aug 2026). Capital.com
 * and Kalshi were removed 2026-08-14 — no approved affiliate link for either yet.
 * Re-add them here (and restore their VITE_*_AFFILIATE_URL env vars) once a
 * partnership is signed.
 *
 * Set VITE_ETORO_AFFILIATE_URL once the partnership is approved — see
 * https://etoropartners.com. Compliance guidelines:
 * https://etoropartners.com/compliance-g. Notably: never put "eToro" in PPC ad
 * copy/URLs/bidding or bid on eToro brand terms, never land PPC traffic
 * directly on an eToro domain, any custom promotional copy needs eToro
 * pre-approval before publishing, and risk warnings need a readable font,
 * bold color, AND a border, positioned near the CTA (see TradeCTA.tsx /
 * Trade.tsx) — not just bold text.
 * Until the env var is set, the CTA renders disabled rather than link to a placeholder.
 */

export type AffiliateProvider = 'etoro';

export interface AffiliateProviderConfig {
  id: AffiliateProvider;
  name: string;
  tagline: string;
  regionNote: string;
  baseUrl: string | undefined;
}

export const AFFILIATE_PROVIDERS: Record<AffiliateProvider, AffiliateProviderConfig> = {
  etoro: {
    id: 'etoro',
    name: 'eToro',
    tagline: 'Leveraged CFD trading — go long or short on the price',
    // eToro's affiliate compliance guidelines restrict CFD promotion to
    // residents of these three: https://etoropartners.com/compliance-g
    regionNote: 'Not available to US, Australian, or Spanish residents',
    baseUrl: import.meta.env.VITE_ETORO_AFFILIATE_URL as string | undefined,
  },
};

export function isProviderAvailableFor(_provider: AffiliateProvider, _symbol: string): boolean {
  // eToro's CFD catalog is broad across energy/metals/grains; exact
  // per-instrument availability varies and isn't worth hardcoding — the link
  // lands on their markets search, not a guaranteed prefilled contract.
  return true;
}

/**
 * Builds the outbound affiliate link for a given commodity. Appends our own
 * UTM tag so click-through can be correlated with the commodity that drove it
 * once the partner's own reporting is wired up.
 */
export function buildAffiliateUrl(provider: AffiliateProvider, symbol: string): string | null {
  const config = AFFILIATE_PROVIDERS[provider];
  if (!config.baseUrl) return null;
  try {
    const url = new URL(config.baseUrl);
    url.searchParams.set('utm_source', 'commodity-hub');
    url.searchParams.set('utm_medium', 'affiliate');
    url.searchParams.set('utm_content', symbol);
    return url.toString();
  } catch {
    return null;
  }
}
