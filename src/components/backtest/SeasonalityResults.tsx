import React from 'react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import type { BacktestResponse } from '@/hooks/useProAnalytics';

/**
 * Metrics cards + equity curve for the seasonality backtest (% returns,
 * always-positive single-commodity price). Extracted verbatim from
 * Backtest.tsx so the custom-strategy panel doesn't duplicate this markup —
 * it renders its own P&L-based variant instead, since a spread's value can
 * cross zero and % returns aren't meaningful there.
 */
const SeasonalityResults: React.FC<{ data: BacktestResponse }> = ({ data }) => (
  <>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <Card><CardHeader className="pb-2"><CardDescription>Total return</CardDescription></CardHeader><CardContent>
        <div className={`text-2xl font-bold ${data.totalReturnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{data.totalReturnPct > 0 ? '+' : ''}{data.totalReturnPct.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground mt-1">Over {data.yearsCovered}y</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>CAGR</CardDescription></CardHeader><CardContent>
        <div className="text-2xl font-bold">{data.cagrPct.toFixed(2)}%</div>
        <p className="text-xs text-muted-foreground mt-1">B&H: {data.buyHoldReturnPct.toFixed(1)}%</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Max drawdown</CardDescription></CardHeader><CardContent>
        <div className={`text-2xl font-bold ${data.maxDrawdownPct < -20 ? 'text-red-400' : 'text-yellow-400'}`}>{data.maxDrawdownPct.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground mt-1">Peak-to-trough</p>
      </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardDescription>Hit rate</CardDescription></CardHeader><CardContent>
        <div className="text-2xl font-bold">{Math.round(data.hitRate * 100)}%</div>
        <p className="text-xs text-muted-foreground mt-1">{data.trades} trades · Sharpe {data.sharpe ?? '—'}</p>
      </CardContent></Card>
    </div>
    <Card>
      <CardHeader><CardDescription>Equity curve (starting at 1.0)</CardDescription></CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.equityCurve}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={60} />
              <YAxis tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  </>
);

export default SeasonalityResults;
