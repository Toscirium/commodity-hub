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

/**
 * Curated eToro Academy reading, surfaced in the Learning Hub.
 *
 * These are LINKS OUT, never embedded: etoro.com serves
 * `x-frame-options: SAMEORIGIN`, so an iframe is refused by the browser
 * regardless of our own CSP — and republishing their articles in-app would
 * put a regulated broker's compliance disclaimers under our brand.
 *
 * COMPLIANCE (https://etoropartners.com/compliance-g): the `blurb` fields
 * below are custom promotional copy, which eToro requires to pre-approve
 * before publishing. Keep them factual and get sign-off before shipping
 * changes here. The risk warning next to these links is not optional.
 */
export interface AcademyLink {
  id: string;
  title: string;
  blurb: string;
  path: string;
}

export const ETORO_ACADEMY_BASE = 'https://www.etoro.com/academy/';

export const ETORO_ACADEMY_LINKS: AcademyLink[] = [
  {
    id: 'commodities-intro',
    title: 'Commodities trading basics',
    blurb: 'How commodity markets work, and what moves energy, metals, and agricultural prices.',
    path: 'topic/commodities',
  },
  {
    id: 'cfd-explained',
    title: 'What is a CFD?',
    blurb: 'Contracts for difference explained — going long or short without holding the underlying asset.',
    path: 'topic/cfd',
  },
  {
    id: 'risk-management',
    title: 'Risk management',
    blurb: 'Position sizing, stop losses, and managing exposure on leveraged products.',
    path: 'topic/risk-management',
  },
];

/**
 * Academy deep link carrying our affiliate attribution when the partnership
 * URL is configured. Falls back to the plain Academy URL otherwise — the
 * content is publicly readable either way, we just don't get credited.
 */
export function buildAcademyUrl(link: AcademyLink): string {
  const base = AFFILIATE_PROVIDERS.etoro.baseUrl;
  const target = new URL(link.path, ETORO_ACADEMY_BASE);
  target.searchParams.set('utm_source', 'commodity-hub');
  target.searchParams.set('utm_medium', 'affiliate');
  target.searchParams.set('utm_content', `academy-${link.id}`);
  if (!base) return target.toString();
  try {
    // Route through the partner link so the click is attributed, handing the
    // Academy destination along as the redirect target.
    const url = new URL(base);
    url.searchParams.set('utm_source', 'commodity-hub');
    url.searchParams.set('utm_medium', 'affiliate');
    url.searchParams.set('utm_content', `academy-${link.id}`);
    url.searchParams.set('redirect', target.toString());
    return url.toString();
  } catch {
    return target.toString();
  }
}
