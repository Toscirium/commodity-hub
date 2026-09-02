/**
 * URL slugs for the per-commodity detail route (/commodity/:slug).
 *
 * Commodity names are free text from the catalog ("WTI Crude Oil", "Natural
 * Gas UK"), so the slug is derived rather than stored: lowercase, everything
 * non-alphanumeric collapsed to a single dash. Resolution goes the other way
 * by re-slugging every catalog name and comparing — that keeps the mapping in
 * one place and means a renamed commodity can't drift out of sync with a
 * hard-coded table.
 *
 * Legacy links that passed the raw name (/dashboard?commodity=WTI%20Crude%20Oil)
 * still resolve: resolveCommodityBySlug also matches on the decoded name.
 */

export const toCommoditySlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const resolveCommodityBySlug = <T extends { name: string }>(
  commodities: T[] | undefined,
  slug: string | undefined,
): T | undefined => {
  if (!commodities?.length || !slug) return undefined;
  const target = toCommoditySlug(decodeURIComponent(slug));
  return commodities.find((c) => toCommoditySlug(c.name) === target);
};

export const commodityDetailPath = (name: string, tab?: string): string =>
  `/commodity/${toCommoditySlug(name)}${tab ? `?tab=${tab}` : ''}`;
