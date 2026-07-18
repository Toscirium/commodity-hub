import React from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { TouchRipple } from './mobile/TouchRipple';

import { useIsMobile } from '@/hooks/use-mobile';
import { useHaptics } from '@/hooks/useHaptics';
import { useAuth } from '@/contexts/AuthContext';
import { getMarketStatus } from '@/lib/marketHours';
import LazyChart from './LazyChart';
import LazyNews from './LazyNews';

interface CommodityCardProps {
  name: string;
  symbol: string;
  price: number | null;
  change: number;
  changePercent: number;
  volume?: string;
  lastUpdate?: string;
  venue?: string;
  contractSize?: string;
  category?: string;
  /**
   * Data freshness tier surfaced as a small badge next to the venue.
   * - 'live' (default): minute/hour-fresh exchange feed
   * - 'eod':            daily settlement only (Platts/Argus-style)
   * - 'reference':      weekly reference price, no intraday signal
   */
  dataFreshness?: 'live' | 'eod' | 'reference';
  defaultOpen?: boolean;
  availableContracts?: Array<{
    name: string;
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume?: number;
    expirationDate: string;
    contractSize?: string;
    venue?: string;
  }>;
}

const CommodityCard = React.memo<CommodityCardProps>(({ 
  name, 
  symbol, 
  price, 
  change, 
  changePercent, 
  volume, 
  lastUpdate, 
  venue = 'NYMEX',
  contractSize,
  category,
  dataFreshness = 'live',
  defaultOpen = false,
  availableContracts
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [selectedContract, setSelectedContract] = React.useState(symbol);
  const isMobile = useIsMobile();
  const { vibrateTouch } = useHaptics();
  const { profile } = useAuth();
  const marketStatus = getMarketStatus(name);

  // Get current price data for selected contract
  const selectedContractData = React.useMemo(() => {
    if (!availableContracts) return null;
    return availableContracts.find(contract => contract.symbol === selectedContract) || null;
  }, [availableContracts, selectedContract]);

  // Price display logic
  const displayPrice = React.useMemo(() => {
    if (selectedContractData) {
      return selectedContractData.price;
    }
    return price;
  }, [selectedContractData, price]);

  const currentChange = React.useMemo(() => {
    if (selectedContractData) {
      return selectedContractData.changePercent;
    }
    return changePercent;
  }, [selectedContractData, changePercent]);

  const isPositive = currentChange >= 0;

  // Get price prefix based on commodity units
  const getPricePrefix = React.useCallback((commodityName: string): string => {
    const lower = commodityName.toLowerCase();
    if (lower.includes('gas storage')) return ''; // Bcf value, no currency
    if (lower.includes('dutch ttf')) return '€';
    if (lower.includes('natural gas uk')) return '£';
    return '$';
  }, []);

  // Format price for display
  const formatPrice = React.useCallback((priceValue: number): string => {
    if (priceValue >= 10000) {
      return priceValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    if (priceValue >= 1000) {
      return priceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return priceValue.toFixed(2);
  }, []);

  // Get price units helper
  const getPriceUnits = React.useCallback((commodityName: string): string => {
    const lower = commodityName.toLowerCase();
    // Marine fuels (VLSFO, HFO, MGO)
    if (lower.includes('vlsfo') || lower.includes('hfo') || lower.includes('mgo')) {
      return '$/MT';
    }
    if (lower.includes('gasoil') || lower.includes('naphtha')) {
      return '$/tonne';
    }
    // Refined products sold per gallon
    if (lower.includes('jet fuel') || lower.includes('ulsd') || lower.includes('diesel') || 
        lower.includes('heating oil') || lower.includes('gasoline') || lower.includes('rbob')) {
      return '$/gallon';
    }
    // Gas storage in Bcf
    if (lower.includes('gas storage')) {
      return 'Bcf';
    }
    // Dutch TTF in EUR/MWh
    if (lower.includes('dutch ttf')) {
      return '€/MWh';
    }
    // LNG in $/MMBtu
    if (lower.includes('lng')) {
      return '$/MMBtu';
    }
    // Crude oils per barrel
    if (lower.includes('oil') || lower.includes('crude') || lower.includes('wti') || 
        lower.includes('brent') || lower.includes('tapis') || lower.includes('urals') || 
        lower.includes('canadian select') || lower.includes('opec')) {
      return '$/barrel';
    }
    // Natural gas
    if (lower.includes('gas')) {
      return '$/MMBtu';
    }
    // UK natural gas in GBp/therm
    if (lower.includes('natural gas uk')) {
      return 'GBp/therm';
    }
    if (lower.includes('gold') || lower.includes('silver')) {
      return '$/oz';
    }
    if (lower.includes('corn') || lower.includes('wheat')) {
      return '¢/bushel';
    }
    return '$/unit';
  }, []);

  // Contract change handler
  const handleContractChange = React.useCallback((value: string) => {
    setSelectedContract(value);
  }, []);

  // Toggle handler
  const handleToggle = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    vibrateTouch();
    setIsOpen(!isOpen);
  }, [vibrateTouch, isOpen]);

  // Generate expiration date helper
  const getExpirationDate = React.useCallback((contractSymbol: string): Date => {
    const now = new Date();
    const futureMonths = Math.floor(Math.random() * 12) + 1;
    return new Date(now.getFullYear(), now.getMonth() + futureMonths, 15);
  }, []);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full min-w-0 max-w-full overflow-hidden">
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <Card className="group relative w-full min-w-0 max-w-full overflow-hidden border border-border bg-card rounded-lg transition-colors hover:border-border/80">
          <CardHeader className="relative p-4 sm:p-5">
            {/* Header with click handler */}
            <div 
              className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between cursor-pointer touch-manipulation rounded-md focus-ring"
              onClick={handleToggle}
              role="button"
              tabIndex={0}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} details for ${name} commodity`}
            >
              {/* Main Content */}
              <div className="flex-1 space-y-2.5">
                {/* Title and badges */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                      <DollarSign className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[15px] sm:text-base font-semibold text-foreground tracking-tight truncate">
                        {name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium font-mono bg-muted rounded text-muted-foreground tracking-wide">
                          {selectedContract}
                        </span>
                        <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border rounded tracking-wide">
                          {selectedContractData?.venue || venue}
                        </span>
                        {(selectedContractData?.contractSize || contractSize) && (
                          <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 tracking-wide">
                            {selectedContractData?.contractSize || contractSize}
                          </span>
                        )}
                        {dataFreshness !== 'live' && (
                          <span
                            className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded tracking-wide ${
                              dataFreshness === 'eod'
                                ? 'text-muted-foreground border border-border'
                                : 'text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/40'
                            }`}
                            title={
                              dataFreshness === 'eod'
                                ? 'End-of-day settlement price — refreshed once per trading day.'
                                : 'Reference price — published weekly, no intraday signal.'
                            }
                          >
                            {dataFreshness === 'eod' ? 'EOD' : 'REF'}
                          </span>
                        )}
                        {selectedContractData && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="w-2.5 h-2.5" />
                            {selectedContractData.expirationDate ? new Date(selectedContractData.expirationDate).toLocaleDateString() : 'N/A'}
                          </span>
                        )}
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            marketStatus.isOpen ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'
                          }`}
                          title={marketStatus.isOpen ? 'Market open' : 'Market closed'}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Mobile Expand Icon */}
                  <div className="flex items-center sm:hidden">
                    <div className={`p-1.5 rounded-md transition-colors duration-100 ${
                      isOpen ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Price Section */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-[26px] font-semibold text-foreground number-display tracking-tight">
                      {displayPrice !== null ? (
                        typeof displayPrice === 'string' 
                          ? displayPrice 
                          : `${getPricePrefix(name)}${formatPrice(displayPrice)}`
                      ) : (
                        <span className="text-muted-foreground text-base">—</span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground/80 number-display">{getPriceUnits(name)}</span>
                  </div>
                  
                  <div className={`inline-flex items-center gap-1 text-sm font-medium number-display ${
                    isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'
                  }`}>
                    {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{isPositive ? '+' : '−'}{Math.abs(currentChange).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
              
              {/* Desktop Stats Section */}
              <div className="hidden sm:flex sm:items-center sm:gap-2 ml-3">
                <div className={`flex items-center p-1.5 rounded-md transition-colors duration-100 ${
                  isOpen ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground'
                }`}>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Contract Selector - Outside click handler */}
            {availableContracts && availableContracts.length > 0 && (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <Select value={selectedContract} onValueChange={handleContractChange}>
                  <SelectTrigger 
                    className="w-full sm:w-[280px] h-8 text-xs focus-ring bg-background border-border hover:bg-muted/50"
                    aria-label="Select futures contract"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue placeholder="Select Contract" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-background border-border shadow-lg">
                    {/* Default contract */}
                    <SelectItem value={symbol}>
                      <div className="flex flex-col">
                        <span className="font-medium">{name}</span>
                        <span className="text-xs text-muted-foreground">{symbol} • Main Contract</span>
                      </div>
                    </SelectItem>
                    {availableContracts.map((contract) => (
                      <SelectItem key={contract.symbol} value={contract.symbol}>
                        <div className="flex flex-col">
                          <span className="font-medium">{contract.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{contract.symbol}</span>
                            <span>{contract.expirationDate ? new Date(contract.expirationDate).toLocaleDateString() : 'N/A'}</span>
                            {contract.volume && (
                              <>
                                <span>•</span>
                                <span>Vol: {contract.volume.toLocaleString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mobile Stats Section - Visible only when expanded on mobile */}
            {isOpen && (
              <div className="mt-4 sm:hidden border-t border-border/50 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Price Units</p>
                    <p className="text-xs font-semibold text-muted-foreground number-display">{getPriceUnits(name)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Market Status</p>
                    <div className="flex items-center justify-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        marketStatus.isOpen ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {marketStatus.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
        </Card>
      </div>
      
      <CollapsibleContent className="overflow-hidden w-full min-w-0 max-w-full">
        <div className="mt-3 sm:mt-4 space-y-4 sm:space-y-6 animate-accordion-down w-full min-w-0 max-w-full overflow-hidden contain-inline-size">
          <LazyChart 
            name={name} 
            basePrice={displayPrice || 0} 
            selectedContract={selectedContract}
            contractData={selectedContractData ? { 
              ...selectedContractData, 
              category: 'futures', 
              supportedByFMP: true,
              volume: selectedContractData.volume || 0,
              contractSize: selectedContractData.contractSize || contractSize || 'N/A',
              venue: selectedContractData.venue || venue || 'NYMEX'
            } : undefined}
          />
          <LazyNews commodity={name} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

CommodityCard.displayName = 'CommodityCard';

export default CommodityCard;