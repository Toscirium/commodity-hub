/**
 * Sanitization utilities for edge function logs.
 *
 * Goal: ensure no secrets, tokens, API keys, JWTs, emails, IPs, or other PII
 * are ever written to logs (which are persisted by Supabase and visible in the
 * dashboard).
 *
 * Strategy:
 *   - Recursively walk objects/arrays.
 *   - Redact values whose KEY name matches a sensitive pattern (e.g. token, key,
 *     password, secret, authorization, cookie, email, phone).
 *   - Redact values whose CONTENT matches a sensitive pattern (e.g. JWTs,
 *     bearer tokens, email addresses, long alphanumeric API keys, IPv4/IPv6).
 *   - Truncate any string longer than MAX_STR_LEN to avoid log bloat.
 */

const REDACTED = "[REDACTED]";
const MAX_STR_LEN = 500;
const MAX_DEPTH = 6;

// Field/key names whose values should always be redacted (case-insensitive substring match).
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "refresh",
  "access_token",
  "id_token",
  "client_secret",
  "private_key",
  "credential",
  "signature",
  "x-api-key",
  "supabase_service_role_key",
  "service_role",
  "anon_key",
  // PII
  "email",
  "phone",
  "ssn",
  "dob",
  "address",
  "ip_address",
  "ipaddress",
];

// Value-content patterns that look like secrets/PII regardless of key name.
const VALUE_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // JWT (three base64url segments separated by dots)
  {
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: "[JWT_REDACTED]",
  },
  // Bearer tokens
  { re: /Bearer\s+[A-Za-z0-9._-]+/gi, replace: "Bearer [REDACTED]" },
  // Email addresses
  {
    re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replace: "[EMAIL_REDACTED]",
  },
  // IPv4 (skip 127.0.0.1 / 0.0.0.0 to keep loopback diagnostics readable)
  {
    re: /\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replace: "[IP_REDACTED]",
  },
  // Long alphanumeric blobs that look like API keys (32+ chars, mixed)
  {
    re: /\b(?=[A-Za-z0-9_-]{32,})(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}\b/g,
    replace: "[KEY_REDACTED]",
  },
  // Stripe-style keys
  { re: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}\b/g, replace: "[STRIPE_KEY_REDACTED]" },
  // Google/AWS-style access keys
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[AWS_KEY_REDACTED]" },
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

function sanitizeString(str: string): string {
  let out = str;
  for (const { re, replace } of VALUE_PATTERNS) {
    out = out.replace(re, replace);
  }
  if (out.length > MAX_STR_LEN) {
    out = out.slice(0, MAX_STR_LEN) + `…[+${out.length - MAX_STR_LEN} chars]`;
  }
  return out;
}

/** Recursively sanitize any value before logging. Safe on circular refs. */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[MAX_DEPTH]";

  const t = typeof value;
  if (t === "string") return sanitizeString(value as string);
  if (t === "number" || t === "boolean" || t === "bigint") return value;
  if (t === "function" || t === "symbol") return `[${t}]`;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      // NOTE: stack is intentionally omitted by default to avoid leaking file
      // paths and inlined values. Re-enable per-call if needed in development.
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1, seen));
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "[Circular]";
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = sanitize(v, depth + 1, seen);
      }
    }
    return out;
  }

  return String(value);
}

/** Convenience: sanitize and JSON-stringify, never throws. */
export function sanitizeForLog(value: unknown): string {
  try {
    return JSON.stringify(sanitize(value));
  } catch {
    return "[unserializable]";
  }
}