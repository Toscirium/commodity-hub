// Maps a commodity to the news it should surface, against the RSS-sourced
// commodity_news_feed table.
//
// Pure and dependency-free so it can be unit tested directly — see
// commodity-news-match_test.ts. The edge function that uses it
// (enhanced-commodity-news) only adds the DB read and HTTP shell.
//
// Deliberately NO fuzzy category fallback: if nothing matches a commodity's
// own terms, the caller gets an empty list and the UI says "No Recent News".
// Padding a milk contract's panel with cattle headlines because they're both
// "agriculture" is the same instinct that produced the fabricated-articles
// bug this feature replaced — thin and honest beats full and misleading.

export interface MatchableArticle {
  title: string;
  description: string;
  published_at: string;
}

/**
 * Search terms per commodity. Multi-word entries are matched as phrases.
 *
 * Same boundary discipline as the RSS categorizer: entries are matched with
 * a LEADING word boundary and an open end, so "soybean" also catches
 * "soybeans" and "refiner" catches "refinery"/"refiners". Short tokens that
 * would otherwise appear inside unrelated words are listed in
 * STRICT_TERMS below and matched with both boundaries.
 */
export const COMMODITY_TERMS: Record<string, readonly string[]> = {
  // Energy
  'WTI Crude Oil': ['wti', 'crude', 'crude oil', 'opec', 'petroleum', 'oil price', 'oil market', 'refiner', 'barrel', 'shale'],
  'Brent Crude Oil': ['brent', 'crude', 'crude oil', 'opec', 'petroleum', 'oil price', 'oil market', 'barrel'],
  'Natural Gas': ['natural gas', 'lng', 'gas storage', 'henry hub', 'gas price', 'gas market'],
  'Gasoline RBOB': ['gasoline', 'rbob', 'pump price', 'refiner'],
  'Heating Oil': ['heating oil', 'diesel', 'distillate', 'ulsd'],

  // Metals
  'Gold Futures': ['gold', 'bullion', 'xau'],
  'Silver Futures': ['silver', 'xag'],
  'Copper': ['copper'],
  'Platinum': ['platinum'],
  'Palladium': ['palladium'],
  'Steel HRC': ['steel', 'hot-rolled', 'hrc', 'iron ore'],

  // Grains
  'Corn Futures': ['corn', 'maize', 'ethanol'],
  'Wheat Futures': ['wheat'],
  'KC HRW Wheat': ['wheat', 'hard red'],
  'Soybean Futures': ['soybean', 'soy complex'],
  'Soybean Oil': ['soybean oil', 'soy oil', 'vegetable oil'],
  'Soybean Meal': ['soybean meal', 'soy meal', 'protein meal'],
  'Oat Futures': ['oat'],
  'Rough Rice': ['rice'],

  // Livestock
  'Live Cattle': ['cattle', 'beef', 'feedlot'],
  'Feeder Cattle': ['feeder cattle', 'cattle', 'feedlot'],
  'Lean Hogs': ['hog', 'pork', 'swine'],

  // Dairy
  'Class III Milk': ['class iii', 'milk', 'dairy', 'cheese', 'whey', 'butter'],
  'Dry Whey': ['whey', 'dairy', 'milk'],
  'Cash-Settled Butter': ['butter', 'dairy', 'milk'],
  'Nonfat Dry Milk': ['nonfat dry', 'milk', 'dairy'],
  'Cash-Settled Cheese': ['cheese', 'dairy', 'milk'],

  // Industrials
  'Lumber Futures': ['lumber', 'timber', 'sawmill', 'housing start'],
};

/** Terms short enough to appear inside unrelated words ("ore" in "before",
 *  "hrc" nowhere but kept for symmetry), matched with both boundaries. */
const STRICT_TERMS = new Set(['wti', 'xau', 'xag', 'lng', 'hrc', 'oat', 'rice', 'hog', 'corn']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const termMatches = (haystack: string, term: string): boolean => {
  const pattern = STRICT_TERMS.has(term)
    ? `\\b${escapeRegExp(term)}\\b`
    : `\\b${escapeRegExp(term)}`;
  return new RegExp(pattern, 'i').test(haystack);
};

/**
 * Resolves the term list for a commodity, tolerating the naming drift
 * between catalogs — "Micro Gold" should read as gold, and a bare "Gold"
 * should find the "Gold Futures" entry.
 */
export function termsFor(commodity: string): readonly string[] {
  const direct = COMMODITY_TERMS[commodity];
  if (direct) return direct;

  const normalized = commodity.replace(/^Micro\s+/i, '').replace(/^Cash-Settled\s+/i, '').trim();
  if (COMMODITY_TERMS[normalized]) return COMMODITY_TERMS[normalized];

  const lower = normalized.toLowerCase();
  for (const [name, terms] of Object.entries(COMMODITY_TERMS)) {
    const nameLower = name.toLowerCase();
    if (nameLower === lower) return terms;
    // "Gold" -> "Gold Futures"; "Wheat Futures" -> "Wheat Futures"
    if (nameLower.startsWith(lower + ' ') || lower.startsWith(nameLower + ' ')) return terms;
  }

  // Unknown commodity: fall back to its own words, minus generic suffixes,
  // so a catalog addition still gets *something* sensible before anyone
  // remembers to add it above.
  const own = normalized.replace(/\b(futures|continuous|front month)\b/gi, '').trim().toLowerCase();
  return own.length >= 3 ? [own] : [];
}

/** Distinct terms hit, weighting the title over the body — a headline about
 *  wheat is more about wheat than one that mentions it in passing. */
export function scoreArticle(article: MatchableArticle, terms: readonly string[]): number {
  const title = article.title ?? '';
  const body = article.description ?? '';
  let score = 0;
  for (const term of terms) {
    if (termMatches(title, term)) score += 3;
    else if (termMatches(body, term)) score += 1;
  }
  return score;
}

/** Best matches for a commodity, most relevant first, recency breaking ties. */
export function selectForCommodity<T extends MatchableArticle>(
  articles: readonly T[],
  commodity: string,
  limit: number,
): T[] {
  const terms = termsFor(commodity);
  if (terms.length === 0) return [];

  return articles
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : new Date(b.article.published_at).getTime() - new Date(a.article.published_at).getTime(),
    )
    .slice(0, limit)
    .map((x) => x.article);
}
