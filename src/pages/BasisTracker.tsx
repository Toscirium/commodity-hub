import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, Lock, Plus, Trash2, Scale, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import { useCurrency } from '@/hooks/useCurrency';
import PremiumPaywall from '@/components/PremiumPaywall';
import TraderCsvImportDialog from '@/components/TraderCsvImportDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  availableUnits, convertFuturesQuote, unitLabel, type PriceUnit,
} from '@/utils/commodityUnits';

interface BasisEntry {
  id: string;
  commodity_name: string;
  location: string;
  contract_month: string | null;
  cash_price: number;
  futures_price: number;
  basis: number;
  entry_date: string;
  notes: string | null;
  price_unit: string;
  fx_rate: number | null;
}

const fmtMoney = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' own tooltip payload type is not exported cleanly for this shape */
const BasisTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs shadow-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className={v >= 0 ? 'text-success' : 'text-destructive'}>
        {v >= 0 ? '+' : ''}{fmtMoney(v)}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  New entry form                                                    */
/* ------------------------------------------------------------------ */

const NewEntryForm: React.FC<{
  commodities: { name: string; price: number }[];
  usdToEur: number | undefined;
  onSaved: () => void;
  onClose: () => void;
}> = ({ commodities, usdToEur, onSaved, onClose }) => {
  const [commodityName, setCommodityName] = useState('');
  const [location, setLocation] = useState('');
  const [contractMonth, setContractMonth] = useState('');
  const [cashPrice, setCashPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('native');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const nativeFutures = commodities.find((c) => c.name === commodityName)?.price ?? null;
  const unitOptions = commodityName ? availableUnits(commodityName) : (['native'] as PriceUnit[]);

  // If the selected commodity can't express the chosen unit (e.g. switching
  // from corn to crude with EUR/t selected), fall back rather than showing a
  // stale, wrong conversion.
  const effectiveUnit: PriceUnit = unitOptions.includes(priceUnit) ? priceUnit : 'native';

  // The futures quote restated into the same unit the cash price is in — this
  // is the whole point of the conversion layer. Null means "can't express it",
  // which must block saving rather than silently fall back to a raw subtraction.
  const convertedFutures =
    nativeFutures != null && commodityName
      ? convertFuturesQuote(commodityName, nativeFutures, effectiveUnit, usdToEur)
      : null;

  const cash = Number(cashPrice);
  const basisPreview =
    convertedFutures != null && Number.isFinite(cash) && cashPrice !== ''
      ? cash - convertedFutures
      : null;

  const handleSave = async () => {
    if (!commodityName) return toast({ title: 'Pick a commodity', variant: 'destructive' });
    if (!location.trim()) return toast({ title: 'Location required', variant: 'destructive' });
    if (!Number.isFinite(cash) || cash <= 0) return toast({ title: 'Enter a valid cash price', variant: 'destructive' });
    if (nativeFutures == null) return toast({ title: 'No live futures price for that commodity right now', variant: 'destructive' });
    if (convertedFutures == null) {
      return toast({
        title: 'Cannot convert to that unit',
        description: `${commodityName} has no ${unitLabel(effectiveUnit, commodityName)} basis${effectiveUnit === 'EUR/t' ? ' — the FX rate may still be loading' : ''}.`,
        variant: 'destructive',
      });
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast({ title: 'Sign in required', variant: 'destructive' });

    setSaving(true);
    const { error } = await supabase.from('basis_entries').insert({
      user_id: u.user.id,
      commodity_name: commodityName,
      location: location.trim(),
      contract_month: contractMonth.trim() || null,
      cash_price: cash,
      // Store the CONVERTED futures price, not the raw quote — so the row is
      // internally consistent: all three numbers are in price_unit.
      futures_price: convertedFutures,
      basis: cash - convertedFutures,
      price_unit: effectiveUnit,
      // DB constraint requires the rate exactly when the unit is EUR-based.
      fx_rate: effectiveUnit === 'EUR/t' ? (usdToEur ?? null) : null,
      entry_date: entryDate,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Basis entry saved' });
    onSaved();
  };

  return (
    <div className="border border-border bg-card/50 rounded-md">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="font-mono text-[11px] uppercase tracking-wider text-warning">New Entry</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Commodity</Label>
            <Select value={commodityName} onValueChange={setCommodityName}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue placeholder="Pick commodity" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {commodities.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rotterdam" className="h-9 font-mono text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Price basis</Label>
            <Select value={effectiveUnit} onValueChange={(v) => setPriceUnit(v as PriceUnit)} disabled={!commodityName}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {unitOptions.map((u) => (
                  <SelectItem key={u} value={u}>{unitLabel(u, commodityName)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cash price</Label>
            <Input type="number" step="any" value={cashPrice} onChange={(e) => setCashPrice(e.target.value)} placeholder="0.00" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Futures</Label>
            <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/30 font-mono text-sm text-muted-foreground">
              {!commodityName ? 'pick one' : convertedFutures != null ? fmtMoney(convertedFutures) : '—'}
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-9 font-mono text-sm" />
          </div>
        </div>

        {/* Show the conversion, don't hide it — a trader needs to see that the
            futures quote was restated before trusting the basis. */}
        {commodityName && nativeFutures != null && effectiveUnit !== 'native' && (
          <p className="font-mono text-[11px] text-muted-foreground">
            {fmtMoney(nativeFutures)} {unitLabel('native', commodityName)} → {convertedFutures != null ? fmtMoney(convertedFutures) : '—'} {unitLabel(effectiveUnit, commodityName)}
            {effectiveUnit === 'EUR/t' && usdToEur ? ` · USD→EUR ${usdToEur.toFixed(4)}` : ''}
          </p>
        )}
        {commodityName && nativeFutures != null && convertedFutures == null && (
          <p className="font-mono text-[11px] text-destructive">
            No {unitLabel(effectiveUnit, commodityName)} conversion available for {commodityName}
            {effectiveUnit === 'EUR/t' ? ' — FX rate unavailable.' : '.'}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Contract month <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
            <Input value={contractMonth} onChange={(e) => setContractMonth(e.target.value)} placeholder="e.g. Dec 2026" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes <span className="normal-case text-muted-foreground/60">(optional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} className="min-h-9 text-sm resize-none" />
          </div>
        </div>

        {basisPreview != null && (
          <p className="font-mono text-xs text-muted-foreground">
            Basis: <span className={cn('font-medium', basisPreview >= 0 ? 'text-success' : 'text-destructive')}>
              {basisPreview >= 0 ? '+' : ''}{fmtMoney(basisPreview)}
            </span>{' '}
            <span className="text-muted-foreground/70">{unitLabel(effectiveUnit, commodityName)}</span>
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Save entry
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

const BasisTracker: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const isPro = tier === 'pro';
  const queryClient = useQueryClient();
  const userId = auth?.user?.id ?? null;

  const { data: commodities = [], isLoading: commoditiesLoading } = useAvailableCommodities({ lightweight: true });
  const { rates } = useCurrency();
  const usdToEur = rates?.EUR;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const entriesQuery = useQuery({
    queryKey: ['basis_entries', userId],
    enabled: !!userId && isPro,
    queryFn: async (): Promise<BasisEntry[]> => {
      const { data, error } = await supabase
        .from('basis_entries')
        .select('id, commodity_name, location, contract_month, cash_price, futures_price, basis, entry_date, notes, price_unit, fx_rate')
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BasisEntry[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('basis_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['basis_entries', userId] });
      toast({ title: 'Entry removed' });
    },
  });

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  // Group key = commodity + location + unit. Commodity+location because the
  // same commodity has a different basis at every delivery point; unit because
  // plotting a EUR/tonne basis on the same axis as a cents/bushel one would
  // reintroduce exactly the units bug this release fixes.
  const groups = useMemo(() => {
    const map = new Map<string, BasisEntry[]>();
    for (const e of entries) {
      const key = `${e.commodity_name} · ${e.location} · ${unitLabel(e.price_unit as PriceUnit, e.commodity_name)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [entries]);

  const groupKeys = useMemo(() => Array.from(groups.keys()).sort(), [groups]);
  const activeGroup = groupFilter && groups.has(groupFilter) ? groupFilter : groupKeys[0] ?? null;

  const chartData = useMemo(() => {
    if (!activeGroup) return [];
    const rows = groups.get(activeGroup) ?? [];
    return [...rows]
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .map((e) => ({ date: e.entry_date.slice(5), basis: e.basis }));
  }, [groups, activeGroup]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="border border-border rounded-md overflow-hidden bg-card/40">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
              <Scale className="w-3.5 h-3.5 text-success" />
              <span className="text-warning">BASIS</span>
              <span className="text-muted-foreground hidden sm:inline">› basis.tracker</span>
            </div>
          </div>

          <div className="px-3 py-3 sm:px-4">
            <h1 className="font-mono text-xl sm:text-2xl font-semibold tracking-tight">BASIS TRACKER</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Cash price minus futures benchmark, by commodity and delivery point. Entered by hand — basis
              is hyperlocal and isn't published data, unlike the futures price it's measured against.
            </p>
          </div>

          {!isPro ? (
            <div className="p-4">
              <div className="border border-primary/30 bg-primary/5 rounded-md p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Basis Tracker is a Pro feature</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Track cash-vs-futures basis over time, by location and delivery month.
                  </p>
                </div>
                <Button onClick={() => setPaywallOpen(true)}>Upgrade</Button>
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-4 space-y-4">
              {!formOpen && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setFormOpen(true)} className="h-8 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> New entry
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} className="h-8 text-xs text-muted-foreground">
                    <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
                  </Button>
                </div>
              )}
              {formOpen && (
                <NewEntryForm
                  commodities={commodities.map((c) => ({ name: c.name, price: c.price }))}
                  usdToEur={usdToEur}
                  onSaved={() => {
                    setFormOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['basis_entries', userId] });
                  }}
                  onClose={() => setFormOpen(false)}
                />
              )}

              {entriesQuery.isLoading || commoditiesLoading ? (
                <p className="text-xs text-muted-foreground font-mono">loading…</p>
              ) : entries.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">
                  No entries yet. Click <span className="text-foreground">New entry</span> to log your first basis reading.
                </p>
              ) : (
                <>
                  {groupKeys.length > 1 && (
                    <Select value={activeGroup ?? undefined} onValueChange={setGroupFilter}>
                      <SelectTrigger className="h-9 font-mono text-xs w-full sm:w-72"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {groupKeys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}

                  {chartData.length > 1 && (
                    <div className="border border-border rounded-md bg-card/30 p-2 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip content={<BasisTooltip />} />
                          <Line type="monotone" dataKey="basis" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="grid grid-cols-[80px_1fr_1fr_70px_70px_70px_72px_auto] gap-2 px-3 py-1.5 bg-muted/30 border-b border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Date</span>
                      <span>Commodity</span>
                      <span>Location</span>
                      <span className="text-right">Cash</span>
                      <span className="text-right">Fut.</span>
                      <span className="text-right">Basis</span>
                      <span>Unit</span>
                      <span />
                    </div>
                    {entries.map((e) => (
                      <div key={e.id} className="grid grid-cols-[80px_1fr_1fr_70px_70px_70px_72px_auto] gap-2 px-3 py-2 border-b border-border/60 last:border-0 items-center hover:bg-muted/40 group">
                        <span className="font-mono text-[11px] text-muted-foreground">{e.entry_date}</span>
                        <span className="text-sm truncate">{e.commodity_name}</span>
                        <span className="text-sm text-muted-foreground truncate">{e.location}</span>
                        <span className="font-mono text-xs text-right tabular-nums">{fmtMoney(e.cash_price)}</span>
                        <span className="font-mono text-xs text-right tabular-nums text-muted-foreground">{fmtMoney(e.futures_price)}</span>
                        <span className={cn('font-mono text-xs text-right tabular-nums font-medium', e.basis >= 0 ? 'text-success' : 'text-destructive')}>
                          {e.basis >= 0 ? '+' : ''}{fmtMoney(e.basis)}
                        </span>
                        <span
                          className="font-mono text-[10px] text-muted-foreground truncate"
                          title={e.fx_rate ? `USD→EUR ${e.fx_rate} at entry` : undefined}
                        >
                          {unitLabel(e.price_unit as PriceUnit, e.commodity_name)}
                        </span>
                        <button
                          onClick={() => deleteMutation.mutate(e.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity justify-self-end"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <TraderCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="basis"
        knownCommodities={commodities.map((c) => c.name)}
        usdToEur={usdToEur}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['basis_entries', userId] })}
      />
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default BasisTracker;
