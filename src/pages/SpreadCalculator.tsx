import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Plus, Trash2, Save, X, Activity, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import {
  SPREAD_PRESETS, computeSpread, computeCustomSpread,
  type CustomSpreadFormula, type SpreadLeg,
} from '@/utils/spreadFormulas';
import { limitsFor } from '@/utils/tiers';
import PremiumPaywall from '@/components/PremiumPaywall';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Terminal-style atoms                                              */
/* ------------------------------------------------------------------ */

const fmt = (v: number | null, unit: string) => {
  if (v == null || !Number.isFinite(v)) return '—';
  if (unit === 'ratio') return v.toFixed(3);
  return v.toFixed(2);
};

const tickClass = (delta: number | null) =>
  delta == null || delta === 0
    ? 'text-muted-foreground'
    : delta > 0
      ? 'text-success'
      : 'text-destructive';

interface SavedSpread {
  id: string;
  name: string;
  formula: CustomSpreadFormula;
}

/* ------------------------------------------------------------------ */
/*  Row component — shows tick direction by remembering previous value */
/* ------------------------------------------------------------------ */

const SpreadRow: React.FC<{
  ticker: string;
  name: string;
  unit: string;
  value: number | null;
  description?: string;
  onDelete?: () => void;
}> = ({ ticker, name, unit, value, description, onDelete }) => {
  const prev = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && prev.current !== value) {
      setDelta(value - prev.current);
    }
    prev.current = value;
  }, [value]);

  return (
    <div className="grid grid-cols-[88px_1fr_auto_auto] sm:grid-cols-[100px_1fr_120px_120px_auto] items-center gap-3 px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 transition-colors group">
      <span className="font-mono text-[11px] tracking-wider text-warning uppercase">{ticker}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground truncate hidden sm:block">{description}</div>
        )}
      </div>
      <span className="font-mono text-xs text-muted-foreground hidden sm:inline">{unit}</span>
      <div className={cn('font-mono text-base sm:text-lg tabular-nums text-right flex items-center justify-end gap-1', tickClass(delta))}>
        {delta != null && delta !== 0 && (
          delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        )}
        <span>
          {unit !== 'ratio' && value != null && <span className="text-muted-foreground/60 mr-0.5">$</span>}
          {fmt(value, unit)}
        </span>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          aria-label="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Custom spread builder                                             */
/* ------------------------------------------------------------------ */

const emptyLeg = (): SpreadLeg => ({ match: [''], weight: 1 });

const CustomSpreadBuilder: React.FC<{
  commodityNames: string[];
  onSaved: () => void;
  onClose: () => void;
}> = ({ commodityNames, onSaved, onClose }) => {
  const [name, setName] = useState('');
  const [op, setOp] = useState<'sum' | 'ratio'>('sum');
  const [unit, setUnit] = useState('$');
  const [legs, setLegs] = useState<SpreadLeg[]>([emptyLeg(), { match: [''], weight: -1 }]);
  const [saving, setSaving] = useState(false);

  const updateLeg = (i: number, patch: Partial<SpreadLeg>) =>
    setLegs((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleSave = async () => {
    if (!name.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    const cleanLegs = legs.filter((l) => l.match[0]?.trim());
    if (op === 'sum' && cleanLegs.length < 2) {
      return toast({ title: 'Sum spreads need ≥ 2 legs', variant: 'destructive' });
    }
    if (op === 'ratio' && cleanLegs.length !== 2) {
      return toast({ title: 'Ratio spreads need exactly 2 legs', variant: 'destructive' });
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast({ title: 'Sign in required', variant: 'destructive' });
    setSaving(true);
    const formula: CustomSpreadFormula = {
      op,
      unit: op === 'ratio' ? 'ratio' : unit,
      legs: cleanLegs.map((l) => ({ match: [l.match[0].toLowerCase()], weight: Number(l.weight) || 0 })),
    };
    const { error } = await supabase.from('user_spreads').insert({
      user_id: u.user.id,
      name: name.trim(),
      formula: formula as unknown as never,
    });
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Spread saved' });
    onSaved();
  };

  return (
    <div className="border border-border bg-card/50 rounded-md">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="font-mono text-[11px] uppercase tracking-wider text-warning">New Spread</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px] gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WTI–Dubai" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Operation</Label>
            <Select value={op} onValueChange={(v) => setOp(v as 'sum' | 'ratio')}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Weighted sum</SelectItem>
                <SelectItem value="ratio">A / B ratio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Unit</Label>
            <Input value={op === 'ratio' ? 'ratio' : unit} onChange={(e) => setUnit(e.target.value)} disabled={op === 'ratio'} className="h-9 font-mono text-sm" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Legs</Label>
          {legs.map((leg, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2 items-center">
              <Select
                value={leg.match[0] || ''}
                onValueChange={(v) => updateLeg(i, { match: [v] })}
              >
                <SelectTrigger className="h-9 font-mono text-xs"><SelectValue placeholder="Pick commodity" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {commodityNames.map((n) => (
                    <SelectItem key={n} value={n.toLowerCase()}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="any"
                value={leg.weight}
                onChange={(e) => updateLeg(i, { weight: Number(e.target.value) })}
                disabled={op === 'ratio'}
                placeholder="Weight"
                className="h-9 font-mono text-xs"
              />
              <button
                onClick={() => setLegs((arr) => arr.filter((_, idx) => idx !== i))}
                disabled={legs.length <= 2}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {op === 'sum' && (
            <Button variant="ghost" size="sm" onClick={() => setLegs((arr) => [...arr, emptyLeg()])} className="h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add leg
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="w-3.5 h-3.5 mr-1.5" /> Save spread
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

const SpreadCalculator: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const limits = limitsFor(tier);
  const queryClient = useQueryClient();
  const { data: commodities = [], isLoading, dataUpdatedAt } = useAvailableCommodities({ lightweight: true });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const priceFeed = useMemo(
    () => commodities.map((c) => ({ name: c.name, price: c.price })),
    [commodities],
  );

  const visiblePresets = useMemo(
    () => SPREAD_PRESETS.slice(0, Number.isFinite(limits.spreadPresets) ? limits.spreadPresets : SPREAD_PRESETS.length),
    [limits.spreadPresets],
  );

  const computedPresets = useMemo(
    () => visiblePresets.map((p) => ({ preset: p, value: computeSpread(p, priceFeed) })),
    [visiblePresets, priceFeed],
  );

  const lockedCount = SPREAD_PRESETS.length - visiblePresets.length;

  /* ---------- Custom spreads (Pro) ---------- */

  const userId = auth?.user?.id ?? null;
  const customQuery = useQuery({
    queryKey: ['user_spreads', userId],
    enabled: !!userId && limits.customSpreads,
    queryFn: async (): Promise<SavedSpread[]> => {
      const { data, error } = await supabase
        .from('user_spreads')
        .select('id, name, formula')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedSpread[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_spreads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_spreads', userId] });
      toast({ title: 'Spread removed' });
    },
  });

  const customComputed = useMemo(
    () =>
      (customQuery.data ?? []).map((s) => ({
        spread: s,
        value: computeCustomSpread(s.formula, priceFeed),
      })),
    [customQuery.data, priceFeed],
  );

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const timeStr = now.toISOString().slice(11, 19) + ' UTC';

  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        {/* Terminal header bar */}
        <div className="border border-border rounded-md overflow-hidden bg-card/40">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-success" />
              <span className="text-warning">SPRD</span>
              <span className="text-muted-foreground hidden sm:inline">› spread.terminal</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">
                LAST {lastUpdate ? lastUpdate.toISOString().slice(11, 19) : '—'}
              </span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', isLoading ? 'bg-warning animate-pulse' : 'bg-success')} />
                {timeStr}
              </span>
            </div>
          </div>

          <div className="px-3 py-3 sm:px-4">
            <h1 className="font-mono text-xl sm:text-2xl font-semibold tracking-tight">SPREAD TERMINAL</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Live derived prices · crack margins · ratios · benchmark differentials
            </p>
          </div>

          {/* Column header */}
          <div className="grid grid-cols-[88px_1fr_auto_auto] sm:grid-cols-[100px_1fr_120px_120px_auto] gap-3 px-3 py-1.5 border-y border-border bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Code</span>
            <span>Instrument</span>
            <span className="hidden sm:block">Unit</span>
            <span className="text-right">Last</span>
            <span />
          </div>

          {/* Preset rows */}
          {computedPresets.map(({ preset, value }) => (
            <SpreadRow
              key={preset.id}
              ticker={preset.id.replace(/-/g, '').slice(0, 8)}
              name={preset.name}
              unit={preset.unit}
              description={preset.description}
              value={value}
            />
          ))}

          {/* Custom rows */}
          {limits.customSpreads && customComputed.map(({ spread, value }) => (
            <SpreadRow
              key={spread.id}
              ticker={'U.' + spread.name.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase()}
              name={spread.name}
              unit={spread.formula?.unit ?? '$'}
              description="Custom"
              value={value}
              onDelete={() => deleteMutation.mutate(spread.id)}
            />
          ))}

          {isLoading && (
            <div className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
              loading market feed…
            </div>
          )}
        </div>

        {/* Custom spreads section */}
        <div className="mt-6 border border-border rounded-md bg-card/40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <span className="font-mono text-[11px] uppercase tracking-wider text-warning">Custom Spreads</span>
            {limits.customSpreads ? (
              !builderOpen && (
                <Button size="sm" variant="ghost" onClick={() => setBuilderOpen(true)} className="h-7 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> New
                </Button>
              )
            ) : (
              <Button size="sm" onClick={() => setPaywallOpen(true)} className="h-7 text-xs">
                <Lock className="w-3 h-3 mr-1" /> Pro
              </Button>
            )}
          </div>
          <div className="p-3">
            {limits.customSpreads ? (
              builderOpen ? (
                <CustomSpreadBuilder
                  commodityNames={commodities.map((c) => c.name)}
                  onSaved={() => {
                    setBuilderOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['user_spreads', userId] });
                  }}
                  onClose={() => setBuilderOpen(false)}
                />
              ) : customComputed.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">
                  No saved spreads. Click <span className="text-foreground">New</span> to build one
                  from any combination of live legs.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">
                  {customComputed.length} custom spread{customComputed.length > 1 ? 's' : ''} streaming above.
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Build your own spreads with any combination of legs and weights. Upgrade to Pro to unlock.
              </p>
            )}
          </div>
        </div>

        {lockedCount > 0 && (
          <div className="mt-6 border border-primary/30 bg-primary/5 rounded-md p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">
                {lockedCount} more preset{lockedCount > 1 ? 's' : ''} on {tier === 'free' ? 'Premium' : 'Pro'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {tier === 'free'
                  ? 'Unlock 3:2:1 crack, soybean crush, gold/silver ratio, and gas/oil parity.'
                  : 'Upgrade to Pro to build custom spreads with your own formulas.'}
              </p>
            </div>
            <Button onClick={() => setPaywallOpen(true)}>Upgrade</Button>
          </div>
        )}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default SpreadCalculator;