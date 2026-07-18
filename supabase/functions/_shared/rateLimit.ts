/**
 * Lightweight in-memory IP-based rate limiter for public edge functions.
 *
 * Caveats:
 * - State is per-isolate. Supabase may run multiple isolates, so the effective
 *   limit is approximately (limit * isolate_count). Sufficient for casual abuse,
 *   not for coordinated DDoS (Cloudflare in front handles those).
 * - Memory-safe: oldest buckets are evicted when the map grows past `maxEntries`.
 * - Zero DB cost.
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
  /** Whether a breach for this bucket has already been logged. */
  breachLogged?: boolean;
}

interface LimiterOptions {
  /** Max requests per window, per IP. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Soft cap on tracked IPs to prevent unbounded memory growth. Default 10_000. */
  maxEntries?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  /** True if this is the first over-limit hit in the current window for this IP. */
  firstBreach?: boolean;
}

export class IpRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(opts: LimiterOptions) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  /** Returns the best-effort client IP from common proxy headers. */
  static getClientIp(req: Request): string {
    const headers = req.headers;
    const cfIp = headers.get("cf-connecting-ip");
    if (cfIp) return normalizeIp(cfIp);
    const xff = headers.get("x-forwarded-for");
    if (xff) return normalizeIp(xff.split(",")[0]);
    const xri = headers.get("x-real-ip");
    if (xri) return normalizeIp(xri);
    return "unknown";
  }

  check(ip: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(ip, bucket);
    }

    bucket.count += 1;
    const allowed = bucket.count <= this.limit;
    const remaining = Math.max(0, this.limit - bucket.count);
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    // Memory hygiene: if we've grown too large, drop expired/oldest entries.
    if (this.buckets.size > this.maxEntries) {
      this.evict(now);
    }

    return {
      allowed,
      limit: this.limit,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
      firstBreach: !allowed && !bucket.breachLogged,
    };
  }

  /** Marks the current bucket for `ip` as already-logged so we don't spam. */
  markBreachLogged(ip: string): void {
    const b = this.buckets.get(ip);
    if (b) b.breachLogged = true;
  }

  private evict(now: number) {
    // Drop expired buckets first.
    for (const [ip, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(ip);
    }
    // Still too large? Drop oldest (lowest resetAt) until under cap.
    if (this.buckets.size > this.maxEntries) {
      const sorted = [...this.buckets.entries()].sort(
        (a, b) => a[1].resetAt - b[1].resetAt,
      );
      const toDrop = this.buckets.size - this.maxEntries;
      for (let i = 0; i < toDrop; i++) {
        this.buckets.delete(sorted[i][0]);
      }
    }
  }
}

/** Builds the standard rate-limit response headers. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  // (helpers below)
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };
}

/**
 * Normalize an IP string from a proxy header.
 *
 * Handles:
 *  - Surrounding whitespace (`" 1.2.3.4 "` → `"1.2.3.4"`)
 *  - Bracketed IPv6 with optional port (`"[2001:db8::42]:443"` → `"2001:db8::42"`)
 *  - Bracketed IPv6 without port (`"[::1]"` → `"::1"`)
 *  - IPv4 with port (`"1.2.3.4:8080"` → `"1.2.3.4"`)
 *  - Bare IPv4 / bare unbracketed IPv6 (returned as-is, trimmed)
 *
 * Never throws: returns the trimmed input on unrecognized shapes so logging
 * + bucketing remain stable. The result is the value used for hashing — it
 * is NOT logged in raw form (see `hashIp`), so log safety is preserved.
 */
export function normalizeIp(raw: string): string {
  const s = raw.trim();
  if (!s) return "unknown";

  // Bracketed IPv6: "[v6]" or "[v6]:port"
  if (s.startsWith("[")) {
    const close = s.indexOf("]");
    if (close > 1) return s.slice(1, close);
    return s; // malformed — return as-is rather than throwing
  }

  // IPv4 with port: exactly one ':' and a dot before it.
  // (IPv6 always contains multiple ':'.)
  const firstColon = s.indexOf(":");
  const lastColon = s.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon && s.indexOf(".") !== -1) {
    return s.slice(0, firstColon);
  }

  return s;
}

/** Builds a 429 Too Many Requests Response with proper headers. */
export function tooManyRequestsResponse(
  result: RateLimitResult,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...extraHeaders,
        ...rateLimitHeaders(result),
        "Retry-After": String(result.retryAfterSeconds),
        "Content-Type": "application/json",
      },
    },
  );
}

/**
 * Hashes an IP into an opaque, non-reversible 12-char token so we can
 * correlate repeat offenders in logs without storing raw IPs (PII).
 */
export async function hashIp(ip: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(`rl:${ip}`);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .slice(0, 6)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "unknown";
  }
}

/**
 * Emits a single structured log line on the FIRST breach per IP per window.
 * Subsequent breaches in the same window are silently suppressed to avoid
 * log flooding under sustained abuse.
 */
export async function logRateLimitBreach(
  functionName: string,
  ip: string,
  result: RateLimitResult,
  req: Request,
  limiter: IpRateLimiter,
): Promise<void> {
  if (!result.firstBreach) return;
  limiter.markBreachLogged(ip);

  const ipHash = await hashIp(ip);
  const url = new URL(req.url);
  // Structured single-line JSON log — no raw IP, no headers, no body.
  console.warn(
    JSON.stringify({
      evt: "rate_limit_breach",
      fn: functionName,
      ipHash,
      method: req.method,
      path: url.pathname,
      limit: result.limit,
      windowResetAt: new Date(result.resetAt).toISOString(),
      retryAfterSeconds: result.retryAfterSeconds,
      ts: new Date().toISOString(),
    }),
  );
}