import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { usePortfolio, PositionSide, PositionStatus } from '@/hooks/usePortfolio';
import { COMMODITY_OPTIONS, KNOWN_BROKERS } from '@/lib/brokerPositions';

interface AddPositionFormProps {
  onSuccess?: () => void;
  portfolioId?: string;
}

const AddPositionForm: React.FC<AddPositionFormProps> = ({ onSuccess, portfolioId }) => {
  const [formData, setFormData] = React.useState({
    commodity_name: '',
    quantity: '',
    entry_price: '',
    entry_date: new Date().toISOString().split('T')[0],
    notes: '',
    side: 'buy' as PositionSide,
    leverage: '',
    broker: '',
    status: 'open' as PositionStatus,
    exit_price: '',
    closed_date: new Date().toISOString().split('T')[0],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { addPosition } = usePortfolio(portfolioId);

  const isClosed = formData.status === 'closed';
  const canSubmit =
    formData.commodity_name && formData.quantity && formData.entry_price &&
    (!isClosed || formData.exit_price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      await addPosition({
        commodity_name: formData.commodity_name,
        quantity: parseFloat(formData.quantity),
        entry_price: parseFloat(formData.entry_price),
        entry_date: formData.entry_date,
        notes: formData.notes || undefined,
        portfolio_id: portfolioId,
        side: formData.side,
        leverage: formData.leverage ? parseFloat(formData.leverage) : null,
        broker: formData.broker || null,
        status: formData.status,
        exit_price: isClosed ? parseFloat(formData.exit_price) : null,
        closed_date: isClosed ? formData.closed_date : null,
      });

      // Reset form
      setFormData({
        commodity_name: '',
        quantity: '',
        entry_price: '',
        entry_date: new Date().toISOString().split('T')[0],
        notes: '',
        side: 'buy',
        leverage: '',
        broker: '',
        status: 'open',
        exit_price: '',
        closed_date: new Date().toISOString().split('T')[0],
      });

      onSuccess?.();
    } catch (error) {
      console.error('Failed to add position:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add New Position
        </CardTitle>
        <CardDescription>
          Log a position by hand — including one you're actually holding at eToro or another
          broker — so it shows up here with live P&amp;L. This never connects to or reads from
          any real broker account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="commodity">Commodity</Label>
              <Select
                value={formData.commodity_name}
                onValueChange={(value) => handleChange('commodity_name', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select commodity" />
                </SelectTrigger>
                <SelectContent>
                  {COMMODITY_OPTIONS.map((commodity) => (
                    <SelectItem key={commodity} value={commodity}>
                      {commodity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Direction</Label>
              <ToggleGroup
                type="single"
                value={formData.side}
                onValueChange={(value) => value && handleChange('side', value)}
                className="justify-start"
              >
                <ToggleGroupItem value="buy" className="gap-1.5 data-[state=on]:bg-green-100 data-[state=on]:text-green-700 dark:data-[state=on]:bg-green-950/40 dark:data-[state=on]:text-green-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Buy / Long
                </ToggleGroupItem>
                <ToggleGroupItem value="sell" className="gap-1.5 data-[state=on]:bg-red-100 data-[state=on]:text-red-700 dark:data-[state=on]:bg-red-950/40 dark:data-[state=on]:text-red-400">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Sell / Short
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity / Units</Label>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                min="0"
                placeholder="e.g., 10.5"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="entry_price">Entry (Open) Price ($)</Label>
              <Input
                id="entry_price"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 2000.50"
                value={formData.entry_price}
                onChange={(e) => handleChange('entry_price', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="entry_date">Entry Date</Label>
              <Input
                id="entry_date"
                type="date"
                value={formData.entry_date}
                onChange={(e) => handleChange('entry_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leverage">Leverage (optional)</Label>
              <Input
                id="leverage"
                type="number"
                step="1"
                min="1"
                placeholder="e.g., 5 (for 5x)"
                value={formData.leverage}
                onChange={(e) => handleChange('leverage', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="broker">Broker (optional)</Label>
              <Input
                id="broker"
                list="broker-suggestions"
                placeholder="e.g., eToro"
                value={formData.broker}
                onChange={(e) => handleChange('broker', e.target.value)}
              />
              <datalist id="broker-suggestions">
                {KNOWN_BROKERS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <ToggleGroup
                type="single"
                value={formData.status}
                onValueChange={(value) => value && handleChange('status', value)}
                className="justify-start"
              >
                <ToggleGroupItem value="open">Open</ToggleGroupItem>
                <ToggleGroupItem value="closed">Closed</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {isClosed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 rounded-lg border bg-muted/30">
              <div className="space-y-2">
                <Label htmlFor="exit_price">Exit (Close) Price ($)</Label>
                <Input
                  id="exit_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 2050.00"
                  value={formData.exit_price}
                  onChange={(e) => handleChange('exit_price', e.target.value)}
                  required={isClosed}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closed_date">Closed Date</Label>
                <Input
                  id="closed_date"
                  type="date"
                  value={formData.closed_date}
                  onChange={(e) => handleChange('closed_date', e.target.value)}
                  required={isClosed}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this position..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Adding Position...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Position
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default AddPositionForm;
