import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, ReferenceLine } from 'recharts';
import { Play, Save, Trash2, Upload, FolderOpen } from 'lucide-react';
import { PRO_ANALYTICS_PRODUCTS } from '@/hooks/useProAnalytics';
import {
  useRunStrategyBacktest,
  useSavedStrategies,
  useCreateStrategy,
  useDeleteStrategy,
  type StrategyBacktestResult,
} from '@/hooks/useStrategyBacktest';

const STARTER_CODE = `function backtest(bars) {
  // bars: [{ date, a, b }, ...] — daily closes for leg A and leg B, aligned
  // on their common dates. Return one signal per bar: 1 = long the spread
  // (long A / short B), -1 = short the spread, 0 = flat. signals[0] is
  // ignored (no prior bar to compare against).
  return bars.map((bar, i) => {
    if (i === 0) return 0;
    return bar.a > bars[i - 1].a ? 1 : -1;
  });
}`;

const CONTRACT_NOTES = [
  'Must define a top-level function backtest(bars) returning an array of -1|0|1, same length as bars.',
  'Runs in an isolated sandbox with no network/file/Deno access — pure computation on the bars you get only.',
  '~2s CPU budget and ~16MB memory; a runaway loop or excessive memory is killed automatically.',
  'signals[i] is applied to the return from bars[i-1] to bars[i] (so it may see bars[i]’s own close — not strictly point-in-time, keep that in mind when judging results).',
];

const CustomStrategyPanel: React.FC = () => {
  const [legA, setLegA] = useState('wti');
  const [legB, setLegB] = useState('brent');
  const [weightA, setWeightA] = useState('1');
  const [weightB, setWeightB] = useState('-1');
  const [years, setYears] = useState(10);
  const [code, setCode] = useState(STARTER_CODE);
  const [strategyName, setStrategyName] = useState('');
  const [result, setResult] = useState<StrategyBacktestResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runBacktest = useRunStrategyBacktest();
  const savedStrategies = useSavedStrategies();
  const createStrategy = useCreateStrategy();
  const deleteStrategy = useDeleteStrategy();

  const run = () => {
    setRunError(null);
    runBacktest.mutate(
      { code, legA, legB, weightA: Number(weightA) || 0, weightB: Number(weightB) || 0, years },
      { onSuccess: setResult, onError: (err: Error) => setRunError(err.message) },
    );
  };

  const runSaved = (id: string) => {
    setRunError(null);
    runBacktest.mutate({ strategyId: id }, { onSuccess: setResult, onError: (err: Error) => setRunError(err.message) });
  };

  const loadSaved = (s: { name: string; code: string; leg_a: string; leg_b: string; weight_a: number; weight_b: number; years: number }) => {
    setStrategyName(s.name);
    setCode(s.code);
    setLegA(s.leg_a);
    setLegB(s.leg_b);
    setWeightA(String(s.weight_a));
    setWeightB(String(s.weight_b));
    setYears(s.years);
    setResult(null);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCode(String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const save = () => {
    if (!strategyName.trim()) return;
    createStrategy.mutate({ name: strategyName.trim(), code, legA, legB, weightA: Number(weightA) || 0, weightB: Number(weightB) || 0, years });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Long/short a two-leg spread using your own JS rule instead of the built-in seasonality rule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-44">
              <label className="text-xs text-muted-foreground">Leg A (long side sign)</label>
              <Select value={legA} onValueChange={setLegA}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRO_ANALYTICS_PRODUCTS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Weight A</label>
              <Input value={weightA} onChange={(e) => setWeightA(e.target.value)} inputMode="decimal" />
            </div>
            <div className="w-44">
              <label className="text-xs text-muted-foreground">Leg B</label>
              <Select value={legB} onValueChange={setLegB}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRO_ANALYTICS_PRODUCTS.filter((p) => p.id !== legA).map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Weight B</label>
              <Input value={weightB} onChange={(e) => setWeightB(e.target.value)} inputMode="decimal" />
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">History</label>
              <Select value={String(years)} onValueChange={(v) => setYears(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 15, 20].map((y) => (<SelectItem key={y} value={String(y)}>{y} years</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Strategy code</label>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept=".js,text/javascript" className="hidden" onChange={onUpload} />
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload .js
                </Button>
              </div>
            </div>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={14}
              spellCheck={false}
              className="font-mono text-xs"
            />
            <ul className="text-[11px] text-muted-foreground list-disc pl-4 mt-1.5 space-y-0.5">
              {CONTRACT_NOTES.map((note) => (<li key={note}>{note}</li>))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" onClick={run} disabled={runBacktest.isPending || legA === legB}>
              <Play className="w-4 h-4 mr-2" /> {runBacktest.isPending ? 'Running…' : 'Run backtest'}
            </Button>
            <Input
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              placeholder="Name this strategy to save it"
              className="w-56 h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={save} disabled={!strategyName.trim() || createStrategy.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save
            </Button>
          </div>
          {legA === legB && <p className="text-xs text-destructive">Leg A and Leg B must be different commodities.</p>}
        </CardContent>
      </Card>

      {(savedStrategies.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4" /> My strategies</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {savedStrategies.data!.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{s.leg_a} / {s.leg_b}</span>
                  {s.last_result && (
                    <span className={`text-xs ml-2 ${s.last_result.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      last run: {s.last_result.totalPnl >= 0 ? '+' : ''}{s.last_result.totalPnl.toFixed(2)} pts
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => loadSaved(s)}>Load</Button>
                  <Button size="sm" variant="ghost" onClick={() => runSaved(s.id)} disabled={runBacktest.isPending}>Run</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteStrategy.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {runError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{runError}</CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card><CardHeader className="pb-2"><CardDescription>Total P&amp;L</CardDescription></CardHeader><CardContent>
              <div className={`text-2xl font-bold ${result.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{result.totalPnl >= 0 ? '+' : ''}{result.totalPnl.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">spread pts · B&H: {result.buyHoldPnl >= 0 ? '+' : ''}{result.buyHoldPnl.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Sharpe</CardDescription></CardHeader><CardContent>
              <div className="text-2xl font-bold">{result.sharpe ?? '—'}</div>
              <p className="text-xs text-muted-foreground mt-1">annualized</p>
            </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Max drawdown</CardDescription></CardHeader><CardContent>
              <div className="text-2xl font-bold text-yellow-400">{result.maxDrawdown.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">spread pts, peak-to-trough</p>
            </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Hit rate</CardDescription></CardHeader><CardContent>
              <div className="text-2xl font-bold">{Math.round(result.hitRate * 100)}%</div>
              <p className="text-xs text-muted-foreground mt-1">{result.trades} trades over {result.bars} bars</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardDescription>Equity curve ({result.legALabel} / {result.legBLabel}, spread points)</CardDescription></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.equityCurve}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={60} />
                    <YAxis tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default CustomStrategyPanel;
