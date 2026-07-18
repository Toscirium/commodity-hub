import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PriceAlert {
  id: string;
  user_id: string;
  commodity_name: string;
  commodity_symbol: string | null;
  condition: "above" | "below" | null;
  target_price: number | null;
  alert_type: "price" | "pct_move" | "volatility_band" | "spread" | "news_keyword";
  config: Record<string, any> | null;
  is_active: boolean;
  cooldown_minutes: number;
  note: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceAlertTrigger {
  id: string;
  alert_id: string;
  user_id: string;
  commodity_name: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  triggered_at: string;
  dismissed_at: string | null;
}

export const usePriceAlerts = () => {
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useQuery({
    queryKey: ["price_alerts", userId],
    enabled: !!userId,
    queryFn: async (): Promise<PriceAlert[]> => {
      const { data, error } = await supabase
        .from("price_alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PriceAlert[];
    },
  });
};

export const useUndismissedTriggers = () => {
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useQuery({
    queryKey: ["alert_triggers_undismissed", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PriceAlertTrigger[]> => {
      const { data, error } = await supabase
        .from("price_alert_triggers")
        .select("*")
        .is("dismissed_at", null)
        .order("triggered_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PriceAlertTrigger[];
    },
  });
};

export const useCreatePriceAlert = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useMutation({
    mutationFn: async (input: {
      commodity_name: string;
      commodity_symbol?: string | null;
      alert_type: "price" | "pct_move" | "volatility_band" | "spread" | "news_keyword";
      condition?: "above" | "below" | null;
      target_price?: number | null;
      config?: Record<string, any> | null;
      cooldown_minutes?: number;
      note?: string | null;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("price_alerts")
        .insert({
          user_id: userId,
          commodity_name: input.commodity_name,
          commodity_symbol: input.commodity_symbol ?? null,
          alert_type: input.alert_type,
          condition: input.condition ?? null,
          target_price: input.target_price ?? null,
          config: input.config ?? null,
          cooldown_minutes: input.cooldown_minutes ?? 60,
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PriceAlert;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price_alerts", userId] }),
  });
};

export const useToggleAlert = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("price_alerts")
        .update({ is_active: input.is_active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price_alerts", userId] }),
  });
};

export const useDeleteAlert = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price_alerts", userId] }),
  });
};

export const useDismissTrigger = () => {
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth?.user?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("price_alert_triggers")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert_triggers_undismissed", userId] });
    },
  });
};