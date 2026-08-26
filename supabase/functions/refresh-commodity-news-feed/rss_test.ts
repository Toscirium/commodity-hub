import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { categorize, dedupeByGuid, parseFeed, stripHtml, truncate, type FeedSource, type NewsRow } from './rss.ts';

const SOURCE: FeedSource = { name: 'Test Source', url: 'https://example.com/rss', category: 'energy' };

// A single-item feed is the classic fast-xml-parser gotcha: without the
// isArray override, one <item> collapses to a bare object instead of a
// 1-length array, and `for (const item of items)` would iterate its
// *properties* rather than the item itself.
const SINGLE_ITEM_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Feed</title>
  <item>
    <title>Crude oil stocks fall as refiners ramp up runs</title>
    <link>https://example.com/articles/1</link>
    <guid isPermaLink="true">https://example.com/articles/1</guid>
    <pubDate>Tue, 25 Aug 2026 16:00:00 -0500</pubDate>
    <description><![CDATA[<p>Weekly EIA data showed a larger-than-expected draw.</p>]]></description>
  </item>
</channel></rss>`;

Deno.test('parseFeed: single-item feed still parses as one row (isArray override)', () => {
  const rows = parseFeed(SINGLE_ITEM_RSS, SOURCE);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].title, 'Crude oil stocks fall as refiners ramp up runs');
  assertEquals(rows[0].url, 'https://example.com/articles/1');
  assertEquals(rows[0].published_at, new Date('Tue, 25 Aug 2026 16:00:00 -0500').toISOString());
});

Deno.test('parseFeed: guid is prefixed with the source name (cross-source dedupe safety)', () => {
  const rows = parseFeed(SINGLE_ITEM_RSS, SOURCE);
  assertEquals(rows[0].guid, 'Test Source:https://example.com/articles/1');
});

Deno.test('parseFeed: CDATA description is stripped of HTML and merged as plain text', () => {
  const rows = parseFeed(SINGLE_ITEM_RSS, SOURCE);
  assertEquals(rows[0].description, 'Weekly EIA data showed a larger-than-expected draw.');
});

Deno.test('parseFeed: multiple items all parse', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>A</title><link>https://example.com/a</link><guid>a</guid><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate><description>desc a</description></item>
    <item><title>B</title><link>https://example.com/b</link><guid>b</guid><pubDate>Tue, 25 Aug 2026 11:00:00 GMT</pubDate><description>desc b</description></item>
    <item><title>C</title><link>https://example.com/c</link><guid>c</guid><pubDate>Tue, 25 Aug 2026 12:00:00 GMT</pubDate><description>desc c</description></item>
  </channel></rss>`;
  const rows = parseFeed(xml, SOURCE);
  assertEquals(rows.length, 3);
  assertEquals(rows.map((r) => r.title), ['A', 'B', 'C']);
});

Deno.test('parseFeed: falls back to <link> as guid when <guid> is absent', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>No guid here</title><link>https://example.com/no-guid</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate><description>d</description></item>
  </channel></rss>`;
  const rows = parseFeed(xml, SOURCE);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].guid, 'Test Source:https://example.com/no-guid');
});

Deno.test('parseFeed: skips an item missing title/link rather than throwing', () => {
  const xml = `<rss version="2.0"><channel>
    <item><link>https://example.com/no-title</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate></item>
    <item><title>Has everything</title><link>https://example.com/ok</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const rows = parseFeed(xml, SOURCE);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].title, 'Has everything');
});

Deno.test('parseFeed: skips an item with an unparseable pubDate rather than throwing', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>Bad date</title><link>https://example.com/bad-date</link><pubDate>not a date</pubDate></item>
    <item><title>Good date</title><link>https://example.com/good-date</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const rows = parseFeed(xml, SOURCE);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].title, 'Good date');
});

Deno.test('parseFeed: empty channel (no items) returns an empty array, not a throw', () => {
  const xml = `<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
  assertEquals(parseFeed(xml, SOURCE), []);
});

Deno.test('parseFeed: falls back to the source default category when no keyword matches', () => {
  const xml = `<rss version="2.0"><channel>
    <item><title>Quarterly outlook update</title><link>https://example.com/x</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate><description>General commentary.</description></item>
  </channel></rss>`;
  const rows = parseFeed(xml, { ...SOURCE, category: 'energy' });
  assertEquals(rows[0].category, 'energy');
});

Deno.test('parseFeed: categorizes by content even when it contradicts the source default', () => {
  // e.g. EIA (source default "energy") occasionally covers corn ethanol —
  // the article is about grains, not energy, and should be tagged as such.
  const xml = `<rss version="2.0"><channel>
    <item><title>Corn ethanol demand reshapes grain markets</title><link>https://example.com/corn</link><pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate><description>Harvest season crop outlook.</description></item>
  </channel></rss>`;
  const rows = parseFeed(xml, { ...SOURCE, category: 'energy' });
  assertEquals(rows[0].category, 'grains');
});

Deno.test('categorize: matches each commodity bucket', () => {
  assertEquals(categorize('wheat harvest forecast', 'general'), 'grains');
  assertEquals(categorize('cattle and hog prices', 'general'), 'livestock');
  assertEquals(categorize('coffee and cocoa futures', 'general'), 'softs');
  assertEquals(categorize('gold and silver bullion demand', 'general'), 'metals');
  assertEquals(categorize('crude oil and OPEC production', 'general'), 'energy');
  assertEquals(categorize('new tariffs and sanctions announced', 'general'), 'geopolitical');
  assertEquals(categorize('Federal Reserve signals on inflation', 'general'), 'economic');
  assertEquals(categorize('nothing matches any keyword here', 'general'), 'general');
});

Deno.test('categorize: plural/suffixed forms still match (not just the exact singular stem)', () => {
  assertEquals(categorize('soybeans rally on export demand', 'general'), 'grains');
  assertEquals(categorize('metals rally as dollar weakens', 'general'), 'metals');
  assertEquals(categorize('interest rates seen unchanged', 'general'), 'economic');
  assertEquals(categorize('new export bans announced', 'general'), 'geopolitical');
  assertEquals(categorize('refinery runs increase', 'general'), 'energy');
  assertEquals(categorize('dollars weaken broadly', 'general'), 'economic');
});

Deno.test('categorize: short strict tokens do not false-positive inside unrelated words', () => {
  assertEquals(categorize('the software update shipped today', 'general'), 'general', 'should not match "war" inside "software"');
  assertEquals(categorize('learn more before you buy', 'general'), 'general', 'should not match "ore" inside "before"/"more"');
  assertEquals(categorize('the federal budget process', 'general'), 'general', 'should not match "fed" inside "federal"');
});

Deno.test('stripHtml: removes tags and decodes common entities', () => {
  assertEquals(stripHtml('<p>Oil &amp; gas prices &gt; forecast &lt;2026&gt;</p>'), 'Oil & gas prices > forecast <2026>');
});

Deno.test('stripHtml: collapses whitespace and trims', () => {
  assertEquals(stripHtml('  <b>Hello</b>   <i>world</i>  '), 'Hello world');
});

Deno.test('stripHtml: non-string input returns empty string rather than throwing', () => {
  assertEquals(stripHtml(undefined), '');
  assertEquals(stripHtml(null), '');
  assertEquals(stripHtml(42), '');
});

Deno.test('truncate: leaves short text untouched', () => {
  assertEquals(truncate('short', 100), 'short');
});

Deno.test('truncate: cuts long text and appends an ellipsis, never exceeding max length', () => {
  const long = 'a'.repeat(500);
  const result = truncate(long, 320);
  assert(result.length <= 320);
  assert(result.endsWith('…'));
});

// --- Regressions from the first live production run ---

Deno.test('parseFeed: skips far-future-dated (scheduled/embargoed) posts', () => {
  // Found live: Farm Progress publishes embargoed posts dated up to a week
  // out. The feed page orders by published_at DESC, so these would pin
  // themselves above every real article until their date arrived.
  const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  const xml = `<rss version="2.0"><channel>
    <item><title>Embargoed piece</title><link>https://example.com/future</link><pubDate>${weekOut}</pubDate></item>
    <item><title>Real piece</title><link>https://example.com/now</link><pubDate>${new Date().toUTCString()}</pubDate></item>
  </channel></rss>`;
  const rows = parseFeed(xml, SOURCE);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].title, 'Real piece');
});

Deno.test('parseFeed: keeps an item dated slightly ahead (publisher clock skew)', () => {
  const inTenMinutes = new Date(Date.now() + 10 * 60 * 1000).toUTCString();
  const xml = `<rss version="2.0"><channel>
    <item><title>Just published</title><link>https://example.com/skew</link><pubDate>${inTenMinutes}</pubDate></item>
  </channel></rss>`;
  assertEquals(parseFeed(xml, SOURCE).length, 1);
});

const row = (guid: string, title = guid): NewsRow => ({
  guid,
  title,
  description: '',
  url: `https://example.com/${guid}`,
  source_name: 'Test Source',
  category: 'energy',
  published_at: '2026-08-25T10:00:00.000Z',
  fetched_at: '2026-08-25T10:00:00.000Z',
});

Deno.test('dedupeByGuid: collapses repeated guids, keeping the first occurrence', () => {
  // THE bug from the first live run: USDA NASS listed 7 URLs twice, and
  // Postgres aborted the entire 367-row ON CONFLICT batch ("cannot affect
  // row a second time") — upserted: 0, empty table, every other source
  // silently taken down with it.
  const rows = [row('a', 'first'), row('b'), row('a', 'second'), row('c')];
  const out = dedupeByGuid(rows);
  assertEquals(out.map((r) => r.guid), ['a', 'b', 'c']);
  assertEquals(out[0].title, 'first', 'keeps the first occurrence, not the last');
});

Deno.test('dedupeByGuid: dedupes across sources, not just within one', () => {
  // The batch handed to the upsert is the concatenation of every source, so
  // that whole array is what has to be conflict-key-unique.
  const a = { ...row('shared'), source_name: 'A' };
  const b = { ...row('shared'), source_name: 'B' };
  assertEquals(dedupeByGuid([a, b]).length, 1);
});

Deno.test('dedupeByGuid: leaves an already-unique batch untouched', () => {
  const rows = [row('a'), row('b'), row('c')];
  assertEquals(dedupeByGuid(rows).length, 3);
});

Deno.test('dedupeByGuid: handles an empty batch', () => {
  assertEquals(dedupeByGuid([]), []);
});
