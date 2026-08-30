import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Plus, Trash2, Shield, X, CheckCircle2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  CONTRACT_SIZES, futuresLotsToPhysical, hedgeRatio, type PhysicalUnit,
} from '@/utils/hedgeMath';

interface HedgedPosition {
  id: string;
  commodity_name: string;
  location: string;
  physical_side: string;
  physical_quantity: number;
  physical_unit: string;
  cash_price: number;
  futures_contract_month: string | null;
  futures_lots: number;
  futures_price: number | null;
  price_unit: string;
  fx_rate: number | null;
  opened_date: string;
  closed_date: string | null;
  notes: string | null;
}

const fmt = (v: number | null, dp = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(dp));

/* ------------------------------------------------------------------ */
/*  New position form                                                 */
/* ------------------------------------------------------------------ */

const NewPositionForm: React.FC<{
  commodities: { name: string; price: number }[];
  usdToEur: number | undefined;
  onSaved: () => void;
  onClose: () => void;
}> = ({ commodities, usdToEur, onSaved, onClose }) => {
  const [commodityName, setCommodityName] = useState('');
  const [location, setLocation] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [quantity, setQuantity] = useState('');
  const [physicalUnit, setPhysicalUnit] = useState<PhysicalUnit>('tonne');
  const [cashPrice, setCashPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('native');
  const [contractMonth, setContractMonth] = useState('');
  const [lots, setLots] = useState('');
  const [openedDate, setOpenedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const nativeFutures = commodities.find((c) => c.name === commodityName)?.price ?? null;
  const unitOptions = commodityName ? availableUnits(commodityName) : (['native'] as PriceUnit[]);
  const effectiveUnit: PriceUnit = unitOptions.includes(priceUnit) ? priceUnit : 'native';
  const convertedFutures =
    nativeFutures != null && commodityName
      ? convertFuturesQuote(commodityName, nativeFutures, effectiveUnit, usdToEur)
      : null;

  const qty = Number(quantity);
  const lotsNum = Number(lots) || 0;
  const hedgedQty = commodityName
    ? futuresLotsToPhysical(commodityName, lotsNum, physicalUnit)
    : null;
  const ratio = hedgedQty != null && Number.isFinite(qty) && qty > 0 ? hedgeRatio(hedgedQty, qty) : null;

  const handleSave = async () => {
    if (!commodityName) return toast({ title: 'Pick a commodity', variant: 'destructive' });
    if (!location.trim()) return toast({ title: 'Location required', variant: 'destructive' });
    if (!Number.isFinite(qty) || qty <= 0) return toast({ title: 'Enter a physical quantity', variant: 'destructive' });
    if (!Number.isFinite(Number(cashPrice)) || Number(cashPrice) <= 0) {
      return toast({ title: 'Enter a valid cash price', variant: 'destructive' });
    }
    if (lotsNum > 0 && convertedFutures == null) {
      return toast({
        title: 'Cannot price the futures leg',
        description: `No ${unitLabel(effectiveUnit, commodityName)} conversion available for ${commodityName}.`,
        variant: 'destructive',
      });
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast({ title: 'Sign in required', variant: 'destructive' });

    setSaving(true);
    const { error } = await supabase.from('hedged_positions').insert({
      user_id: u.user.id,
      commodity_name: commodityName,
      location: location.trim(),
      physical_side: side,
      physical_quantity: qty,
      physical_unit: physicalUnit,
      cash_price: Number(cashPrice),
      futures_contract_month: contractMonth.trim() || null,
      futures_lots: lotsNum,
      // DB CHECK requires a price whenever lots > 0.
      futures_price: lotsNum > 0 ? convertedFutures : null,
      price_unit: effectiveUnit,
      fx_rate: effectiveUnit === 'EUR/t' ? (usdToEur ?? null) : null,
      opened_date: openedDate,
    });
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Position saved' });
    onSaved();
  };

  return (
    <div className="border border-border bg-card/50 rounded-md">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="font-mono text-[11px] uppercase tracking-wider text-warning">New Position</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Commodity</Label>
            <Select value={commodityName} onValueChange={setCommodityName}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue placeholder="Pick commodity" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {commodities.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rotterdam" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Physical side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as 'long' | 'short')}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="long">Long — bought physical</SelectItem>
                <SelectItem value="short">Short — sold forward</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Quantity</Label>
            <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Qty unit</Label>
            <Select value={physicalUnit} onValueChange={(v) => setPhysicalUnit(v as PhysicalUnit)}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tonne">tonnes</SelectItem>
                <SelectItem value="bushel">bushels</SelectItem>
                <SelectItem value="short-ton">short tons</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Price basis</Label>
            <Select value={effectiveUnit} onValueChange={(v) => setPriceUnit(v as PriceUnit)} disabled={!commodityName}>
              <SelectTrigger className="h-9 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {unitOptions.map((u) => <SelectItem key={u} value={u}>{unitLabel(u, commodityName)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cash price</Label>
            <Input type="number" step="any" value={cashPrice} onChange={(e) => setCashPrice(e.target.value)} placeholder="0.00" className="h-9 font-mono text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Futures lots</Label>
            <Input type="number" step="any" value={lots} onChange={(e) => setLots(e.target.value)} placeholder="0" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Contract month</Label>
            <Input value={contractMonth} onChange={(e) => setContractMonth(e.target.value)} placeholder="e.g. Dec 2026" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Futures price</Label>
            <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/30 font-mono text-sm text-muted-foreground">
              {convertedFutures != null ? fmt(convertedFutures) : '—'}
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Opened</Label>
            <Input type="date" value={openedDate} onChange={(e) => setOpenedDate(e.target.value)} className="h-9 font-mono text-sm" />
          </div>
        </div>

        {commodityName && CONTRACT_SIZES[commodityName] && (
          <p className="font-mono text-[11px] text-muted-foreground">
            1 lot = {CONTRACT_SIZES[commodityName].size.toLocaleString()} {CONTRACT_SIZES[commodityName].unit}
            {lotsNum > 0 && hedgedQty != null && (
              <> · {lotsNum} lot{lotsNum === 1 ? '' : 's'} ≈ {fmt(hedgedQty, 1)} {physicalUnit}</>
            )}
            {ratio != null && (
              <> · hedge ratio <span className={cn('font-medium', Math.abs(ratio - 1) <= 0.05 ? 'text-success' : 'text-warning')}>{(ratio * 100).toFixed(0)}%</span></>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Save position
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

const HedgeBook: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = (auth?.tier ?? 'free') === 'pro';
  const queryClient = useQueryClient();
  const userId = auth?.user?.id ?? null;

  const { data: commodities = [] } = useAvailableCommodities({ lightweight: true });
  const { rates } = useCurrency();
  const usdToEur = rates?.EUR;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const positionsQuery = useQuery({
    queryKey: ['hedged_positions', userId],
    enabled: !!userId && isPro,
    queryFn: async (): Promise<HedgedPosition[]> => {
      const { data, error } = await supabase
        .from('hedged_positions')
        .select('id, commodity_name, location, physical_side, physical_quantity, physical_unit, cash_price, futures_contract_month, futures_lots, futures_price, price_unit, fx_rate, opened_date, closed_date, notes')
        .order('opened_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as HedgedPosition[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hedged_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hedged_positions', userId] });
      toast({ title: 'Position removed' });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hedged_positions')
        .update({ closed_date: new Date().toISOString().slice(0, 10) })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hedged_positions', userId] });
      toast({ title: 'Position closed' });
    },
  });

  const positions = useMemo(() => positionsQuery.data ?? [], [positionsQuery.data]);
  const visible = useMemo(
    () => positions.filter((p) => (showClosed ? true : !p.closed_date)),
    [positions, showClosed],
  );

  // Net unhedged exposure per commodity+unit. Only open positions count —
  // a closed position carries no risk. Long physical is positive exposure,
  // short physical negative; futures offset in the opposite direction.
  const exposure = useMemo(() => {
    const map = new Map<string, { commodity: string; unit: string; net: number }>();
    for (const p of positions) {
      if (p.closed_date) continue;
      const hedged = futuresLotsToPhysical(p.commodity_name, p.futures_lots, p.physical_unit as PhysicalUnit) ?? 0;
      const signed = p.physical_side === 'long' ? p.physical_quantity - hedged : -(p.physical_quantity - hedged);
      const key = `${p.commodity_name}|${p.physical_unit}`;
      const cur = map.get(key) ?? { commodity: p.commodity_name, unit: p.physical_unit, net: 0 };
      cur.net += signed;
      map.set(key, cur);
    }
    return Array.from(map.values()).filter((e) => Math.abs(e.net) > 0.001);
  }, [positions]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="border border-border rounded-md overflow-hidden bg-card/40">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-success" />
              <span className="text-warning">HEDGE</span>
              <span className="text-muted-foreground hidden sm:inline">› hedge.book</span>
            </div>
          </div>

          <div className="px-3 py-3 sm:px-4">
            <h1 className="font-mono text-xl sm:text-2xl font-semibold tracking-tight">HEDGE BOOK</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Physical positions and the futures hedged against them. Shows hedge ratio and net unhedged
              exposure — what's left after the futures leg offsets the physical.
            </p>
          </div>

          {!isPro ? (
            <div className="p-4">
              <div className="border border-primary/30 bg-primary/5 rounded-md p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Hedge Book is a Pro feature</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Track physical positions against their futures hedges, with hedge ratio and net exposure.
                  </p>
                </div>
                <Button onClick={() => setPaywallOpen(true)}>Upgrade</Button>
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-4 space-y-4">
              {exposure.length > 0 && (
                <div className="border border-border rounded-md bg-card/30">
                  <div className="px-3 py-1.5 border-b border-border bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Net unhedged exposure · open positions
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 px-3 py-2.5">
                    {exposure.map((e) => (
                      <div key={`${e.commodity}|${e.unit}`} className="font-mono text-xs">
                        <span className="text-muted-foreground">{e.commodity}</span>{' '}
                        <span className={cn('font-medium', e.net > 0 ? 'text-success' : 'text-destructive')}>
                          {e.net > 0 ? '+' : ''}{fmt(e.net, 1)}
                        </span>{' '}
                        <span className="text-muted-foreground/70">{e.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {!formOpen && (
                  <Button size="sm" variant="ghost" onClick={() => setFormOpen(true)} className="h-8 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> New position
                  </Button>
                )}
                {!formOpen && (
                  <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} className="h-8 text-xs text-muted-foreground">
                    <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setShowClosed((s) => !s)} className="h-8 text-xs text-muted-foreground">
                  {showClosed ? 'Hide closed' : 'Show closed'}
                </Button>
              </div>

              {formOpen && (
                <NewPositionForm
                  commodities={commodities.map((c) => ({ name: c.name, price: c.price }))}
                  usdToEur={usdToEur}
                  onSaved={() => {
                    setFormOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['hedged_positions', userId] });
                  }}
                  onClose={() => setFormOpen(false)}
                />
              )}

              {positionsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground font-mono">loading…</p>
              ) : visible.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">
                  {positions.length === 0
                    ? <>No positions yet. Click <span className="text-foreground">New position</span> to add one.</>
                    : 'No open positions. Toggle "Show closed" to see history.'}
                </p>
              ) : (
                <div className="border border-border rounded-md overflow-x-auto">
                  <div className="min-w-[860px]">
                    <div className="grid grid-cols-[76px_1fr_90px_56px_92px_92px_64px_72px_auto] gap-2 px-3 py-1.5 bg-muted/30 border-b border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Opened</span>
                      <span>Commodity</span>
                      <span>Location</span>
                      <span>Side</span>
                      <span className="text-right">Physical</span>
                      <span className="text-right">Hedged</span>
                      <span className="text-right">Ratio</span>
                      <span className="text-right">Basis</span>
                      <span />
                    </div>
                    {visible.map((p) => {
                      const hedged = futuresLotsToPhysical(p.commodity_name, p.futures_lots, p.physical_unit as PhysicalUnit);
                      const ratio = hedged != null ? hedgeRatio(hedged, p.physical_quantity) : null;
                      const basis = p.futures_price != null ? p.cash_price - p.futures_price : null;
                      return (
                        <div key={p.id} className={cn(
                          'grid grid-cols-[76px_1fr_90px_56px_92px_92px_64px_72px_auto] gap-2 px-3 py-2 border-b border-border/60 last:border-0 items-center hover:bg-muted/40 group',
                          p.closed_date && 'opacity-50',
                        )}>
                          <span className="font-mono text-[11px] text-muted-foreground">{p.opened_date}</span>
                          <span className="text-sm truncate">{p.commodity_name}</span>
                          <span className="text-sm text-muted-foreground truncate">{p.location}</span>
                          <span className={cn('font-mono text-[11px] uppercase', p.physical_side === 'long' ? 'text-success' : 'text-destructive')}>
                            {p.physical_side}
                          </span>
                          <span className="font-mono text-xs text-right tabular-nums">
                            {fmt(p.physical_quantity, 1)}<span className="text-muted-foreground/60 ml-1">{p.physical_unit === 'short-ton' ? 'st' : p.physical_unit === 'bushel' ? 'bu' : 't'}</span>
                          </span>
                          <span className="font-mono text-xs text-right tabular-nums text-muted-foreground">
                            {hedged != null ? fmt(hedged, 1) : '—'}
                            {p.futures_lots > 0 && <span className="text-muted-foreground/60 ml-1">({fmt(p.futures_lots, 0)}L)</span>}
                          </span>
                          <span className={cn(
                            'font-mono text-xs text-right tabular-nums font-medium',
                            ratio == null ? 'text-muted-foreground'
                              : Math.abs(ratio - 1) <= 0.05 ? 'text-success'
                              : 'text-warning',
                          )}>
                            {ratio != null ? `${(ratio * 100).toFixed(0)}%` : '—'}
                          </span>
                          <span className="font-mono text-xs text-right tabular-nums" title={unitLabel(p.price_unit as PriceUnit, p.commodity_name)}>
                            {basis != null ? `${basis >= 0 ? '+' : ''}${fmt(basis)}` : '—'}
                          </span>
                          <div className="flex items-center gap-1.5 justify-self-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {!p.closed_date && (
                              <button onClick={() => closeMutation.mutate(p.id)} className="text-muted-foreground hover:text-success" aria-label="Close position" title="Mark closed">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => deleteMutation.mutate(p.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete position">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <TraderCsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="hedge"
        knownCommodities={commodities.map((c) => c.name)}
        usdToEur={usdToEur}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['hedged_positions', userId] })}
      />
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default HedgeBook;
