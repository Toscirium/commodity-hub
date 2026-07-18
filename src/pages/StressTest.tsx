import React, { useMemo, useState } from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolioAnalytics } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

const StressTest = () => {
  const navigate = useNavigate(); const auth = useAuth(); const isPro = auth?.isPro ?? false;
  const [oil, setOil] = useState(-10); const [usd, setUsd] = useState(3); const [rates, setRates] = useState(100); const [paywall, setPaywall] = useState(false);
  const { data } = usePortfolioAnalytics(isPro);
  const result = useMemo(() => {
    const value = data?.currentValue ?? 0; const beta = data?.beta ?? 0;
    // Transparent factor model: WTI beta drives oil shock; conservative generic
    // sensitivities approximate USD and rates until asset-level factor history exists.
    const pct = beta * oil - 0.25 * usd - 0.03 * rates;
    return { pct, pnl: value * pct / 100, concentration: Math.abs(beta) > 1.2 ? 'High crude concentration' : 'No dominant crude factor detected' };
  }, [data, oil, usd, rates]);
  if (!isPro) return <div className="min-h-screen bg-background p-6"><Button variant="ghost" onClick={() => navigate('/portfolio-analytics')}><ArrowLeft className="mr-2 h-4 w-4" />Portfolio analytics</Button><Card className="mx-auto mt-6 max-w-xl"><CardHeader><CardTitle>Portfolio stress testing</CardTitle><CardDescription>Scenario P&L, factor sensitivity, and concentration warnings are Pro features.</CardDescription></CardHeader><CardContent><Button onClick={() => setPaywall(true)}>Upgrade to Pro</Button></CardContent></Card><PremiumPaywall open={paywall} onOpenChange={setPaywall} /></div>;
  return <div className="min-h-screen bg-background"><main className="mx-auto max-w-3xl space-y-5 p-6"><Button variant="ghost" onClick={() => navigate('/portfolio-analytics')}><ArrowLeft className="mr-2 h-4 w-4" />Portfolio analytics</Button><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldAlert className="h-6 w-6 text-amber-500" />Stress test</h1><p className="text-sm text-muted-foreground">Scenario model using your observed crude beta. USD and rates use conservative portfolio factor assumptions.</p></div><Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-3">{[['Oil shock %',oil,setOil],['USD shock %',usd,setUsd],['Rates shock bps',rates,setRates]].map(([label,value,setter]) => <label key={String(label)} className="space-y-1 text-sm">{label}<Input type="number" value={Number(value)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(e.target.value))} /></label>)}</CardContent></Card><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardDescription>Scenario P&L</CardDescription></CardHeader><CardContent className={result.pnl < 0 ? 'text-xl font-bold text-red-400' : 'text-xl font-bold text-emerald-400'}>${result.pnl.toLocaleString(undefined,{maximumFractionDigits:0})}</CardContent></Card><Card><CardHeader><CardDescription>Portfolio shock</CardDescription></CardHeader><CardContent className="text-xl font-bold">{result.pct.toFixed(1)}%</CardContent></Card><Card><CardHeader><CardDescription>Concentration</CardDescription></CardHeader><CardContent className="text-sm font-medium">{result.concentration}</CardContent></Card></div></main></div>;
};
export default StressTest;
