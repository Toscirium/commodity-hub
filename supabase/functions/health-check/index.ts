import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/utils.ts'
import {
  IpRateLimiter,
  rateLimitHeaders,
  tooManyRequestsResponse,
  logRateLimitBreach,
} from '../_shared/rateLimit.ts'
import { safeLog } from '../_shared/safeConsole.ts'

// 60 requests/minute per IP — fine for uptime monitors (typical 30–60s polling),
// blocks scripted abuse.
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    await logRateLimitBreach('health-check', ip, rl, req, limiter);
    return tooManyRequestsResponse(rl, corsHeaders);
  }

  try {
    // Public endpoint: intended for uptime monitors (UptimeRobot, BetterStack, etc).
    // Returns only non-sensitive aggregate status — no secret values, no row data.

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const healthChecks: Array<{
      service: string;
      status: string;
      responseTime?: number;
      error?: string;
    }> = [];

    // Database health check
    try {
      const t0 = performance.now();
      const { error } = await supabase.from('profiles').select('count').limit(1);
      healthChecks.push({
        service: 'database',
        status: error ? 'unhealthy' : 'healthy',
        responseTime: performance.now() - t0,
        error: error?.message,
      });
    } catch (error) {
      healthChecks.push({
        service: 'database',
        status: 'unhealthy',
        error: (error as Error).message,
      });
    }

    // External provider readiness — just verify secret presence (avoids quota burn).
    const apiChecks = [
      { name: 'CommodityPriceAPI', key: 'COMMODITYPRICE_API_KEY' },
      { name: 'OilPriceAPI', key: 'OIL_PRICE_API_KEY' },
      { name: 'Alpha Vantage', key: 'ALPHA_VANTAGE_API_KEY' },
      { name: 'FRED API', key: 'FRED_API_KEY' },
    ];

    for (const apiCheck of apiChecks) {
      const apiKey = Deno.env.get(apiCheck.key);
      healthChecks.push({
        service: apiCheck.name,
        status: apiKey ? 'configured' : 'not_configured',
      });
    }

    // Overall health status
    const overallStatus = healthChecks.every(
      (check) => check.status === 'healthy' || check.status === 'configured'
    )
      ? 'healthy'
      : 'degraded';

    return new Response(
      JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: healthChecks,
        version: '1.1.0',
      }),
      {
        headers: {
          ...corsHeaders,
          ...rateLimitHeaders(rl),
          'Content-Type': 'application/json',
        },
        status: overallStatus === 'healthy' ? 200 : 503,
      }
    );
  } catch (error) {
    safeLog.error('Health check error:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Internal health check error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      }
    );
  }
})
