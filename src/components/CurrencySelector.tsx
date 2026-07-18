import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { useCurrency, CURRENCIES, CurrencyCode } from '@/hooks/useCurrency';

interface CurrencySelectorProps {
  compact?: boolean;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({ compact = false }) => {
  const { selectedCurrency, setSelectedCurrency, currencyInfo } = useCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold">
          <Globe className="w-3.5 h-3.5" />
          {compact ? currencyInfo.symbol : `${currencyInfo.code} ${currencyInfo.symbol}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {CURRENCIES.map((currency) => (
          <DropdownMenuItem
            key={currency.code}
            onClick={() => setSelectedCurrency(currency.code)}
            className={`flex items-center justify-between ${
              selectedCurrency === currency.code ? 'bg-primary/10 text-primary font-semibold' : ''
            }`}
          >
            <span>{currency.symbol} {currency.code}</span>
            <span className="text-xs text-muted-foreground">{currency.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CurrencySelector;
