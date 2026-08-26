// Pure RSS parsing/normalization logic for the commodity news feed — no
// serve()/network/DB here on purpose, so this module can be unit-tested by
// importing it directly (see rss_test.ts) without pulling in the HTTP
// listener the way index.ts's serve() call would.
//
// All sources are plain RSS 2.0 (<rss><channel><item>...) — this does not
// attempt to support Atom feeds. Every one was fetched live and checked for
// real, current items before being listed here.
import { XMLParser } from 'npm:fast-xml-parser@5.11.0';

export type NewsCategory =
  | 'energy'
  | 'metals'
  | 'grains'
  | 'livestock'
  | 'softs'
  | 'economic'
  | 'geopolitical'
  | 'general';

export interface FeedSource {
  name: string;
  url: string;
  /** Used only when no keyword in categorize() matches the item's own text. */
  category: NewsCategory;
}

// Reuters/LSEG access is enterprise-licensed, sales-quote-only, and
// standard individual terms explicitly forbid redistribution — see the
// commodity_news_feed migration's header comment. These need no commercial
// license at all: EIA is official U.S. government data, the rest publish RSS
// specifically for syndication.
//
// Chosen to keep every category filter on the news page populated —
// energy/metals/grains/livestock all have a dedicated primary source, since
// a feed that leaves half its filters permanently empty reads as broken.
//
// Two sources were dropped after the first live run, both verified:
//  - Mining.com returned HTTP 403 on every feed path (/feed/, /rss/, apex
//    domain). They're blocking non-browser clients; spoofing a browser
//    User-Agent to get around that is evading an access control, not
//    syndication, so Northern Miner covers metals/mining instead.
//  - USDA NASS's news.xml parsed fine but its newest item was ~11 months
//    old (their ASB feed was worse). Every row it produced fell outside the
//    14-day retention window and was deleted immediately after insert, so
//    it contributed nothing but fetch time. Farm Progress covers grains.
export const FEED_SOURCES: FeedSource[] = [
  { name: 'U.S. Energy Information Administration', url: 'https://www.eia.gov/rss/todayinenergy.xml', category: 'energy' },
  { name: 'OilPrice.com', url: 'https://oilprice.com/rss/main', category: 'energy' },
  { name: 'Northern Miner', url: 'https://www.northernminer.com/feed/', category: 'metals' },
  { name: 'Farm Progress', url: 'https://www.farmprogress.com/rss.xml', category: 'grains' },
  { name: 'Beef Magazine', url: 'https://www.beefmagazine.com/rss.xml', category: 'livestock' },
  { name: 'Hellenic Shipping News', url: 'https://www.hellenicshippingnews.com/feed/', category: 'general' },
];

export const MAX_DESCRIPTION_LENGTH = 320;

/** How far ahead of "now" a pubDate may be before the item is treated as
 *  scheduled-but-not-published rather than news. Found live: Farm Progress
 *  ships embargoed posts dated up to a week out, and since the feed page
 *  orders by published_at DESC those would pin themselves above every real
 *  article until their date arrived. The hour of slack absorbs ordinary
 *  clock skew between a publisher's server and ours. */
export const MAX_FUTURE_DATE_MS = 60 * 60 * 1000;

// isArray forces <item> to always parse as an array even when a feed has
// exactly one entry — without it, fast-xml-parser collapses a single item
// into a bare object and `for (const item of items)` would iterate its
// *properties* instead. ignoreAttributes/attributeNamePrefix are left at
// their defaults (true / "") since nothing here reads XML attributes (e.g.
// guid's isPermaLink) — only element text.
const xmlParser = new XMLParser({ isArray: (name) => name === 'item' });

export function stripHtml(input: unknown): string {
  const text = typeof input === 'string' ? input : '';
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

/** Same commodity-category taxonomy fetch-commodity-news/index.ts's
 *  commodityKeywords maps into, condensed to keyword buckets so every item
 *  gets tagged by *content* — a source's own `category` is only the
 *  fallback for when nothing here matches (e.g. an EIA post about corn
 *  ethanol should land in "grains", not "energy" just because EIA published
 *  it). Order matters: checked most-specific-commodity first, broader
 *  economic/geopolitical framing last, so e.g. "oil sanctions" lands in
 *  energy rather than geopolitical.
 */
export function categorize(text: string, fallback: NewsCategory): NewsCategory {
  const t = text.toLowerCase();
  // Deliberately no trailing \b on most terms: it's a leading-boundary-only
  // prefix match, so "soybean" also catches "soybeans", "harvest" also
  // catches "harvested"/"harvesting", "tariff" also catches "tariffs", etc.
  // — a first version required a trailing \b on the whole group too, which
  // made every plural/suffixed form silently miss (caught by the "matches
  // each commodity bucket" test failing on plain "tariffs"). The few terms
  // checked with both boundaries (war, ore, fed, gdp) are the opposite risk
  // — short enough to false-positive *inside* unrelated words (software,
  // before, federal) if left as a prefix match.
  if (/\b(wheat|corn|soybean|grain|crop|harvest|acreage|planting)/.test(t)) return 'grains';
  if (/\b(cattle|hog|livestock|beef|pork|poultry|dairy)/.test(t)) return 'livestock';
  if (/\b(coffee|sugar|cotton|cocoa|orange juice)/.test(t)) return 'softs';
  if (/\b(gold|silver|copper|platinum|palladium|metal|mining|bullion)/.test(t) || /\bore\b/.test(t)) return 'metals';
  if (/\b(oil|crude|opec|natural gas|petroleum|refin|diesel|gasoline|drilling)/.test(t) || /\blng\b/.test(t)) return 'energy';
  if (/\b(tariff|sanction|geopolit|export ban|conflict)/.test(t) || /\bwar\b/.test(t)) return 'geopolitical';
  if (/\b(inflation|federal reserve|interest rate|recession|dollar)/.test(t) || /\bfed\b/.test(t) || /\bgdp\b/.test(t))
    return 'economic';
  return fallback;
}

/** fast-xml-parser gives plain strings for ordinary text elements; the
 *  `#text` branch is a defensive fallback in case a feed's element also
 *  carries attributes fast-xml-parser would otherwise nest it under (not
 *  expected here since ignoreAttributes stays at its default). */
function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

export interface NewsRow {
  guid: string;
  title: string;
  description: string;
  url: string;
  source_name: string;
  category: NewsCategory;
  published_at: string;
  fetched_at: string;
}

/** Parses one RSS 2.0 document into normalized, upsert-ready rows.
 *  Per-item failures (missing title/link, unparseable pubDate) are skipped
 *  rather than failing the whole source — one malformed item in a feed
 *  shouldn't drop the other 19. */
export function parseFeed(xml: string, source: FeedSource, onSkip?: (reason: string, detail: unknown) => void): NewsRow[] {
  const doc = xmlParser.parse(xml);
  const items: unknown[] = doc?.rss?.channel?.item ?? [];
  const fetchedAt = new Date().toISOString();
  const rows: NewsRow[] = [];

  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const title = stripHtml(extractText(item.title));
    const link = extractText(item.link).trim();
    const rawGuid = extractText(item.guid).trim() || link;
    if (!title || !link || !rawGuid) {
      onSkip?.('missing title/link/guid', { title, link });
      continue;
    }

    const pubDateRaw = extractText(item.pubDate).trim();
    const published = pubDateRaw ? new Date(pubDateRaw) : null;
    if (!published || Number.isNaN(published.getTime())) {
      onSkip?.('unparseable pubDate', { title, pubDateRaw });
      continue;
    }
    if (published.getTime() > Date.now() + MAX_FUTURE_DATE_MS) {
      onSkip?.('published in the future (scheduled post)', { title, pubDateRaw });
      continue;
    }

    const description = truncate(stripHtml(extractText(item.description)), MAX_DESCRIPTION_LENGTH);

    rows.push({
      // Prefixed with the source name so two unrelated feeds can never
      // collide on a coincidentally identical guid/link.
      guid: `${source.name}:${rawGuid}`,
      title,
      description,
      url: link,
      source_name: source.name,
      category: categorize(`${title} ${description}`, source.category),
      published_at: published.toISOString(),
      fetched_at: fetchedAt,
    });
  }

  return rows;
}

/**
 * Collapses rows sharing a guid, keeping the first occurrence.
 *
 * This is not a nicety — it's required for the upsert to work at all.
 * Postgres aborts an ENTIRE `INSERT ... ON CONFLICT DO UPDATE` statement
 * with "cannot affect row a second time" if one batch carries the same
 * conflict key twice, so a single duplicated item silently takes down every
 * other row in the run. Found exactly that way on the first live run: USDA
 * NASS's feed listed 7 URLs twice, and all 367 rows from all 5 sources
 * failed to insert (`upserted: 0`, empty table) because of it.
 *
 * Runs across the combined batch, not per-source, since that's the shape
 * actually handed to the upsert.
 */
export function dedupeByGuid(rows: NewsRow[]): NewsRow[] {
  const seen = new Set<string>();
  const out: NewsRow[] = [];
  for (const row of rows) {
    if (seen.has(row.guid)) continue;
    seen.add(row.guid);
    out.push(row);
  }
  return out;
}
