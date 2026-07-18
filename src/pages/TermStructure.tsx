import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useTermStructure, MASSIVE_ANALYTICS_PRODUCTS } from '@/hooks/useMassiveAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

const TermStructure: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [commodity, setCommodity] = useState('gold');
  const { data, isLoading, error, refetch, isFetching } = useTermStructure(isPro ? commodity : null);

  const chartData = useMemo(() => (data?.points ?? []).map((p) => ({
    label: `M${p.monthIdx}`,
    expiry: p.expiry,
    symbol: p.symbol,
    current: p.current,
    weekAgo: p.weekAgo,
    monthAgo: p.monthAgo,
  })), [data]);

  const shifts = useMemo(() => {
    if (!data) return null;
    const pts = data.points;
    const valid = pts.filter((p) => p.weekAgo != null && p.monthAgo != null);
    if (!valid.length) return null;
    const avgWeek = valid.reduce((a, p) => a + ((p.current - (p.weekAgo as number)) / (p.weekAgo as number)) * 100, 0) / valid.length;
    const avgMonth = valid.reduce((a, p) => a + ((p.current - (p.monthAgo as number)) / (p.monthAgo as number)) * 100, 0) / valid.length;
    return { avgWeek, avgMonth };
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-primary" />
              Term Structure Shift
              <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Current forward curve overlaid against 1-week-ago and 1-month-ago settlements per contract.
            </p>
          </div>
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Term Structure Shift is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  See how the entire curve shifted in the past week and month — spot parallel moves vs steepening/flattening.
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
                    {MASSIVE_ANALYTICS_PRODUCTS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Fetching historical settlements…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  Couldn't load the curve history.
                </CardContent>
              </Card>
            )}

            {data && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Avg shift vs 1 week ago</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${shifts && shifts.avgWeek > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {shifts ? `${shifts.avgWeek > 0 ? '+' : ''}${shifts.avgWeek.toFixed(2)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Across all contracts on {data.weekAgoDate}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Avg shift vs 1 month ago</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${shifts && shifts.avgMonth > 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        {shifts ? `${shifts.avgMonth > 0 ? '+' : ''}${shifts.avgMonth.toFixed(2)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Across all contracts on {data.monthAgoDate}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardDescription>{data.label} — Forward curve overlay (asOf {data.asOf})</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 24, left: 4, bottom: 8 }}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(2)} />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                          labelFormatter={(l, p) => `${l} · ${(p?.[0]?.payload as any)?.expiry ?? ''}`}
                          formatter={(v: any, n: string) => [v != null ? `$${Number(v).toFixed(2)}` : '—', n]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="monthAgo" name="1 month ago" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="weekAgo" name="1 week ago" stroke="#94a3b8" strokeDasharray="2 3" strokeWidth={1.5} dot={{ r: 2 }} />
                        <Line type="monotone" dataKey="current" name="Current" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
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

export default TermStructure;