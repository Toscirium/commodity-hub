/**
 * Parses a broker account statement (eToro's "Account Statement" export, or
 * any similarly-shaped CSV/XLSX) into rows we can bulk-insert into
 * portfolio_positions. Nothing here ever talks to a broker — it only reads a
 * file the user already downloaded from their own account and chose to
 * upload. See src/components/ImportPositionsDialog.tsx for the wizard UI
 * that drives this, and src/lib/brokerPositions.ts for the shared commodity
 * vocabulary.
 *
 * Broker export formats vary by locale/version and aren't something we can
 * verify against a live account, so this deliberately does NOT hardcode a
 * single expected header set. Instead it guesses a mapping from column
 * headers to fields, and the wizard always shows that guess to the user to
 * confirm/correct before anything is imported.
 */
import * as XLSX from 'xlsx';
import { matchCommodityOption, type CommodityOption } from './brokerPositions';
import type { PositionSide, PositionStatus } from '@/hooks/usePortfolio';

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export async function parseStatementFile(file: File): Promise<ParsedSheet[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { name, headers: headers.map((h) => h.trim()), rows };
  }).filter((sheet) => sheet.headers.length > 0);
}

export type ImportField =
  | 'instrument' | 'side' | 'units' | 'open_rate' | 'open_date'
  | 'close_rate' | 'close_date' | 'leverage' | 'position_id' | 'notes';

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  instrument: 'Instrument / Symbol',
  side: 'Direction (Buy/Sell)',
  units: 'Units / Quantity',
  open_rate: 'Open (Entry) Price',
  open_date: 'Open (Entry) Date',
  close_rate: 'Close (Exit) Price — leave unmapped if importing open positions',
  close_date: 'Close (Exit) Date — leave unmapped if importing open positions',
  leverage: 'Leverage',
  position_id: 'Position / Trade ID',
  notes: 'Notes',
};

export const REQUIRED_IMPORT_FIELDS: ImportField[] = ['instrument', 'units', 'open_rate', 'open_date'];

const FIELD_ALIASES: Record<ImportField, string[]> = {
  instrument: ['instrument', 'symbol', 'market', 'asset', 'name'],
  side: ['action', 'direction', 'type', 'position type', 'buy/sell', 'side'],
  units: ['units', 'amount', 'quantity', 'size', 'volume'],
  open_rate: ['open rate', 'open price', 'entry price', 'rate open', 'open'],
  open_date: ['open date', 'date opened', 'entry date', 'open time', 'opened'],
  close_rate: ['close rate', 'close price', 'exit price', 'rate close', 'close'],
  close_date: ['close date', 'date closed', 'exit date', 'close time', 'closed'],
  leverage: ['leverage'],
  position_id: ['position id', 'trade id', 'ticket', 'id', 'position'],
  notes: ['notes', 'comment', 'comments', 'copied from'],
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** Best-effort guess at which column maps to which field. Always user-editable. */
export function autoMapHeaders(headers: string[]): Record<ImportField, string | null> {
  const result = {} as Record<ImportField, string | null>;
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  (Object.keys(FIELD_ALIASES) as ImportField[]).forEach((field) => {
    const aliases = FIELD_ALIASES[field];
    // Exact alias match first, then substring match.
    let match = normalizedHeaders.find((h) => aliases.includes(h.norm));
    if (!match) {
      match = normalizedHeaders.find((h) => aliases.some((a) => h.norm.includes(a)));
    }
    result[field] = match?.raw ?? null;
  });

  return result;
}

const parseNum = (raw: unknown): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
  let s = String(raw).trim();
  if (!s) return null;
  const isNegative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()+-]/g, '').replace(/[^0-9.,]/g, '').replace(/,/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return isNegative ? -n : n;
};

const parseDateToISO = (raw: unknown): string | null => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // ISO (YYYY-MM-DD...)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY or MM/DD/YYYY, optionally with a time suffix. Most European
  // brokers (eToro included) export DD/MM/YYYY, so that's the default
  // interpretation when both readings are plausible.
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    const year = m[3];
    if (day > 12 && month <= 12) {
      // unambiguous DD/MM
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const parseSide = (raw: unknown): PositionSide => {
  const s = String(raw ?? '').toLowerCase();
  return /sell|short/.test(s) ? 'sell' : 'buy';
};

/** Stable, non-cryptographic hash used as a dedupe key when a statement has no ID column. */
const stableHash = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `auto-${(hash >>> 0).toString(36)}`;
};

export interface ParsedImportRow {
  rowIndex: number;
  instrumentRaw: string;
  commodity_name: string | null;
  commodityMatched: boolean;
  side: PositionSide;
  quantity: number | null;
  entry_price: number | null;
  entry_date: string | null;
  status: PositionStatus;
  exit_price: number | null;
  closed_date: string | null;
  leverage: number | null;
  external_id: string;
  notes: string | null;
  errors: string[];
}

export function buildImportRows(
  sheetRows: Record<string, unknown>[],
  mapping: Record<ImportField, string | null>,
): ParsedImportRow[] {
  const getRaw = (row: Record<string, unknown>, field: ImportField): unknown => {
    const col = mapping[field];
    return col ? row[col] : undefined;
  };

  return sheetRows.map((row, rowIndex) => {
    const instrumentRaw = String(getRaw(row, 'instrument') ?? '').trim();
    const matched = instrumentRaw ? matchCommodityOption(instrumentRaw) : null;

    const quantity = parseNum(getRaw(row, 'units'));
    const entry_price = parseNum(getRaw(row, 'open_rate'));
    const entry_date = parseDateToISO(getRaw(row, 'open_date'));
    const side = parseSide(getRaw(row, 'side'));
    const leverage = parseNum(getRaw(row, 'leverage'));

    const closeRateRaw = getRaw(row, 'close_rate');
    const closeDateRaw = getRaw(row, 'close_date');
    const exit_price = parseNum(closeRateRaw);
    const closed_date = parseDateToISO(closeDateRaw);
    const isClosed = exit_price != null && closed_date != null;

    const positionIdRaw = String(getRaw(row, 'position_id') ?? '').trim();
    const external_id = positionIdRaw || stableHash(
      [instrumentRaw, side, quantity, entry_price, entry_date, exit_price, closed_date].join('|'),
    );

    const notes = String(getRaw(row, 'notes') ?? '').trim() || null;

    const errors: string[] = [];
    if (!instrumentRaw) errors.push('Missing instrument');
    if (!matched) errors.push('No matching commodity — pick one manually');
    if (quantity == null || quantity <= 0) errors.push('Missing or invalid quantity');
    if (entry_price == null || entry_price < 0) errors.push('Missing or invalid entry price');
    if (!entry_date) errors.push('Missing or unreadable entry date');

    return {
      rowIndex,
      instrumentRaw,
      commodity_name: matched,
      commodityMatched: Boolean(matched),
      side,
      quantity,
      entry_price,
      entry_date,
      status: isClosed ? 'closed' : 'open',
      exit_price: isClosed ? exit_price : null,
      closed_date: isClosed ? closed_date : null,
      leverage,
      external_id,
      notes,
      errors,
    };
  });
}

export type { CommodityOption };
