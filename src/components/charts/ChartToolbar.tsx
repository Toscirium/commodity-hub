import React from 'react';
import { Pencil, Plus, X, Loader2 } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useAvailableCommodities } from '@/hooks/useCommodityData';

interface ChartToolbarProps {
  trendlineMode: boolean;
  onTrendlineModeChange: (enabled: boolean) => void;
  trendlineCount: number;
  onClearTrendlines: () => void;
  compareSymbol: string | null;
  onCompareSymbolChange: (name: string | null) => void;
  currentSymbol: string;
  /** Icon-only, single dense row — for full-screen/landscape where every row of height matters. */
  compact?: boolean;
}

const ChartToolbar: React.FC<ChartToolbarProps> = ({
  trendlineMode,
  onTrendlineModeChange,
  trendlineCount,
  onClearTrendlines,
  compareSymbol,
  onCompareSymbolChange,
  currentSymbol,
  compact = false,
}) => {
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const { data: commodities, isLoading } = useAvailableCommodities({ lightweight: true });

  const options = (commodities ?? []).filter((c) => c.name !== currentSymbol);

  return (
    <div className={compact ? 'flex items-center gap-1 shrink-0' : 'flex items-center gap-2 flex-wrap mb-2'}>
      <Toggle
        pressed={trendlineMode}
        onPressedChange={onTrendlineModeChange}
        aria-label="Draw trendline"
        size="sm"
        className="data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
      >
        <Pencil className="w-3.5 h-3.5" />
        {!compact && <span className="ml-1.5">Draw trendline</span>}
      </Toggle>

      {trendlineCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearTrendlines}
          className="text-xs text-muted-foreground hover:text-foreground"
          title={compact ? `Clear ${trendlineCount} line${trendlineCount === 1 ? '' : 's'}` : undefined}
        >
          {compact ? <X className="w-3.5 h-3.5" /> : `Clear ${trendlineCount} line${trendlineCount === 1 ? '' : 's'}`}
        </Button>
      )}

      {compareSymbol ? (
        <Badge variant="secondary" className="gap-1.5 py-1 shrink-0">
          {compact ? compareSymbol : `Comparing ${compareSymbol}`}
          <button onClick={() => onCompareSymbolChange(null)} aria-label="Remove compare series">
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ) : (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs shrink-0" title={compact ? 'Compare' : undefined}>
              <Plus className="w-3.5 h-3.5" />
              {!compact && <span className="ml-1">Compare</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search commodity..." />
              <CommandList>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading...
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No commodity found.</CommandEmpty>
                    <CommandGroup>
                      {options.map((commodity) => (
                        <CommandItem
                          key={commodity.name}
                          value={commodity.name}
                          onSelect={() => {
                            onCompareSymbolChange(commodity.name);
                            setPopoverOpen(false);
                          }}
                        >
                          {commodity.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default ChartToolbar;
