import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader, Plus } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';

// Commodity options for the dropdown
const COMMODITY_OPTIONS = [
  'Gold Futures',
  'Silver Futures',
  'WTI Crude Oil',
  'Natural Gas',
  'Copper',
  'Platinum',
  'Palladium',
  'Brent Crude Oil',
  'Corn Futures',
  'Wheat Futures',
  'Soybean Futures',
  'Live Cattle Futures',
  'Lean Hogs Futures',
  'Coffee Futures',
  'Sugar Futures',
  'Cotton Futures',
  'Cocoa Futures'
];

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
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { addPosition } = usePortfolio(portfolioId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.commodity_name || !formData.quantity || !formData.entry_price) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await addPosition({
        commodity_name: formData.commodity_name,
        quantity: parseFloat(formData.quantity),
        entry_price: parseFloat(formData.entry_price),
        entry_date: formData.entry_date,
        notes: formData.notes || undefined,
        portfolio_id: portfolioId,
      });
      
      // Reset form
      setFormData({
        commodity_name: '',
        quantity: '',
        entry_price: '',
        entry_date: new Date().toISOString().split('T')[0],
        notes: ''
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
          Track your commodity investments by adding positions to your portfolio
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
              <Label htmlFor="quantity">Quantity</Label>
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
              <Label htmlFor="entry_price">Entry Price ($)</Label>
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
          </div>

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
            disabled={isSubmitting || !formData.commodity_name || !formData.quantity || !formData.entry_price}
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