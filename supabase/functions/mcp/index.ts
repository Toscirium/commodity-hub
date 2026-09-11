// Commodity Hub's own MCP server — the "Option B" from
// docs/IBKR_INTEGRATION_OPTIONS.md. The pitch: a user connects IBKR's own
// official MCP server (https://api.ibkr.com/v1/api/mcp-public) to their AI
// tool for their live account, and connects THIS server for the analytics
// layer neither IBKR nor the AI itself has — forward curves, COT
// positioning, seasonality, fundamentals, and their own watchlists/alerts.
// The AI combines both in one conversation. We never touch IBKR credentials;
// IBKR never touches ours.
//
// Same auth, same rate limit, same tier gating as the REST Data API
// (data-api/index.ts) — literally the same `ch_live_...` key, the same
// data_api_keys/rate-limit/trial-quota tables and RPCs, and the same
// resource logic (dataApiResources.ts). This is deliberately a second
// *protocol* over the existing API, not a second product: a key a developer
// already has for REST just works here too, and usage from both shows up
// together (tagged `mcp:<tool>` vs the bare resource name) in
// data_api_usage — see data-api-usage/index.ts.
//
// Protocol notes (MCP spec, Streamable HTTP transport):
// - Single POST endpoint, JSON body, one JSON-RPC message per request (no
//   batching — dropped from later spec revisions, and no client we target
//   needs it for a tools-only server like this one).
// - We only ever return a single `application/json` response, never
//   `text/event-stream` — correct per spec for a server with nothing to
//   push after the one response (no server-initiated messages, no
//   long-running tool calls here). GET (the SSE-stream half of the
//   transport) is therefore unsupported and returns 405, which the spec
//   explicitly allows for servers that don't offer a standalone SSE stream.
// - Stateless: no session ID is issued or required. Every tool call re-runs
//   the same auth/rate-limit path a REST call would.
// - Auth is a static bearer API key (`Authorization: Bearer ch_live_...`),
//   not OAuth. That's a deliberate v1 simplification (see
//   IBKR_INTEGRATION_OPTIONS.md open question #3) — CLI/agent MCP clients
//   (Claude Code, Cursor) just take a pasted token with no browser dance;
//   OAuth 2.1 + Dynamic Client Registration (what Claude.ai's own custom
//   connectors expect for a *browser* flow) is real follow-up work, not
//   scaffolding.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { rateLimitHeaders, tooManyRequestsResponse, type RateLimitResult } from '../_shared/rateLimit.ts';
import {
  resourcePortfolio, resourceWatchlists, resourcePrices, resourceCot,
  resourceFundamentals, resourceAlerts, resourceSentiment, resourceNews,
  resourceAnalyticsSnapshot, type ResourceCtx, type ResourceResult,
  MAX_COT_LIMIT, MAX_NEWS_LIMIT, MASSIVE_PRODUCTS, MONTHS_AHEAD_MIN, MONTHS_AHEAD_MAX,
} from '../_shared/dataApiResources.ts';

// Same DB-backed atomic limits as data-api/index.ts — see that file's
// comment on why this is an UPSERT-increment RPC and not an in-memory
// counter. Intentionally the SAME budget, not a separate one: a key gets one
// combined allowance across REST + MCP, not double the throughput by using
// both.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const TRIAL_DAILY_LIMIT = 50;

// MCP protocol version this server speaks. Echoed back from whatever the
// client requests in `initialize` when we recognize it, otherwise we offer
// this one — permissive-by-default rather than hard-rejecting a client on a
// version string mismatch, since the wire format we actually use (tools
// list + tools call, no fancy capabilities) has been stable across recent
// revisions.
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'commodity-hub';
const SERVER_VERSION = '1.0.0';

// A couple of MCP-specific headers clients may send that aren't in the
// shared corsHeaders allow-list (that list is used by every function in
// this project, so we extend it locally rather than widen it globally).
const MCP_CORS_HEADERS: Record<string, string> = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, mcp-protocol-version, mcp-session-id`,
};

const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map((v) => v.toString(16).padStart(2, '0')).join('');

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const rpcResult = (id: JsonRpcRequest['id'], result: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result }), {
    status: 200,
    headers: { ...MCP_CORS_HEADERS, ...extraHeaders, 'Content-Type': 'application/json' },
  });

const rpcError = (id: JsonRpcRequest['id'], code: number, message: string, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), {
    status,
    headers: { ...MCP_CORS_HEADERS, ...extraHeaders, 'Content-Type': 'application/json' },
  });

// Plain (non-JSON-RPC) HTTP error, for failures before we even have a
// parsed request to attach an `id` to (auth, rate limit, malformed body).
const httpError = (body: unknown, status: number, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...MCP_CORS_HEADERS, ...extraHeaders, 'Content-Type': 'application/json' } });

/**
 * Wraps a ResourceResult (the same {status, body} shape data-api/index.ts
 * consumes) into an MCP tool-call result. Per spec, a resource-level failure
 * (403 pro_required, 404 snapshot_not_available, ...) is reported via
 * `isError: true` inside a normal result, NOT a JSON-RPC protocol error —
 * protocol errors are reserved for things like an unknown tool name or
 * malformed arguments, which a well-behaved client can't recover from by
 * itself. A gating error, by contrast, is exactly the kind of thing we want
 * the model to read and explain to the user ("this needs a Pro key").
 */
const toolResult = (r: ResourceResult) => ({
  content: [{ type: 'text', text: JSON.stringify(r.body) }],
  isError: r.status >= 400,
});

type ToolHandler = (ctx: ResourceCtx, args: Record<string, unknown>) => Promise<ResourceResult>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// Tool catalog. Each entry mirrors one data-api `resource` 1:1 — same
// gating, same limits, same underlying query — just addressed by name and
// typed arguments instead of a `?resource=` query string. Kept as a flat
// list (not auto-derived from some shared schema) so each tool's
// description can be written for a model reading it cold, not for a human
// reading REST docs.
const TOOLS: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}> = [
  {
    name: 'get_prices',
    description:
      'Get commodity prices. Omit `commodity` for the current price of every tracked commodity. ' +
      'Provide `commodity` alone for one current price, or with `timeframe` for historical chart data.',
    inputSchema: {
      type: 'object',
      properties: {
        commodity: { type: 'string', description: 'Full display name, e.g. "WTI Crude Oil". Omit for all commodities.' },
        timeframe: { type: 'string', enum: ['1d', '1m', '3m', '6m', '1y', '2y'], description: 'Requires `commodity`. Omit for the current price only.' },
      },
    },
    handler: (ctx, a) => resourcePrices(ctx, { commodity: str(a.commodity), timeframe: str(a.timeframe) }),
  },
  {
    name: 'get_cot_positioning',
    description: 'Get CFTC Commitments of Traders weekly positioning (managed money / commercials, net position, open interest) for one commodity.',
    inputSchema: {
      type: 'object',
      properties: {
        commodity: { type: 'string', description: 'Full display name, e.g. "WTI Crude Oil".' },
        limit: { type: 'integer', description: `Weekly reports to return, default 52, max ${MAX_COT_LIMIT}.` },
      },
      required: ['commodity'],
    },
    handler: (ctx, a) => resourceCot(ctx, { commodity: str(a.commodity), limit: num(a.limit) }),
  },
  {
    name: 'get_fundamentals',
    description: 'Get EIA/USDA/FRED fundamentals series. Provide `series_id` for one full series with its observation history, or `dataset` (or neither) to list series with their latest values only.',
    inputSchema: {
      type: 'object',
      properties: {
        series_id: { type: 'string', description: 'e.g. "PET.WCESTUS1.W". Returns the full observation history for just this series.' },
        dataset: { type: 'string', description: 'Filters the list view, e.g. "petroleum". Ignored if series_id is set.' },
      },
    },
    handler: (ctx, a) => resourceFundamentals(ctx, { seriesId: str(a.series_id), dataset: str(a.dataset) }),
  },
  {
    name: 'get_sentiment',
    description: 'Get community bullish/bearish sentiment votes, per commodity or for all commodities.',
    inputSchema: {
      type: 'object',
      properties: { commodity: { type: 'string', description: 'Full display name. Omit for all commodities.' } },
    },
    handler: (ctx, a) => resourceSentiment(ctx, { commodity: str(a.commodity) }),
  },
  {
    name: 'get_news',
    description: 'Get recent commodity news articles. Requires an active Premium or Pro subscription on the key\'s account.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['energy', 'metals', 'grains', 'livestock', 'softs', 'economic', 'geopolitical', 'general'] },
        limit: { type: 'integer', description: `Default 20, max ${MAX_NEWS_LIMIT}.` },
      },
    },
    handler: (ctx, a) => resourceNews(ctx, { category: str(a.category), limit: num(a.limit) }),
  },
  {
    name: 'get_vol_cone',
    description: 'Get the implied-volatility cone for a commodity. Requires an active Pro subscription. Reads a cached snapshot — never computes live.',
    inputSchema: {
      type: 'object',
      properties: { commodity: { type: 'string', enum: Array.from(MASSIVE_PRODUCTS), description: 'Short slug, NOT the display name (different namespace from get_prices/get_cot_positioning).' } },
      required: ['commodity'],
    },
    handler: (ctx, a) => resourceAnalyticsSnapshot(ctx, 'vol_cone', { commodity: str(a.commodity) }),
  },
  {
    name: 'get_term_structure',
    description: 'Get the futures term structure / forward curve for a commodity. Requires an active Pro subscription. Reads a cached snapshot — never computes live.',
    inputSchema: {
      type: 'object',
      properties: {
        commodity: { type: 'string', enum: Array.from(MASSIVE_PRODUCTS), description: 'Short slug, NOT the display name.' },
        months_ahead: { type: 'integer', minimum: MONTHS_AHEAD_MIN, maximum: MONTHS_AHEAD_MAX, description: 'How far out the curve extends. Default 12.' },
      },
      required: ['commodity'],
    },
    handler: (ctx, a) => resourceAnalyticsSnapshot(ctx, 'term_structure', { commodity: str(a.commodity), monthsAhead: num(a.months_ahead) }),
  },
  {
    name: 'get_roll_scanner',
    description: 'Get the full-universe futures roll scanner (contango/backwardation, days-to-roll) across all tracked commodities. Requires an active Pro subscription. Reads a cached snapshot — never computes live.',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => resourceAnalyticsSnapshot(ctx, 'roll_scanner', {}),
  },
  {
    name: 'list_portfolio',
    description: 'List the key owner\'s own portfolio positions (commodity, quantity, entry price/date, notes).',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => resourcePortfolio(ctx),
  },
  {
    name: 'list_watchlists',
    description: 'List the key owner\'s own watchlists and their items.',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => resourceWatchlists(ctx),
  },
  {
    name: 'list_price_alerts',
    description: 'List the key owner\'s own price alerts (condition, target price, active state).',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => resourceAlerts(ctx),
  },
];
const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: MCP_CORS_HEADERS });
  // No standalone SSE stream offered — see file header. A GET here is a
  // client probing for one; 405 is the spec-sanctioned answer.
  if (req.method === 'GET') return httpError({ error: 'method_not_allowed', message: 'This server has no standalone SSE stream. POST a JSON-RPC request instead.' }, 405);
  if (req.method !== 'POST') return httpError({ error: 'method_not_allowed' }, 405);

  const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!raw.startsWith('ch_live_')) {
    return httpError({ error: 'api_key_required', message: 'Create a key at https://app.commodity-hub.eu/exports and connect with Authorization: Bearer ch_live_...' }, 401);
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  if (!rpc || typeof rpc.method !== 'string') return rpcError((rpc as JsonRpcRequest)?.id ?? null, -32600, 'Invalid Request', 400);
  const isNotification = rpc.id === undefined; // JSON-RPC notifications carry no id and get no response body

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: key } = await admin.from('data_api_keys').select('id,user_id').eq('key_hash', await hash(raw)).is('revoked_at', null).maybeSingle();
  if (!key) return httpError({ error: 'invalid_api_key' }, 401);

  const { data: profile } = await admin.from('profiles').select('subscription_active, subscription_tier').eq('id', key.user_id).maybeSingle();
  const isPro = !!profile?.subscription_active && profile.subscription_tier === 'pro';
  const isPremiumOrPro = !!profile?.subscription_active && (profile.subscription_tier === 'premium' || profile.subscription_tier === 'pro');

  // Handshake and discovery methods don't touch the resource layer, so they
  // skip rate limiting/trial-quota entirely — same principle as a REST
  // client listing available resources on /api-docs not costing quota.
  if (rpc.method === 'initialize') {
    return rpcResult(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        'Read-only commodity market data: prices, COT positioning, fundamentals, sentiment, news, ' +
        'and curve/vol analytics, plus the key owner\'s own portfolio/watchlists/alerts. ' +
        'Pair this with a broker\'s own MCP server (e.g. IBKR\'s) to reason over real positions ' +
        'against these curves in one conversation — this server never touches brokerage accounts.',
    });
  }
  if (rpc.method === 'notifications/initialized' || rpc.method.startsWith('notifications/')) {
    return isNotification ? new Response(null, { status: 202, headers: MCP_CORS_HEADERS }) : rpcResult(rpc.id, {});
  }
  if (rpc.method === 'ping') return rpcResult(rpc.id, {});
  if (rpc.method === 'tools/list') return rpcResult(rpc.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });

  if (rpc.method !== 'tools/call') return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`, 404);

  const toolName = str(rpc.params?.name);
  const tool = toolName ? TOOLS_BY_NAME.get(toolName) : undefined;
  if (!tool) return rpcError(rpc.id, -32602, `Unknown tool: ${toolName ?? '(missing name)'}`, 400);
  const args = (rpc.params?.arguments && typeof rpc.params.arguments === 'object' ? rpc.params.arguments : {}) as Record<string, unknown>;

  // From here on this is functionally the same request data-api/index.ts
  // would handle — same DB-backed atomic rate limit, same trial quota,
  // same usage recording — just reached via tools/call instead of a query
  // string. `p_resource` is tagged `mcp:<tool>` so data_api_usage can tell
  // the two protocols apart without a schema change.
  const windowStartMs = Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const { data: requestCount, error: rateErr } = await admin.rpc('data_api_increment_rate', { p_key_id: key.id, p_window_start: new Date(windowStartMs).toISOString() });
  if (rateErr) console.error(JSON.stringify({ evt: 'rate_limit_check_failed', fn: 'mcp', keyId: key.id, error: rateErr.message })); // fail open, same as data-api
  const count = rateErr ? 0 : (requestCount as number);
  const resetAt = windowStartMs + RATE_WINDOW_MS;
  const limit: RateLimitResult = {
    allowed: count <= RATE_LIMIT,
    limit: RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
  if (!limit.allowed) {
    console.warn(JSON.stringify({ evt: 'rate_limit_breach', fn: 'mcp', keyId: key.id, count, limit: RATE_LIMIT, ts: new Date().toISOString() }));
    return tooManyRequestsResponse(limit, MCP_CORS_HEADERS); // plain HTTP 429, not a JSON-RPC error — matches data-api's own shape for the same condition
  }

  if (!isPro) {
    const { data: trialCount, error: trialErr } = await admin.rpc('data_api_increment_trial_quota', { p_key_id: key.id });
    if (trialErr) {
      console.error(JSON.stringify({ evt: 'trial_quota_check_failed', fn: 'mcp', keyId: key.id, error: trialErr.message }));
    } else if ((trialCount as number) > TRIAL_DAILY_LIMIT) {
      console.warn(JSON.stringify({ evt: 'trial_quota_exceeded', fn: 'mcp', keyId: key.id, count: trialCount, ts: new Date().toISOString() }));
      return rpcResult(rpc.id, {
        content: [{ type: 'text', text: JSON.stringify({ error: 'trial_daily_limit_exceeded', message: `Free trial is limited to ${TRIAL_DAILY_LIMIT} requests/day. Upgrade to Pro for unlimited requests (60/min).`, upgrade_url: 'https://app.commodity-hub.eu/data-api' }) }],
        isError: true,
      }, rateLimitHeaders(limit));
    }
  }

  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const runBackground = (task: Promise<unknown>) => (rt?.waitUntil ? rt.waitUntil(task) : task.catch(() => {}));
  runBackground(Promise.resolve(admin.from('data_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)));
  runBackground(
    Promise.resolve(admin.rpc('data_api_record_usage', { p_key_id: key.id, p_resource: `mcp:${tool.name}` })).then(({ error: usageErr }) => {
      if (usageErr) console.error(JSON.stringify({ evt: 'usage_record_failed', fn: 'mcp', keyId: key.id, error: usageErr.message }));
    }),
  );

  const ctx: ResourceCtx = { admin, userId: key.user_id, isPro, isPremiumOrPro };
  const result = await tool.handler(ctx, args);
  return rpcResult(rpc.id, toolResult(result), rateLimitHeaders(limit));
});
