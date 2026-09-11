/**
 * Site consumption: either a real meter export, or a synthetic cold-store
 * profile so you can run the analysis before anyone has sent you data.
 *
 * Output shape matches the price grid exactly:
 *   { ts, hours, kwh }
 */

import { readFile } from 'node:fs/promises';

/* ------------------------------------------------------------------ */
/*  Meter CSV                                                         */
/* ------------------------------------------------------------------ */

/**
 * European meter exports are a minefield: semicolon delimiters, decimal
 * commas, "01.02.2026 13:00" dates, and a header that may or may not exist.
 * Sniff rather than assume, and say out loud what was assumed.
 */
function sniffDelimiter(sample) {
  const counts = [';', ',', '\t'].map((d) => [d, (sample.match(new RegExp(`\\${d}`, 'g')) ?? []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function parseTimestamp(raw) {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  if (/^\d{9,}$/.test(s)) {
    const n = Number(s);
    return s.length > 10 ? Math.floor(n / 1000) : n;
  }
  // dd.mm.yyyy hh:mm  /  dd/mm/yyyy hh:mm
  const eu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (eu) {
    const [, d, m, y, hh, mm] = eu;
    return Math.floor(Date.UTC(+y, +m - 1, +d, +hh, +mm) / 1000);
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

const parseNumber = (raw) => {
  const s = String(raw ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s/g, '');
  // "1.234,56" -> European thousands; "1234.56" -> plain
  const normalised = /,\d{1,3}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return Number(normalised);
};

/**
 * @param {object} opts
 * @param {string} opts.file      path to the meter export
 * @param {'kwh'|'kw'} opts.unit  whether the value column is energy or power
 * @param {number} [opts.tsCol]   0-indexed timestamp column
 * @param {number} [opts.valCol]  0-indexed value column
 */
export async function readMeterCsv({ file, unit = 'kwh', tsCol = 0, valCol = 1 }) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error(`${file} is empty`);

  const delimiter = sniffDelimiter(lines.slice(0, 20).join('\n'));
  const rows = [];
  let skipped = 0;

  for (const line of lines) {
    const cells = line.split(delimiter);
    const ts = parseTimestamp(cells[tsCol] ?? '');
    const value = parseNumber(cells[valCol]);
    if (!Number.isFinite(ts) || !Number.isFinite(value)) {
      skipped++;
      continue;
    }
    rows.push({ ts, value });
  }

  if (!rows.length) {
    throw new Error(
      `No usable rows in ${file}. Check --ts-col / --val-col (delimiter sniffed as "${delimiter}").`,
    );
  }
  rows.sort((a, b) => a.ts - b.ts);

  // Derive each row's duration from the gap to the next.
  const series = rows.map((r, i) => {
    const next = rows[i + 1];
    const prev = rows[i - 1];
    const seconds = next ? next.ts - r.ts : prev ? r.ts - prev.ts : 3600;
    const hours = seconds / 3600;
    return { ts: r.ts, hours, kwh: unit === 'kw' ? r.value * hours : r.value };
  });

  const days = (series[series.length - 1].ts - series[0].ts) / 86400;
  console.log(
    `  meter: ${series.length} rows, ${days.toFixed(0)} days, ` +
      `${(series.reduce((s, r) => s + r.kwh, 0) / 1000).toFixed(1)} MWh` +
      (skipped ? ` (${skipped} unparseable rows skipped)` : ''),
  );
  return series;
}

/* ------------------------------------------------------------------ */
/*  Synthetic cold store                                              */
/* ------------------------------------------------------------------ */

/**
 * A plausible refrigerated-warehouse profile, for use BEFORE a prospect has
 * sent real data. Never put a number derived from this in front of a customer
 * as if it were theirs — it is an order-of-magnitude sizing tool for deciding
 * whether the vertical is worth a phone call.
 *
 * Structure: a weather-driven refrigeration load (~70% of consumption, which
 * is the published share for cold stores), a small always-on base, a
 * working-hours bump from door openings and handling, and periodic defrost.
 */
export function syntheticColdStore({ start, end, annualMwh = 2400, seed = 7 }) {
  let state = seed >>> 0;
  const rand = () => {
    // xorshift32 — deterministic so two runs of the same site match.
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };

  const series = [];
  const stepHours = 0.25;
  for (let t = start.getTime(); t < end.getTime(); t += stepHours * 3600 * 1000) {
    const d = new Date(t);
    const dayOfYear = (t - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;

    // Ambient temperature: seasonal swing plus a daily cycle peaking mid-afternoon.
    const seasonal = Math.sin(((dayOfYear - 105) / 365) * 2 * Math.PI); // peaks late July
    const diurnal = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const ambient = 6 + 11 * seasonal + 4 * diurnal;

    // Compressor work rises with the gap between ambient and setpoint.
    const refrigeration = 0.55 + 0.030 * Math.max(0, ambient + 18);

    const base = 0.22;
    const handling = weekday && hour >= 6 && hour < 18 ? 0.30 : 0.0;
    const defrost = hour % 6 < 0.25 ? 0.35 : 0.0;
    const noise = 0.94 + 0.12 * rand();

    series.push({
      ts: Math.floor(t / 1000),
      hours: stepHours,
      shape: (refrigeration + base + handling + defrost) * noise,
    });
  }

  // Scale the shape so the year totals the requested consumption.
  const shapeEnergy = series.reduce((s, r) => s + r.shape * r.hours, 0);
  const years = (end.getTime() - start.getTime()) / (365.25 * 86400 * 1000);
  const targetKwh = annualMwh * 1000 * years;
  const scale = targetKwh / shapeEnergy;

  const out = series.map((r) => ({ ts: r.ts, hours: r.hours, kwh: r.shape * r.hours * scale }));
  console.log(
    `  meter: SYNTHETIC cold store, ${out.length} slots, ` +
      `${(targetKwh / 1000).toFixed(0)} MWh — replace with real data before quoting`,
  );
  return out;
}

/* ------------------------------------------------------------------ */
/*  Alignment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resample consumption onto the price grid by interval overlap.
 *
 * This is the piece that makes mixed resolutions safe: hourly meter data
 * against 15-minute prices, 15-minute meter data against hourly prices, and
 * the mid-year resolution switch in Nord Pool history all fall out of the
 * same overlap arithmetic. Energy inside a meter interval is assumed to be
 * evenly distributed, which is the only assumption available without
 * sub-interval data.
 */
export function alignToPriceGrid(priceSlots, meterSeries) {
  const aligned = priceSlots.map((p) => ({ ts: p.ts, hours: p.hours, price: p.price, kwh: 0 }));
  if (!meterSeries.length) return aligned;

  let cursor = 0;
  let matched = 0;

  for (const slot of aligned) {
    const slotStart = slot.ts;
    const slotEnd = slot.ts + slot.hours * 3600;

    while (cursor < meterSeries.length && meterSeries[cursor].ts + meterSeries[cursor].hours * 3600 <= slotStart) {
      cursor++;
    }

    for (let i = cursor; i < meterSeries.length; i++) {
      const m = meterSeries[i];
      const mStart = m.ts;
      const mEnd = m.ts + m.hours * 3600;
      if (mStart >= slotEnd) break;

      const overlap = Math.min(slotEnd, mEnd) - Math.max(slotStart, mStart);
      if (overlap > 0) {
        slot.kwh += m.kwh * (overlap / (m.hours * 3600));
        matched++;
      }
    }
  }

  const covered = aligned.filter((s) => s.kwh > 0).length;
  if (covered < aligned.length * 0.9) {
    console.warn(
      `  ! only ${((covered / aligned.length) * 100).toFixed(0)}% of price slots have meter data — ` +
        'the two date ranges may not line up',
    );
  }
  void matched;
  return aligned.filter((s) => s.kwh > 0);
}
