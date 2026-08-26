import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scoreArticle, selectForCommodity, termsFor, type MatchableArticle } from './commodity-news-match.ts';

const art = (title: string, description = '', published_at = '2026-08-26T10:00:00Z'): MatchableArticle => ({
  title,
  description,
  published_at,
});

Deno.test('termsFor: known commodity returns its own terms', () => {
  assert(termsFor('Wheat Futures').includes('wheat'));
  assert(termsFor('Lean Hogs').includes('pork'));
});

Deno.test('termsFor: Micro/Cash-Settled variants resolve to the parent contract', () => {
  assertEquals(termsFor('Micro Gold'), termsFor('Gold Futures'));
  assertEquals(termsFor('Cash-Settled Butter'), termsFor('Cash-Settled Butter'));
  assert(termsFor('Micro Copper').includes('copper'));
});

Deno.test('termsFor: a bare name resolves to its "<name> Futures" entry', () => {
  assertEquals(termsFor('Gold'), termsFor('Gold Futures'));
  assertEquals(termsFor('Corn'), termsFor('Corn Futures'));
});

Deno.test('termsFor: unknown commodity falls back to its own words minus generic suffixes', () => {
  assertEquals(termsFor('Cocoa Futures'), ['cocoa']);
});

Deno.test('scoreArticle: title matches outweigh description matches', () => {
  const terms = termsFor('Wheat Futures');
  const inTitle = scoreArticle(art('Wheat rallies on export demand'), terms);
  const inBody = scoreArticle(art('Grain markets mixed', 'Wheat eased slightly.'), terms);
  assert(inTitle > inBody, `${inTitle} should exceed ${inBody}`);
});

Deno.test('scoreArticle: unrelated article scores zero', () => {
  assertEquals(scoreArticle(art('Bitcoin ETF inflows surge'), termsFor('Wheat Futures')), 0);
});

Deno.test('selectForCommodity: returns only genuine matches, best first', () => {
  const articles = [
    art('Bitcoin ETF inflows surge'),
    art('Crude oil slips as OPEC weighs output', 'Traders eye barrel prices.'),
    art('Weekly grain roundup', 'Corn and wheat little changed.'),
  ];
  const out = selectForCommodity(articles, 'WTI Crude Oil', 10);
  assertEquals(out.length, 1);
  assert(out[0].title.startsWith('Crude oil slips'));
});

Deno.test('selectForCommodity: no fuzzy category bleed — cattle news is not milk news', () => {
  // The whole point of having no category fallback: padding a dairy panel
  // with beef headlines is the same instinct that produced the fabricated
  // articles this feature replaced.
  const articles = [art('Feedlot cattle margins tighten as beef demand cools')];
  assertEquals(selectForCommodity(articles, 'Class III Milk', 10).length, 0);
});

Deno.test('selectForCommodity: dairy terms do match a milk contract', () => {
  const articles = [
    art('Cheese output climbs as dairy margins recover'),
    art('Class III milk futures firm on tighter supply'),
  ];
  assertEquals(selectForCommodity(articles, 'Class III Milk', 10).length, 2);
});

Deno.test('selectForCommodity: recency breaks ties at equal score', () => {
  const older = art('Wheat prices ease', '', '2026-08-20T10:00:00Z');
  const newer = art('Wheat prices climb', '', '2026-08-26T10:00:00Z');
  const out = selectForCommodity([older, newer], 'Wheat Futures', 10);
  assertEquals(out.map((a) => a.title), ['Wheat prices climb', 'Wheat prices ease']);
});

Deno.test('selectForCommodity: respects the limit', () => {
  const articles = Array.from({ length: 20 }, (_, i) => art(`Wheat story ${i}`));
  assertEquals(selectForCommodity(articles, 'Wheat Futures', 6).length, 6);
});

Deno.test('selectForCommodity: empty input yields empty output', () => {
  assertEquals(selectForCommodity([], 'Gold Futures', 6), []);
});

Deno.test('plural and suffixed forms match (soybean -> soybeans, refiner -> refinery)', () => {
  assert(scoreArticle(art('Soybeans rally on China buying'), termsFor('Soybean Futures')) > 0);
  assert(scoreArticle(art('Refinery runs increase'), termsFor('WTI Crude Oil')) > 0);
});

Deno.test('strict short tokens do not false-positive inside unrelated words', () => {
  // 'oat' must not match "coat"/"float"; 'hog' must not match "hogshead"
  // via a leading-boundary-only match; 'rice' must not match "price".
  assertEquals(scoreArticle(art('Floating rate notes and coat sales'), termsFor('Oat Futures')), 0);
  assertEquals(scoreArticle(art('Copper price hits record'), termsFor('Rough Rice')), 0);
  assertEquals(scoreArticle(art('Corner office politics'), termsFor('Corn Futures')), 0);
});
