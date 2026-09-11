import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VesselPosition {
  mmsi: number;
  ship_name: string | null;
  ship_type: number | null;
  destination: string | null;
  region: string;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  true_heading: number | null;
  nav_status: number | null;
  updated_at: string;
}

// Vessels not re-reported inside this window are treated as stale (out of
// AIS range, transponder off, etc.) and dropped from the map rather than
// left showing a last-known position that could be hours old. Wider than the
// 1-minute fetch-vessel-positions cadence to tolerate a missed cron tick.
const FRESHNESS_MINUTES = 20;
const QUERY_KEY = ['vessel-positions'] as const;

/**
 * Reads the fetch-vessel-positions-populated vessel_positions table and
 * subscribes to live changes so the map updates as soon as the next cron
 * run writes new positions, no manual refresh. A single upsert batch can
 * touch a few hundred rows at once (one row-change event each), so the
 * realtime handler coalesces a burst into one refetch a few seconds later
 * instead of refetching once per row.
 */
export const useVesselPositions = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async (): Promise<VesselPosition[]> => {
      const cutoff = new Date(Date.now() - FRESHNESS_MINUTES * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('vessel_positions')
        .select('mmsi, ship_name, ship_type, destination, region, lat, lon, sog, cog, true_heading, nav_status, updated_at')
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(1500);
      if (error) throw error;
      return (data ?? []) as VesselPosition[];
    },
  });

  React.useEffect(() => {
    let pending = false;
    const channel = supabase
      .channel('vessel_positions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vessel_positions' }, () => {
        if (pending) return;
        pending = true;
        setTimeout(() => {
          pending = false;
          void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        }, 4000);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};
