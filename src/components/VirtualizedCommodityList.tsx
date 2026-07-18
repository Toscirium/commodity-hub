import React from 'react';
import CommodityCard from './CommodityCard';
import { Commodity } from '@/hooks/useCommodityData';
import { useIsMobile } from '@/hooks/use-mobile';
import { SkeletonCard } from '@/components/ui/enhanced-skeleton';
import { Anchor, Droplets, Flame, BarChart3 } from 'lucide-react';

interface VirtualizedCommodityListProps {
  commodities: Commodity[];
  loading?: boolean;
  highlightCommodity?: string | null;
}

const VirtualizedCommodityList: React.FC<VirtualizedCommodityListProps> = ({ 
  commodities, 
  loading = false,
  highlightCommodity
}) => {
  const isMobile = useIsMobile();
  // Render every commodity — cards are lightweight and chart/news inside
  // only mount when the card is expanded (LazyChart / LazyNews).

  // Energy subsections. Marine fuels + LNG hubs + niche crude blends were
  // retired 2026-07-14 when we migrated to Massive Futures.
  const MARINE_FUEL_NAMES = new Set<string>([]);
  const REFINED_PRODUCT_NAMES = new Set(['Gasoline RBOB', 'Heating Oil']);
  const NATURAL_GAS_NAMES = new Set(['Natural Gas']);

  const groupedVisible = React.useMemo(() => {
    const items = commodities;
    // Only apply subsections for energy category
    const isEnergy = items.length > 0 && items[0]?.category === 'energy';
    if (!isEnergy) return { sections: [{ label: null, icon: null, items }] };

    const crudeOils: Commodity[] = [];
    const naturalGas: Commodity[] = [];
    const refinedProducts: Commodity[] = [];
    const marineFuels: Commodity[] = [];

    for (const c of items) {
      if (MARINE_FUEL_NAMES.has(c.name)) marineFuels.push(c);
      else if (REFINED_PRODUCT_NAMES.has(c.name)) refinedProducts.push(c);
      else if (NATURAL_GAS_NAMES.has(c.name)) naturalGas.push(c);
      else crudeOils.push(c);
    }

    const sections: { label: string | null; icon: React.ReactNode | null; items: Commodity[] }[] = [];
    if (crudeOils.length > 0) sections.push({ label: 'Crude Oil Benchmarks', icon: <Droplets className="w-4 h-4" />, items: crudeOils });
    if (naturalGas.length > 0) sections.push({ label: 'Natural Gas & LNG', icon: <Flame className="w-4 h-4" />, items: naturalGas });
    if (refinedProducts.length > 0) sections.push({ label: 'Refined Products', icon: <BarChart3 className="w-4 h-4" />, items: refinedProducts });
    if (marineFuels.length > 0) sections.push({ label: 'Marine Fuels', icon: <Anchor className="w-4 h-4" />, items: marineFuels });

    return { sections };
  }, [commodities]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:gap-4 lg:gap-6">
        {Array.from({ length: isMobile ? 3 : 6 }).map((_, index) => (
          <div key={index}>
            <SkeletonCard 
              showImage={false}
              showTitle={true}
              showDescription={true}
              showActions={false}
              lines={3}
            />
          </div>
        ))}
      </div>
    );
  }

  let globalIndex = 0;

  return (
    <div className="space-y-3 pb-8 w-full min-w-0 max-w-full overflow-x-hidden">
      {groupedVisible.sections.map((section, sIdx) => (
        <div key={section.label || sIdx} className="w-full min-w-0 max-w-full overflow-x-hidden">
          {section.label && (
            <div className="flex items-center gap-2 mb-2 mt-2">
              <div className="flex items-center gap-2 px-2.5 py-1 border-l-2 border-primary bg-muted/40">
                <span className="text-primary">{section.icon}</span>
                <span className="terminal-label text-muted-foreground">{section.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground/70">{section.items.length}</span>
              </div>
              <div className="flex-1 h-px bg-border/30" />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:gap-3 w-full min-w-0 max-w-full overflow-x-hidden">
            {section.items.map((commodity) => {
              const idx = globalIndex++;
              const availableContracts = undefined;
              const isHighlighted = commodity.name === highlightCommodity;
              return (
                <div 
                  key={`${commodity.symbol}-${idx}`}
                  className={`w-full min-w-0 max-w-full overflow-x-hidden ${isHighlighted ? 'rounded-[2rem] bg-primary/10 p-1 shadow-[0_0_0_2px_hsl(var(--primary)/0.35),0_0_24px_hsl(var(--primary)/0.18)]' : ''}`}
                  ref={isHighlighted ? (el) => {
                    if (el && !el.dataset.scrolled) {
                      el.dataset.scrolled = '1';
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  } : undefined}
                >
                  <CommodityCard
                    name={commodity.name}
                    price={commodity.price}
                    change={commodity.change || 0}
                    changePercent={commodity.changePercent}
                    symbol={commodity.symbol}
                    venue={commodity.venue}
                    contractSize={commodity.contractSize}
                    availableContracts={availableContracts}
                    defaultOpen={commodity.name === highlightCommodity}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(VirtualizedCommodityList);
