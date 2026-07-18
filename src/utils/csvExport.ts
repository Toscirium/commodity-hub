/**
 * Premium feature: download arbitrary tabular data as CSV.
 * Server-side gating is not required — the data already belongs to the user.
 */

const escapeCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const body = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(','))
    .join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};