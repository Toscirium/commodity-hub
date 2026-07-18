/**
 * Forward-curve futures symbol mapping for FMP.
 * Each entry returns the 12 next monthly contracts using CME-style codes:
 * <root><MonthCode><YearDigit> e.g. CLF26 = WTI Jan 2026.
 */

const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];

export interface CurveCommodity {
  id: string;
  label: string;
  root: string; // FMP root (CL, BZ, NG, GC, HG, SI, ZC, ZS, ZW)
  contractsPerYear: 12 | 6 | 4; // monthly, bi-monthly, quarterly
}

export const CURVE_COMMODITIES: CurveCommodity[] = [
  { id: 'wti', label: 'WTI Crude Oil', root: 'CL', contractsPerYear: 12 },
  { id: 'brent', label: 'Brent Crude', root: 'BZ', contractsPerYear: 12 },
  { id: 'natgas', label: 'Natural Gas', root: 'NG', contractsPerYear: 12 },
  { id: 'gold', label: 'Gold', root: 'GC', contractsPerYear: 6 },
  { id: 'silver', label: 'Silver', root: 'SI', contractsPerYear: 6 },
  { id: 'copper', label: 'Copper', root: 'HG', contractsPerYear: 12 },
  { id: 'corn', label: 'Corn', root: 'ZC', contractsPerYear: 6 },
  { id: 'soybeans', label: 'Soybeans', root: 'ZS', contractsPerYear: 6 },
  { id: 'wheat', label: 'Wheat', root: 'ZW', contractsPerYear: 6 },
];

/** Generate the next N contract symbols from now. */
export function generateContractSymbols(root: string, monthsAhead = 12): {
  symbol: string;
  expiry: string; // YYYY-MM
  monthIdx: number;
}[] {
  const out: { symbol: string; expiry: string; monthIdx: number }[] = [];
  const now = new Date();
  for (let i = 1; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const code = MONTH_CODES[d.getMonth()];
    const yr = String(d.getFullYear() % 100).padStart(2, '0');
    out.push({
      symbol: `${root}${code}${yr}`,
      expiry: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      monthIdx: i,
    });
  }
  return out;
}

export function findCurveCommodity(id: string): CurveCommodity | undefined {
  return CURVE_COMMODITIES.find((c) => c.id === id);
}