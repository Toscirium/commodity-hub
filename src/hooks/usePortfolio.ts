import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDelayedData } from '@/hooks/useDelayedData';

export interface PortfolioPosition {
  id: string;
  user_id: string;
  portfolio_id: string;
  commodity_name: string;
  quantity: number;
  entry_price: number;
  entry_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PositionWithCurrentPrice extends PortfolioPosition {
  current_price: number;
  current_value: number;
  total_return: number;
  return_percentage: number;
  is_positive: boolean;
}

export const usePortfolio = (portfolioId?: string | null) => {
  const [positions, setPositions] = React.useState<PositionWithCurrentPrice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const auth = useAuth();
  const { toast } = useToast();
  const { isPremium } = useDelayedData();

  // Handle case where auth is not yet available
  const user = auth?.user || null;

  // Fetch positions from database
  const fetchPositions = async () => {
    if (!user) {
      setPositions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('portfolio_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (portfolioId) query = query.eq('portfolio_id', portfolioId);
      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // Fetch current prices for all positions
      const positionsWithPrices = await Promise.all(
        (data || []).map(async (position) => {
          try {
            // Use the Supabase edge function to fetch current prices
            const response = await supabase.functions.invoke('fetch-commodity-prices', {
              body: { 
                commodityName: position.commodity_name,
                isPremium,
                dataDelay: 'realtime'
              }
            });
            let currentPrice = position.entry_price; // fallback to entry price
            
            if (response.data && !response.error) {
              const priceData = response.data;
              currentPrice = priceData.price?.price || position.entry_price;
            }

            const currentValue = position.quantity * currentPrice;
            const entryValue = position.quantity * position.entry_price;
            const totalReturn = currentValue - entryValue;
            const returnPercentage = ((currentPrice - position.entry_price) / position.entry_price) * 100;

            return {
              ...position,
              current_price: currentPrice,
              current_value: currentValue,
              total_return: totalReturn,
              return_percentage: returnPercentage,
              is_positive: totalReturn >= 0
            };
          } catch (error) {
            console.warn(`Failed to fetch price for ${position.commodity_name}:`, error);
            return {
              ...position,
              current_price: position.entry_price,
              current_value: position.quantity * position.entry_price,
              total_return: 0,
              return_percentage: 0,
              is_positive: true
            };
          }
        })
      );

      setPositions(positionsWithPrices);
    } catch (err) {
      console.error('Error fetching portfolio positions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  };

  // Add new position
  const addPosition = async (positionData: {
    commodity_name: string;
    quantity: number;
    entry_price: number;
    entry_date: string;
    notes?: string;
    portfolio_id?: string;
  }) => {
    if (!user) throw new Error('User not authenticated');

    try {
      const { data, error } = await supabase
        .from('portfolio_positions')
        .insert([{
          ...positionData,
          user_id: user.id
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Position Added",
        description: `Added ${positionData.quantity} units of ${positionData.commodity_name}`,
      });

      await fetchPositions(); // Refresh positions
      return data;
    } catch (error) {
      console.error('Error adding position:', error);
      toast({
        title: "Error",
        description: "Failed to add position",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Update position
  const updatePosition = async (id: string, updates: Partial<PortfolioPosition>) => {
    try {
      const { error } = await supabase
        .from('portfolio_positions')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Position Updated",
        description: "Portfolio position has been updated",
      });

      await fetchPositions(); // Refresh positions
    } catch (error) {
      console.error('Error updating position:', error);
      toast({
        title: "Error",
        description: "Failed to update position",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Delete position
  const deletePosition = async (id: string) => {
    try {
      const { error } = await supabase
        .from('portfolio_positions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Position Deleted",
        description: "Portfolio position has been removed",
      });

      await fetchPositions(); // Refresh positions
    } catch (error) {
      console.error('Error deleting position:', error);
      toast({
        title: "Error",
        description: "Failed to delete position",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Calculate portfolio summary
  const portfolioSummary = {
    totalValue: positions.reduce((sum, pos) => sum + pos.current_value, 0),
    totalCost: positions.reduce((sum, pos) => sum + (pos.quantity * pos.entry_price), 0),
    totalReturn: positions.reduce((sum, pos) => sum + pos.total_return, 0),
    get returnPercentage() {
      return this.totalCost > 0 ? (this.totalReturn / this.totalCost) * 100 : 0;
    },
    get isPositive() {
      return this.totalReturn >= 0;
    },
    positionCount: positions.length
  };

  React.useEffect(() => {
    fetchPositions();
  }, [user, portfolioId]);

  return {
    positions,
    loading,
    error,
    portfolioSummary,
    addPosition,
    updatePosition,
    deletePosition,
    refreshPositions: fetchPositions
  };
};