import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Calculator } from 'lucide-react';
import SEOHead from '@/components/SEOHead';
import { useAvailableCommodities } from '@/hooks/useCommodityData';

// Commodity registry: native price unit + conversions to other common units.
// `unit` is the unit the user enters Entry/Stop in. `equivalents` lets the
// calculator translate the resulting position size into other practical units.
type CommodityDef = {
  label: string;
  unit: string;                 // e.g. "barrel", "bushel", "troy oz", "lb", "MMBtu"
  equivalents?: { label: string; factor: number }[]; // 1 native unit = factor × label
  futuresSymbol?: keyof typeof CONTRACTS; // optional link to futures contract
  spotCommodity?: string;       // commodity name as exposed by useAvailableCommodities()
};

const COMMODITIES: Record<string, CommodityDef> = {
  CRUDE:    { label: 'Crude Oil (WTI/Brent)', unit: 'barrel',   equivalents: [{ label: 'gallons (US)', factor: 42 }, { label: 'liters', factor: 158.987 }], futuresSymbol: 'CL', spotCommodity: 'WTI Crude Oil' },
  NATGAS:   { label: 'Natural Gas',           unit: 'MMBtu',    equivalents: [{ label: 'therms', factor: 10 }],                                            futuresSymbol: 'NG', spotCommodity: 'Natural Gas' },
  GASOLINE: { label: 'Gasoline (RBOB)',       unit: 'gallon',   equivalents: [{ label: 'liters', factor: 3.78541 }, { label: 'barrels', factor: 1/42 }], spotCommodity: 'Gasoline RBOB' },
  HEATOIL:  { label: 'Heating Oil',           unit: 'gallon',   equivalents: [{ label: 'liters', factor: 3.78541 }, { label: 'barrels', factor: 1/42 }], spotCommodity: 'Heating Oil' },
  GOLD:     { label: 'Gold',                  unit: 'troy oz',  equivalents: [{ label: 'grams', factor: 31.1035 }, { label: 'kg', factor: 0.0311035 }],  futuresSymbol: 'GC', spotCommodity: 'Gold Futures' },
  SILVER:   { label: 'Silver',                unit: 'troy oz',  equivalents: [{ label: 'grams', factor: 31.1035 }, { label: 'kg', factor: 0.0311035 }],  futuresSymbol: 'SI', spotCommodity: 'Silver Futures' },
  PLATINUM: { label: 'Platinum',              unit: 'troy oz',  equivalents: [{ label: 'grams', factor: 31.1035 }, { label: 'kg', factor: 0.0311035 }], spotCommodity: 'Platinum' },
  COPPER:   { label: 'Copper',                unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'metric tons', factor: 0.000453592 }], futuresSymbol: 'HG', spotCommodity: 'Copper' },
  CORN:     { label: 'Corn',                  unit: 'bushel',   equivalents: [{ label: 'lb', factor: 56 }, { label: 'metric tons', factor: 56 * 0.000453592 }], futuresSymbol: 'ZC', spotCommodity: 'Corn Futures' },
  WHEAT:    { label: 'Wheat',                 unit: 'bushel',   equivalents: [{ label: 'lb', factor: 60 }, { label: 'metric tons', factor: 60 * 0.000453592 }], futuresSymbol: 'ZW', spotCommodity: 'Wheat Futures' },
  SOYBEAN:  { label: 'Soybeans',              unit: 'bushel',   equivalents: [{ label: 'lb', factor: 60 }, { label: 'metric tons', factor: 60 * 0.000453592 }], futuresSymbol: 'ZS', spotCommodity: 'Soybean Futures' },
  COFFEE:   { label: 'Coffee',                unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'bags (60kg)', factor: 0.453592 / 60 }], futuresSymbol: 'KC', spotCommodity: 'Coffee Arabica' },
  SUGAR:    { label: 'Sugar',                 unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'metric tons', factor: 0.000453592 }], futuresSymbol: 'SB', spotCommodity: 'Sugar #11' },
  COTTON:   { label: 'Cotton',                unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'bales (480 lb)', factor: 1 / 480 }], futuresSymbol: 'CT', spotCommodity: 'Cotton' },
  CATTLE:   { label: 'Live Cattle',           unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'cwt', factor: 0.01 }], futuresSymbol: 'LE', spotCommodity: 'Live Cattle' },
  HOGS:     { label: 'Lean Hogs',             unit: 'lb',       equivalents: [{ label: 'kg', factor: 0.453592 }, { label: 'cwt', factor: 0.01 }], futuresSymbol: 'HE', spotCommodity: 'Lean Hogs' },
  GENERIC:  { label: 'Generic / Other',       unit: 'unit' },
};

// Standard futures contract specifications.
// Margins reflect typical published values from major brokers (Interactive Brokers,
// NinjaTrader/AMP, Tradovate, TD/Schwab) as of late 2025. Exchanges and brokers
// adjust these frequently — always confirm with your broker before trading.
//   - initialMargin / maintenanceMargin: CME SPAN-based overnight margins
//     used by IBKR, TDA/Schwab Futures, etc.
//   - dayTradeMargin: typical intraday margin from day-trading brokers
//     (AMP, NinjaTrader, Tradovate, Optimus). Position must be flat by close.
const CONTRACTS: Record<string, {
  label: string;
  pointValue: number;
  tickSize: number;
  tickValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  dayTradeMargin: number;
  contractSize: number;     // physical units per contract
  unit: string;             // unit label (barrels, troy oz, bushels, lb, MMBtu)
}> = {
  CL:  { label: 'Crude Oil (CL)',         pointValue: 1000,  tickSize: 0.01,  tickValue: 10,    initialMargin: 6820,  maintenanceMargin: 6200,  dayTradeMargin: 500,  contractSize: 1000,  unit: 'barrels'  },
  MCL: { label: 'Micro Crude Oil (MCL)',  pointValue: 100,   tickSize: 0.01,  tickValue: 1,     initialMargin: 682,   maintenanceMargin: 620,   dayTradeMargin: 50,   contractSize: 100,   unit: 'barrels'  },
  NG:  { label: 'Natural Gas (NG)',       pointValue: 10000, tickSize: 0.001, tickValue: 10,    initialMargin: 3300,  maintenanceMargin: 3000,  dayTradeMargin: 500,  contractSize: 10000, unit: 'MMBtu'    },
  GC:  { label: 'Gold (GC)',              pointValue: 100,   tickSize: 0.10,  tickValue: 10,    initialMargin: 16500, maintenanceMargin: 15000, dayTradeMargin: 1000, contractSize: 100,   unit: 'troy oz'  },
  MGC: { label: 'Micro Gold (MGC)',       pointValue: 10,    tickSize: 0.10,  tickValue: 1,     initialMargin: 1650,  maintenanceMargin: 1500,  dayTradeMargin: 100,  contractSize: 10,    unit: 'troy oz'  },
  SI:  { label: 'Silver (SI)',            pointValue: 5000,  tickSize: 0.005, tickValue: 25,    initialMargin: 17050, maintenanceMargin: 15500, dayTradeMargin: 2000, contractSize: 5000,  unit: 'troy oz'  },
  HG:  { label: 'Copper (HG)',            pointValue: 25000, tickSize: 0.0005,tickValue: 12.5,  initialMargin: 7150,  maintenanceMargin: 6500,  dayTradeMargin: 750,  contractSize: 25000, unit: 'lb'       },
  ZC:  { label: 'Corn (ZC)',              pointValue: 50,    tickSize: 0.25,  tickValue: 12.5,  initialMargin: 1650,  maintenanceMargin: 1500,  dayTradeMargin: 300,  contractSize: 5000,  unit: 'bushels'  },
  ZW:  { label: 'Wheat (ZW)',             pointValue: 50,    tickSize: 0.25,  tickValue: 12.5,  initialMargin: 2200,  maintenanceMargin: 2000,  dayTradeMargin: 400,  contractSize: 5000,  unit: 'bushels'  },
  ZS:  { label: 'Soybeans (ZS)',          pointValue: 50,    tickSize: 0.25,  tickValue: 12.5,  initialMargin: 3300,  maintenanceMargin: 3000,  dayTradeMargin: 500,  contractSize: 5000,  unit: 'bushels'  },
  KC:  { label: 'Coffee (KC)',            pointValue: 375,   tickSize: 0.05,  tickValue: 18.75, initialMargin: 15400, maintenanceMargin: 14000, dayTradeMargin: 1500, contractSize: 37500, unit: 'lb'       },
  SB:  { label: 'Sugar (SB)',             pointValue: 1120,  tickSize: 0.01,  tickValue: 11.2,  initialMargin: 1540,  maintenanceMargin: 1400,  dayTradeMargin: 400,  contractSize: 112000,unit: 'lb'       },
  CT:  { label: 'Cotton (CT)',            pointValue: 500,   tickSize: 0.01,  tickValue: 5,     initialMargin: 3300,  maintenanceMargin: 3000,  dayTradeMargin: 750,  contractSize: 50000, unit: 'lb'       },
  LE:  { label: 'Live Cattle (LE)',       pointValue: 400,   tickSize: 0.025, tickValue: 10,    initialMargin: 2640,  maintenanceMargin: 2400,  dayTradeMargin: 400,  contractSize: 40000, unit: 'lb'       },
  HE:  { label: 'Lean Hogs (HE)',         pointValue: 400,   tickSize: 0.025, tickValue: 10,    initialMargin: 2200,  maintenanceMargin: 2000,  dayTradeMargin: 400,  contractSize: 40000, unit: 'lb'       },
};

const fmtUsd = (n: number) =>
  isFinite(n)
    ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    : '—';

const fmtPct = (n: number, digits = 2) =>
  isFinite(n) ? `${n.toFixed(digits)}%` : '—';

const fmtNum = (n: number, digits = 4) =>
  isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

const PositionCalculator: React.FC = () => {
  const navigate = useNavigate();

  // Live spot prices for autofill of Entry fields.
  const { data: liveCommodities } = useAvailableCommodities({ lightweight: true });
  const spotPrices = useMemo(() => {
    const map: Record<string, number> = {};
    (liveCommodities ?? []).forEach((c) => { map[c.name] = c.price; });
    return map;
  }, [liveCommodities]);

  // Selected commodity for unit-aware dollar-risk sizing
  const [commodityKey, setCommodityKey] = useState<keyof typeof COMMODITIES>('CRUDE');
  const commodity = COMMODITIES[commodityKey];

  // Risk-based (dollar) sizing
  const [accountSize, setAccountSize] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('80');
  const [stop, setStop] = useState('78');

  // Futures sizing
  const [symbol, setSymbol] = useState<keyof typeof CONTRACTS>('CL');
  const [contracts, setContracts] = useState('1');
  const [futEntry, setFutEntry] = useState('80');
  const [futStop, setFutStop] = useState('78');

  // When the user picks a commodity that maps to a futures contract,
  // mirror that selection in the Futures tab for seamless cross-tab flow.
  React.useEffect(() => {
    if (commodity.futuresSymbol) setSymbol(commodity.futuresSymbol);
  }, [commodityKey, commodity.futuresSymbol]);

  // Autofill Dollar-Risk Entry/Stop when commodity changes (or when spot prices arrive).
  React.useEffect(() => {
    if (!commodity.spotCommodity) return;
    const spot = spotPrices[commodity.spotCommodity];
    if (!spot || !isFinite(spot) || spot <= 0) return;
    setEntry(spot.toFixed(spot < 5 ? 4 : 2));
    setStop((spot * 0.975).toFixed(spot < 5 ? 4 : 2)); // default -2.5% stop
  }, [commodityKey, commodity.spotCommodity, spotPrices]);

  // Autofill Futures Entry/Stop when contract symbol changes (or when spot prices arrive).
  React.useEffect(() => {
    const match = Object.values(COMMODITIES).find((c) => c.futuresSymbol === symbol);
    if (!match?.spotCommodity) return;
    const spot = spotPrices[match.spotCommodity];
    if (!spot || !isFinite(spot) || spot <= 0) return;
    setFutEntry(spot.toFixed(spot < 5 ? 4 : 2));
    setFutStop((spot * 0.975).toFixed(spot < 5 ? 4 : 2));
  }, [symbol, spotPrices]);

  const dollar = useMemo(() => {
    const acct = parseFloat(accountSize) || 0;
    const risk = parseFloat(riskPct) || 0;
    const e = parseFloat(entry) || 0;
    const s = parseFloat(stop) || 0;
    const riskAmount = (acct * risk) / 100;
    const perUnitRisk = Math.abs(e - s);
    const units = perUnitRisk > 0 ? riskAmount / perUnitRisk : 0;
    const positionValue = units * e;
    return { riskAmount, perUnitRisk, units, positionValue };
  }, [accountSize, riskPct, entry, stop]);

  const fut = useMemo(() => {
    const spec = CONTRACTS[symbol];
    const n = Math.max(0, Math.floor(parseFloat(contracts) || 0));
    const e = parseFloat(futEntry) || 0;
    const s = parseFloat(futStop) || 0;
    const notional = n * spec.pointValue * e;
    const totalMargin = n * spec.initialMargin;
    const leverage = totalMargin > 0 ? notional / totalMargin : 0;
    const ticks = spec.tickSize > 0 ? Math.abs(e - s) / spec.tickSize : 0;
    const riskPerContract = ticks * spec.tickValue;
    const totalRisk = n * riskPerContract;
    return { spec, n, notional, totalMargin, leverage, riskPerContract, totalRisk };
  }, [symbol, contracts, futEntry, futStop]);

  // Suggested # of futures contracts given the dollar-risk inputs above
  const suggestedContracts = useMemo(() => {
    const spec = CONTRACTS[symbol];
    const e = parseFloat(futEntry) || 0;
    const s = parseFloat(futStop) || 0;
    const ticks = spec.tickSize > 0 ? Math.abs(e - s) / spec.tickSize : 0;
    const riskPerContract = ticks * spec.tickValue;
    if (riskPerContract <= 0 || dollar.riskAmount <= 0) return 0;
    return Math.floor(dollar.riskAmount / riskPerContract);
  }, [symbol, futEntry, futStop, dollar.riskAmount]);

  return (
    <>
      <SEOHead
        title="Position Size Calculator - Commodity Hub"
        description="Calculate position size in dollars or futures contracts with margin and risk-based sizing."
        keywords={["position size", "futures margin", "risk management", "calculator"]}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl pb-[calc(3rem+env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Calculator className="h-6 w-6" />
                Position Size Calculator
              </CardTitle>
              <CardDescription>
                Size positions by dollar risk or futures contracts, with margin and leverage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="dollar" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="dollar">Dollar Risk</TabsTrigger>
                  <TabsTrigger value="futures">Futures Contracts</TabsTrigger>
                </TabsList>

                <TabsContent value="dollar" className="space-y-4 mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Commodity</Label>
                      <Select value={commodityKey} onValueChange={(v) => setCommodityKey(v as keyof typeof COMMODITIES)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(COMMODITIES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{`${v.label} — $/${v.unit}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Prices below are interpreted as USD per {commodity.unit}.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="acct">Account Size (USD)</Label>
                      <Input id="acct" type="number" inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="risk">Risk per Trade (%)</Label>
                      <Input id="risk" type="number" inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entry">Entry Price (USD/{commodity.unit})</Label>
                      <Input id="entry" type="number" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stop">Stop-Loss Price (USD/{commodity.unit})</Label>
                      <Input id="stop" type="number" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-background/60 font-mono text-xs">
                    <Section title="Risk">
                      <TermRow label="RISK AMOUNT" value={fmtUsd(dollar.riskAmount)} sub={`${parseFloat(riskPct) || 0}% of acct`} highlight />
                      <TermRow label={`RISK / ${commodity.unit.toUpperCase()}`} value={fmtUsd(dollar.perUnitRisk)} />
                    </Section>
                    <Section title="Position">
                      <TermRow label={`SIZE (${commodity.unit.toUpperCase()})`} value={fmtNum(dollar.units)} accent />
                      {commodity.equivalents?.map((eq) => (
                        <TermRow key={eq.label} label={`≈ ${eq.label.toUpperCase()}`} value={fmtNum(dollar.units * eq.factor)} />
                      ))}
                      <TermRow label="POSITION VALUE" value={fmtUsd(dollar.positionValue)} highlight />
                      {commodity.futuresSymbol && (
                        <TermRow
                          label={`≈ ${CONTRACTS[commodity.futuresSymbol].label.toUpperCase()}`}
                          value={(() => {
                            const spec = CONTRACTS[commodity.futuresSymbol!];
                            const e = parseFloat(entry) || 0;
                            const s = parseFloat(stop) || 0;
                            const ticks = spec.tickSize > 0 ? Math.abs(e - s) / spec.tickSize : 0;
                            const riskPerContract = ticks * spec.tickValue;
                            if (riskPerContract <= 0 || dollar.riskAmount <= 0) return '0';
                            return String(Math.floor(dollar.riskAmount / riskPerContract));
                          })()}
                          sub="contracts"
                        />
                      )}
                    </Section>
                  </div>
                </TabsContent>

                <TabsContent value="futures" className="space-y-4 mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Contract</Label>
                      <Select value={symbol} onValueChange={(v) => setSymbol(v as keyof typeof CONTRACTS)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CONTRACTS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="n">Number of Contracts</Label>
                      <Input id="n" type="number" inputMode="numeric" min={0} value={contracts} onChange={(e) => setContracts(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fe">Entry Price</Label>
                      <Input id="fe" type="number" inputMode="decimal" value={futEntry} onChange={(e) => setFutEntry(e.target.value)} />
                      {(() => {
                        const match = Object.values(COMMODITIES).find((c) => c.futuresSymbol === symbol);
                        const spot = match?.spotCommodity ? spotPrices[match.spotCommodity] : undefined;
                        return spot ? (
                          <p className="text-xs text-muted-foreground">Live spot: {fmtUsd(spot)}</p>
                        ) : null;
                      })()}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fs">Stop-Loss Price</Label>
                      <Input id="fs" type="number" inputMode="decimal" value={futStop} onChange={(e) => setFutStop(e.target.value)} />
                    </div>
                  </div>

                  {(() => {
                    const entryPx = parseFloat(futEntry) || 0;
                    const contractNotional = fut.spec.pointValue * entryPx;
                    const initPct = contractNotional > 0 ? (fut.spec.initialMargin / contractNotional) * 100 : NaN;
                    const maintPct = contractNotional > 0 ? (fut.spec.maintenanceMargin / contractNotional) * 100 : NaN;
                    const dayPct = contractNotional > 0 ? (fut.spec.dayTradeMargin / contractNotional) * 100 : NaN;
                    const riskPctOfAcct = (() => {
                      const acct = parseFloat(accountSize) || 0;
                      return acct > 0 ? (fut.totalRisk / acct) * 100 : NaN;
                    })();
                    return (
                      <div className="rounded-md border border-border bg-background/60 font-mono text-xs">
                        <TerminalTicker
                          symbol={symbol}
                          label={fut.spec.label}
                          entry={entryPx}
                          initPct={initPct}
                          leverage={fut.leverage}
                        />
                        <Section title="Contract Specs">
                          <TermRow label="POINT VALUE" value={fmtUsd(fut.spec.pointValue)} />
                          <TermRow label="TICK SIZE" value={String(fut.spec.tickSize)} />
                          <TermRow label="TICK VALUE" value={fmtUsd(fut.spec.tickValue)} />
                          <TermRow label="CONTRACT SIZE" value={`${fmtNum(fut.spec.contractSize, 0)} ${fut.spec.unit}`} />
                        </Section>
                        <Section title="Margin Requirements (per contract)">
                          <TermRow label="INITIAL  (OVERNIGHT)" value={fmtUsd(fut.spec.initialMargin)} sub={fmtPct(initPct)} />
                          <TermRow label="MAINTENANCE" value={fmtUsd(fut.spec.maintenanceMargin)} sub={fmtPct(maintPct)} />
                          <TermRow label="DAY TRADE  (INTRADAY)" value={fmtUsd(fut.spec.dayTradeMargin)} sub={fmtPct(dayPct)} accent />
                        </Section>
                        <Section title="Position">
                          <TermRow
                            label={`UNDERLYING (${fut.spec.unit.toUpperCase()})`}
                            value={`${fmtNum(fut.n * fut.spec.contractSize, 0)} ${fut.spec.unit}`}
                            accent
                          />
                          {(() => {
                            const match = Object.values(COMMODITIES).find(
                              (c) => c.futuresSymbol === symbol,
                            );
                            const totalUnits = fut.n * fut.spec.contractSize;
                            return match?.equivalents?.map((eq) => (
                              <TermRow
                                key={eq.label}
                                label={`≈ ${eq.label.toUpperCase()}`}
                                value={`${fmtNum(totalUnits * eq.factor, 2)} ${eq.label}`}
                              />
                            ));
                          })()}
                          <TermRow label="NOTIONAL VALUE" value={fmtUsd(fut.notional)} />
                          <TermRow label="TOTAL INITIAL MARGIN" value={fmtUsd(fut.totalMargin)} highlight />
                          <TermRow label="TOTAL MAINT. MARGIN" value={fmtUsd(fut.n * fut.spec.maintenanceMargin)} />
                          <TermRow label="TOTAL DAY-TRADE MARGIN" value={fmtUsd(fut.n * fut.spec.dayTradeMargin)} />
                          <TermRow label="LEVERAGE" value={`${fut.leverage.toFixed(2)}x`} accent />
                        </Section>
                        <Section title="Risk">
                          <TermRow label="RISK / CONTRACT (TO STOP)" value={fmtUsd(fut.riskPerContract)} />
                          <TermRow label="TOTAL RISK" value={fmtUsd(fut.totalRisk)} sub={isFinite(riskPctOfAcct) ? fmtPct(riskPctOfAcct) + ' of acct' : undefined} highlight />
                          <TermRow label="SUGGESTED CONTRACTS" value={String(suggestedContracts)} sub="from Dollar Risk tab" />
                        </Section>
                      </div>
                    );
                  })()}

                  <p className="text-xs text-muted-foreground">
                    Margin figures reflect typical published values from major brokers — IBKR, NinjaTrader/AMP,
                    Tradovate, TD/Schwab Futures (CME SPAN-based overnight; intraday from day-trading brokers).
                    Exchanges and brokers adjust these frequently; always confirm with your broker before trading.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={highlight ? 'font-semibold text-foreground' : 'font-medium'}>{value}</span>
  </div>
);

// ─── Bloomberg-Terminal-style result components ───────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-border last:border-b-0">
    <div className="px-3 py-1.5 bg-muted/40 text-[10px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
      {title}
    </div>
    <div className="divide-y divide-border/60">{children}</div>
  </div>
);

const TermRow: React.FC<{
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  accent?: boolean;
}> = ({ label, value, sub, highlight, accent }) => (
  <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
    <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground truncate">{label}</span>
    <span className="flex items-baseline gap-2 tabular-nums">
      {sub && <span className="text-[10px] text-muted-foreground/80">{sub}</span>}
      <span
        className={
          highlight
            ? 'text-sm font-bold text-primary'
            : accent
              ? 'text-sm font-semibold text-foreground'
              : 'text-sm font-medium text-foreground'
        }
      >
        {value}
      </span>
    </span>
  </div>
);

const TerminalTicker: React.FC<{
  symbol: string;
  label: string;
  entry: number;
  initPct: number;
  leverage: number;
}> = ({ symbol, label, entry, initPct, leverage }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-primary/10 border-b border-primary/30">
    <span className="text-sm font-bold text-primary tracking-wider">{symbol}</span>
    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
      <span className="text-muted-foreground">PX</span>
      <span className="font-semibold text-foreground">{fmtUsd(entry)}</span>
      <span className="text-muted-foreground">MARG</span>
      <span className="font-semibold text-foreground">{fmtPct(initPct)}</span>
      <span className="text-muted-foreground">LEV</span>
      <span className="font-semibold text-foreground">{leverage.toFixed(2)}x</span>
    </span>
  </div>
);

export default PositionCalculator;