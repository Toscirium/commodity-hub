/**
 * Output: a console summary for you, a CSV for the customer's analyst to
 * pull apart, and a one-page HTML report you can actually send.
 *
 * The HTML is the deliverable in the first paid pilots. Keep it honest —
 * every assumption is printed on the page, because the fastest way to lose a
 * technical buyer is a savings number with no visible method.
 */

import { writeFile } from 'node:fs/promises';

const eur = (v) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const eur2 = (v) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v);
const num = (v, d = 0) => new Intl.NumberFormat('en-IE', { maximumFractionDigits: d }).format(v);

/* ------------------------------------------------------------------ */

export function printConsole({ site, result, stats, sens, cfg, tariff, synthetic }) {
  const years = result.days / 365.25;
  const perYear = result.totalSaving / years;

  const line = (c = '─') => console.log(c.repeat(64));

  console.log('');
  line('━');
  console.log(`  ${site.name}`);
  line('━');

  console.log('\n  DAY-AHEAD PRICES');
  console.log(`    slots            ${num(stats.count)} over ${num(result.days)} days`);
  console.log(`    min / p10        ${eur2(stats.min)} / ${eur2(stats.p10)} per MWh`);
  console.log(`    median           ${eur2(stats.median)} per MWh`);
  console.log(`    p90 / max        ${eur2(stats.p90)} / ${eur2(stats.max)} per MWh`);
  console.log(`    negative slots   ${num(stats.negative)}`);
  console.log(`    p90-to-p10 ratio ${(stats.p90 / Math.max(stats.p10, 0.01)).toFixed(1)}x  <- the opportunity`);

  console.log('\n  SITE');
  console.log(`    consumption      ${num(result.baseKwh / 1000)} MWh (${num(result.baseKwh / 1000 / years)} MWh/yr)`);
  console.log(`    flexible share   ${(cfg.flexibleShare * 100).toFixed(0)}%`);
  console.log(`    thermal buffer   ${cfg.storageHours}h  (~${num(result.capacityKwh)} kWh usable)`);
  console.log(`    boost / coast    ${cfg.boostFactor.toFixed(2)}x / ${(cfg.coastDepth * 100).toFixed(0)}%`);
  console.log(`    round-trip       ${(cfg.roundTripEfficiency * 100).toFixed(0)}%`);

  console.log('\n  RESULT');
  console.log(`    baseline cost    ${eur(result.baseCost / years)} /yr`);
  console.log(`    optimised cost   ${eur(result.optCost / years)} /yr`);
  console.log(`    ── energy        ${eur(result.energySaving / years)} /yr`);
  console.log(`    ── peak demand   ${eur(result.peakSaving / years)} /yr`);
  line();
  console.log(`    SAVING           ${eur(perYear)} /yr   (${((result.totalSaving / result.baseCost) * 100).toFixed(1)}% of bill)`);
  line();

  console.log('\n  COST OF THE STRATEGY');
  console.log(`    energy shifted   ${num(result.shiftedKwh / 1000)} MWh`);
  console.log(`    extra energy     ${num(result.extraKwh / 1000)} MWh (+${((result.extraKwh / result.baseKwh) * 100).toFixed(2)}%) from losses`);
  console.log(`    slots altered    ${num(result.slotsTouched)} of ${num(result.slotsTotal)} (${((result.slotsTouched / result.slotsTotal) * 100).toFixed(0)}%)`);

  const peakDelta = result.monthly.reduce((s, m) => s + (m.optPeak - m.basePeak), 0) / result.monthly.length;
  console.log(`    avg peak change  ${peakDelta >= 0 ? '+' : ''}${num(peakDelta, 1)} kW ${peakDelta > 0.5 ? '<- watch this' : ''}`);

  if (sens) {
    console.log('\n  SENSITIVITY — EUR/yr saving');
    console.log('    flexible |' + sens.storageHours.map((h) => `${h}h buffer`.padStart(12)).join(''));
    for (const row of sens.grid) {
      const cells = row.cells.map((c) => eur(c.saving / years).padStart(12)).join('');
      console.log(`      ${(row.share * 100).toFixed(0).padStart(5)}% |${cells}`);
    }
  }

  console.log('\n  VERDICT');
  const verdict =
    perYear >= 15000
      ? 'PASS — worth a paid pilot. Book the meeting.'
      : perYear >= 6000
        ? 'MARGINAL — real, but thin for a B2B contract. Look for a bigger site.'
        : 'FAIL — this vertical/site does not clear the bar. Try the next one.';
  console.log(`    ${verdict}`);
  console.log(`    Test: is annual saving >= EUR 15,000? -> ${eur(perYear)}`);

  if (synthetic) {
    console.log('\n  ⚠  SYNTHETIC LOAD PROFILE — sizing only.');
    console.log('     Do not put this number in front of a customer as theirs.');
  }
  console.log('');
}

/* ------------------------------------------------------------------ */

export async function writeCsv(file, slots, result, tariff, marginalRate) {
  const delta = new Map(result.monthly ? [] : []);
  void delta;
  const rows = ['timestamp_utc,hours,price_eur_mwh,marginal_eur_mwh,baseline_kwh,optimised_kwh,delta_kwh,baseline_cost_eur,optimised_cost_eur'];
  for (const s of slots) {
    const rate = marginalRate(s, tariff);
    const opt = s.optKwh ?? s.kwh;
    rows.push(
      [
        new Date(s.ts * 1000).toISOString(),
        s.hours,
        s.price.toFixed(2),
        rate.toFixed(2),
        s.kwh.toFixed(3),
        opt.toFixed(3),
        (opt - s.kwh).toFixed(3),
        ((s.kwh * rate) / 1000).toFixed(4),
        ((opt * rate) / 1000).toFixed(4),
      ].join(','),
    );
  }
  await writeFile(file, rows.join('\n'));
  console.log(`  wrote ${file}`);
}

/* ------------------------------------------------------------------ */

export async function writeHtml(file, { site, result, stats, sens, cfg, tariff, synthetic, range }) {
  const years = result.days / 365.25;
  const perYear = result.totalSaving / years;
  const pct = (result.totalSaving / result.baseCost) * 100;

  const maxSaving = Math.max(...result.monthly.map((m) => Math.abs(m.saving)), 1);
  const monthlyRows = result.monthly
    .map((m) => {
      const w = (Math.abs(m.saving) / maxSaving) * 100;
      return `<tr>
        <td>${m.key}</td>
        <td class="n">${num(m.kwh / 1000, 1)}</td>
        <td class="n">${eur(m.baseEnergy + m.basePeakCost)}</td>
        <td class="n">${eur(m.optEnergy + m.optPeakCost)}</td>
        <td class="n pos">${eur(m.saving)}</td>
        <td class="bar"><span style="width:${w}%"></span></td>
      </tr>`;
    })
    .join('');

  const sensTable = sens
    ? `<table class="grid">
        <thead><tr><th>Flexible share</th>${sens.storageHours
          .map((h) => `<th class="n">${h}h buffer</th>`)
          .join('')}</tr></thead>
        <tbody>${sens.grid
          .map(
            (row) =>
              `<tr><th>${(row.share * 100).toFixed(0)}%</th>${row.cells
                .map(
                  (c) =>
                    `<td class="n${Math.abs(c.saving / years - perYear) < 1 ? ' hi' : ''}">${eur(
                      c.saving / years,
                    )}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')}</tbody>
      </table>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(site.name)} — flexibility assessment</title>
<style>
  :root{--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--pos:#047857;--bg:#fff;--accent:#0f766e}
  *{box-sizing:border-box}
  body{margin:0;background:#f3f4f6;color:var(--ink);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .page{max-width:860px;margin:32px auto;background:var(--bg);padding:48px;
    box-shadow:0 1px 3px rgba(0,0,0,.08);border-radius:6px}
  h1{font-size:24px;margin:0 0 4px}
  .sub{color:var(--muted);margin:0 0 32px;font-size:14px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
    margin:36px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
  .headline{background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;padding:24px 28px;margin:24px 0}
  .headline .big{font-size:40px;font-weight:650;color:var(--accent);letter-spacing:-.02em}
  .headline .cap{font-size:13px;color:var(--muted);margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;font-weight:600;color:var(--muted);font-size:12px;
    text-transform:uppercase;letter-spacing:.05em;padding:6px 10px 6px 0}
  td{padding:6px 10px 6px 0;border-top:1px solid var(--line)}
  .n{text-align:right;font-variant-numeric:tabular-nums}
  .pos{color:var(--pos);font-weight:600}
  .bar{width:110px}
  .bar span{display:block;height:7px;background:var(--accent);opacity:.65;border-radius:2px}
  .grid th:first-child{text-align:left}
  .grid td.hi{background:#f0fdfa;font-weight:650;color:var(--accent)}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:32px}
  dl{margin:0;font-size:14px}
  dl div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)}
  dt{color:var(--muted)} dd{margin:0;font-variant-numeric:tabular-nums}
  .warn{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:14px 18px;
    margin:24px 0;font-size:14px}
  footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);
    font-size:12px;color:var(--muted)}
  @media(max-width:700px){.page{padding:24px;margin:0}.cols{grid-template-columns:1fr}}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}}
</style></head><body><div class="page">

<h1>${esc(site.name)}</h1>
<p class="sub">Load-flexibility assessment &middot; ${range} &middot; ${esc(site.zone)} day-ahead prices</p>

${synthetic ? `<div class="warn"><strong>Modelled load profile.</strong> This run used a synthetic
  consumption shape, not metered data from this site. Treat every figure as an order-of-magnitude
  estimate pending a real half-hourly export.</div>` : ''}

<div class="headline">
  <div class="big">${eur(perYear)}<span style="font-size:20px;font-weight:400"> / year</span></div>
  <div class="cap">Estimated saving from shifting flexible load into cheaper hours &mdash;
    ${pct.toFixed(1)}% of the electricity bill, with no capital expenditure
    and no change to the temperature band.</div>
</div>

<div class="cols">
  <div>
    <h2>Where the saving comes from</h2>
    <dl>
      <div><dt>Energy arbitrage</dt><dd>${eur(result.energySaving / years)}</dd></div>
      <div><dt>Peak demand charge</dt><dd>${eur(result.peakSaving / years)}</dd></div>
      <div><dt>Baseline cost</dt><dd>${eur(result.baseCost / years)}</dd></div>
      <div><dt>Optimised cost</dt><dd>${eur(result.optCost / years)}</dd></div>
    </dl>
  </div>
  <div>
    <h2>What it costs</h2>
    <dl>
      <div><dt>Energy shifted</dt><dd>${num(result.shiftedKwh / 1000, 1)} MWh</dd></div>
      <div><dt>Extra energy used</dt><dd>+${((result.extraKwh / result.baseKwh) * 100).toFixed(2)}%</dd></div>
      <div><dt>Slots altered</dt><dd>${((result.slotsTouched / result.slotsTotal) * 100).toFixed(0)}%</dd></div>
      <div><dt>Capital required</dt><dd>&euro;0</dd></div>
    </dl>
  </div>
</div>

<h2>Why the opportunity exists</h2>
<p style="font-size:14px;margin:0 0 12px">Over this period the ${esc(site.zone)} day-ahead price ranged from
${eur2(stats.min)} to ${eur2(stats.max)} per MWh. The cheapest tenth of intervals averaged below
<strong>${eur2(stats.p10)}</strong> while the dearest tenth exceeded <strong>${eur2(stats.p90)}</strong>
&mdash; a ${(stats.p90 / Math.max(stats.p10, 0.01)).toFixed(1)}&times; spread${
    stats.negative ? `, including ${num(stats.negative)} intervals priced below zero` : ''
  }. Consumption that can move a few hours is paid for at the low end instead of the average.</p>

<h2>Month by month</h2>
<table>
  <thead><tr><th>Month</th><th class="n">MWh</th><th class="n">Baseline</th>
    <th class="n">Optimised</th><th class="n">Saving</th><th></th></tr></thead>
  <tbody>${monthlyRows}</tbody>
</table>

${sens ? `<h2>Sensitivity</h2>
<p style="font-size:14px;margin:0 0 12px">Nobody knows their true flexible share before measuring it.
The figure above assumes ${(cfg.flexibleShare * 100).toFixed(0)}% of load is shiftable with a
${cfg.storageHours}-hour buffer (highlighted). Here is the whole range:</p>${sensTable}` : ''}

<h2>Assumptions</h2>
<dl>
  <div><dt>Flexible share of load</dt><dd>${(cfg.flexibleShare * 100).toFixed(0)}%</dd></div>
  <div><dt>Thermal buffer</dt><dd>${cfg.storageHours} h (~${num(result.capacityKwh)} kWh)</dd></div>
  <div><dt>Boost above baseline</dt><dd>${cfg.boostFactor.toFixed(2)}&times;</dd></div>
  <div><dt>Maximum coast depth</dt><dd>${(cfg.coastDepth * 100).toFixed(0)}% of flexible load</dd></div>
  <div><dt>Round-trip efficiency</dt><dd>${(cfg.roundTripEfficiency * 100).toFixed(0)}%</dd></div>
  <div><dt>Cycles per day (max)</dt><dd>${cfg.maxCyclesPerDay}</dd></div>
  <div><dt>Minimum spread acted on</dt><dd>${eur2(cfg.minSpread)} / MWh</dd></div>
  <div><dt>Supplier margin</dt><dd>${eur2(tariff.supplierMargin)} / MWh</dd></div>
  <div><dt>Network charge</dt><dd>${eur2(tariff.networkDay)} day${
    tariff.networkNight != null ? ` / ${eur2(tariff.networkNight)} night` : ''
  } per MWh</dd></div>
  <div><dt>Levies and taxes</dt><dd>${eur2(tariff.levies)} / MWh</dd></div>
  <div><dt>Demand charge</dt><dd>${eur2(tariff.demandCharge)} / kW / month</dd></div>
</dl>

<footer>
  Method: flexible load is modelled as a thermal store and scheduled against realised day-ahead
  prices, one day at a time, never carrying charge overnight. Savings are computed on the full
  per-kWh rate, and the extra energy consumed by round-trip losses is charged at that same rate.
  Prices are historical actuals, not forecasts &mdash; this is what the strategy <em>would have</em>
  earned, and it excludes forecast error, so treat it as an upper bound on a live deployment.
  VAT excluded throughout. Generated ${new Date().toISOString().slice(0, 10)}.
</footer>

</div></body></html>`;

  await writeFile(file, html);
  console.log(`  wrote ${file}`);
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
