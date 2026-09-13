import React, { useState } from 'react';
import PageShell from '@/components/PageShell';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Lock, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useBacktest, PRO_ANALYTICS_PRODUCTS } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';
import SeasonalityResults from '@/components/backtest/SeasonalityResults';
import CustomStrategyPanel from '@/components/backtest/CustomStrategyPanel';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [commodity, setCommodity] = useState('natgas');
  const [selected, setSelected] = useState<number[]>([11, 12, 1]);
  const [years, setYears] = useState(15);
  const [runParams, setRunParams] = useState<{ commodity: string; monthsLong: number[]; years: number } | null>(null);

  const { data, isLoading, error } = useBacktest(isPro ? runParams : null);

  const toggleMonth = (m: number) => {
    setSelected((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b));
  };

  const run = () => {
    if (!selected.length) return;
    setRunParams({ commodity, monthsLong: selected, years });
  };

  return (
    <PageShell
      eyebrow="BTEST"
      title="Backtest Sandbox"
      description="Replay seasonal rules against 15+ years of front-month history. Compare to buy-and-hold, see drawdowns and Sharpe."
      badges={<><Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge></>}
    >

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Backtest Sandbox is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Test "long natgas Nov–Jan" or "long grains May–Jul" and know the historical edge before you put on risk.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="seasonality">
            <TabsList className="mb-4">
              <TabsTrigger value="seasonality">Seasonality</TabsTrigger>
              <TabsTrigger value="custom">Custom Strategy</TabsTrigger>
            </TabsList>

            <TabsContent value="custom">
              <CustomStrategyPanel />
            </TabsContent>

            <TabsContent value="seasonality">
            <Card className="mb-4">
              <CardHeader className="pb-2"><CardDescription>Rule: long the front month during selected calendar months, flat otherwise</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="w-52">
                    <Select value={commodity} onValueChange={setCommodity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRO_ANALYTICS_PRODUCTS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Select value={String(years)} onValueChange={(v) => setYears(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[5, 10, 15, 20].map((y) => (<SelectItem key={y} value={String(y)}>{y} years</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={run} disabled={!selected.length || isLoading}>
                    <Play className="w-4 h-4 mr-2" /> {isLoading ? 'Running…' : 'Run backtest'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map((label, i) => {
                    const m = i + 1;
                    const on = selected.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMonth(m)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Selected: {selected.length ? selected.map((m) => MONTHS[m - 1]).join(', ') : 'none'}
                </p>
              </CardContent>
            </Card>

            {error && (
              <Card className="border-destructive/30 bg-destructive/5"><CardContent className="pt-6 text-sm text-destructive">Backtest failed. Try a different commodity or window.</CardContent></Card>
            )}

            {data && <SeasonalityResults data={data} />}
            </TabsContent>
          </Tabs>
        )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

export default Backtest;