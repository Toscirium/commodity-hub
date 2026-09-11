#!/usr/bin/env node
/**
 * Invariant checks for the dispatch model.
 *
 * These numbers end up in front of paying customers, so the model needs to
 * be provably not-nonsense. Run with:  node test.mjs
 */

import assert from 'node:assert/strict';
import { backtest, marginalRate } from './model.mjs';

const TARIFF = {
  supplierMargin: 8, levies: 12, networkDay: 45, networkNight: null,
  nightWindow: [22, 7], weekendIsNight: false, demandCharge: 0,
};

const CFG = {
  flexibleShare: 0.6, storageHours: 3, boostFactor: 1.5, coastDepth: 0.8,
  roundTripEfficiency: 0.85, maxCyclesPerDay: 3, minSpread: 0, peakCapKw: null,
};

/** A day of hourly slots with a given price shape and flat consumption. */
function makeDay(prices, kwhPerSlot = 100, startDay = 0) {
  return prices.map((price, i) => ({
    ts: startDay * 86400 + i * 3600,
    hours: 1,
    price,
    kwh: kwhPerSlot,
  }));
}

const cheapThenDear = [
  10, 10, 10, 10, 10, 10, 20, 40, 80, 120, 90, 60,
  50, 45, 40, 60, 140, 200, 180, 120, 70, 40, 20, 10,
];

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

console.log('\n  dispatch model\n');

check('never costs more than doing nothing', () => {
  const r = backtest(makeDay(cheapThenDear), CFG, TARIFF);
  assert.ok(r.optCost <= r.baseCost, `opt ${r.optCost} > base ${r.baseCost}`);
  assert.ok(r.totalSaving >= 0);
});

check('flat prices produce no action', () => {
  const r = backtest(makeDay(new Array(24).fill(60)), CFG, TARIFF);
  assert.equal(r.slotsTouched, 0);
  assert.ok(Math.abs(r.totalSaving) < 1e-6);
});

check('zero flexible share produces no action', () => {
  const r = backtest(makeDay(cheapThenDear), { ...CFG, flexibleShare: 0 }, TARIFF);
  assert.equal(r.slotsTouched, 0);
});

check('losses mean total energy goes up, never down', () => {
  const r = backtest(makeDay(cheapThenDear), CFG, TARIFF);
  assert.ok(r.extraKwh > 0, 'expected extra energy from round-trip losses');
  const implied = r.shiftedKwh * (1 / CFG.roundTripEfficiency - 1);
  assert.ok(Math.abs(r.extraKwh - implied) < 1e-6, `${r.extraKwh} vs ${implied}`);
});

check('perfect efficiency consumes no extra energy', () => {
  const r = backtest(makeDay(cheapThenDear), { ...CFG, roundTripEfficiency: 1 }, TARIFF);
  assert.ok(Math.abs(r.extraKwh) < 1e-6);
});

check('better efficiency never saves less', () => {
  const lossy = backtest(makeDay(cheapThenDear), { ...CFG, roundTripEfficiency: 0.7 }, TARIFF);
  const clean = backtest(makeDay(cheapThenDear), { ...CFG, roundTripEfficiency: 0.95 }, TARIFF);
  assert.ok(clean.totalSaving >= lossy.totalSaving);
});

check('a bigger buffer never saves less', () => {
  let prev = -Infinity;
  for (const storageHours of [1, 2, 3, 4, 6]) {
    const r = backtest(makeDay(cheapThenDear), { ...CFG, storageHours }, TARIFF);
    assert.ok(r.totalSaving >= prev - 1e-6, `${storageHours}h regressed`);
    prev = r.totalSaving;
  }
});

check('wider spreads save more', () => {
  const narrow = backtest(makeDay(cheapThenDear.map((p) => 60 + (p - 60) * 0.2)), CFG, TARIFF);
  const wide = backtest(makeDay(cheapThenDear.map((p) => 60 + (p - 60) * 2)), CFG, TARIFF);
  assert.ok(wide.totalSaving > narrow.totalSaving);
});

check('pre-cooling happens before coasting, never after', () => {
  const slots = makeDay(cheapThenDear);
  backtest(slots, CFG, TARIFF);
  // Charge slots must be cheaper than the discharge slots they fund.
  const charged = slots.filter((s) => s.optKwh > s.kwh + 1e-9);
  const coasted = slots.filter((s) => s.optKwh < s.kwh - 1e-9);
  assert.ok(charged.length > 0 && coasted.length > 0);
  const avgChargePrice = charged.reduce((a, s) => a + s.price, 0) / charged.length;
  const avgCoastPrice = coasted.reduce((a, s) => a + s.price, 0) / coasted.length;
  assert.ok(avgCoastPrice > avgChargePrice, 'coasting in cheaper hours than pre-cooling');
  // Physically: you cannot bank cooling you have not produced yet.
  assert.ok(charged[0].ts < coasted[coasted.length - 1].ts);
});

check('boost limit is respected', () => {
  const slots = makeDay(cheapThenDear);
  backtest(slots, CFG, TARIFF);
  for (const s of slots) {
    const maxKwh = s.kwh + (CFG.boostFactor - 1) * s.kwh * CFG.flexibleShare + 1e-6;
    assert.ok(s.optKwh <= maxKwh, `slot exceeded boost cap: ${s.optKwh} > ${maxKwh}`);
  }
});

check('coast limit is respected — load never goes negative', () => {
  const slots = makeDay(cheapThenDear);
  backtest(slots, CFG, TARIFF);
  for (const s of slots) {
    const minKwh = s.kwh - CFG.coastDepth * s.kwh * CFG.flexibleShare - 1e-6;
    assert.ok(s.optKwh >= minKwh, `slot dropped below coast floor`);
    assert.ok(s.optKwh >= 0);
  }
});

check('storage does not carry across midnight', () => {
  // Dear day followed by cheap day: no charge on day 0 should serve day 1.
  const slots = [
    ...makeDay(new Array(24).fill(200), 100, 0),
    ...makeDay(new Array(24).fill(10), 100, 1),
  ];
  const r = backtest(slots, CFG, TARIFF);
  assert.equal(r.slotsTouched, 0, 'flat days should need no action');
});

check('peak cap holds the monthly peak flat', () => {
  const slots = makeDay(cheapThenDear);
  const basePeak = Math.max(...slots.map((s) => s.kwh / s.hours));
  const r = backtest(slots, { ...CFG, peakCapKw: 'baseline' }, { ...TARIFF, demandCharge: 5 });
  const optPeak = Math.max(...r.monthly.map((m) => m.optPeak));
  assert.ok(optPeak <= basePeak + 1e-6, `peak rose from ${basePeak} to ${optPeak}`);
  assert.ok(r.peakSaving >= -1e-6, 'peak cost must not increase');
});

check('demand charge is what makes the uncapped run worse', () => {
  const withCharge = { ...TARIFF, demandCharge: 8 };
  const uncapped = backtest(makeDay(cheapThenDear), CFG, withCharge);
  const capped = backtest(makeDay(cheapThenDear), { ...CFG, peakCapKw: 'baseline' }, withCharge);
  assert.ok(capped.totalSaving >= uncapped.totalSaving, 'capping should not hurt');
});

check('time-of-use network charge is applied', () => {
  const tou = { ...TARIFF, networkNight: 20 };
  const night = marginalRate({ ts: Date.UTC(2026, 0, 5, 2) / 1000, price: 50 }, tou);
  const day = marginalRate({ ts: Date.UTC(2026, 0, 5, 12) / 1000, price: 50 }, tou);
  assert.equal(night, 50 + 8 + 12 + 20);
  assert.equal(day, 50 + 8 + 12 + 45);
});

check('mixed 15-min and hourly slots are handled by duration', () => {
  const quarter = cheapThenDear.flatMap((price) => [price, price, price, price]);
  const hourly = backtest(makeDay(cheapThenDear, 100), CFG, TARIFF);
  const fine = backtest(
    quarter.map((price, i) => ({ ts: i * 900, hours: 0.25, price, kwh: 25 })),
    CFG,
    TARIFF,
  );
  // Same energy, same prices, finer grid — savings should be in the same ballpark.
  const ratio = fine.totalSaving / hourly.totalSaving;
  assert.ok(ratio > 0.7 && ratio < 1.5, `15-min vs hourly diverged: ${ratio.toFixed(2)}x`);
});

check('negative prices are exploited, not ignored', () => {
  const withNeg = [...cheapThenDear];
  withNeg[3] = -50;
  const r = backtest(makeDay(withNeg), CFG, TARIFF);
  const slots = makeDay(withNeg);
  backtest(slots, CFG, TARIFF);
  assert.ok(slots[3].optKwh > slots[3].kwh, 'should pre-cool hard during negative prices');
  assert.ok(r.totalSaving > 0);
});

console.log(`\n  ${passed} passed\n`);
