import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  watchlist_id: string;
  user_id: string;
  commodity_name: string;
  commodity_symbol: string | null;
  position: number;
  added_at: string;
}

export const useWatchlists = () => {
  const auth = useAuth();
  const userId = auth?.user?.id;
  return useQuery({
    queryKey: ['watchlists', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Watchlist[]> => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Watchlist[];
    },
  });
};

export const useWatchlistItems = (watchlistId: string | null) => {
  return useQuery({
    queryKey: ['watchlist-items', watchlistId],
    enabled: Boolean(watchlistId),
    queryFn: async (): Promise<WatchlistItem[]> => {
      const { data, error } = await supabase
        .from('watchlist_items')
        .select('*')
        .eq('watchlist_id', watchlistId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WatchlistItem[];
    },
  });
};

export const useCreateWatchlist = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { name: string; color?: string }) => {
      if (!auth?.user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('watchlists')
        .insert({ user_id: auth.user.id, name: args.name, color: args.color ?? 'blue' })
        .select()
        .single();
      if (error) throw error;
      return data as Watchlist;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlists'] });
      toast({ title: 'Watchlist created' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not create watchlist',
        description: err.message?.includes('limit')
          ? "You're at your watchlist limit. Upgrade for more."
          : err.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteWatchlist = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('watchlists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlists'] });
      toast({ title: 'Watchlist deleted' });
    },
  });
};

export const useAddWatchlistItem = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { watchlistId: string; commodity_name: string; commodity_symbol?: string | null }) => {
      if (!auth?.user) throw new Error('Not authenticated');
      const { data: existing } = await supabase
        .from('watchlist_items')
        .select('position')
        .eq('watchlist_id', args.watchlistId)
        .order('position', { ascending: false })
        .limit(1);
      const nextPos = ((existing?.[0] as any)?.position ?? -1) + 1;
      const { data, error } = await supabase
        .from('watchlist_items')
        .insert({
          watchlist_id: args.watchlistId,
          user_id: auth.user.id,
          commodity_name: args.commodity_name,
          commodity_symbol: args.commodity_symbol ?? null,
          position: nextPos,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WatchlistItem;
    },
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ['watchlist-items', args.watchlistId] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not add commodity',
        description: err.message?.includes('limit')
          ? "You've hit the items-per-watchlist limit on your tier. Upgrade for more."
          : err.message?.includes('duplicate')
          ? 'Already in this watchlist.'
          : err.message,
        variant: 'destructive',
      });
    },
  });
};

export const useRemoveWatchlistItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; watchlistId: string }) => {
      const { error } = await supabase.from('watchlist_items').delete().eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ['watchlist-items', args.watchlistId] });
    },
  });
};

export const useReorderWatchlistItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; position: number; watchlistId: string }) => {
      const { error } = await supabase
        .from('watchlist_items')
        .update({ position: args.position })
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ['watchlist-items', args.watchlistId] });
    },
  });
};