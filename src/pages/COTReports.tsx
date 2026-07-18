import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Lock, AlertTriangle, Download, Radar, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useCOTCommodities, useCOTHistory } from '@/hooks/useCOT';
import { useCOTScreener } from '@/hooks/useCOTScreener';
import PremiumPaywall from '@/components/PremiumPaywall';
import { downloadCsv } from '@/utils/csvExport';
import { limitsFor } from '@/utils/tiers';

const COTReports: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const tier = auth?.tier ?? 'free';
  const limits = limitsFor(tier);
  const { data: commodities = [] } = useCOTCommodities();
  const [commodity, setCommodity] = useState<string>('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chart');

  React.useEffect(() => {
    if (!commodity && commodities.length > 0) setCommodity(commodities[0]);
  }, [commodities, commodity]);

  const { data: history = [], isLoading: historyLoading } = useCOTHistory(isPro ? commodity || null : null);
  const { data: extremes = [], isLoading: screenerLoading } = useCOTScreener();

  const chartData = useMemo(() =>
    history.map((h) => ({
      date: h.report_date.slice(5),
      Long: h.managed_money_long,
      Short: -h.managed_money_short,
      Net: h.net_position,
    })),
    [history],
  );

  const latest = history[history.length - 1];
  const nets = history.map((h) => h.net_position);
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  const percentile = latest && nets.length > 0
    ? (nets.filter((n) => n <= latest.net_position).length / nets.length) * 100
    : null;
  const extreme = percentile != null && (percentile >= 90 || percentile <= 10);

  const handleExportCsv = () => {
    if (!limits.csvExport) { setPaywallOpen(true); return; }
    downloadCsv(
      `cot-${commodity || 'report'}.csv`,
      ['Report Date', 'Managed Money Long', 'Managed Money Short', 'Net Position'],
      history.map((h) => [h.report_date, h.managed_money_long, h.managed_money_short, h.net_position]),
    );
  };

  const handleExportScreenerCsv = () => {
    if (!limits.csvExport) { setPaywallOpen(true); return; }
    downloadCsv(
      'cot-screener.csv',
      ['Commodity', 'Report Date', 'Net Position', 'Net Percentile', 'Signal', 'Commercial Divergence', 'Commercial Signal'],
      extremes.map((e) => [e.commodity, e.latestReportDate, e.netPosition, e.netPercentile.toFixed(0), e.netSignal, e.commercialDivergence, e.commercialSignal]),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            COT Reports
            <Badge variant="default" className="bg-primary/15 text-primary border-transparent">Pro</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            CFTC Commitments of Traders — track managed-money positioning, commercial divergence, and positioning extremes.
          </p>
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">COT reports are a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  See where hedge funds & commercials are positioned across crude, gold, soybeans, and more.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : commodities.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No COT data yet — first weekly sync runs on Friday after market close. Check back soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="chart" className="gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Positioning Chart
              </TabsTrigger>
              <TabsTrigger value="screener" className="gap-1.5">
                <Radar className="w-3.5 h-3.5" /> Extreme Screener
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="mt-0 space-y-4">
              <div className="mb-4 w-full max-w-xs">
                <Select value={commodity} onValueChange={setCommodity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {commodities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={history.length === 0}
                  title={limits.csvExport ? 'Export CSV' : 'Upgrade to export CSV'}
                >
                  {limits.csvExport ? <Download className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                  Export CSV
                </Button>
              </div>

              {historyLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

              {latest && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Net managed money</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${latest.net_position >= 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                        {latest.net_position.toLocaleString()}
                        <span className="text-sm font-normal text-muted-foreground ml-1">contracts</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        As of {latest.report_date}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>52-week percentile</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{percentile?.toFixed(0)}%</div>
                      <p className="text-xs text-muted-foreground mt-1">Range: {min.toLocaleString()} → {max.toLocaleString()} contracts</p>
                    </CardContent>
                  </Card>
                  <Card className={extreme ? 'border-orange-500/50 bg-orange-500/5' : ''}>
                    <CardHeader className="pb-2"><CardDescription>Sentiment signal</CardDescription></CardHeader>
                    <CardContent>
                      {extreme ? (
                        <div className="flex items-center gap-2 text-orange-500 font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          {percentile! >= 90 ? 'Extreme long' : 'Extreme short'}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">Neutral positioning</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {chartData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">52-week positioning</CardTitle>
                    <CardDescription>Values shown in number of contracts</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis className="text-xs" tickFormatter={(v: number) => v.toLocaleString()} label={{ value: 'Contracts', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 } }} />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          formatter={(value: number) => [`${Number(value).toLocaleString()} contracts`, '']}
                        />
                        <Legend />
                        <Bar dataKey="Long" stackId="a" fill="hsl(142 70% 45%)" />
                        <Bar dataKey="Short" stackId="a" fill="hsl(0 70% 55%)" />
                        <Line type="monotone" dataKey="Net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="screener" className="mt-0 space-y-4">
              <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Commodities ranked by how extreme managed-money positioning is versus the last 52 weeks. Commercial divergence flags when the "smart money" is positioned opposite to speculators.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportScreenerCsv}
                  disabled={extremes.length === 0}
                  title={limits.csvExport ? 'Export CSV' : 'Upgrade to export CSV'}
                >
                  {limits.csvExport ? <Download className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                  Export CSV
                </Button>
              </div>

              {screenerLoading && <p className="text-sm text-muted-foreground">Loading screener…</p>}

              {!screenerLoading && extremes.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    No COT data available yet for the screener.
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {extremes.map((e) => {
                  const netExtreme = e.netSignal !== 'neutral';
                  const commercialExtreme = e.commercialSignal !== 'neutral';
                  return (
                    <Card key={e.commodity} className={netExtreme ? 'border-orange-500/50 bg-orange-500/5' : ''}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{e.commodity}</CardTitle>
                          <Badge variant="secondary" className="text-xs">{e.latestReportDate}</Badge>
                        </div>
                        <CardDescription className="text-xs">Net position percentile</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold">
                            {e.netPercentile.toFixed(0)}%
                          </div>
                          <div className={`text-sm font-medium ${e.netPosition >= 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {e.netPosition.toLocaleString()} net
                          </div>
                        </div>

                        {netExtreme && (
                          <div className="flex items-center gap-2 text-orange-500 text-sm font-medium">
                            <AlertTriangle className="w-4 h-4" />
                            {e.netSignal === 'extreme_long' ? 'Extreme long' : 'Extreme short'}
                          </div>
                        )}

                        {commercialExtreme && (
                          <div className={`text-sm font-medium ${e.commercialSignal === 'smart_long' ? 'text-emerald-500' : 'text-orange-500'}`}>
                            Commercial divergence: {e.commercialSignal === 'smart_long' ? 'smart money long' : 'smart money short'}
                          </div>
                        )}

                        {!netExtreme && !commercialExtreme && (
                          <div className="text-sm text-muted-foreground">Neutral</div>
                        )}

                        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                          OI percentile: {e.oiPercentile.toFixed(0)}% · Commercials: {(e.commercialsLong - e.commercialsShort).toLocaleString()} net
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default COTReports;
