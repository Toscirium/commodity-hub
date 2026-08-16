import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import {
  parseStatementFile,
  autoMapHeaders,
  buildImportRows,
  IMPORT_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS,
  type ParsedSheet,
  type ImportField,
  type ParsedImportRow,
} from '@/lib/statementImport';
import { COMMODITY_OPTIONS, KNOWN_BROKERS, type CommodityOption } from '@/lib/brokerPositions';
import { useImportPositions } from '@/hooks/useImportPositions';

type Step = 'upload' | 'mapping' | 'preview' | 'done';

interface ImportPositionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId?: string;
  onImported?: () => void;
}

const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];

const scoreMapping = (mapping: Record<ImportField, string | null>) =>
  Object.values(mapping).filter(Boolean).length;

const ImportPositionsDialog: React.FC<ImportPositionsDialogProps> = ({
  open, onOpenChange, portfolioId, onImported,
}) => {
  const [step, setStep] = React.useState<Step>('upload');
  const [broker, setBroker] = React.useState('eToro');
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);

  const [sheets, setSheets] = React.useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = React.useState(0);
  const [mapping, setMapping] = React.useState<Record<ImportField, string | null> | null>(null);

  const [parsedRows, setParsedRows] = React.useState<ParsedImportRow[]>([]);
  const [checkedRows, setCheckedRows] = React.useState<Set<number>>(new Set());
  const [overrides, setOverrides] = React.useState<Record<number, CommodityOption>>({});
  const [result, setResult] = React.useState<{ imported: number; skipped: number } | null>(null);

  const { importPositions, importing } = useImportPositions(portfolioId);

  // Reset the wizard every time it's opened fresh.
  React.useEffect(() => {
    if (open) {
      setStep('upload');
      setBroker('eToro');
      setParseError(null);
      setSheets([]);
      setSheetIndex(0);
      setMapping(null);
      setParsedRows([]);
      setCheckedRows(new Set());
      setOverrides({});
      setResult(null);
    }
  }, [open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setIsParsing(true);
    try {
      const parsedSheets = await parseStatementFile(file);
      if (parsedSheets.length === 0) {
        setParseError('Could not find any rows with a header row in this file.');
        return;
      }
      // Pick whichever sheet's headers our alias table recognizes best —
      // useful when a statement export has separate "Open"/"Closed" sheets.
      let bestIdx = 0;
      let bestScore = -1;
      parsedSheets.forEach((sheet, i) => {
        const s = scoreMapping(autoMapHeaders(sheet.headers));
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      });
      setSheets(parsedSheets);
      setSheetIndex(bestIdx);
      setMapping(autoMapHeaders(parsedSheets[bestIdx].headers));
      setStep('mapping');
    } catch (err) {
      console.error('Failed to parse statement file:', err);
      setParseError('Could not read this file. Make sure it\'s a .csv or .xlsx export.');
    } finally {
      setIsParsing(false);
      e.target.value = '';
    }
  };

  const handleSheetChange = (value: string) => {
    const idx = Number(value);
    setSheetIndex(idx);
    setMapping(autoMapHeaders(sheets[idx].headers));
  };

  const handleMappingContinue = () => {
    if (!mapping) return;
    const rows = buildImportRows(sheets[sheetIndex].rows, mapping);
    setParsedRows(rows);
    setOverrides({});
    setCheckedRows(new Set(rows.filter((r) => r.errors.length === 0).map((r) => r.rowIndex)));
    setStep('preview');
  };

  // Apply per-row commodity overrides on top of the auto-match.
  const effectiveRows = React.useMemo(() => {
    return parsedRows.map((r) => {
      const override = overrides[r.rowIndex];
      if (!override) return r;
      return {
        ...r,
        commodity_name: override,
        commodityMatched: true,
        errors: r.errors.filter((e) => !e.includes('matching commodity')),
      };
    });
  }, [parsedRows, overrides]);

  const handleOverride = (rowIndex: number, value: CommodityOption) => {
    setOverrides((prev) => ({ ...prev, [rowIndex]: value }));
    setCheckedRows((prev) => {
      const row = effectiveRows.find((r) => r.rowIndex === rowIndex);
      const stillHasOtherErrors = row?.errors.some((e) => !e.includes('matching commodity'));
      if (stillHasOtherErrors) return prev;
      const next = new Set(prev);
      next.add(rowIndex);
      return next;
    });
  };

  const toggleRow = (rowIndex: number, checked: boolean) => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowIndex); else next.delete(rowIndex);
      return next;
    });
  };

  const importableCount = effectiveRows.filter((r) => r.errors.length === 0 && checkedRows.has(r.rowIndex)).length;

  const handleImport = async () => {
    const rows = effectiveRows.filter((r) => r.errors.length === 0 && checkedRows.has(r.rowIndex));
    if (rows.length === 0) return;
    try {
      const res = await importPositions(rows, broker.trim() || 'Other');
      setResult(res);
      setStep('done');
      onImported?.();
    } catch {
      // toast already shown by the hook
    }
  };

  const missingRequired = mapping
    ? REQUIRED_IMPORT_FIELDS.filter((f) => !mapping[f])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import positions from a statement
          </DialogTitle>
          <DialogDescription>
            Upload a statement you've exported from your own broker account (eToro or otherwise).
            The file is parsed entirely in your browser — nothing is sent anywhere except the
            positions you confirm importing. This never connects to or reads from a real
            broker account.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-broker">Broker</Label>
              <Input
                id="import-broker"
                list="import-broker-suggestions"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g., eToro"
              />
              <datalist id="import-broker-suggestions">
                {KNOWN_BROKERS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-file">Statement file (.csv or .xlsx)</Label>
              <Input id="import-file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={isParsing} />
              <p className="text-xs text-muted-foreground">
                On eToro: Portfolio → History → Export. Both open positions and closed trade
                history exports are supported.
              </p>
            </div>

            {isParsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader className="w-4 h-4 animate-spin" /> Reading file…
              </div>
            )}

            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Couldn't read that file</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'mapping' && mapping && (
          <div className="space-y-4">
            {sheets.length > 1 && (
              <div className="space-y-2">
                <Label>Sheet</Label>
                <Tabs value={String(sheetIndex)} onValueChange={handleSheetChange}>
                  <TabsList>
                    {sheets.map((s, i) => (
                      <TabsTrigger key={s.name} value={String(i)}>{s.name} ({s.rows.length})</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              We matched these columns automatically — check they look right, or point any field
              at a different column from your file.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {IMPORT_FIELDS.map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{IMPORT_FIELD_LABELS[field]}</Label>
                  <Select
                    value={mapping[field] ?? '__none__'}
                    onValueChange={(value) =>
                      setMapping((prev) => (prev ? { ...prev, [field]: value === '__none__' ? null : value } : prev))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {sheets[sheetIndex].headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Missing required fields</AlertTitle>
                <AlertDescription>
                  {missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')} must be mapped to continue.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {importableCount} of {effectiveRows.length} row{effectiveRows.length === 1 ? '' : 's'} will be imported.
              Rows with an error are skipped until fixed — pick a commodity for any unmatched instrument, or
              uncheck rows you don't want.
            </p>
            <div className="border rounded-lg max-h-[45vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Instrument</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Entry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Exit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveRows.map((row) => {
                    const hasError = row.errors.length > 0;
                    const isUnmatched = !row.commodityMatched;
                    return (
                      <TableRow key={row.rowIndex} className={hasError ? 'opacity-70' : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={checkedRows.has(row.rowIndex)}
                            disabled={hasError}
                            onCheckedChange={(c) => toggleRow(row.rowIndex, Boolean(c))}
                          />
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="text-sm font-medium">{row.instrumentRaw || '—'}</div>
                          {isUnmatched ? (
                            <Select
                              value={overrides[row.rowIndex] ?? ''}
                              onValueChange={(v) => handleOverride(row.rowIndex, v as CommodityOption)}
                            >
                              <SelectTrigger className="h-7 mt-1 text-xs">
                                <SelectValue placeholder="Pick a commodity…" />
                              </SelectTrigger>
                              <SelectContent>
                                {COMMODITY_OPTIONS.map((c) => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="text-xs text-muted-foreground">{row.commodity_name}</div>
                          )}
                          {row.errors.length > 0 && (
                            <div className="text-xs text-destructive mt-1">{row.errors.join('; ')}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{row.side}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.quantity ?? '—'}</TableCell>
                        <TableCell className="text-sm">{row.entry_price ?? '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{row.entry_date ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === 'closed' ? 'secondary' : 'outline'} className="text-xs capitalize">
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.exit_price ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <Alert>
            <CheckCircle2 className="w-4 h-4" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              {result.imported} position{result.imported === 1 ? '' : 's'} imported
              {result.skipped > 0 ? `, ${result.skipped} skipped as already imported.` : '.'}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          {step === 'upload' && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleMappingContinue} disabled={missingRequired.length > 0}>
                Continue
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
              <Button onClick={handleImport} disabled={importableCount === 0 || importing} className="gap-2">
                {importing ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import {importableCount} position{importableCount === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportPositionsDialog;
