/**
 * CSV/XLSX import for the Basis Tracker and Hedge Book.
 *
 * Reuses parseStatementFile() from statementImport.ts for the actual file
 * reading (it's format-agnostic and already handles both CSV and XLSX); this
 * module adds the field vocabulary, header guessing, and validation specific
 * to basis entries and hedged positions.
 *
 * Deliberately separate from statementImport's own field mapping, which is
 * broker-statement-shaped (instrument/units/open_rate/leverage) and doesn't
 * describe a basis reading or a two-legged hedge.
 *
 * Validation here mirrors the DB CHECK constraints in
 * 20260830140000_basis_units_and_hedge_book.sql, so a row that passes preview
 * won't be rejected by Postgres afterwards. When the two disagree the
 * database wins — these checks exist to give a useful per-row error in the UI
 * rather than one opaque failure for the whole batch.
 */
import { parseStatementFile, type ParsedSheet } from './statementImport';
import { availableUnits, type PriceUnit } from '@/utils/commodityUnits';

export { parseStatementFile };
export type { ParsedSheet };

export type ImportKind = 'basis' | 'hedge';

export type BasisField =
  | 'commodity_name' | 'location' | 'contract_month'
  | 'cash_price' | 'futures_price' | 'price_unit' | 'entry_date' | 'notes';

export type HedgeField =
  | 'commodity_name' | 'location' | 'physical_side' | 'physical_quantity'
  | 'physical_unit' | 'cash_price' | 'futures_contract_month' | 'futures_lots'
  | 'futures_price' | 'price_unit' | 'opened_date' | 'notes';

export type AnyField = BasisField | HedgeField;

export const BASIS_FIELD_LABELS: Record<BasisField, string> = {
  commodity_name: 'Commodity',
  location: 'Location',
  contract_month: 'Contract month',
  cash_price: 'Cash price',
  futures_price: 'Futures price',
  price_unit: 'Price unit',
  entry_date: 'Date',
  notes: 'Notes',
};

export const HEDGE_FIELD_LABELS: Record<HedgeField, string> = {
  commodity_name: 'Commodity',
  location: 'Location',
  physical_side: 'Side (long/short)',
  physical_quantity: 'Physical quantity',
  physical_unit: 'Quantity unit',
  cash_price: 'Cash price',
  futures_contract_month: 'Contract month',
  futures_lots: 'Futures lots',
  futures_price: 'Futures price',
  price_unit: 'Price unit',
  opened_date: 'Opened date',
  notes: 'Notes',
};

export const BASIS_REQUIRED: BasisField[] = ['commodity_name', 'location', 'cash_price', 'futures_price'];
export const HEDGE_REQUIRED: HedgeField[] = ['commodity_name', 'location', 'physical_quantity', 'cash_price'];

export const fieldLabels = (kind: ImportKind): Record<string, string> =>
  kind === 'basis' ? BASIS_FIELD_LABELS : HEDGE_FIELD_LABELS;

export const requiredFields = (kind: ImportKind): string[] =>
  kind === 'basis' ? BASIS_REQUIRED : HEDGE_REQUIRED;

export const allFields = (kind: ImportKind): string[] =>
  Object.keys(fieldLabels(kind));

const FIELD_ALIASES: Record<string, string[]> = {
  commodity_name: ['commodity', 'product', 'instrument', 'grain', 'commodityname'],
  location: ['location', 'delivery', 'deliverypoint', 'elevator', 'port', 'origin', 'destination'],
  contract_month: ['contractmonth', 'month', 'contract', 'delivery month', 'deliverymonth'],
  futures_contract_month: ['contractmonth', 'month', 'contract', 'futuresmonth'],
  cash_price: ['cashprice', 'cash', 'physicalprice', 'spot', 'spotprice', 'price'],
  futures_price: ['futuresprice', 'futures', 'boardprice', 'board', 'hedgeprice'],
  price_unit: ['priceunit', 'unit', 'basis', 'currency', 'pricebasis'],
  entry_date: ['date', 'entrydate', 'asof', 'tradedate'],
  opened_date: ['openeddate', 'opened', 'date', 'tradedate', 'startdate'],
  physical_side: ['side', 'direction', 'longshort', 'buysell', 'position'],
  physical_quantity: ['quantity', 'qty', 'volume', 'tonnes', 'tons', 'amount', 'physicalquantity'],
  physical_unit: ['quantityunit', 'qtyunit', 'unitofmeasure', 'uom', 'physicalunit'],
  futures_lots: ['lots', 'contracts', 'futureslots', 'numcontracts'],
  notes: ['notes', 'note', 'comment', 'remarks'],
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function autoMapFields(kind: ImportKind, headers: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  for (const field of allFields(kind)) {
    const aliases = FIELD_ALIASES[field] ?? [field.replace(/_/g, '')];
    let match = normalized.find((h) => aliases.includes(h.norm));
    if (!match) match = normalized.find((h) => aliases.some((a) => h.norm.includes(a)));
    result[field] = match?.raw ?? null;
  }
  return result;
}

/** Tolerant numeric parse — handles "1,234.50", "(12.5)" negatives, currency symbols. */
export function parseNum(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()+-]/g, '').replace(/[^0-9.,]/g, '');
  // Treat comma as a thousands separator unless it's clearly the decimal mark
  // (European "195,50" style: a single comma with 1-2 trailing digits).
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/** Accepts ISO, and the common DD/MM/YYYY and MM/DD/YYYY spreadsheet shapes. */
export function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const na = Number(a);
    const nb = Number(b);
    if (na > 12 && nb > 12) return null; // neither can be a month
    // a > 12 forces DD/MM; b > 12 forces MM/DD; otherwise ambiguous and we
    // prefer DD/MM, the convention these users write in.
    const [day, month] = nb > 12 ? [nb, na] : [na, nb];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const normalizeSide = (raw: unknown): 'long' | 'short' | null => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['long', 'l', 'buy', 'bought', 'b'].includes(s)) return 'long';
  if (['short', 's', 'sell', 'sold'].includes(s)) return 'short';
  return null;
};

const normalizePhysicalUnit = (raw: unknown): string | null => {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z-]/g, '');
  if (!s) return null;
  if (['tonne', 'tonnes', 't', 'mt', 'metricton', 'metrictonne'].includes(s)) return 'tonne';
  if (['bushel', 'bushels', 'bu'].includes(s)) return 'bushel';
  if (['shortton', 'short-ton', 'shorttons', 'st'].includes(s)) return 'short-ton';
  return null;
};

const normalizePriceUnit = (raw: unknown): PriceUnit | null => {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (!s) return null;
  if (['native', 'raw', 'asquoted'].includes(s)) return 'native';
  if (['usd/bu', '$/bu', 'usdbu', 'dollarsperbushel'].includes(s)) return 'USD/bu';
  if (['usd/t', '$/t', 'usdt', 'usd/tonne', '$/tonne', 'usdpertonne'].includes(s)) return 'USD/t';
  if (['eur/t', '€/t', 'eurt', 'eur/tonne', '€/tonne', 'europertonne'].includes(s)) return 'EUR/t';
  return null;
};

export interface ParsedRow {
  index: number;
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

/**
 * Maps and validates raw sheet rows. Never throws — every problem becomes a
 * per-row error so the preview can show exactly which lines won't import and
 * why, rather than failing the whole file.
 *
 * `knownCommodities` is the live catalogue; a row naming something not in it
 * is an error rather than a warning, because the futures price and all unit
 * conversion depend on matching a real commodity.
 */
export function buildRows(
  kind: ImportKind,
  sheet: ParsedSheet,
  mapping: Record<string, string | null>,
  knownCommodities: string[],
): ParsedRow[] {
  const known = new Map(knownCommodities.map((c) => [c.toLowerCase(), c]));
  const required = requiredFields(kind);

  return sheet.rows.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const values: Record<string, unknown> = {};

    const get = (field: string) => {
      const col = mapping[field];
      return col ? raw[col] : undefined;
    };

    // Commodity — must resolve against the live catalogue.
    const rawCommodity = String(get('commodity_name') ?? '').trim();
    const matched = known.get(rawCommodity.toLowerCase());
    if (!rawCommodity) errors.push('Missing commodity');
    else if (!matched) errors.push(`Unknown commodity "${rawCommodity}"`);
    else values.commodity_name = matched;

    const location = String(get('location') ?? '').trim();
    if (!location) errors.push('Missing location');
    else values.location = location;

    // Price unit — default to native when absent, matching the DB default.
    const rawUnit = get('price_unit');
    let unit: PriceUnit = 'native';
    if (rawUnit != null && String(rawUnit).trim() !== '') {
      const parsed = normalizePriceUnit(rawUnit);
      if (!parsed) errors.push(`Unrecognised price unit "${String(rawUnit)}"`);
      else unit = parsed;
    }
    if (matched && !availableUnits(matched).includes(unit)) {
      errors.push(`${matched} cannot be expressed in ${unit}`);
    }
    values.price_unit = unit;
    if (unit === 'EUR/t') {
      // fx_rate is applied at import time from the live rate, not the file —
      // a historical row would need its own rate, which a CSV rarely carries.
      warnings.push('EUR/t row will use today’s FX rate');
    }

    const cash = parseNum(get('cash_price'));
    if (cash == null) errors.push('Missing or unparseable cash price');
    else if (cash <= 0) errors.push('Cash price must be positive');
    else values.cash_price = cash;

    const notes = String(get('notes') ?? '').trim();
    if (notes) values.notes = notes;

    if (kind === 'basis') {
      const fut = parseNum(get('futures_price'));
      if (fut == null) errors.push('Missing or unparseable futures price');
      else values.futures_price = fut;
      if (cash != null && fut != null) values.basis = cash - fut;

      const cm = String(get('contract_month') ?? '').trim();
      if (cm) values.contract_month = cm;

      const d = parseDate(get('entry_date'));
      values.entry_date = d ?? new Date().toISOString().slice(0, 10);
      if (get('entry_date') && !d) warnings.push('Unreadable date — using today');
    } else {
      const side = normalizeSide(get('physical_side'));
      if (get('physical_side') != null && String(get('physical_side')).trim() !== '' && !side) {
        errors.push(`Unrecognised side "${String(get('physical_side'))}"`);
      }
      values.physical_side = side ?? 'long';
      if (!side) warnings.push('No side given — defaulting to long');

      const qty = parseNum(get('physical_quantity'));
      if (qty == null) errors.push('Missing or unparseable quantity');
      else if (qty <= 0) errors.push('Quantity must be positive');
      else values.physical_quantity = qty;

      const pu = normalizePhysicalUnit(get('physical_unit'));
      if (get('physical_unit') != null && String(get('physical_unit')).trim() !== '' && !pu) {
        errors.push(`Unrecognised quantity unit "${String(get('physical_unit'))}"`);
      }
      values.physical_unit = pu ?? 'tonne';
      if (!pu) warnings.push('No quantity unit — defaulting to tonnes');

      const lots = parseNum(get('futures_lots')) ?? 0;
      if (lots < 0) errors.push('Futures lots cannot be negative');
      else values.futures_lots = lots;

      const fut = parseNum(get('futures_price'));
      // Mirrors the DB CHECK: lots > 0 requires a price.
      if (lots > 0 && fut == null) errors.push('Futures lots given without a futures price');
      values.futures_price = fut;

      const cm = String(get('futures_contract_month') ?? '').trim();
      if (cm) values.futures_contract_month = cm;

      const d = parseDate(get('opened_date'));
      values.opened_date = d ?? new Date().toISOString().slice(0, 10);
      if (get('opened_date') && !d) warnings.push('Unreadable date — using today');
    }

    for (const f of required) {
      if (mapping[f] == null) {
        const label = fieldLabels(kind)[f];
        if (!errors.some((e) => e.toLowerCase().includes(label.toLowerCase().split(' ')[0]))) {
          errors.push(`Column for "${label}" not mapped`);
        }
      }
    }

    return { index, values, errors, warnings };
  });
}

/** Example CSV a user can download to see the expected shape. */
export function templateCsv(kind: ImportKind): string {
  if (kind === 'basis') {
    return [
      'Commodity,Location,Contract month,Cash price,Futures price,Price unit,Date,Notes',
      'Corn Futures,Rotterdam,Dec 2026,195.00,199.47,EUR/t,2026-08-30,',
      'Soybean Meal,Amsterdam,,386.00,386.25,USD/t,2026-08-30,',
    ].join('\n');
  }
  return [
    'Commodity,Location,Side,Physical quantity,Quantity unit,Cash price,Contract month,Futures lots,Futures price,Price unit,Opened date,Notes',
    'Corn Futures,Rotterdam,long,1000,tonne,195.00,Dec 2026,8,199.47,EUR/t,2026-08-30,',
    'Wheat Futures,Hamburg,short,500,tonne,240.00,Sep 2026,4,238.10,EUR/t,2026-08-30,',
  ].join('\n');
}
