import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Lock, Info, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceDot,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useForwardCurve } from '@/hooks/useForwardCurve';
import { CURVE_COMMODITIES } from '@/utils/forwardCurveSymbols';
import PremiumPaywall from '@/components/PremiumPaywall';

const ForwardCurves: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [commodity, setCommodity] = useState<string>('wti');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useForwardCurve(isPro ? commodity : null);

  const structureColor = data?.structure === 'contango' ? 'text-orange-500'
    : data?.structure === 'backwardation' ? 'text-emerald-500'
    : 'text-muted-foreground';

  const StructureIcon = data?.structure === 'backwardation' ? TrendingDown
    : data?.structure === 'contango' ? TrendingUp : Activity;

  const m1 = data?.m1 ?? null;
  const spot = data?.spot ?? null;

  const chartData = useMemo(() => {
    return (data?.curve ?? []).map((p, idx) => ({
      name: p.expiry.slice(2).replace('-', '/'),
      label: `M${idx + 1}`,
      symbol: p.symbol,
      price: p.price,
      basis: m1 != null ? +(p.price - m1).toFixed(4) : null,
      basisPct: m1 != null ? +(((p.price - m1) / m1) * 100).toFixed(2) : null,
    }));
  }, [data, m1]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    const prices = chartData.map((d) => d.price).filter((v): v is number => typeof v === 'number');
    if (!prices.length) return undefined;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max((max - min) * 0.15, max * 0.005);
    return [+(min - pad).toFixed(2), +(max + pad).toFixed(2)];
  }, [chartData]);

  const lineColor = data?.structure === 'backwardation' ? '#10b981'
    : data?.structure === 'contango' ? '#f59e0b'
    : '#fbbf24';

  const errorMessage = error instanceof Error && error.message === 'Authentication required'
    ? 'Your session expired. Please sign in again to load Pro forward curves.'
    : 'No settlement curve available right now. The latest session may not be settled yet.';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Forward Curves
              <Badge variant="default" className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
              {data?.source === 'market' && (
                <Badge variant="outline" className="ml-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Live EOD</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real CME/CBOT/COMEX/NYMEX settlement strip across the next 12 monthly contracts.
            </p>
          </div>
        </div>

        {isPro && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-start gap-2 text-xs">
            <Info className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">End-of-day settlement curve</span>{' '}
              from CME/NYMEX/COMEX/CBOT via Massive Futures. Refreshes after each
              US futures settlement (~17:00 CT). Contracts without a settlement
              price for the latest session are omitted.
            </div>
          </div>
        )}

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Forward curves are a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  See the full futures strip, contango/backwardation status, and roll yield across all major commodities.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="w-full max-w-xs">
                <Select value={commodity} onValueChange={setCommodity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURVE_COMMODITIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading curve…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  {errorMessage}
                </CardContent>
              </Card>
            )}

            {data && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Structure</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`flex items-center gap-2 text-2xl font-bold capitalize ${structureColor}`}>
                        <StructureIcon className="w-6 h-6" />
                        {data.structure}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {data.structure === 'contango' && 'Future prices > front month — storage costs / oversupply.'}
                        {data.structure === 'backwardation' && 'Future prices < front month — tight supply / strong demand.'}
                        {data.structure === 'flat' && 'No clear directional bias.'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>M1 → M2 Roll Yield</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${data.rollYield && data.rollYield > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                        {data.rollYield != null ? `${data.rollYield.toFixed(2)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Annualised: {data.rollYield != null ? `${(data.rollYield * 12).toFixed(1)}%` : '—'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>M1 / M2 Settlement</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        ${data.m1?.toFixed(2) ?? '—'} <span className="text-muted-foreground text-base">→</span> ${data.m2?.toFixed(2) ?? '—'}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-amber-500/20 bg-[#07090d] text-amber-50 shadow-2xl shadow-amber-500/5 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-amber-500/15 bg-[#0b0f15] px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400/80">
                    <span>{data.label} · Forward Curve</span>
                    <span className="hidden sm:inline">{data.curve.length} contracts · USD</span>
                    <span>Settlement {data.asOf}</span>
                  </div>

                  <CardContent className="h-96 px-2 sm:px-4 pt-4 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 4, bottom: 8 }}>
                        <defs>
                          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(245,158,11,0.08)" strokeDasharray="2 4" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="rgba(245,158,11,0.5)"
                          tick={{ fill: 'rgba(245,158,11,0.7)', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          tickLine={false}
                          axisLine={{ stroke: 'rgba(245,158,11,0.25)' }}
                        />
                        <YAxis
                          orientation="right"
                          stroke="rgba(245,158,11,0.5)"
                          tick={{ fill: 'rgba(245,158,11,0.7)', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          tickLine={false}
                          axisLine={false}
                          domain={yDomain as any}
                          tickFormatter={(v: number) => v.toFixed(2)}
                          width={56}
                        />
                        <Tooltip
                          cursor={{ stroke: 'rgba(245,158,11,0.35)', strokeDasharray: '3 3' }}
                          contentStyle={{
                            background: '#0b0f15',
                            border: '1px solid rgba(245,158,11,0.4)',
                            borderRadius: 2,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 11,
                            color: '#fde68a',
                            padding: '8px 10px',
                          }}
                          labelStyle={{ color: '#f59e0b', fontWeight: 700, letterSpacing: '0.08em' }}
                          formatter={(_v: any, _n: any, p: any) => {
                            const row = p?.payload ?? {};
                            const px = typeof row.price === 'number' ? `$${row.price.toFixed(2)}` : '—';
                            const bp = row.basisPct != null ? ` (${row.basisPct >= 0 ? '+' : ''}${row.basisPct}%)` : '';
                            return [`${px}${bp}`, `${row.symbol} · ${row.name}`];
                          }}
                        />
                        {spot != null && (
                          <ReferenceLine
                            y={spot}
                            stroke="rgba(148,163,184,0.55)"
                            strokeDasharray="4 4"
                            label={{ value: `M1 ${spot.toFixed(2)}`, position: 'insideLeft', fill: '#94a3b8', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          />
                        )}
                        <Area type="monotone" dataKey="price" stroke="none" fill="url(#curveFill)" isAnimationActive={false} />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke={lineColor}
                          strokeWidth={1.75}
                          dot={{ r: 2.5, fill: lineColor, stroke: lineColor }}
                          activeDot={{ r: 5, fill: '#0b0f15', stroke: lineColor, strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                        {m1 != null && (
                          <ReferenceDot x="M1" y={m1} r={4} fill={lineColor} stroke="#0b0f15" strokeWidth={2} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>

                  <div className="border-t border-amber-500/15 overflow-x-auto">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-[#0b0f15] text-amber-400/70 uppercase tracking-[0.12em]">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-normal">Contract</th>
                          <th className="px-3 py-1.5 text-left font-normal">Expiry</th>
                          <th className="px-3 py-1.5 text-right font-normal">Settle</th>
                          <th className="px-3 py-1.5 text-right font-normal">vs M1</th>
                          <th className="px-3 py-1.5 text-right font-normal">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((row) => (
                          <tr key={row.symbol} className="border-t border-amber-500/5 hover:bg-amber-500/5">
                            <td className="px-3 py-1 text-amber-200">{row.label} <span className="text-amber-500/60">{row.symbol}</span></td>
                            <td className="px-3 py-1 text-amber-100/70">{row.name}</td>
                            <td className="px-3 py-1 text-right text-amber-50">${row.price.toFixed(2)}</td>
                            <td className={`px-3 py-1 text-right ${row.basis == null ? 'text-amber-50/40' : row.basis >= 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                              {row.basis != null ? `${row.basis >= 0 ? '+' : ''}${row.basis.toFixed(2)}` : '—'}
                            </td>
                            <td className={`px-3 py-1 text-right ${row.basisPct == null ? 'text-amber-50/40' : row.basisPct >= 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                              {row.basisPct != null ? `${row.basisPct >= 0 ? '+' : ''}${row.basisPct.toFixed(2)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default ForwardCurves;
