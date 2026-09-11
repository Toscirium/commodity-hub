/**
 * Day-ahead price sources.
 *
 * Two providers, deliberately:
 *   - elering  : Baltic + Finland, NO API KEY. Run it today.
 *   - entsoe   : all of Europe, needs a free token (see README).
 *   - csv      : anything else you can export.
 *
 * Everything is normalised to the same shape:
 *   { ts: <unix seconds>, price: <EUR/MWh>, hours: <duration of the slot> }
 *
 * `hours` matters. Nord Pool moved from hourly to 15-minute settlement during
 * 2025, so a single year of history contains both resolutions. Anything that
 * assumes 24 points per day silently mangles the newer data.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(import.meta.dirname, '.cache');

/* ------------------------------------------------------------------ */
/*  Normalisation                                                     */
/* ------------------------------------------------------------------ */

/**
 * Attach a duration to every point by looking at the gap to the next one.
 * The final point inherits the duration of the one before it.
 */
function withDurations(points) {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  return sorted.map((p, i) => {
    const next = sorted[i + 1];
    const prev = sorted[i - 1];
    const seconds = next
      ? next.ts - p.ts
      : prev
        ? p.ts - prev.ts
        : 3600;
    return { ts: p.ts, price: p.price, hours: seconds / 3600 };
  });
}

/**
 * Guard against the two ways a price feed usually lies to you: duplicated
 * timestamps around DST, and gaps where an hour is simply missing.
 */
function sanityCheck(points, label) {
  const warnings = [];
  const seen = new Set();
  let duplicates = 0;
  for (const p of points) {
    if (seen.has(p.ts)) duplicates++;
    seen.add(p.ts);
  }
  if (duplicates) warnings.push(`${duplicates} duplicate timestamps (DST fold?)`);

  const steps = new Map();
  for (const p of points) {
    const k = p.hours.toFixed(4);
    steps.set(k, (steps.get(k) ?? 0) + 1);
  }
  if (steps.size > 1) {
    const desc = [...steps.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `${Number(h) * 60}min x${n}`)
      .join(', ');
    warnings.push(`mixed resolution: ${desc}`);
  }

  const gaps = points.filter((p) => p.hours > 1.5).length;
  if (gaps) warnings.push(`${gaps} slots longer than 90min (missing data?)`);

  if (warnings.length) {
    console.warn(`  ! ${label}: ${warnings.join('; ')}`);
  }
  return points;
}

/* ------------------------------------------------------------------ */
/*  Elering — Baltics + Finland, no token                             */
/* ------------------------------------------------------------------ */

const ELERING_ZONES = ['ee', 'fi', 'lv', 'lt'];

async function fetchElering({ zone, start, end }) {
  const z = zone.toLowerCase();
  if (!ELERING_ZONES.includes(z)) {
    throw new Error(
      `Elering serves ${ELERING_ZONES.join('/')} only. For "${zone}" use --source entsoe.`,
    );
  }

  const url =
    'https://dashboard.elering.ee/api/nps/price' +
    `?start=${encodeURIComponent(start.toISOString())}` +
    `&end=${encodeURIComponent(end.toISOString())}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Elering returned HTTP ${res.status}`);

  const body = await res.json();
  if (!body?.success || !body?.data?.[z]) {
    throw new Error(`Elering returned no data for zone "${z}"`);
  }

  // Prices are already EUR/MWh, excluding VAT and all network charges.
  return body.data[z].map((r) => ({ ts: r.timestamp, price: Number(r.price) }));
}

/* ------------------------------------------------------------------ */
/*  ENTSO-E — all of Europe, needs a token                            */
/* ------------------------------------------------------------------ */

/** Bidding-zone EIC codes. Add your own as needed. */
export const ENTSOE_ZONES = {
  EE: '10Y1001A1001A39I', FI: '10YFI-1--------U', LV: '10YLV-1001A00074',
  LT: '10YLT-1001A0008Q', SE1: '10Y1001A1001A44P', SE2: '10Y1001A1001A45N',
  SE3: '10Y1001A1001A46L', SE4: '10Y1001A1001A47J', NO1: '10YNO-1--------2',
  NO2: '10YNO-2--------T', DK1: '10YDK-1--------W', DK2: '10YDK-2--------M',
  DE: '10Y1001A1001A82H', NL: '10YNL----------L', BE: '10YBE----------2',
  FR: '10YFR-RTE------C', ES: '10YES-REE------0', PT: '10YPT-REN------W',
  IT_NORD: '10Y1001A1001A73I', PL: '10YPL-AREA-----S', AT: '10YAT-APG------L',
};

const entsoeStamp = (d) =>
  d.toISOString().slice(0, 16).replace(/[-:T]/g, '');

/**
 * Minimal reader for ENTSO-E's Publication_MarketDocument.
 *
 * Deliberately not a general XML parser — the document shape is fixed and
 * small, and pulling in a dependency for one endpoint isn't worth it. Each
 * TimeSeries carries a start instant, a resolution, and sparse points that
 * carry forward: a missing position means "same price as the last one".
 */
function parseEntsoeXml(xml) {
  const reason = xml.match(/<Reason>[\s\S]*?<text>([\s\S]*?)<\/text>/)?.[1];
  if (reason && !/<Point>/.test(xml)) {
    throw new Error(`ENTSO-E: ${reason.trim()}`);
  }

  const points = [];
  const periods = xml.matchAll(/<Period>([\s\S]*?)<\/Period>/g);

  for (const [, period] of periods) {
    const startIso = period.match(/<start>([\s\S]*?)<\/start>/)?.[1];
    const resolution = period.match(/<resolution>([\s\S]*?)<\/resolution>/)?.[1];
    if (!startIso || !resolution) continue;

    const minutes = { PT15M: 15, PT30M: 30, PT60M: 60, P1D: 1440 }[resolution];
    if (!minutes) continue;

    const startTs = Math.floor(new Date(startIso).getTime() / 1000);
    const raw = [];
    for (const [, block] of period.matchAll(/<Point>([\s\S]*?)<\/Point>/g)) {
      const position = Number(block.match(/<position>(\d+)<\/position>/)?.[1]);
      const amount = Number(
        block.match(/<price\.amount>([-\d.]+)<\/price\.amount>/)?.[1],
      );
      if (Number.isFinite(position) && Number.isFinite(amount)) {
        raw.push({ position, amount });
      }
    }
    if (!raw.length) continue;

    // Expand sparse positions: a gap repeats the previous price.
    raw.sort((a, b) => a.position - b.position);
    const last = raw[raw.length - 1].position;
    let cursor = 0;
    for (let pos = 1; pos <= last; pos++) {
      if (raw[cursor + 1] && raw[cursor + 1].position <= pos) cursor++;
      points.push({
        ts: startTs + (pos - 1) * minutes * 60,
        price: raw[cursor].amount,
      });
    }
  }

  if (!points.length) throw new Error('ENTSO-E returned no price points');
  return points;
}

async function fetchEntsoe({ zone, start, end, token }) {
  if (!token) {
    throw new Error(
      'ENTSO-E needs a token. Set ENTSOE_TOKEN — see README for how to request one (free, ~2 working days).',
    );
  }
  const eic = ENTSOE_ZONES[zone.toUpperCase()];
  if (!eic) {
    throw new Error(
      `Unknown zone "${zone}". Known: ${Object.keys(ENTSOE_ZONES).join(', ')}`,
    );
  }

  // The API caps a single request at one year, so walk it in 90-day chunks.
  const chunks = [];
  const CHUNK_MS = 90 * 24 * 3600 * 1000;
  for (let t = start.getTime(); t < end.getTime(); t += CHUNK_MS) {
    chunks.push([new Date(t), new Date(Math.min(t + CHUNK_MS, end.getTime()))]);
  }

  const all = [];
  for (const [from, to] of chunks) {
    const url =
      'https://web-api.tp.entsoe.eu/api' +
      `?documentType=A44&in_Domain=${eic}&out_Domain=${eic}` +
      `&periodStart=${entsoeStamp(from)}&periodEnd=${entsoeStamp(to)}` +
      `&securityToken=${encodeURIComponent(token)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(`ENTSO-E returned HTTP ${res.status} for ${from.toISOString().slice(0, 10)}`);
    }
    all.push(...parseEntsoeXml(await res.text()));
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return all;
}

/* ------------------------------------------------------------------ */
/*  CSV                                                               */
/* ------------------------------------------------------------------ */

async function fetchCsv({ file }) {
  const text = await readFile(file, 'utf8');
  const points = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^[a-z_ ]*(time|date)/i.test(line)) continue;
    const [tsRaw, priceRaw] = line.split(/[,;\t]/);
    const ts = /^\d+$/.test(tsRaw.trim())
      ? Number(tsRaw.trim())
      : Math.floor(new Date(tsRaw.trim()).getTime() / 1000);
    const price = Number(String(priceRaw ?? '').replace(',', '.'));
    if (Number.isFinite(ts) && Number.isFinite(price)) points.push({ ts, price });
  }
  if (!points.length) throw new Error(`No usable rows in ${file}`);
  return points;
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch day-ahead prices, caching to disk so repeated runs during a sales
 * conversation don't re-hammer the API.
 */
export async function getPrices({ source, zone, start, end, token, file, noCache }) {
  const key = `${source}-${zone ?? path.basename(file ?? 'csv')}-${start
    .toISOString()
    .slice(0, 10)}-${end.toISOString().slice(0, 10)}.json`;
  const cachePath = path.join(CACHE_DIR, key);

  if (!noCache) {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      console.log(`  prices: ${cached.length} slots (cached)`);
      return sanityCheck(cached, 'prices');
    } catch {
      /* cache miss is normal */
    }
  }

  let raw;
  if (source === 'elering') raw = await fetchElering({ zone, start, end });
  else if (source === 'entsoe') raw = await fetchEntsoe({ zone, start, end, token });
  else if (source === 'csv') raw = await fetchCsv({ file });
  else throw new Error(`Unknown price source "${source}"`);

  const points = withDurations(
    raw.filter((p) => p.ts * 1000 >= start.getTime() && p.ts * 1000 < end.getTime()),
  );

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(points));

  console.log(`  prices: ${points.length} slots from ${source}`);
  return sanityCheck(points, 'prices');
}
