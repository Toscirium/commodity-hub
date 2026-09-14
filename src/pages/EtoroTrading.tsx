import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader, LinkIcon, Unlink, TrendingUp, TrendingDown, ShieldAlert, LogIn } from 'lucide-react';
import {
  useEtoroStatus,
  useEtoroPortfolio,
  useConnectEtoro,
  useDisconnectEtoro,
  usePlaceEtoroOrder,
} from '@/hooks/useEtoroTrading';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

// Kept in sync by hand with etoro-trading/index.ts's COMMODITY_SEARCH keys —
// this is the picker for which one a user can place a demo order on.
const COMMODITIES = [
  { id: 'wti', label: 'WTI Crude Oil' },
  { id: 'brent', label: 'Brent Oil' },
  { id: 'natgas', label: 'Natural Gas' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'copper', label: 'Copper' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'palladium', label: 'Palladium' },
  { id: 'corn', label: 'Corn' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soybeans', label: 'Soybean' },
];

const EtoroTrading: React.FC = () => {
  const { toast } = useToast();
  const auth = useAuth();
  const status = useEtoroStatus(Boolean(auth?.user));
  const connected = status.data?.connected ?? false;
  const portfolio = useEtoroPortfolio(connected);
  const connect = useConnectEtoro();
  const disconnect = useDisconnectEtoro();
  const placeOrder = usePlaceEtoroOrder();

  const [commodity, setCommodity] = useState('gold');
  const [transaction, setTransaction] = useState<'buy' | 'sellShort'>('buy');
  const [amount, setAmount] = useState('500');
  const [leverage, setLeverage] = useState('1');

  const handleConnect = async () => {
    try {
      const res = await connect.mutateAsync();
      window.location.href = res.authorizationUrl;
    } catch (err) {
      toast({ title: 'Could not start eToro connection', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast({ title: 'Disconnected from eToro' });
    } catch (err) {
      toast({ title: 'Could not disconnect', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handlePlaceOrder = async () => {
    const amountNum = Number(amount);
    const leverageNum = Number(leverage);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    try {
      const res = await placeOrder.mutateAsync({ commodity, transaction, amount: amountNum, leverage: leverageNum });
      toast({ title: `Demo order placed on ${res.instrument}`, description: `Order #${res.orderId}` });
    } catch (err) {
      toast({ title: 'Order failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  if (!auth?.loading && !auth?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="mx-auto max-w-sm text-center space-y-4">
          <LogIn className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold">Sign in to trade on eToro's demo account</h1>
          <p className="text-sm text-muted-foreground">
            Connecting an eToro demo account requires a Commodity Hub account first.
          </p>
          <Button asChild><Link to="/auth">Sign in</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="ETORO"
      title="eToro Trading"
      description="Practice trading commodity CFDs on eToro's demo account — simulated balance, real market mechanics, connected via eToro's own Trading API."
      badges={<Badge className="ml-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent">Demo only</Badge>}
    >
      <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            This connects to your eToro <strong>demo</strong> account only — simulated balance, no real money,
            no real orders. Commodity Hub does not execute real trades or hold funds; eToro is an independent,
            regulated broker.
          </p>
        </CardContent>
      </Card>

      {status.isLoading ? (
        <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect your eToro demo account</CardTitle>
            <CardDescription>
              You'll sign in on eToro's own site and approve read/trade access to your demo account only.
              Commodity Hub never sees your eToro password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnect} disabled={connect.isPending}>
              {connect.isPending ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
              Connect eToro (Demo)
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Demo portfolio</CardTitle>
                <CardDescription>
                  {portfolio.data?.accountCurrency ? `Account currency: ${portfolio.data.accountCurrency}` : 'Syncing…'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnect.isPending}>
                <Unlink className="w-3.5 h-3.5 mr-1.5" /> Disconnect
              </Button>
            </CardHeader>
            <CardContent>
              {portfolio.isLoading ? (
                <div className="flex justify-center py-6"><Loader className="h-5 w-5 animate-spin text-primary" /></div>
              ) : portfolio.isError ? (
                <p className="text-sm text-destructive">{(portfolio.error as Error).message}</p>
              ) : !portfolio.data?.instrumentAggregates?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No open positions yet.</p>
              ) : (
                <div className="space-y-2">
                  {portfolio.data.instrumentAggregates.map((p) => {
                    const positive = p.accountCurrencyReturn >= 0;
                    return (
                      <div key={p.instrumentId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                        <div>
                          <p className="font-medium font-mono">Instrument #{p.instrumentId}</p>
                          <p className="text-xs text-muted-foreground">
                            {(p.netUnits ?? p.netContracts ?? 0) >= 0 ? 'Long' : 'Short'} · avg open {p.avgOpenRate.toFixed(2)} · {p.avgLeverage}x
                          </p>
                        </div>
                        <div className={`flex items-center gap-1.5 font-mono ${positive ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
                          {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {p.accountCurrencyReturn.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardDescription>Place a demo market order</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Select value={commodity} onValueChange={setCommodity}>
                  <SelectTrigger className="col-span-2 sm:col-span-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMODITIES.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={transaction} onValueChange={(v) => setTransaction(v as 'buy' | 'sellShort')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy (long)</SelectItem>
                    <SelectItem value="sellShort">Sell (short)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount (USD)"
                />
                <Select value={leverage} onValueChange={setLeverage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5].map((l) => (<SelectItem key={l} value={String(l)}>{l}x</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handlePlaceOrder} disabled={placeOrder.isPending}>
                {placeOrder.isPending && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                Place demo order
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
};

export default EtoroTrading;
