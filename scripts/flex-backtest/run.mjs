#!/usr/bin/env node
/**
 * Flexibility backtest — "what would this site have saved last year?"
 *
 *   node run.mjs --site sites/coldstore-example.json --synthetic
 *   node run.mjs --site sites/acme.json --meter data/acme-2025.csv
 *
 * Zero dependencies. Node 18+. See README.md.
 */

import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { getPrices } from './prices.mjs';
import { readMeterCsv, syntheticColdStore, alignToPriceGrid } from './load.mjs';
import { backtest, sensitivity, priceStats, marginalRate } from './model.mjs';
import { printConsole, writeHtml, writeCsv } from './report.mjs';

/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const DEFAULT_CFG = {
  flexibleShare: 0.5,        // fraction of consumption that can move
  storageHours: 2,           // how many hours of that load the buffer holds
  boostFactor: 1.4,          // how hard you can run above baseline
  coastDepth: 0.8,           // how far you can back off (1.0 = full stop)
  roundTripEfficiency: 0.85, // deeper pre-cooling costs efficiency
  maxCyclesPerDay: 2,        // don't thrash the plant
  minSpread: 5,              // EUR/MWh below which it isn't worth acting
  peakCapKw: null,           // set to hold the monthly peak down
};

const DEFAULT_TARIFF = {
  supplierMargin: 8,   // EUR/MWh
  levies: 12,          // EUR/MWh — excise, renewable levy
  networkDay: 45,      // EUR/MWh
  networkNight: 26,    // EUR/MWh (null to disable time-of-use)
  nightWindow: [22, 7],
  weekendIsNight: true,
  demandCharge: 4.5,   // EUR per kW of monthly peak
};

function usage() {
  console.log(`
Flexibility backtest

  --site <file>        site config JSON (see sites/coldstore-example.json)
  --from <YYYY-MM-DD>  start of period      (default: 1 year ago)
  --to   <YYYY-MM-DD>  end of period        (default: today)

  Prices
  --source <name>      elering | entsoe | csv   (default: elering)
  --zone <code>        ee/fi/lv/lt for elering; EE/DE/ES/... for entsoe
  --price-csv <file>   for --source csv: timestamp,price_eur_mwh

  Load — one of:
  --meter <file>       metered consumption CSV
  --meter-unit <u>     kwh | kw               (default: kwh)
  --ts-col <n>         timestamp column index (default: 0)
  --val-col <n>        value column index     (default: 1)
  --synthetic          generate a cold-store profile instead (sizing only)
  --annual-mwh <n>     size of the synthetic site (default: 2400)

  Overrides
  --flexible-share <f> 0-1
  --storage-hours <h>
  --peak-cap-kw <kw>   forbid pre-cooling above this power

  Output
  --out-dir <dir>      default ./out
  --no-sensitivity     skip the sensitivity grid (16x faster)
  --no-cache           re-fetch prices
`);
}

/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return usage();

  // ---- site ----------------------------------------------------------
  let site = { name: 'Unnamed site', zone: 'ee', cfg: {}, tariff: {} };
  if (args.site) {
    const raw = JSON.parse(await readFile(args.site, 'utf8'));
    site = { ...site, ...raw };
  }

  const cfg = { ...DEFAULT_CFG, ...(site.cfg ?? {}) };
  const tariff = { ...DEFAULT_TARIFF, ...(site.tariff ?? {}) };

  if (args['flexible-share']) cfg.flexibleShare = Number(args['flexible-share']);
  if (args['storage-hours']) cfg.storageHours = Number(args['storage-hours']);
  if (args['peak-cap-kw']) cfg.peakCapKw = Number(args['peak-cap-kw']);

  const zone = args.zone ?? site.zone ?? 'ee';
  const source = args.source ?? site.source ?? 'elering';

  const to = args.to ? new Date(`${args.to}T00:00:00Z`) : new Date();
  const from = args.from
    ? new Date(`${args.from}T00:00:00Z`)
    : new Date(to.getTime() - 365 * 86400 * 1000);

  if (!(from < to)) throw new Error('--from must be before --to');

  console.log(`\n  ${site.name}  ·  ${zone.toUpperCase()}  ·  ` +
    `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\n`);

  // ---- prices --------------------------------------------------------
  const prices = await getPrices({
    source,
    zone,
    start: from,
    end: to,
    token: process.env.ENTSOE_TOKEN,
    file: args['price-csv'],
    noCache: Boolean(args['no-cache']),
  });
  if (!prices.length) throw new Error('No price data in that range');

  // ---- load ----------------------------------------------------------
  const synthetic = Boolean(args.synthetic) || !args.meter;
  if (synthetic && !args.synthetic) {
    console.log('  (no --meter given, falling back to a synthetic profile)');
  }

  const meter = synthetic
    ? syntheticColdStore({
        start: new Date(prices[0].ts * 1000),
        end: new Date((prices[prices.length - 1].ts + 3600) * 1000),
        annualMwh: Number(args['annual-mwh'] ?? site.annualMwh ?? 2400),
      })
    : await readMeterCsv({
        file: args.meter,
        unit: args['meter-unit'] ?? 'kwh',
        tsCol: Number(args['ts-col'] ?? 0),
        valCol: Number(args['val-col'] ?? 1),
      });

  const slots = alignToPriceGrid(prices, meter);
  if (slots.length < 96) {
    throw new Error(
      `Only ${slots.length} slots have both a price and consumption. ` +
        'Check that the meter date range overlaps --from/--to.',
    );
  }

  // ---- run -----------------------------------------------------------
  const stats = priceStats(slots);
  const result = backtest(slots, cfg, tariff);
  const sens = args['no-sensitivity'] ? null : sensitivity(slots, cfg, tariff);

  printConsole({ site, result, stats, sens, cfg, tariff, synthetic });

  // ---- output --------------------------------------------------------
  const outDir = args['out-dir'] ?? path.join(import.meta.dirname, 'out');
  await mkdir(outDir, { recursive: true });
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const range = `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;

  await writeHtml(path.join(outDir, `${slug}.html`), {
    site: { ...site, zone: zone.toUpperCase() },
    result, stats, sens, cfg, tariff, synthetic, range,
  });
  await writeCsv(path.join(outDir, `${slug}-slots.csv`), slots, result, tariff, marginalRate);
  console.log('');
}

main().catch((err) => {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exitCode = 1;
});
