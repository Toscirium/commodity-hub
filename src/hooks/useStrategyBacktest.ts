import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Mirrors run-strategy-backtest's StrategyResult response shape. Deliberately
// NOT the same shape as pro-analytics' seasonality BacktestResponse: a
// two-leg spread's value can cross zero, so this reports absolute P&L
// (spread points), not a compounding % return.
export interface StrategyBacktestResult {
  legA: string; legALabel: string;
  legB: string; legBLabel: string;
  weightA: number; weightB: number;
  years: number;
  totalPnl: number;
  buyHoldPnl: number;
  maxDrawdown: number;
  sharpe: number | null;
  hitRate: number;
  trades: number;
  bars: number;
  equityCurve: { date: string; equity: number }[];
  generatedAt: string;
}

export interface UserStrategy {
  id: string;
  user_id: string;
  name: string;
  code: string;
  leg_a: string;
  leg_b: string;
  weight_a: number;
  weight_b: number;
  years: number;
  last_run_at: string | null;
  last_result: StrategyBacktestResult | null;
  created_at: string;
  updated_at: string;
}

async function invokeStrategyBacktest(body: Record<string, unknown>): Promise<StrategyBacktestResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke('run-strategy-backtest', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data as StrategyBacktestResult;
}

export interface RunStrategyParams {
  strategyId?: string;
  code?: string;
  legA?: string;
  legB?: string;
  weightA?: number;
  weightB?: number;
  years?: number;
}

/** Ad-hoc or saved-strategy run — triggered imperatively via mutate(), not on mount. */
export const useRunStrategyBacktest = () =>
  useMutation({
    mutationFn: (params: RunStrategyParams) => invokeStrategyBacktest({ ...params }),
  });

export const useSavedStrategies = () => {
  const auth = useAuth();
  const userId = auth?.user?.id;
  return useQuery({
    queryKey: ['user-strategies', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<UserStrategy[]> => {
      const { data, error } = await supabase
        .from('user_strategies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserStrategy[];
    },
  });
};

export interface SaveStrategyArgs {
  name: string;
  code: string;
  legA: string;
  legB: string;
  weightA: number;
  weightB: number;
  years: number;
}

export const useCreateStrategy = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: SaveStrategyArgs) => {
      if (!auth?.user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('user_strategies')
        .insert({
          user_id: auth.user.id,
          name: args.name,
          code: args.code,
          leg_a: args.legA,
          leg_b: args.legB,
          weight_a: args.weightA,
          weight_b: args.weightB,
          years: args.years,
        })
        .select()
        .single();
      if (error) throw error;
      return data as UserStrategy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-strategies'] });
      toast({ title: 'Strategy saved' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not save strategy',
        description: err.message?.includes('limit')
          ? "You're at your saved-strategy limit. Delete one to save a new one."
          : err.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteStrategy = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_strategies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-strategies'] });
      toast({ title: 'Strategy deleted' });
    },
  });
};
