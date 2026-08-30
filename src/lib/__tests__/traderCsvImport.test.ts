import { describe, it, expect } from 'vitest';
import {
  parseNum, parseDate, autoMapFields, buildRows, templateCsv,
  type ParsedSheet,
} from '../traderCsvImport';

const COMMODITIES = ['Corn Futures', 'Wheat Futures', 'Soybean Meal', 'WTI Crude Oil'];

const sheet = (rows: Record<string, unknown>[]): ParsedSheet => ({
  name: 'Sheet1',
  headers: rows.length ? Object.keys(rows[0]) : [],
  rows,
});

describe('parseNum', () => {
  it('handles plain numbers and numeric strings', () => {
    expect(parseNum(195.5)).toBe(195.5);
    expect(parseNum('195.50')).toBe(195.5);
  });

  it('strips thousands separators and currency symbols', () => {
    expect(parseNum('1,234.50')).toBe(1234.5);
    expect(parseNum('€1,234.50')).toBe(1234.5);
  });

  it('reads European decimal commas', () => {
    expect(parseNum('195,50')).toBe(195.5);
  });

  it('treats parenthesised values as negative (accounting style)', () => {
    expect(parseNum('(12.5)')).toBe(-12.5);
  });

  it('returns null for junk rather than NaN', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum('n/a')).toBeNull();
    expect(parseNum(null)).toBeNull();
  });
});

describe('parseDate', () => {
  it('passes ISO through', () => {
    expect(parseDate('2026-08-30')).toBe('2026-08-30');
  });

  it('reads Date objects (XLSX cellDates)', () => {
    expect(parseDate(new Date(Date.UTC(2026, 7, 30)))).toBe('2026-08-30');
  });

  it('prefers DD/MM when ambiguous — the European convention', () => {
    expect(parseDate('03/04/2026')).toBe('2026-04-03');
  });

  it('uses MM/DD when the second part cannot be a month', () => {
    expect(parseDate('04/23/2026')).toBe('2026-04-23');
  });

  it('handles unambiguous DD/MM', () => {
    expect(parseDate('30/08/2026')).toBe('2026-08-30');
  });

  it('rejects impossible dates rather than inventing one', () => {
    expect(parseDate('45/99/2026')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('autoMapFields', () => {
  it('maps obvious headers for basis', () => {
    const m = autoMapFields('basis', ['Commodity', 'Location', 'Cash Price', 'Futures Price', 'Date']);
    expect(m.commodity_name).toBe('Commodity');
    expect(m.location).toBe('Location');
    expect(m.cash_price).toBe('Cash Price');
    expect(m.futures_price).toBe('Futures Price');
  });

  it('matches real-world header variants', () => {
    const m = autoMapFields('hedge', ['Product', 'Delivery Point', 'Qty', 'Lots', 'Board Price']);
    expect(m.commodity_name).toBe('Product');
    expect(m.location).toBe('Delivery Point');
    expect(m.physical_quantity).toBe('Qty');
    expect(m.futures_lots).toBe('Lots');
    expect(m.futures_price).toBe('Board Price');
  });

  it('leaves unmatched fields null rather than guessing wildly', () => {
    const m = autoMapFields('basis', ['Foo', 'Bar']);
    expect(m.commodity_name).toBeNull();
  });
});

describe('buildRows — basis', () => {
  const mapping = {
    commodity_name: 'Commodity', location: 'Location', cash_price: 'Cash',
    futures_price: 'Futures', price_unit: 'Unit', entry_date: 'Date',
    contract_month: null, notes: null,
  };

  it('accepts a clean row and computes basis', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'Corn Futures', Location: 'Rotterdam', Cash: '195.00', Futures: '199.47', Unit: 'EUR/t', Date: '2026-08-30' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.basis).toBeCloseTo(-4.47, 2);
    expect(rows[0].values.price_unit).toBe('EUR/t');
  });

  it('warns that EUR/t rows use today’s FX rate', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Cash: '195', Futures: '199', Unit: 'EUR/t', Date: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].warnings.join(' ')).toMatch(/FX rate/i);
  });

  it('rejects an unknown commodity — conversions depend on matching the catalogue', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'Rapeseed', Location: 'R', Cash: '195', Futures: '199', Unit: '', Date: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors.join(' ')).toMatch(/Unknown commodity/);
  });

  it('rejects a unit the commodity cannot express (crude has no tonne basis)', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'WTI Crude Oil', Location: 'R', Cash: '80', Futures: '83', Unit: 'EUR/t', Date: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors.join(' ')).toMatch(/cannot be expressed/);
  });

  it('rejects a non-positive cash price', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Cash: '0', Futures: '199', Unit: '', Date: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors.join(' ')).toMatch(/positive/);
  });

  it('defaults a missing date to today rather than failing', () => {
    const rows = buildRows('basis', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Cash: '195', Futures: '199', Unit: '', Date: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildRows — hedge', () => {
  const mapping = {
    commodity_name: 'Commodity', location: 'Location', physical_side: 'Side',
    physical_quantity: 'Qty', physical_unit: 'Unit', cash_price: 'Cash',
    futures_lots: 'Lots', futures_price: 'Futures', price_unit: 'PriceUnit',
    opened_date: 'Opened', futures_contract_month: null, notes: null,
  };

  it('accepts a clean hedged position', () => {
    const rows = buildRows('hedge', sheet([
      { Commodity: 'Corn Futures', Location: 'Rotterdam', Side: 'long', Qty: '1000', Unit: 'tonne', Cash: '195', Lots: '8', Futures: '199.47', PriceUnit: 'EUR/t', Opened: '2026-08-30' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.physical_side).toBe('long');
    expect(rows[0].values.futures_lots).toBe(8);
  });

  it('normalises side synonyms', () => {
    const rows = buildRows('hedge', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Side: 'SOLD', Qty: '10', Unit: 't', Cash: '1', Lots: '0', Futures: '', PriceUnit: '', Opened: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].values.physical_side).toBe('short');
  });

  it('mirrors the DB constraint: lots without a price is an error', () => {
    const rows = buildRows('hedge', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Side: 'long', Qty: '10', Unit: 't', Cash: '1', Lots: '5', Futures: '', PriceUnit: '', Opened: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors.join(' ')).toMatch(/without a futures price/);
  });

  it('allows an unhedged position (zero lots, no price)', () => {
    const rows = buildRows('hedge', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Side: 'long', Qty: '10', Unit: 't', Cash: '1', Lots: '0', Futures: '', PriceUnit: '', Opened: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].errors).toEqual([]);
  });

  it('warns when defaulting side and quantity unit', () => {
    const rows = buildRows('hedge', sheet([
      { Commodity: 'Corn Futures', Location: 'R', Side: '', Qty: '10', Unit: '', Cash: '1', Lots: '0', Futures: '', PriceUnit: '', Opened: '' },
    ]), mapping, COMMODITIES);
    expect(rows[0].warnings.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].values.physical_unit).toBe('tonne');
  });
});

describe('templateCsv', () => {
  it('produces a header row plus examples for both kinds', () => {
    expect(templateCsv('basis').split('\n')).toHaveLength(3);
    expect(templateCsv('hedge').split('\n')).toHaveLength(3);
    expect(templateCsv('basis')).toMatch(/^Commodity,Location/);
  });

  it('template rows actually pass validation — the example must not be broken', () => {
    const lines = templateCsv('basis').split('\n');
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map((l) => {
      const cells = l.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    });
    const mapping = autoMapFields('basis', headers);
    const parsed = buildRows('basis', sheet(rows), mapping, COMMODITIES);
    expect(parsed.every((r) => r.errors.length === 0)).toBe(true);
  });
});
