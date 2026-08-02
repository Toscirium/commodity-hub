/**
 * Affiliate referral configuration for the "Trade" hub. Commodity Hub does not
 * execute trades, hold funds, or store broker credentials — every CTA here
 * deep-links out to an independent, regulated third party. Revenue comes from
 * referral commission (CPA / rev-share), not from spreads or commissions on
 * the trade itself.
 *
 * Set the *_AFFILIATE_URL env vars once each partnership is approved:
 * - Capital.com: https://capital.com/en-int/partnerships/affiliate-programme
 * - Kalshi: contact partnerships for an affiliate/publisher link (separate
 *   from the peer-to-peer "refer a friend" program).
 * Until then these CTAs render disabled rather than link to a placeholder.
 */

export type AffiliateProvider = 'capital_com' | 'kalshi';

export interface AffiliateProviderConfig {
  id: AffiliateProvider;
  name: string;
  tagline: string;
  regionNote: string;
  baseUrl: string | undefined;
}

export const AFFILIATE_PROVIDERS: Record<AffiliateProvider, AffiliateProviderConfig> = {
  capital_com: {
    id: 'capital_com',
    name: 'Capital.com',
    tagline: 'Leveraged CFD trading — go long or short on the price',
    regionNote: 'Not available to US residents',
    baseUrl: import.meta.env.VITE_CAPITAL_COM_AFFILIATE_URL as string | undefined,
  },
  kalshi: {
    id: 'kalshi',
    name: 'Kalshi',
    tagline: 'Yes/no prediction contracts on the price direction',
    regionNote: 'US-regulated (CFTC); available to US residents',
    baseUrl: import.meta.env.VITE_KALSHI_AFFILIATE_URL as string | undefined,
  },
};

/** Commodities Kalshi's dedicated Commodities Hub actually lists, mapped to our catalog symbols. */
const KALSHI_SYMBOLS = new Set([
  'CL=F', // WTI Crude
  'BZ=F', // Brent Crude
  'GC=F', // Gold
  'SI=F', // Silver
  'NG=F', // Natural Gas
  'HG=F', // Copper
  'ZC=F', // Corn
  'ZS=F', // Soybeans
  'ZW=F', // Wheat
]);

export function isProviderAvailableFor(provider: AffiliateProvider, symbol: string): boolean {
  if (provider === 'kalshi') return KALSHI_SYMBOLS.has(symbol);
  // Capital.com's CFD catalog is broad across energy/metals/grains; exact
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
