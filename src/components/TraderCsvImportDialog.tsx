import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader, Upload, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  parseStatementFile, autoMapFields, buildRows, fieldLabels, requiredFields,
  allFields, templateCsv,
  type ImportKind, type ParsedSheet, type ParsedRow,
} from '@/lib/traderCsvImport';

type Step = 'upload' | 'mapping' | 'preview' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ImportKind;
  /** Live catalogue — rows naming anything outside it are rejected. */
  knownCommodities: string[];
  /** Applied to EUR/t rows at import time; CSVs rarely carry a historical rate. */
  usdToEur: number | undefined;
  onImported: () => void;
}

const TABLE: Record<ImportKind, 'basis_entries' | 'hedged_positions'> = {
  basis: 'basis_entries',
  hedge: 'hedged_positions',
};

const TraderCsvImportDialog: React.FC<Props> = ({
  open, onOpenChange, kind, knownCommodities, usdToEur, onImported,
}) => {
  const [step, setStep] = React.useState<Step>('upload');
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [sheets, setSheets] = React.useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = React.useState(0);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; skipped: number } | null>(null);

  const labels = fieldLabels(kind);
  const required = requiredFields(kind);
  const fields = allFields(kind);

  React.useEffect(() => {
    if (open) {
      setStep('upload'); setParseError(null); setSheets([]); setSheetIndex(0);
      setMapping({}); setRows([]); setResult(null);
    }
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setIsParsing(true);
    try {
      const parsed = await parseStatementFile(file);
      if (parsed.length === 0) {
        setParseError('No readable sheets found in that file.');
        return;
      }
      setSheets(parsed);
      setSheetIndex(0);
      setMapping(autoMapFields(kind, parsed[0].headers));
      setStep('mapping');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setIsParsing(false);
      // Allow re-picking the same file after an error.
      e.target.value = '';
    }
  };

  const activeSheet = sheets[sheetIndex];

  const goToPreview = () => {
    if (!activeSheet) return;
    setRows(buildRows(kind, activeSheet, mapping, knownCommodities));
    setStep('preview');
  };

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidCount = rows.length - validRows.length;
  const warnCount = validRows.filter((r) => r.warnings.length > 0).length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast({ title: 'Sign in required', variant: 'destructive' });

    setImporting(true);
    const payload: Record<string, unknown>[] = validRows.map((r) => {
      const v: Record<string, unknown> = { ...r.values };
      // DB CHECK requires fx_rate exactly when the unit is EUR-based.
      v.fx_rate = v.price_unit === 'EUR/t' ? (usdToEur ?? null) : null;
      v.user_id = u.user.id;
      return v;
    });

    // Guard the constraint client-side too, so the whole batch doesn't fail
    // on one row when the FX rate hasn't loaded.
    const missingFx = payload.filter((p) => p.price_unit === 'EUR/t' && !p.fx_rate);
    if (missingFx.length > 0) {
      setImporting(false);
      return toast({
        title: 'FX rate unavailable',
        description: `${missingFx.length} EUR/t row(s) need a USD→EUR rate. Try again in a moment.`,
        variant: 'destructive',
      });
    }

    const { error } = await supabase
      .from(TABLE[kind])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload is built dynamically per import kind
      .insert(payload as any);
    setImporting(false);

    if (error) {
      return toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    }
    setResult({ imported: payload.length, skipped: invalidCount });
    setStep('done');
    onImported();
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commodity-hub-${kind}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {kind === 'basis' ? 'basis entries' : 'positions'} from a file</DialogTitle>
          <DialogDescription>
            CSV or Excel. Nothing is saved until you review the preview.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="border border-dashed border-border rounded-md p-6 text-center space-y-3">
              <Upload className="w-7 h-7 mx-auto text-muted-foreground" />
              <div>
                <Label htmlFor="csv-file" className="cursor-pointer text-sm underline">
                  Choose a file
                </Label>
                <Input id="csv-file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
              </div>
              <p className="text-xs text-muted-foreground">Column names are matched automatically; you can correct them next.</p>
              {isParsing && (
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader className="w-3 h-3 animate-spin" /> reading…
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download a template CSV
            </Button>
            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Could not read that file</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'mapping' && activeSheet && (
          <div className="space-y-4">
            {sheets.length > 1 && (
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Sheet</Label>
                <Select
                  value={String(sheetIndex)}
                  onValueChange={(v) => {
                    const i = Number(v);
                    setSheetIndex(i);
                    setMapping(autoMapFields(kind, sheets[i].headers));
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sheets.map((s, i) => <SelectItem key={s.name} value={String(i)}>{s.name} ({s.rows.length} rows)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {activeSheet.rows.length} row{activeSheet.rows.length === 1 ? '' : 's'} found. Match your columns:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fields.map((f) => (
                <div key={f}>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {labels[f]}{required.includes(f) && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={mapping[f] ?? '__none__'}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f]: v === '__none__' ? null : v }))}
                  >
                    <SelectTrigger className="h-9 font-mono text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— not in file —</SelectItem>
                      {activeSheet.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-success font-medium">{validRows.length} ready</span>
              {invalidCount > 0 && <span className="text-destructive font-medium">{invalidCount} skipped</span>}
              {warnCount > 0 && <span className="text-warning font-medium">{warnCount} with warnings</span>}
            </div>
            <div className="border border-border rounded-md max-h-72 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.index} className={cn(
                  'px-3 py-2 border-b border-border/60 last:border-0 text-xs',
                  r.errors.length > 0 && 'bg-destructive/5',
                )}>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground pt-0.5 w-8 shrink-0">#{r.index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono">
                        {String(r.values.commodity_name ?? '—')} · {String(r.values.location ?? '—')} · {String(r.values.cash_price ?? '—')}
                      </span>
                      {r.errors.map((e, i) => (
                        <div key={i} className="text-destructive mt-0.5">{e}</div>
                      ))}
                      {r.errors.length === 0 && r.warnings.map((w, i) => (
                        <div key={i} className="text-warning mt-0.5">{w}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {invalidCount > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Rows with errors are skipped — the rest still import. Fix them in your file and re-import if needed.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'done' && result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Imported</AlertTitle>
            <AlertDescription className="text-xs">
              {result.imported} row{result.imported === 1 ? '' : 's'} added
              {result.skipped > 0 && `, ${result.skipped} skipped`}.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {step === 'mapping' && (
            <>
              <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
              <Button
                onClick={goToPreview}
                disabled={required.some((f) => !mapping[f])}
              >
                Preview
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
              <Button onClick={handleImport} disabled={validRows.length === 0 || importing}>
                {importing && <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Import {validRows.length} row{validRows.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TraderCsvImportDialog;
