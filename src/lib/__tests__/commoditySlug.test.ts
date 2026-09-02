import { describe, it, expect } from 'vitest';
import { toCommoditySlug, resolveCommodityBySlug, commodityDetailPath } from '@/lib/commoditySlug';

describe('commoditySlug', () => {
  it('collapses punctuation and spacing into single dashes', () => {
    expect(toCommoditySlug('WTI Crude Oil')).toBe('wti-crude-oil');
    expect(toCommoditySlug('Soybean Oil & Meal')).toBe('soybean-oil-meal');
    expect(toCommoditySlug('  Natural Gas (UK)  ')).toBe('natural-gas-uk');
  });

  const catalog = [{ name: 'WTI Crude Oil' }, { name: 'Natural Gas' }];

  it('resolves a slug back to its catalog entry', () => {
    expect(resolveCommodityBySlug(catalog, 'wti-crude-oil')?.name).toBe('WTI Crude Oil');
  });

  it('still resolves legacy links that passed the encoded name', () => {
    expect(resolveCommodityBySlug(catalog, 'WTI%20Crude%20Oil')?.name).toBe('WTI Crude Oil');
  });

  it('returns undefined for an unknown slug or an empty catalog', () => {
    expect(resolveCommodityBySlug(catalog, 'palladium')).toBeUndefined();
    expect(resolveCommodityBySlug([], 'wti-crude-oil')).toBeUndefined();
    expect(resolveCommodityBySlug(undefined, 'wti-crude-oil')).toBeUndefined();
  });

  it('builds detail paths, optionally deep-linking a tab', () => {
    expect(commodityDetailPath('Natural Gas')).toBe('/commodity/natural-gas');
    expect(commodityDetailPath('Natural Gas', 'news')).toBe('/commodity/natural-gas?tab=news');
  });
});
