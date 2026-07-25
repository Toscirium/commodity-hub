import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Filter, Search, TrendingUp, TrendingDown, BarChart3, RefreshCw, ArrowUp, ArrowDown, Download, Lock, Radar, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import { useAuth } from '@/contexts/AuthContext';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { formatPrice } from '@/lib/commodityUtils';
import { limitsFor } from '@/utils/tiers';
import { downloadCsv } from '@/utils/csvExport';
import PremiumPaywall from '@/components/PremiumPaywall';
import { useRegime, type RegimeRow } from '@/hooks/useProAnalytics';

interface ScreenerFilters {
  category: string;
  priceRange: [number, number];
  changeRange: [number, number];
  volumeRange: [number, number];
  marketCap: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

type SignalPreset = 'all' | 'uptrend' | 'downtrend' | 'high-volatility' | 'momentum';

const normaliseInstrument = (value: string) => value
  .toLowerCase()
  .replace(/futures|future|arabica|#11|class iii|oil/g, '')
  .replace(/[^a-z0-9]/g, '');

const findRegime = (commodity: string, rows: RegimeRow[]): RegimeRow | undefined => {
  const instrument = normaliseInstrument(commodity);
  return rows.find((row) => {
    const label = normaliseInstrument(row.label);
    return label.length > 2 && (instrument.includes(label) || label.includes(instrument));
  });
};

const MarketScreener = () => {
  const navigate = useNavigate();
  // Lightweight mode = no polling, no refetch on mount; reuses Dashboard's cache.
  const { data: commodities, isLoading, error } = useAvailableCommodities({ lightweight: true });
  const { profile } = useAuth();
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const isPro = auth?.isPro ?? tier === 'pro';
  const limits = limitsFor(tier);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [signalPreset, setSignalPreset] = useState<SignalPreset>('all');
  const [filters, setFilters] = useState<ScreenerFilters>({
    category: 'all',
    priceRange: [0, 5000],
    changeRange: [-10, 10],
    volumeRange: [0, 100],
    marketCap: 'all',
    sortBy: 'change',
    sortOrder: 'desc'
  });
  const { data: regimeData, isLoading: regimesLoading } = useRegime(isPro);

  // Show only metrics the source actually supplies. An unavailable metric is
  // preferable to a plausible-looking estimate in a trading workflow.
  const enhancedCommodities = React.useMemo(() => commodities ?? [], [commodities]);
  const regimeRows = regimeData?.rows.filter((row) => !row.error) ?? [];
  const regimesByCommodity = React.useMemo(
    () => new Map(enhancedCommodities.map((commodity) => [commodity.name, findRegime(commodity.name, regimeRows)])),
    [enhancedCommodities, regimeRows],
  );

  const filteredCommodities = React.useMemo(() => {
    let result = enhancedCommodities;

    // Search filter
    if (searchTerm) {
      result = result.filter(commodity => 
        commodity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        commodity.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      result = result.filter(commodity => commodity.category === filters.category);
    }

    // Price range filter
    result = result.filter(commodity => 
      commodity.price >= filters.priceRange[0] && 
      commodity.price <= filters.priceRange[1]
    );

    // Change range filter
    result = result.filter(commodity => 
      commodity.changePercent >= filters.changeRange[0] && 
      commodity.changePercent <= filters.changeRange[1]
    );

    // Pro signal presets only use the verified regime feed; never infer trend
    // or volatility from a single live quote.
    if (signalPreset !== 'all' && isPro) {
      result = result.filter((commodity) => {
        const regime = regimesByCommodity.get(commodity.name);
        if (!regime) return false;
        if (signalPreset === 'uptrend') return regime.trend === 'up';
        if (signalPreset === 'downtrend') return regime.trend === 'down';
        if (signalPreset === 'high-volatility') return regime.vol === 'high';
        return regime.trend === 'up' && (regime.return20d ?? 0) > 0 && (regime.return60d ?? 0) > 0;
      });
    }

    // Sort
    result = result.sort((a, b) => {
      let valueA: number, valueB: number;
      
      switch (filters.sortBy) {
        case 'name':
          return filters.sortOrder === 'asc' 
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        case 'price':
          valueA = a.price || 0;
          valueB = b.price || 0;
          break;
        case 'change':
          valueA = a.changePercent || 0;
          valueB = b.changePercent || 0;
          break;
        case 'volume':
          valueA = a.volume || 0;
          valueB = b.volume || 0;
          break;
        case 'weekHigh':
          valueA = a.weekHigh || 0;
          valueB = b.weekHigh || 0;
          break;
        case 'weekLow':
          valueA = a.weekLow || 0;
          valueB = b.weekLow || 0;
          break;
        case 'volatility':
          valueA = a.volatility || 0;
          valueB = b.volatility || 0;
          break;
        default:
          valueA = a.changePercent || 0;
          valueB = b.changePercent || 0;
      }

      return filters.sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
    });

    return result;
  }, [enhancedCommodities, searchTerm, filters, signalPreset, isPro, regimesByCommodity]);

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) return null;
    return filters.sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />;
  };

  const resetFilters = () => {
    setFilters({
      category: 'all',
      priceRange: [0, 5000],
      changeRange: [-10, 10],
      volumeRange: [0, 100],
      marketCap: 'all',
      sortBy: 'change',
      sortOrder: 'desc'
    });
    setSearchTerm('');
  };

  const categories = ['all', ...Array.from(new Set((commodities || []).map(c => c.category)))];

  const selectPreset = (preset: SignalPreset) => {
    if (preset !== 'all' && !isPro) {
      setPaywallOpen(true);
      return;
    }
    setSignalPreset(preset);
  };

  const handleExportCsv = () => {
    if (!limits.csvExport) { setPaywallOpen(true); return; }
    downloadCsv(
      'market-screener.csv',
      ['Name', 'Symbol', 'Category', 'Price', 'Change %', 'Volume', '52W High', '52W Low', 'Volatility %'],
      filteredCommodities.map((c) => [
        c.name, c.symbol, c.category, c.price, c.changePercent.toFixed(2),
        c.volumeDisplay ?? c.volume ?? '', c.weekHigh ?? '', c.weekLow ?? '', c.volatility ?? '',
      ]),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-optimized header */}
      <MobilePageHeader
        title="Market Screener"
        subtitle="Filter and analyze commodities by performance, volume, and other key metrics"
      >
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredCommodities.length === 0}
            title={limits.csvExport ? 'Export CSV' : 'Upgrade to export CSV'}
          >
            {limits.csvExport ? <Download className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </MobilePageHeader>
      
        <div className="container mx-auto p-4 space-y-6">
          <Card className="border-primary/25 bg-primary/[0.03]">
            <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary"><Radar className="h-5 w-5" /></div>
                <div><p className="font-semibold">Signal screener</p><p className="text-sm text-muted-foreground">Screen on verified 60-day trend and volatility regimes, then inspect the underlying market.</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SignalButton label="All markets" active={signalPreset === 'all'} onClick={() => selectPreset('all')} />
                <SignalButton label="Uptrends" active={signalPreset === 'uptrend'} locked={!isPro} onClick={() => selectPreset('uptrend')} />
                <SignalButton label="Downtrends" active={signalPreset === 'downtrend'} locked={!isPro} onClick={() => selectPreset('downtrend')} />
                <SignalButton label="High volatility" active={signalPreset === 'high-volatility'} locked={!isPro} onClick={() => selectPreset('high-volatility')} />
                <SignalButton label="Momentum" active={signalPreset === 'momentum'} locked={!isPro} onClick={() => selectPreset('momentum')} />
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Filters</CardTitle>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search */}
              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search commodities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select value={filters.category} onValueChange={(value) => setFilters({...filters, category: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price Range */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Price Range: ${filters.priceRange[0]} - ${filters.priceRange[1]}
                </label>
                <Slider
                  value={filters.priceRange}
                  onValueChange={(value) => setFilters({...filters, priceRange: value as [number, number]})}
                  max={5000}
                  min={0}
                  step={50}
                  className="w-full"
                />
              </div>

              {/* Change Range */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Change Range: {filters.changeRange[0]}% - {filters.changeRange[1]}%
                </label>
                <Slider
                  value={filters.changeRange}
                  onValueChange={(value) => setFilters({...filters, changeRange: value as [number, number]})}
                  max={10}
                  min={-10}
                  step={0.5}
                  className="w-full"
                />
              </div>

              {/* Sort Options */}
              <div>
                <label className="text-sm font-medium mb-2 block">Sort By</label>
                <Select value={filters.sortBy} onValueChange={(value) => setFilters({...filters, sortBy: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="change">Change %</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="text-sm font-medium mb-2 block">Sort Order</label>
                <Select value={filters.sortOrder} onValueChange={(value) => setFilters({...filters, sortOrder: value as 'asc' | 'desc'})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                 <div>
                   <CardTitle className="text-lg">Screening Results</CardTitle>
                   <CardDescription>
                     {filteredCommodities.length} commodities match your criteria • Data updated: {new Date().toLocaleTimeString()}
                   </CardDescription>
                 </div>
                 <Badge variant="secondary">
                   {filteredCommodities.length} / {(commodities || []).length}
                 </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading commodities...</p>
                </div>
               ) : error ? (
                 <div className="text-center py-8">
                   <p className="text-red-500 mb-4">Error loading commodities: {error.message}</p>
                   <Button onClick={() => window.location.reload()}>Retry</Button>
                 </div>
              ) : filteredCommodities.length > 0 ? (
                <div className="overflow-x-auto">
                   <table className="w-full">
                     <thead>
                       <tr className="border-b">
                         <th 
                           className="text-left p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('name')}
                         >
                           <div className="flex items-center gap-2">
                             Name
                             {getSortIcon('name')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('price')}
                         >
                           <div className="flex items-center justify-end gap-2">
                             Price
                             {getSortIcon('price')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('change')}
                         >
                           <div className="flex items-center justify-end gap-2">
                             Change
                             {getSortIcon('change')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('volume')}
                           title="Daily contract volume traded (in thousands of contracts)"
                         >
                           <div className="flex items-center justify-end gap-2">
                             Volume (contracts)
                             {getSortIcon('volume')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('weekHigh')}
                           title="52-week high price"
                         >
                           <div className="flex items-center justify-end gap-2">
                             52W High
                             {getSortIcon('weekHigh')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('weekLow')}
                           title="52-week low price"
                         >
                           <div className="flex items-center justify-end gap-2">
                             52W Low
                             {getSortIcon('weekLow')}
                           </div>
                         </th>
                         <th 
                           className="text-right p-3 font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleSort('volatility')}
                           title="Annualized volatility percentage"
                         >
                           <div className="flex items-center justify-end gap-2">
                             Volatility (%)
                             {getSortIcon('volatility')}
                           </div>
                         </th>
                         <th className="hidden p-3 text-left font-semibold lg:table-cell" title="Verified 60-day regime from the Pro analytics feed">Signal</th>
                         <th className="text-center p-3 font-semibold">Action</th>
                       </tr>
                     </thead>
                    <tbody>
                      {filteredCommodities.map((commodity, index) => (
                        <tr key={commodity.symbol} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <div>
                              <p className="font-semibold">{commodity.name}</p>
                              <p className="text-sm text-muted-foreground">{commodity.symbol}</p>
                            </div>
                          </td>
                           <td className="p-3 text-right font-bold">
                             {commodity.price > 0 ? formatPrice(commodity.price, commodity.name) : '/'}
                           </td>
                           <td className="p-3 text-right">
                             {Number.isFinite(commodity.changePercent) ? (
                               <div className={`flex items-center justify-end gap-1 ${
                                 commodity.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                               }`}>
                                 {commodity.changePercent >= 0 ? 
                                   <TrendingUp className="w-4 h-4" /> : 
                                   <TrendingDown className="w-4 h-4" />
                                 }
                                 <span className="font-bold">
                                   {commodity.changePercent.toFixed(2)}%
                                 </span>
                               </div>
                             ) : (
                               <span className="text-muted-foreground">/</span>
                             )}
                           </td>
                           <td className="p-3 text-right font-medium">
                             {commodity.volumeDisplay || '/'}
                           </td>
                           <td className="p-3 text-right">
                             {commodity.weekHigh ? formatPrice(commodity.weekHigh, commodity.name) : '/'}
                           </td>
                           <td className="p-3 text-right">
                             {commodity.weekLow ? formatPrice(commodity.weekLow, commodity.name) : '/'}
                           </td>
                           <td className="p-3 text-right">
                             {commodity.volatility ? `${commodity.volatility}%` : '/'}
                           </td>
                           <td className="hidden p-3 lg:table-cell"><RegimeSignal regime={regimesByCommodity.get(commodity.name)} loading={regimesLoading} isPro={isPro} /></td>
                           <td className="p-3 text-center">
                            <Button variant="ghost" size="sm">
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No Results Found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your filters to see more commodities
                  </p>
                  <Button onClick={resetFilters}>Reset Filters</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

        </div>
        <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

const SignalButton = ({ label, active, locked = false, onClick }: { label: string; active: boolean; locked?: boolean; onClick: () => void }) => (
  <Button type="button" size="sm" variant={active ? 'default' : 'outline'} onClick={onClick} className="gap-1.5">
    {locked && <Lock className="h-3 w-3" />}{label}
  </Button>
);

const RegimeSignal = ({ regime, loading, isPro }: { regime?: RegimeRow; loading: boolean; isPro: boolean }) => {
  if (!isPro) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Pro</span>;
  if (loading) return <span className="text-xs text-muted-foreground">Loading…</span>;
  if (!regime) return <span className="text-xs text-muted-foreground">Unavailable</span>;
  const trendClass = regime.trend === 'up' ? 'bg-emerald-500/10 text-emerald-600' : regime.trend === 'down' ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground';
  return <div className="flex items-center gap-1.5"><span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${trendClass}`}>{regime.trend === 'up' ? <TrendingUp className="h-3 w-3" /> : regime.trend === 'down' ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{regime.trend}</span><span className="text-[10px] text-muted-foreground">vol {regime.vol}</span></div>;
};

export default MarketScreener;
