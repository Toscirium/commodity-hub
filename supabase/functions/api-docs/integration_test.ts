import {
  assertEquals,
  assertGreaterOrEqual,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const API_DOCS_URL =
  "https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/api-docs";
const LIMIT = 30; // matches limiter config in api-docs/index.ts
const BURST = 60; // 2x limit so at least one isolate is likely to 429

/**
 * Integration test against the deployed api-docs edge function.
 *
 * Like the health-check test, requests fan out across N Supabase isolates,
 * so a 429 is likely but not guaranteed. We assert conditional invariants:
 *  - Every response (200, 429) carries X-RateLimit-* headers with the
 *    advertised limit matching the deployed config.
 *  - 200 responses return a valid OpenAPI JSON document.
 *  - 429 responses follow the documented contract (Retry-After + JSON body).
 */
Deno.test(
  "api-docs burst: rate-limit headers present, breaches well-formed",
  async () => {
    const responses = await Promise.all(
      Array.from({ length: BURST }, () =>
        fetch(API_DOCS_URL, {
          method: "GET",
          headers: { "x-forwarded-for": "198.51.100.42" },
        }),
      ),
    );

    let okCount = 0;
    let limitedCount = 0;
    const seenLimitHeader = new Set<string>();

    for (const r of responses) {
      const body = await r.text(); // always consume

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
        const retryAfter = r.headers.get("retry-after");
        if (!retryAfter) throw new Error("429 missing Retry-After header");
        assertGreaterOrEqual(Number(retryAfter), 1);

        const parsed = JSON.parse(body);
        assertEquals(parsed.error, "Too many requests");
        assertGreaterOrEqual(parsed.retryAfterSeconds, 1);
      } else if (r.status === 200) {
        okCount++;
        const parsed = JSON.parse(body);
        assertEquals(parsed.openapi, "3.0.3");
        if (!parsed.paths || typeof parsed.paths !== "object") {
          throw new Error("OpenAPI doc missing paths object");
        }
      } else {
        throw new Error(`unexpected status ${r.status}: ${body.slice(0, 200)}`);
      }
    }

    assertEquals(seenLimitHeader.size, 1, "limit header value is stable across responses");
    console.log(
      `api-docs burst summary: ${okCount} success, ${limitedCount} rate-limited (of ${BURST})`,
    );
  },
);

Deno.test(
  "api-docs YAML format response also carries rate-limit headers",
  async () => {
    const r = await fetch(`${API_DOCS_URL}?format=yaml`, { method: "GET" });
    const body = await r.text();
    if (r.status !== 200 && r.status !== 429) {
      throw new Error(`unexpected status ${r.status}: ${body.slice(0, 200)}`);
    }
    if (!r.headers.get("x-ratelimit-limit")) {
      throw new Error("YAML response missing X-RateLimit-Limit header");
    }
    if (r.status === 200) {
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("yaml")) {
        throw new Error(`expected yaml content-type, got ${ct}`);
      }
    }
  },
);

Deno.test(
  "api-docs OPTIONS preflight bypasses rate limiter and returns CORS",
  async () => {
    const r = await fetch(API_DOCS_URL, { method: "OPTIONS" });
    await r.text();
    if (r.status !== 200 && r.status !== 204) {
      throw new Error(`unexpected OPTIONS status ${r.status}`);
    }
    if (!r.headers.get("access-control-allow-origin")) {
      throw new Error("missing CORS Access-Control-Allow-Origin");
    }
  },
);