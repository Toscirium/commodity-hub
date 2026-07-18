import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Factory, Flame, Droplets, RefreshCw, TrendingUp, TrendingDown, CloudSun, Sprout, Drill, Ship,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useFundamentals, type FundamentalSeries, type FundamentalDataset } from '@/hooks/useFundamentals';

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatSigned(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}`;
}

interface SeriesCardProps {
  series: FundamentalSeries;
  inverse?: boolean; // if true, larger value = more bearish (e.g. stocks)
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series, inverse = true }) => {
  const wowUp = (series.wow_change ?? 0) > 0;
  const yoyUp = (series.yoy_change ?? 0) > 0;
  const vs5y = series.five_year_avg != null && series.latest_value != null
    ? series.latest_value - series.five_year_avg
    : null;

  const chartData = useMemo(
    () => series.observations.slice(-104).map((o) => ({ period: o.period, value: o.value })),
    [series.observations],
  );

  const isPercent = series.unit === 'Percent' || series.unit?.includes('GDD') || series.unit?.includes('HDD') || series.unit?.includes('CDD');
  const digits = isPercent ? 1 : 0;
  const wowPositiveColor = inverse ? 'text-orange-500' : 'text-emerald-500';
  const wowNegativeColor = inverse ? 'text-emerald-500' : 'text-orange-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight truncate">{series.label}</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {series.unit ?? '—'} · {series.latest_period ? `Period ${series.latest_period}` : '—'}
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold number-display">
              {formatNumber(series.latest_value, digits)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">WoW</div>
            <div className={`font-medium flex items-center gap-1 ${wowUp ? wowPositiveColor : wowNegativeColor}`}>
              {wowUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {formatSigned(series.wow_change, digits)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">YoY</div>
            <div className={`font-medium ${yoyUp ? wowPositiveColor : wowNegativeColor}`}>
              {formatSigned(series.yoy_change, digits)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{series.five_year_avg != null ? 'vs 5-yr avg' : 'vs prior'}</div>
            <div className={`font-medium ${vs5y != null && vs5y > 0 ? wowPositiveColor : vs5y != null && vs5y < 0 ? wowNegativeColor : ''}`}>
              {vs5y != null ? formatSigned(vs5y, digits) : '—'}
            </div>
          </div>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id={`grad-${series.series_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="period" hide />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                domain={['auto', 'auto']}
                width={48}
                tickFormatter={(v) => formatNumber(v, digits)}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(v: number) => [formatNumber(v, digits), series.unit ?? '']}
              />
              {series.five_year_avg != null && (
                <ReferenceLine
                  y={series.five_year_avg}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: '5y avg', position: 'right', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#grad-${series.series_id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

type TabKey = Exclude<FundamentalDataset, 'all'> | 'maritime';

const TAB_INFO: Record<TabKey, { label: string; icon: React.ElementType; description: string; note: string; placeholder?: string }> = {
  petroleum: {
    label: 'Petroleum Status',
    icon: Droplets,
    description: 'Weekly Petroleum Status Report',
    note: 'Released Wednesdays at 10:30 ET. Rising stocks = bearish for crude; falling stocks + rising refinery utilization = bullish demand signal.',
  },
  natgas_storage: {
    label: 'Nat Gas Storage',
    icon: Flame,
    description: 'Weekly Natural Gas Storage Report',
    note: 'Released Thursdays at 10:30 ET. Working gas in underground storage (Lower 48). Below the 5-year average during heating season = bullish NG.',
  },
  weather: {
    label: 'Weather',
    icon: CloudSun,
    description: 'Degree Day Intelligence',
    note: 'Heating/cooling degree days (HDD/CDD) for major demand centers and growing degree days (GDD) for the corn belt. Updated daily from Open-Meteo.',
  },
  usda: {
    label: 'Agriculture',
    icon: Sprout,
    description: 'USDA NASS Crop Progress & Livestock',
    note: 'Weekly crop planting/condition reports plus monthly cattle-on-feed. Sourced from USDA NASS Quick Stats.',
  },
  rigs: {
    label: 'Rig Count',
    icon: Drill,
    description: 'Baker Hughes Weekly Rig Count',
    note: 'Weekly U.S. and Canada rotary rig counts. More rigs = more future supply, typically bearish for oil/gas prices.',
  },
  maritime: {
    label: 'Maritime',
    icon: Ship,
    description: 'AIS Tanker & LNG Cargo Tracking',
    note: 'Real-time vessel flows for crude and LNG cargoes.',
    placeholder: 'AIS ship tracking connects to aisstream.io and updates in real time. This integration requires a free AIS API key and a dedicated vessel layer; it is queued for the next iteration.',
  },
};

const Fundamentals: React.FC = () => {
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<TabKey>('petroleum');
  const { data, isLoading, error, isFetching, forceRefresh } = useFundamentals('all');
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await forceRefresh(); } finally { setRefreshing(false); }
  };

  const grouped = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      petroleum: rows.filter((r) => r.dataset === 'petroleum'),
      natgas_storage: rows.filter((r) => r.dataset === 'natgas_storage'),
      weather: rows.filter((r) => r.dataset === 'weather'),
      usda: rows.filter((r) => r.dataset === 'usda'),
      rigs: rows.filter((r) => r.dataset === 'rigs'),
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Factory className="w-6 h-6 text-primary" />
              Physical Market Intelligence
              <Badge variant="secondary" className="text-xs">Beta</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Weekly fundamentals that drive commodity prices — inventories, weather, crop progress, livestock, and rig activity.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching || refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching || refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {error && (
          <Card className="mb-4 border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 text-sm text-destructive">
              Couldn't load fundamentals data. {(error as Error).message}
            </CardContent>
          </Card>
        )}

        <Tabs value={dataset} onValueChange={(v) => setDataset(v as TabKey)} className="w-full">
          <TabsList className="mb-4 flex-wrap h-auto">
            {(Object.keys(TAB_INFO) as Array<TabKey>).map((key) => {
              const Icon = TAB_INFO[key].icon;
              return (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {TAB_INFO[key].label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(TAB_INFO) as Array<TabKey>).map((key) => {
            const info = TAB_INFO[key];
            if (key === 'maritime') {
              return (
                <TabsContent key={key} value={key} className="mt-0 space-y-4">
                  <Card className="bg-muted/30 border-dashed">
                    <CardContent className="pt-4 pb-4 text-xs text-muted-foreground">
                      <strong className="text-foreground">{info.description}</strong> — {info.note}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 pb-6 text-sm text-muted-foreground">
                      <Ship className="w-5 h-5 mb-2 text-primary" />
                      <p className="font-medium text-foreground">{info.placeholder}</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            }
            const rows = grouped[key];
            return (
              <TabsContent key={key} value={key} className="mt-0 space-y-4">
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="pt-4 pb-4 text-xs text-muted-foreground">
                    <strong className="text-foreground">{info.description}</strong> — {info.note}
                  </CardContent>
                </Card>
                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <Card key={i}><CardContent className="h-72 animate-pulse" /></Card>
                    ))}
                  </div>
                ) : rows.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rows.map((s) => (
                      <SeriesCard key={s.series_id} series={s} inverse={key !== 'rigs'} />
                    ))}
                  </div>
                ) : (
                  <Card><CardContent className="pt-6 text-sm text-muted-foreground">No {info.label.toLowerCase()} data available yet — hit Refresh to fetch.</CardContent></Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <p className="text-xs text-muted-foreground mt-6">
          Data sources: U.S. Energy Information Administration (EIA), Open-Meteo, USDA NASS, Baker Hughes. Refreshed every 6 hours on the backend.
        </p>
      </div>
    </div>
  );
};

export default Fundamentals;
