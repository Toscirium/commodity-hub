import {
  assertEquals,
  assertGreaterOrEqual,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const HEALTH_URL =
  "https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/health-check";
const LIMIT = 60; // matches limiter config in health-check/index.ts
const BURST = 90; // exceed the limit so at least one isolate must 429

/**
 * Integration test against the deployed health-check edge function.
 *
 * Why a stable spoofed IP: Supabase fronts edge functions with Cloudflare,
 * which forwards `x-forwarded-for`. Our limiter (`IpRateLimiter.getClientIp`)
 * prefers `cf-connecting-ip`; if absent, it falls back to `x-forwarded-for`.
 * In test traffic from this sandbox `cf-connecting-ip` is the sandbox egress IP,
 * so requests from the same isolate are bucketed together regardless of our
 * spoofed header — which is exactly what we want to verify.
 *
 * Caveat: requests are spread across N isolates. With a 90-request burst and
 * a 60/min/isolate limit, a 429 is *likely* but not guaranteed. The test
 * therefore asserts conditional invariants rather than requiring a 429.
 */
Deno.test(
  "health-check burst: rate-limit headers present, breaches well-formed",
  async () => {
    const responses = await Promise.all(
      Array.from({ length: BURST }, () =>
        fetch(HEALTH_URL, {
          method: "GET",
          headers: { "x-forwarded-for": "198.51.100.7" },
        }),
      ),
    );

    let okCount = 0;
    let limitedCount = 0;
    const seenLimitHeader = new Set<string>();

    for (const r of responses) {
      const body = await r.text(); // always consume

      // Every response — 200, 503, or 429 — must carry rate-limit headers.
      const limit = r.headers.get("x-ratelimit-limit");
      const remaining = r.headers.get("x-ratelimit-remaining");
      const reset = r.headers.get("x-ratelimit-reset");
      if (!limit || !remaining || !reset) {
        throw new Error(
          `missing rate-limit headers on status ${r.status}: limit=${limit} remaining=${remaining} reset=${reset}`,
        );
      }
      seenLimitHeader.add(limit);
      assertEquals(Number(limit), LIMIT, "advertised limit matches config");

      if (r.status === 429) {
        limitedCount++;
        // 429 contract: Retry-After header + JSON body with retryAfterSeconds.
        const retryAfter = r.headers.get("retry-after");
        if (!retryAfter) throw new Error("429 missing Retry-After header");
        assertGreaterOrEqual(Number(retryAfter), 1);

        const parsed = JSON.parse(body);
        assertEquals(parsed.error, "Too many requests");
        assertGreaterOrEqual(parsed.retryAfterSeconds, 1);
      } else if (r.status === 200 || r.status === 503) {
        okCount++;
        // Healthy/degraded responses must include the canonical health payload.
        const parsed = JSON.parse(body);
        if (!parsed.status || !Array.isArray(parsed.checks)) {
          throw new Error(`unexpected health payload: ${body.slice(0, 200)}`);
        }
      } else {
        throw new Error(`unexpected status ${r.status}: ${body.slice(0, 200)}`);
      }
    }

    // Every response advertised the same limit — sanity check.
    assertEquals(seenLimitHeader.size, 1, "limit header value is stable across responses");

    console.log(
      `health-check burst summary: ${okCount} success, ${limitedCount} rate-limited (of ${BURST})`,
    );

    // We accept either outcome (isolates may absorb the burst), but ALL
    // responses must have been well-formed — which the assertions above enforce.
  },
);

Deno.test(
  "health-check OPTIONS preflight is not rate-limited and returns CORS headers",
  async () => {
    const r = await fetch(HEALTH_URL, { method: "OPTIONS" });
    await r.text();
    // OPTIONS short-circuits before the limiter; should be 200/204.
    if (r.status !== 200 && r.status !== 204) {
      throw new Error(`unexpected OPTIONS status ${r.status}`);
    }
    const allowOrigin = r.headers.get("access-control-allow-origin");
    if (!allowOrigin) throw new Error("missing CORS Access-Control-Allow-Origin");
  },
);