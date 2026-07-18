import {
  assertEquals,
  assertGreaterOrEqual,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  IpRateLimiter,
  logRateLimitBreach,
  rateLimitHeaders,
  tooManyRequestsResponse,
} from "./rateLimit.ts";

/**
 * Integration test: simulates the full request → IP-normalization →
 * limiter → breach-log → response-header pipeline using a faithful
 * stand-in for an edge-function `serve` handler.
 *
 * Verifies that across a mixed burst of bracketed and bare IPv6 forms
 * referring to the SAME logical client:
 *   1. Only ONE breach log is emitted per (normalized IP, window).
 *   2. Every response carries consistent X-RateLimit-Limit/Remaining/Reset
 *      headers, and the same Reset epoch for the duration of the window.
 *   3. The 429 response contract is honored on every breach.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

/** Minimal handler that mirrors api-docs/health-check structure. */
function makeHandler(limiter: IpRateLimiter, fnName: string) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const ip = IpRateLimiter.getClientIp(req);
    const rl = limiter.check(ip);
    if (!rl.allowed) {
      await logRateLimitBreach(fnName, ip, rl, req, limiter);
      return tooManyRequestsResponse(rl, corsHeaders);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        ...rateLimitHeaders(rl),
        "Content-Type": "application/json",
      },
    });
  };
}

/** Captures console.warn output during a callback. */
async function captureWarn(
  fn: () => Promise<void> | void,
): Promise<string[]> {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
  };
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return lines;
}

/** Build a request that looks like Cloudflare-fronted edge traffic. */
function makeReq(headers: Record<string, string>): Request {
  return new Request("https://example.test/api-docs", {
    method: "GET",
    headers,
  });
}

Deno.test(
  "mixed bracketed/bare IPv6 in same window: one breach log, consistent headers",
  async () => {
    const LIMIT = 5;
    const WINDOW_MS = 60_000;
    const limiter = new IpRateLimiter({ limit: LIMIT, windowMs: WINDOW_MS });
    const handler = makeHandler(limiter, "api-docs");

    // Three distinct textual forms — all the SAME logical client after
    // normalization:
    //   - bracketed with port    "[2001:db8::42]:443"
    //   - bracketed without port "[2001:db8::42]"
    //   - bare                   "2001:db8::42"
    // We deliver them via cf-connecting-ip and x-forwarded-for to also
    // exercise the header-precedence path.
    const headerVariants: Array<Record<string, string>> = [
      { "cf-connecting-ip": "[2001:db8::42]:443" },
      { "cf-connecting-ip": "[2001:db8::42]" },
      { "cf-connecting-ip": "2001:db8::42" },
      { "x-forwarded-for": "[2001:db8::42]:8443, 10.0.0.1" },
      { "x-forwarded-for": "2001:db8::42" },
    ];
    const BURST = 30; // 6 cycles × 5 variants = 30 reqs against limit=5

    const responses: Response[] = [];
    const logs = await captureWarn(async () => {
      for (let i = 0; i < BURST; i++) {
        const headers = headerVariants[i % headerVariants.length];
        const r = await handler(makeReq(headers));
        responses.push(r);
      }
    });

    // ── Invariant 1: exactly ONE breach log across the entire mixed burst.
    assertEquals(
      logs.length,
      1,
      `expected exactly one breach log for mixed IPv6 forms of one client; got ${logs.length}: ${logs.join(" | ")}`,
    );
    const breachEntry = JSON.parse(logs[0]);
    assertEquals(breachEntry.evt, "rate_limit_breach");
    assertEquals(breachEntry.fn, "api-docs");
    assertEquals(breachEntry.limit, LIMIT);
    assertEquals(typeof breachEntry.ipHash, "string");
    assertEquals(breachEntry.ipHash.length, 12);

    // ── Invariant 2: log must NOT contain any raw IPv6 form, bracket, or port.
    const rawForms = ["2001:db8::42", "[", "]", "443", "8443"];
    for (const f of rawForms) {
      if (logs[0].includes(f)) {
        throw new Error(`raw IP/bracket/port leaked into breach log: ${logs[0]} (matched '${f}')`);
      }
    }

    // ── Invariant 3: response counts.
    const okCount = responses.filter((r) => r.status === 200).length;
    const limitedCount = responses.filter((r) => r.status === 429).length;
    assertEquals(okCount, LIMIT, "first LIMIT requests across all forms succeed");
    assertEquals(limitedCount, BURST - LIMIT, "remainder are rate-limited");

    // Drain bodies (Deno hygiene).
    for (const r of responses) await r.text();

    // ── Invariant 4: header consistency across the SINGLE window.
    const limitValues = new Set<string>();
    const resetValues = new Set<string>();
    for (const r of responses) {
      const lim = r.headers.get("x-ratelimit-limit");
      const reset = r.headers.get("x-ratelimit-reset");
      if (!lim || !reset) {
        throw new Error(`missing rate-limit headers on status ${r.status}`);
      }
      limitValues.add(lim);
      resetValues.add(reset);
    }
    assertEquals(limitValues.size, 1, "X-RateLimit-Limit is constant across the window");
    assertEquals([...limitValues][0], String(LIMIT));
    assertEquals(
      resetValues.size,
      1,
      `X-RateLimit-Reset must be constant within the window (proves all forms hit ONE bucket); got ${resetValues.size} distinct values: ${[...resetValues].join(",")}`,
    );

    // ── Invariant 5: 429 responses honor the Retry-After contract.
    for (const r of responses) {
      if (r.status === 429) {
        const retry = Number(r.headers.get("retry-after"));
        assertGreaterOrEqual(retry, 1);
      }
    }

    // ── Invariant 6: X-RateLimit-Remaining decreases monotonically while
    // allowed, then stays at 0 once limited.
    const remainings = responses.map((r) =>
      Number(r.headers.get("x-ratelimit-remaining")),
    );
    for (let i = 0; i < LIMIT; i++) {
      assertEquals(remainings[i], LIMIT - 1 - i, `remaining at position ${i}`);
    }
    for (let i = LIMIT; i < BURST; i++) {
      assertEquals(remainings[i], 0, `remaining stays 0 after limit at position ${i}`);
    }
  },
);

Deno.test(
  "different normalized IPs in same burst → distinct breach logs and distinct ipHashes",
  async () => {
    // Sanity: ensure the test above isn't trivially passing because
    // everything collapses to one bucket. Two genuinely different clients
    // (one IPv6, one IPv4) must produce two breach logs.
    const limiter = new IpRateLimiter({ limit: 2, windowMs: 60_000 });
    const handler = makeHandler(limiter, "api-docs");

    const sequences: Array<Record<string, string>> = [
      { "cf-connecting-ip": "[2001:db8::42]:443" },
      { "cf-connecting-ip": "192.0.2.10" },
    ];

    const responses: Response[] = [];
    const logs = await captureWarn(async () => {
      for (let i = 0; i < 12; i++) {
        responses.push(await handler(makeReq(sequences[i % 2])));
      }
    });
    for (const r of responses) await r.text();

    assertEquals(logs.length, 2, "one breach log per distinct client");
    const hashes = logs.map((l) => JSON.parse(l).ipHash);
    assertEquals(new Set(hashes).size, 2, "distinct clients → distinct ipHashes");
  },
);