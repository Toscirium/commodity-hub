import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  IpRateLimiter,
  logRateLimitBreach,
  hashIp,
  normalizeIp,
} from "./rateLimit.ts";

/** Captures console.warn output during a callback. */
async function captureWarn(fn: () => Promise<void> | void): Promise<string[]> {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return lines;
}

function fakeReq(): Request {
  return new Request("https://example.test/api-docs", { method: "GET" });
}

Deno.test("burst from one IP: exactly one breach log per window", async () => {
  const limiter = new IpRateLimiter({ limit: 5, windowMs: 60_000 });
  const ip = "10.0.0.1";
  const req = fakeReq();

  const logs = await captureWarn(async () => {
    // 20 requests, only 5 allowed; remaining 15 should breach.
    for (let i = 0; i < 20; i++) {
      const rl = limiter.check(ip);
      if (!rl.allowed) {
        await logRateLimitBreach("test-fn", ip, rl, req, limiter);
      }
    }
  });

  assertEquals(logs.length, 1, "expected exactly one breach log per IP per window");
  const parsed = JSON.parse(logs[0]);
  assertEquals(parsed.evt, "rate_limit_breach");
  assertEquals(parsed.fn, "test-fn");
  assertEquals(parsed.limit, 5);
  assertEquals(typeof parsed.ipHash, "string");
  assertEquals(parsed.ipHash.length, 12);
});

Deno.test("breach log does not contain raw IP", async () => {
  const limiter = new IpRateLimiter({ limit: 1, windowMs: 60_000 });
  const ip = "203.0.113.42";
  const req = fakeReq();

  const logs = await captureWarn(async () => {
    limiter.check(ip); // allowed
    const rl = limiter.check(ip); // breach
    await logRateLimitBreach("test-fn", ip, rl, req, limiter);
  });

  assertEquals(logs.length, 1);
  if (logs[0].includes(ip)) {
    throw new Error(`raw IP leaked into breach log: ${logs[0]}`);
  }
});

Deno.test("multiple IPs each get their own breach log", async () => {
  const limiter = new IpRateLimiter({ limit: 2, windowMs: 60_000 });
  const req = fakeReq();
  const ips = ["1.1.1.1", "2.2.2.2", "3.3.3.3"];

  const logs = await captureWarn(async () => {
    for (const ip of ips) {
      for (let i = 0; i < 10; i++) {
        const rl = limiter.check(ip);
        if (!rl.allowed) {
          await logRateLimitBreach("test-fn", ip, rl, req, limiter);
        }
      }
    }
  });

  assertEquals(logs.length, 3, "one breach log per offending IP");
  const hashes = new Set(logs.map((l) => JSON.parse(l).ipHash));
  assertEquals(hashes.size, 3, "each IP produces a distinct hash");
});

Deno.test("new window resets breachLogged flag", async () => {
  const limiter = new IpRateLimiter({ limit: 1, windowMs: 10 });
  const ip = "9.9.9.9";
  const req = fakeReq();

  const logs = await captureWarn(async () => {
    // Window 1: trigger breach
    limiter.check(ip);
    let rl = limiter.check(ip);
    await logRateLimitBreach("test-fn", ip, rl, req, limiter);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 25));

    // Window 2: trigger breach again — should log again
    limiter.check(ip);
    rl = limiter.check(ip);
    await logRateLimitBreach("test-fn", ip, rl, req, limiter);
  });

  assertEquals(logs.length, 2, "expected one log per window");
});

Deno.test("hashIp is deterministic and opaque", async () => {
  const a = await hashIp("192.0.2.1");
  const b = await hashIp("192.0.2.1");
  const c = await hashIp("192.0.2.2");
  assertEquals(a, b);
  assertEquals(a.length, 12);
  if (a === c) throw new Error("different IPs produced identical hashes");
  if (a.includes("192")) throw new Error("hash leaks IP characters");
});

Deno.test("integration: burst against deployed api-docs returns 200s and rate-limit headers", async () => {
  const url = "https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/api-docs";
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => fetch(url)),
  );
  for (const r of responses) {
    await r.text(); // consume body to prevent leaks
    assertEquals(r.status === 200 || r.status === 429, true);
    // Rate-limit headers must be present on every response
    if (!r.headers.get("x-ratelimit-limit")) {
      throw new Error("missing X-RateLimit-Limit header on response");
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IPv6 + mixed-stack coverage
// ─────────────────────────────────────────────────────────────────────────────

const IPV6_SAMPLES = [
  "2001:db8::1",                                 // compressed
  "2001:0db8:85a3:0000:0000:8a2e:0370:7334",      // full form
  "::1",                                          // loopback
  "fe80::1ff:fe23:4567:890a",                     // link-local
  "::ffff:192.0.2.128",                           // IPv4-mapped IPv6
];

Deno.test("hashIp handles IPv6 deterministically and opaquely", async () => {
  for (const ip of IPV6_SAMPLES) {
    const a = await hashIp(ip);
    const b = await hashIp(ip);
    assertEquals(a, b, `hash should be stable for ${ip}`);
    assertEquals(a.length, 12);
    // No IPv6 fragment (segments, '::', or embedded IPv4) should leak.
    const fragments = ip.split(/[:.]/).filter((s) => s.length >= 2);
    for (const frag of fragments) {
      if (a.toLowerCase().includes(frag.toLowerCase())) {
        throw new Error(`hash for ${ip} leaks fragment '${frag}': ${a}`);
      }
    }
    if (a.includes(":") || a.includes(".")) {
      throw new Error(`hash should be opaque hex, got ${a}`);
    }
  }
});

Deno.test("hashIp: distinct IPv6 addresses produce distinct hashes", async () => {
  const hashes = await Promise.all(IPV6_SAMPLES.map((ip) => hashIp(ip)));
  assertEquals(
    new Set(hashes).size,
    IPV6_SAMPLES.length,
    "each IPv6 sample should hash to a unique value",
  );
});

Deno.test("hashIp: equivalent-but-different IPv6 representations hash differently", async () => {
  // Document current behavior: we hash the raw header string, not a normalized
  // form. Different textual representations of the same address therefore
  // produce different hashes. This is acceptable because clients consistently
  // send one form per session, and normalization would add complexity for
  // little security benefit.
  const compressed = await hashIp("2001:db8::1");
  const expanded = await hashIp("2001:0db8:0000:0000:0000:0000:0000:0001");
  if (compressed === expanded) {
    throw new Error("expected differing hashes for non-normalized IPv6 forms");
  }
});

Deno.test("limiter buckets IPv4 and IPv6 from the same logical client independently", async () => {
  // A dual-stack client connecting via IPv4 vs IPv6 will be tracked as two
  // distinct buckets — verify this and ensure each gets its own breach log.
  const limiter = new IpRateLimiter({ limit: 2, windowMs: 60_000 });
  const req = fakeReq();
  const v4 = "192.0.2.10";
  const v6 = "2001:db8::dead:beef";

  const logs = await captureWarn(async () => {
    for (let i = 0; i < 5; i++) {
      const r4 = limiter.check(v4);
      if (!r4.allowed) await logRateLimitBreach("test-fn", v4, r4, req, limiter);
      const r6 = limiter.check(v6);
      if (!r6.allowed) await logRateLimitBreach("test-fn", v6, r6, req, limiter);
    }
  });

  assertEquals(logs.length, 2, "one breach log per address family");
  const hashes = logs.map((l) => JSON.parse(l).ipHash);
  assertEquals(new Set(hashes).size, 2, "v4 and v6 produce distinct hashes");
});

Deno.test("breach log never contains raw IPv6 address (full or compressed)", async () => {
  const limiter = new IpRateLimiter({ limit: 1, windowMs: 60_000 });
  const req = fakeReq();

  for (const ip of IPV6_SAMPLES) {
    const local = new IpRateLimiter({ limit: 1, windowMs: 60_000 });
    const logs = await captureWarn(async () => {
      local.check(ip); // allowed
      const rl = local.check(ip); // breach
      await logRateLimitBreach("test-fn", ip, rl, req, local);
    });
    assertEquals(logs.length, 1, `expected one breach log for ${ip}`);
    const line = logs[0];
    if (line.includes(ip)) {
      throw new Error(`raw IPv6 leaked into log for ${ip}: ${line}`);
    }
    // Also check non-trivial fragments don't leak.
    for (const frag of ip.split(":").filter((s) => s.length >= 3)) {
      if (line.toLowerCase().includes(frag.toLowerCase())) {
        throw new Error(`IPv6 fragment '${frag}' leaked for ${ip}: ${line}`);
      }
    }
  }

  // Silence unused-binding lint
  void limiter;
});

Deno.test("getClientIp parses IPv6 from cf-connecting-ip and x-forwarded-for", () => {
  const v6 = "2001:db8::42";

  // cf-connecting-ip wins
  const r1 = new Request("https://x.test", {
    headers: { "cf-connecting-ip": v6, "x-forwarded-for": "1.2.3.4" },
  });
  assertEquals(IpRateLimiter.getClientIp(r1), v6);

  // Falls back to x-forwarded-for; takes the FIRST entry, trimmed and normalized.
  const r2 = new Request("https://x.test", {
    headers: { "x-forwarded-for": `${v6}, 10.0.0.1` },
  });
  assertEquals(IpRateLimiter.getClientIp(r2), v6);

  // No proxy headers → "unknown"
  const r3 = new Request("https://x.test");
  assertEquals(IpRateLimiter.getClientIp(r3), "unknown");
});

Deno.test("normalizeIp strips brackets and ports for IPv6 and IPv4", () => {
  // Bracketed IPv6 with port
  assertEquals(normalizeIp("[2001:db8::42]:443"), "2001:db8::42");
  // Bracketed IPv6 without port
  assertEquals(normalizeIp("[::1]"), "::1");
  assertEquals(normalizeIp("[fe80::1ff:fe23:4567:890a]:8080"), "fe80::1ff:fe23:4567:890a");
  // Bare IPv6 — left alone
  assertEquals(normalizeIp("2001:db8::42"), "2001:db8::42");
  assertEquals(normalizeIp("::1"), "::1");
  // IPv4 with port
  assertEquals(normalizeIp("1.2.3.4:8080"), "1.2.3.4");
  // Bare IPv4
  assertEquals(normalizeIp("203.0.113.5"), "203.0.113.5");
  // Whitespace
  assertEquals(normalizeIp("  192.0.2.1  "), "192.0.2.1");
  // Empty / malformed
  assertEquals(normalizeIp(""), "unknown");
  assertEquals(normalizeIp("   "), "unknown");
  // Malformed bracket — return as-is, never throw
  assertEquals(normalizeIp("[broken"), "[broken");
});

Deno.test("getClientIp accepts bracketed IPv6 with port from proxy headers", () => {
  const r1 = new Request("https://x.test", {
    headers: { "cf-connecting-ip": "[2001:db8::42]:443" },
  });
  assertEquals(IpRateLimiter.getClientIp(r1), "2001:db8::42");

  const r2 = new Request("https://x.test", {
    headers: { "x-forwarded-for": "[2001:db8::42]:443, 10.0.0.1" },
  });
  assertEquals(IpRateLimiter.getClientIp(r2), "2001:db8::42");

  const r3 = new Request("https://x.test", {
    headers: { "x-real-ip": "[::1]" },
  });
  assertEquals(IpRateLimiter.getClientIp(r3), "::1");

  // IPv4 with port via XFF
  const r4 = new Request("https://x.test", {
    headers: { "x-forwarded-for": "203.0.113.5:51234" },
  });
  assertEquals(IpRateLimiter.getClientIp(r4), "203.0.113.5");
});

Deno.test("bracketed and bare IPv6 forms bucket to the same IP after normalization", async () => {
  // After bracket-stripping, "[v6]:port" and "v6" must resolve to the same
  // bucket — otherwise an attacker could double their effective limit by
  // alternating header forms.
  const limiter = new IpRateLimiter({ limit: 2, windowMs: 60_000 });
  const req = fakeReq();

  const ipBracketed = normalizeIp("[2001:db8::beef]:443");
  const ipBare = normalizeIp("2001:db8::beef");
  assertEquals(ipBracketed, ipBare);

  const logs = await captureWarn(async () => {
    for (let i = 0; i < 5; i++) {
      const rl = limiter.check(ipBracketed);
      if (!rl.allowed) await logRateLimitBreach("test-fn", ipBracketed, rl, req, limiter);
    }
  });
  assertEquals(logs.length, 1, "single bucket → single breach log");
});

Deno.test("bracketed IPv6 in headers does not leak raw form into breach logs", async () => {
  const limiter = new IpRateLimiter({ limit: 1, windowMs: 60_000 });
  const rawHeader = "[2001:db8::cafe]:8443";
  const ip = normalizeIp(rawHeader);
  const req = fakeReq();

  const logs = await captureWarn(async () => {
    limiter.check(ip);
    const rl = limiter.check(ip);
    await logRateLimitBreach("test-fn", ip, rl, req, limiter);
  });

  assertEquals(logs.length, 1);
  const line = logs[0];
  if (line.includes(rawHeader) || line.includes(ip)) {
    throw new Error(`raw IP/header leaked into breach log: ${line}`);
  }
  if (line.includes("[") || line.includes("]") || line.includes("8443")) {
    throw new Error(`bracket/port artifacts leaked into log: ${line}`);
  }
});