/**
 * The counterfactual: what would this site have paid last year if its
 * flexible load had been scheduled against day-ahead prices?
 *
 * The model treats thermal mass as a battery, because that is what it is.
 * Pre-cooling a cold store below setpoint stores cooling; letting it drift
 * back up releases it. The same abstraction covers water reservoirs, hot
 * water, building thermal mass, and an actual battery — only the parameters
 * change.
 *
 * Everything here is deliberately biased conservative. A pilot that
 * under-promises and over-delivers renews; one that over-promises does not.
 */

/* ------------------------------------------------------------------ */
/*  Tariff                                                            */
/* ------------------------------------------------------------------ */

/**
 * The saving is NOT the spot spread. It is the spread on every per-kWh
 * component that moves with time, minus the extra kWh that losses add at the
 * full retail rate, plus or minus whatever happens to the monthly peak.
 *
 * Components (all EUR/MWh, all excluding VAT — a business reclaims it):
 *   spot            : the market price, varies per slot
 *   supplierMargin  : fixed adder, does not vary — but losses pay it
 *   levies          : taxes, renewable/excise, does not vary — losses pay it
 *   network         : grid charge, may be time-of-use
 *   demandCharge    : EUR per kW of monthly peak — often the bigger prize
 */
export function marginalRate(slot, tariff) {
  const hour = new Date(slot.ts * 1000).getUTCHours();
  const network =
    tariff.networkNight != null && isNightWindow(hour, slot.ts, tariff)
      ? tariff.networkNight
      : tariff.networkDay;
  return slot.price + tariff.supplierMargin + tariff.levies + network;
}

function isNightWindow(hour, ts, tariff) {
  const [from, to] = tariff.nightWindow ?? [22, 7];
  const weekend = [0, 6].includes(new Date(ts * 1000).getUTCDay());
  if (tariff.weekendIsNight && weekend) return true;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

/* ------------------------------------------------------------------ */
/*  Dispatch                                                          */
/* ------------------------------------------------------------------ */

const EPS = 1e-6;

/**
 * Greedy pre-cool / coast scheduling, one day at a time.
 *
 * Repeatedly takes the single most valuable (cheap slot -> expensive slot)
 * pair still available and moves as much energy as the constraints allow.
 * Greedy rather than a full LP on purpose: it is within a few percent of
 * optimal for this shape of problem, it runs instantly, and — the part that
 * actually matters in a sales meeting — you can explain it in one sentence.
 * "We run the compressors harder in the cheapest quarter-hours and let the
 * room coast in the dearest ones, never leaving your temperature band."
 *
 * Storage is reset at each day boundary. Thermal buffers do not hold
 * overnight, and it stops one freak day from flattering the whole year.
 */
function dispatchDay(slots, cfg, tariff) {
  const n = slots.length;
  const flex = slots.map((s) => s.kwh * cfg.flexibleShare);
  const marginal = slots.map((s) => marginalRate(s, tariff));

  const chargedElec = new Array(n).fill(0);
  const dischargedDeliv = new Array(n).fill(0);
  const soc = new Array(n).fill(0); // deliverable kWh stored at END of slot

  const medianFlexPower = median(slots.map((s, i) => flex[i] / s.hours).filter((v) => v > 0));
  const capacity = cfg.storageHours * medianFlexPower;
  const throughputCap = cfg.maxCyclesPerDay * capacity;
  if (!(capacity > 0)) return { chargedElec, dischargedDeliv, capacity: 0 };

  const eta = cfg.roundTripEfficiency;
  let throughput = 0;

  for (let guard = 0; guard < 400; guard++) {
    let best = null;

    for (let i = 0; i < n - 1; i++) {
      if (dischargedDeliv[i] > EPS) continue; // a slot either boosts or coasts
      const boostRoom = (cfg.boostFactor - 1) * flex[i] - chargedElec[i];
      if (boostRoom <= EPS) continue;

      let peakRoom = Infinity;
      if (cfg.peakCapKw != null) {
        const current = (slots[i].kwh + chargedElec[i] - dischargedDeliv[i]) / slots[i].hours;
        peakRoom = Math.max(0, (cfg.peakCapKw - current) * slots[i].hours);
      }
      const chargeRoomElec = Math.min(boostRoom, peakRoom);
      if (chargeRoomElec <= EPS) continue;

      let runningMaxSoc = soc[i];
      for (let j = i + 1; j < n; j++) {
        const socRoom = capacity - runningMaxSoc;
        if (socRoom > EPS && chargedElec[j] <= EPS) {
          const coastRoom = cfg.coastDepth * flex[j] - dischargedDeliv[j];
          if (coastRoom > EPS) {
            // Spend 1/eta kWh at i to avoid 1 kWh at j.
            const gain = marginal[j] - marginal[i] / eta;
            if (gain > cfg.minSpread) {
              const qty = Math.min(
                coastRoom,
                chargeRoomElec * eta,
                socRoom,
                throughputCap - throughput,
              );
              if (qty > EPS) {
                const value = gain * qty;
                if (!best || value > best.value) best = { i, j, qty, value };
              }
            }
          }
        }
        runningMaxSoc = Math.max(runningMaxSoc, soc[j]);
      }
    }

    if (!best) break;
    chargedElec[best.i] += best.qty / eta;
    dischargedDeliv[best.j] += best.qty;
    for (let k = best.i; k < best.j; k++) soc[k] += best.qty;
    throughput += best.qty;
    if (throughput >= throughputCap - EPS) break;
  }

  return { chargedElec, dischargedDeliv, capacity };
}

/* ------------------------------------------------------------------ */
/*  Backtest                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {Array} slots aligned {ts, hours, price, kwh}
 * @param {object} cfg  flexibility parameters
 * @param {object} tariff
 */
export function backtest(slots, cfg, tariff) {
  const byDay = new Map();
  for (const slot of slots) {
    const day = Math.floor(slot.ts / 86400);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(slot);
  }

  /*
   * Pre-cooling naively will happily set a new monthly peak, and the demand
   * charge then claws back a large slice of the energy saving — on a real
   * cold-store profile it ate roughly a third of it. `peakCapKw: "baseline"`
   * pins each month's cap to the peak that month already had, so the strategy
   * can never make the demand charge worse. That is also the right promise to
   * make commercially: "we will not raise your peak."
   */
  const monthPeak = new Map();
  for (const slot of slots) {
    const key = monthKey(slot.ts);
    monthPeak.set(key, Math.max(monthPeak.get(key) ?? 0, slot.kwh / slot.hours));
  }

  const delta = new Map(); // ts -> electrical kWh change
  let capacityKwh = 0;

  for (const daySlots of byDay.values()) {
    daySlots.sort((a, b) => a.ts - b.ts);
    const dayCfg =
      cfg.peakCapKw === 'baseline'
        ? { ...cfg, peakCapKw: monthPeak.get(monthKey(daySlots[0].ts)) }
        : cfg;
    const { chargedElec, dischargedDeliv, capacity } = dispatchDay(daySlots, dayCfg, tariff);
    capacityKwh = Math.max(capacityKwh, capacity);
    daySlots.forEach((s, i) => {
      const d = chargedElec[i] - dischargedDeliv[i];
      if (Math.abs(d) > EPS) delta.set(s.ts, d);
    });
  }

  // ---- cost both ways -------------------------------------------------
  const months = new Map();
  let baseEnergy = 0, optEnergy = 0, baseKwh = 0, optKwh = 0, shifted = 0;

  for (const slot of slots) {
    const rate = marginalRate(slot, tariff);
    const d = delta.get(slot.ts) ?? 0;
    const optKwhSlot = slot.kwh + d;
    slot.optKwh = optKwhSlot; // consumed by the per-slot CSV export

    baseEnergy += (slot.kwh * rate) / 1000;
    optEnergy += (optKwhSlot * rate) / 1000;
    baseKwh += slot.kwh;
    optKwh += optKwhSlot;
    if (d < 0) shifted += -d;

    const key = new Date(slot.ts * 1000).toISOString().slice(0, 7);
    let m = months.get(key);
    if (!m) {
      m = { key, baseEnergy: 0, optEnergy: 0, basePeak: 0, optPeak: 0, kwh: 0 };
      months.set(key, m);
    }
    m.baseEnergy += (slot.kwh * rate) / 1000;
    m.optEnergy += (optKwhSlot * rate) / 1000;
    m.kwh += slot.kwh;
    m.basePeak = Math.max(m.basePeak, slot.kwh / slot.hours);
    m.optPeak = Math.max(m.optPeak, optKwhSlot / slot.hours);
  }

  const monthly = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  let basePeakCost = 0, optPeakCost = 0;
  for (const m of monthly) {
    m.basePeakCost = m.basePeak * tariff.demandCharge;
    m.optPeakCost = m.optPeak * tariff.demandCharge;
    m.saving = m.baseEnergy - m.optEnergy + (m.basePeakCost - m.optPeakCost);
    basePeakCost += m.basePeakCost;
    optPeakCost += m.optPeakCost;
  }

  const energySaving = baseEnergy - optEnergy;
  const peakSaving = basePeakCost - optPeakCost;

  return {
    monthly,
    capacityKwh,
    baseCost: baseEnergy + basePeakCost,
    optCost: optEnergy + optPeakCost,
    energySaving,
    peakSaving,
    totalSaving: energySaving + peakSaving,
    baseKwh,
    extraKwh: optKwh - baseKwh,
    shiftedKwh: shifted,
    slotsTouched: delta.size,
    slotsTotal: slots.length,
    days: byDay.size,
  };
}

/* ------------------------------------------------------------------ */
/*  Sensitivity                                                       */
/* ------------------------------------------------------------------ */

/**
 * The single most useful output in a sales conversation. Nobody knows their
 * true flexible share on day one, so quote the grid, not a point estimate,
 * and let the customer pick the row they believe.
 */
export function sensitivity(slots, cfg, tariff, {
  shares = [0.2, 0.35, 0.5, 0.7],
  storageHours = [1, 2, 3, 4],
} = {}) {
  const grid = [];
  for (const share of shares) {
    const row = { share, cells: [] };
    for (const hours of storageHours) {
      const r = backtest(slots, { ...cfg, flexibleShare: share, storageHours: hours }, tariff);
      row.cells.push({ hours, saving: r.totalSaving, pct: (r.totalSaving / r.baseCost) * 100 });
    }
    grid.push(row);
  }
  return { grid, storageHours };
}

/* ------------------------------------------------------------------ */

const monthKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function priceStats(slots) {
  const prices = slots.map((s) => s.price).sort((a, b) => a - b);
  const q = (p) => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))];
  return {
    min: prices[0],
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
    max: prices[prices.length - 1],
    negative: prices.filter((p) => p < 0).length,
    count: prices.length,
  };
}
