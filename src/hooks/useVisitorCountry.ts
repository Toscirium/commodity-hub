import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface GeoCountryResponse {
  country: string | null;
}

/**
 * Resolves the visitor's country via the `geo-country` edge function (which
 * reads Cloudflare's `cf-ipcountry` header) so affiliate CTAs can be hidden
 * for residents of countries where a partner's compliance guidelines
 * prohibit promoting the product — see isProviderAvailableInCountry() in
 * src/config/affiliates.ts.
 *
 * One lookup per session (staleTime/gcTime: Infinity) — country doesn't
 * change mid-session and there's no reason to re-hit the function on every
 * navigation.
 *
 * `isLoading` is exposed on purpose: callers should treat "not yet resolved"
 * as "don't show the CTA yet" so a restricted visitor never sees a flash of
 * it before it's hidden. Once resolved, a failed/unknown lookup fails open
 * (country: null) — see isProviderAvailableInCountry for why.
 */
export function useVisitorCountry(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { data, isLoading } = useQuery({
    queryKey: ['visitor-country'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke<GeoCountryResponse>('geo-country');
      if (error) throw error;
      return data?.country ?? null;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    // Skip the lookup entirely when a caller already knows it doesn't need
    // one (e.g. a paid-tier user who won't render the CTA regardless) — no
    // point spending a network round trip on geo-gating content that's
    // hidden for an unrelated reason.
    enabled,
    // A geo lookup failing shouldn't surface as an app-wide error state —
    // callers just get country: null and fail open.
    throwOnError: false,
  });

  // While disabled, there's nothing to wait on — don't make callers hang in
  // a permanent "loading" state.
  return { country: data ?? null, isLoading: enabled && isLoading };
}
