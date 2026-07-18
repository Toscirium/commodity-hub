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
    const expectedToken = Deno.env.get('HEALTH_CHECK_TOKEN') ?? '';
    const suppliedToken = req.headers.get('authorization') ?? '';
    if (!expectedToken || suppliedToken !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const healthChecks: Array<{
      service: string;
      status: string;
      responseTime?: number;
    }> = [];

    // Database health check
    try {
      const t0 = performance.now();
      const { error } = await supabase.from('profiles').select('count').limit(1);
      healthChecks.push({
        service: 'database',
        status: error ? 'unhealthy' : 'healthy',
        responseTime: performance.now() - t0,
      });
    } catch (error) {
      healthChecks.push({
        service: 'database',
        status: 'unhealthy',
      });
    }

    // Overall health status
    const overallStatus = healthChecks.every(
      (check) => check.status === 'healthy'
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
