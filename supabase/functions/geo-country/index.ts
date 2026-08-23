import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/utils.ts'
import {
  IpRateLimiter,
  rateLimitHeaders,
  tooManyRequestsResponse,
  logRateLimitBreach,
} from '../_shared/rateLimit.ts'

/**
 * Returns the visitor's country as seen by Cloudflare (which fronts every
 * Supabase edge function — see IpRateLimiter's use of `cf-connecting-ip`).
 * Cloudflare appends `cf-ipcountry` to every proxied request; we just read
 * it back out.
 *
 * This exists so the client can hide affiliate CTAs for residents of
 * countries where a partner's compliance guidelines prohibit promoting the
 * product (e.g. eToro's CFD restriction on US/AU/ES — see
 * src/config/affiliates.ts and src/hooks/useVisitorCountry.ts). Deliberately
 * a separate, tiny, public endpoint rather than folded into an existing
 * function: it has no auth, no DB access, and nothing here is sensitive
 * (an ISO country code, not an IP address — we never store or return the IP
 * itself).
 */
const limiter = new IpRateLimiter({ limit: 120, windowMs: 60_000 });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    await logRateLimitBreach('geo-country', ip, rl, req, limiter);
    return tooManyRequestsResponse(rl, corsHeaders);
  }

  // 'XX' is Cloudflare's own placeholder for "couldn't determine" (e.g. Tor
  // exit nodes) — treat it the same as missing so callers fail open rather
  // than matching an unexpected literal country code.
  const rawCountry = req.headers.get('cf-ipcountry');
  const country = rawCountry && rawCountry !== 'XX' ? rawCountry.toUpperCase() : null;

  return new Response(JSON.stringify({ country }), {
    status: 200,
    headers: {
      ...corsHeaders,
      ...rateLimitHeaders(rl),
      'Content-Type': 'application/json',
      // Per-visitor, and country doesn't change within a session — safe for
      // the browser to cache, cheap for us either way.
      'Cache-Control': 'private, max-age=3600',
    },
  })
})
