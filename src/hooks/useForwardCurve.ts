import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ForwardCurvePoint {
  symbol: string;
  expiry: string;       // YYYY-MM
  monthIdx: number;
  price: number;
}

export interface ForwardCurveResponse {
  commodity: string;
  label: string;
  source: 'market';
  provider: string;
  asOf: string;         // YYYY-MM-DD settlement date
  spot: number;
  curve: ForwardCurvePoint[];
  m1: number | null;
  m2: number | null;
  structure: 'contango' | 'backwardation' | 'flat' | 'unknown';
  rollYield: number | null;
  /**
   * True when the server served the free WTI preview rather than full Pro
   * access — the curve is real, but capped at six months and WTI only.
   */
  preview?: boolean;
}

/** Free tier sees this one curve, six months out. Mirrors fetch-forward-curve. */
export const PREVIEW_CURVE_COMMODITY = 'wti';
export const PREVIEW_CURVE_MONTHS = 6;

/** Thrown when the server refuses this curve for the viewer's tier. */
export const PRO_REQUIRED = 'pro_required';

export const useForwardCurve = (commodity: string | null, enabled = true) => {
  return useQuery({
    queryKey: ['forward-curve', commodity],
    enabled: Boolean(commodity) && enabled,
    staleTime: 6 * 60 * 60 * 1000, // 6h — matches edge cache
    queryFn: async (): Promise<ForwardCurveResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData.session;
      const expiresAtMs = (session?.expires_at ?? 0) * 1000;
      if (session && expiresAtMs < Date.now() + 60_000) {
        const refreshed = await supabase.auth.refreshSession();
        session = refreshed.data.session;
      }
      if (!session?.access_token) {
        throw new Error('Authentication required');
      }
      const { data, error } = await supabase.functions.invoke('fetch-forward-curve', {
        body: { commodity, monthsAhead: 12 },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (error) {
        // Distinguish the tier refusal from a genuine failure so the page can
        // fall back to the upgrade prompt rather than showing "no curve
        // available", which would read as a bug.
        //
        // This also makes the free preview safe to deploy in either order:
        // the web bundle ships via Vercel on merge, while the edge function
        // needs a separate Supabase deploy. Until that lands the server still
        // 403s non-Pro, and without this the preview UI would promise a curve
        // and then fail — worse than the locked card it replaced.
        const status = (error as { context?: Response })?.context?.status;
        if (status === 403) throw new Error(PRO_REQUIRED);
        throw error;
      }
      if ((data as { error?: string })?.error === 'pro_required') {
        throw new Error(PRO_REQUIRED);
      }
      return data as ForwardCurveResponse;
    },
  });
};
