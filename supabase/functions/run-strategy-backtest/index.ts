// Custom Strategy Backtest Sandbox — Pro users author a JS `backtest(bars)`
// function and this runs it against a real two-leg commodity spread's price
// history, server-side, inside a QuickJS-WASM interpreter with zero host
// bindings (no fetch/Deno/console/anything reachable from user code).
//
// Why QuickJS-in-WASM rather than a "real" sandbox (container/subprocess):
// Supabase Edge Functions give no subprocess/container spawning, so there is
// no gVisor/Firecracker-style option available here. An embedded WASM JS
// engine with nothing bound into its global scope is the strongest isolation
// achievable on this hosting platform — verified locally under Deno before
// building this: normal execution, a `while(true){}` strategy killed cleanly
// by the interrupt handler within its deadline, a memory-bomb strategy
// rejected by the memory limit, and zero host globals reachable from inside.
//
// Unlike pro-analytics' seasonality backtest (which compounds % returns —
// fine for a single, always-positive commodity price), a spread's value
// (weightA*a + weightB*b) can cross zero, so % returns aren't well-defined
// here. This works in absolute P&L points instead: equity is a running sum
// of `position * change-in-spread-value`, not a compounding ratio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { getQuickJS } from 'npm:quickjs-emscripten@0.31.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveFrontMonthBars } from '../_shared/massive-client.ts';
import { ensurePro } from '../_shared/proTier.ts';
import { alignPair } from '../_shared/spreadSeries.ts';
import { annualizedSharpe, maxDrawdownAbsolute } from '../_shared/backtestMath.ts';
import { rateLimitHeaders, tooManyRequestsResponse, type RateLimitResult } from '../_shared/rateLimit.ts';

// Kept in sync by hand with pro-analytics' PRODUCTS map (same commodity ids)
// rather than imported across function boundaries — each edge function in
// this repo is deployed as its own self-contained bundle (see _shared/ for
// what's actually meant to be shared).
const PRODUCTS: Record<string, { label: string; code: string }> = {
  wti:       { label: 'WTI Crude',     code: 'CL' },
  brent:     { label: 'Brent Crude',   code: 'BZ' },
  natgas:    { label: 'Natural Gas',   code: 'NG' },
  rbob:      { label: 'RBOB Gasoline', code: 'RB' },
  heating:   { label: 'Heating Oil',   code: 'HO' },
  gold:      { label: 'Gold',          code: 'GC' },
  silver:    { label: 'Silver',        code: 'SI' },
  copper:    { label: 'Copper',        code: 'HG' },
  platinum:  { label: 'Platinum',      code: 'PL' },
  palladium: { label: 'Palladium',     code: 'PA' },
  corn:      { label: 'Corn',          code: 'ZC' },
  wheat:     { label: 'Wheat',         code: 'ZW' },
  soybeans:  { label: 'Soybeans',      code: 'ZS' },
  soymeal:   { label: 'Soybean Meal',  code: 'ZM' },
  soyoil:    { label: 'Soybean Oil',   code: 'ZL' },
  cattle:    { label: 'Live Cattle',   code: 'LE' },
  hogs:      { label: 'Lean Hogs',     code: 'HE' },
};

const MAX_CODE_LENGTH = 20_000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000; // 10 requests / 10 minutes per user
const EXEC_DEADLINE_MS = 2_000;
const EXEC_MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_BARS = 6000; // ~20y of daily bars with headroom

// Cheap, early, defense-in-depth rejects only — the actual security
// boundary is the sandbox exposing no bindings at all, not this list.
const FORBIDDEN_PATTERNS = [/\bDeno\./, /\bimport\s*\(/, /\brequire\s*\(/, /\bprocess\./, /\bfetch\s*\(/, /\bWorker\s*\(/, /\bXMLHttpRequest\b/, /\beval\s*\(/];

const BodySchema = z.object({
  strategyId: z.string().uuid().optional(),
  code: z.string().min(1).max(MAX_CODE_LENGTH).optional(),
  legA: z.string().optional(),
  legB: z.string().optional(),
  weightA: z.number().min(-100).max(100).optional(),
  weightB: z.number().min(-100).max(100).optional(),
  years: z.number().int().min(1).max(20).optional(),
}).refine((b) => b.strategyId || (b.code && b.legA && b.legB), {
  message: 'Provide either strategyId or {code, legA, legB}',
});

interface StrategyResult {
  legA: string; legALabel: string;
  legB: string; legBLabel: string;
  weightA: number; weightB: number;
  years: number;
  totalPnl: number;
  buyHoldPnl: number;
  maxDrawdown: number;
  sharpe: number | null;
  hitRate: number;
  trades: number;
  bars: number;
  equityCurve: { date: string; equity: number }[];
  generatedAt: string;
}

function staticCodeCheck(code: string): string | null {
  if (!/\bfunction\s+backtest\s*\(/.test(code)) {
    return 'Code must define a top-level function named backtest(bars).';
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) return `Disallowed token matching ${pattern}. The sandbox has no such bindings anyway — remove it.`;
  }
  return null;
}

async function runInSandbox(
  code: string,
  bars: { date: string; a: number; b: number }[],
): Promise<{ ok: true; signals: number[] } | { ok: false; error: string }> {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(EXEC_MEMORY_LIMIT_BYTES);
  const start = Date.now();
  let steps = 0;
  const MAX_STEPS = 50_000_000;
  runtime.setInterruptHandler(() => {
    steps++;
    return Date.now() - start > EXEC_DEADLINE_MS || steps > MAX_STEPS;
  });
  const vm = runtime.newContext();
  try {
    const payload = bars.map((b) => ({ date: b.date, a: b.a, b: b.b }));
    const inject = vm.evalCode(`globalThis.__BARS__ = ${JSON.stringify(JSON.stringify(payload))};`);
    if (inject.error) { inject.error.dispose(); return { ok: false, error: 'Failed to load price data into sandbox.' }; }
    inject.value.dispose();

    const wrapped = `
      (function () {
        ${code}
        const bars = JSON.parse(globalThis.__BARS__);
        const out = backtest(bars);
        return JSON.stringify(out);
      })()
    `;
    const result = vm.evalCode(wrapped);
    if (result.error) {
      const dumped = vm.dump(result.error);
      result.error.dispose();
      const message = typeof dumped === 'object' && dumped && 'message' in dumped
        ? String((dumped as { message: unknown }).message)
        : String(dumped);
      return { ok: false, error: message.slice(0, 300) };
    }
    const raw = vm.dump(result.value);
    result.value.dispose();
    let parsed: unknown;
    try { parsed = JSON.parse(raw as string); } catch { return { ok: false, error: 'backtest() must return JSON-serializable output.' }; }
    if (!Array.isArray(parsed) || parsed.length !== bars.length || !parsed.every((v) => v === -1 || v === 0 || v === 1)) {
      return { ok: false, error: `backtest() must return an array of -1|0|1 with length ${bars.length} (one signal per bar). Got ${Array.isArray(parsed) ? parsed.length : typeof parsed}.` };
    }
    return { ok: true, signals: parsed as number[] };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

function computeResult(
  legA: string, legB: string, weightA: number, weightB: number, years: number,
  bars: { date: string; a: number; b: number }[], signals: number[],
): StrategyResult {
  const spreadValue = bars.map((b) => weightA * b.a + weightB * b.b);
  let equity = 0;
  const equityCurve: { date: string; equity: number }[] = [{ date: bars[0].date, equity: 0 }];
  const pnlSeries: number[] = [];
  let trades = 0;
  let wins = 0;
  for (let i = 1; i < bars.length; i++) {
    const pos = signals[i];
    const deltaS = spreadValue[i] - spreadValue[i - 1];
    const pnl = pos * deltaS;
    equity += pnl;
    equityCurve.push({ date: bars[i].date, equity: Number(equity.toFixed(4)) });
    if (pos !== 0) {
      trades++;
      pnlSeries.push(pnl);
      if (pnl > 0) wins++;
    }
  }
  const buyHoldPnl = spreadValue[spreadValue.length - 1] - spreadValue[0];
  return {
    legA, legALabel: PRODUCTS[legA].label,
    legB, legBLabel: PRODUCTS[legB].label,
    weightA, weightB, years,
    totalPnl: Number(equity.toFixed(4)),
    buyHoldPnl: Number(buyHoldPnl.toFixed(4)),
    maxDrawdown: Number(maxDrawdownAbsolute(equityCurve.map((p) => p.equity)).toFixed(4)),
    sharpe: (() => { const s = annualizedSharpe(pnlSeries, 252); return s != null ? Number(s.toFixed(2)) : null; })(),
    hitRate: trades ? Number((wins / trades).toFixed(3)) : 0,
    trades,
    bars: bars.length,
    equityCurve,
    generatedAt: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const logger = new EdgeLogger({ functionName: 'run-strategy-backtest' });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Invalid session' }, 401);
    const userId = userData.user.id;

    if (!(await ensurePro(admin, userId))) return json({ error: 'Pro tier required' }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
    const body = parsed.data;

    // Rate limit before doing any real work — atomic UPSERT-increment RPC,
    // same pattern as data-api's data_api_increment_rate (see that
    // migration's comment for why a plain COUNT isn't safe under concurrency).
    const windowStartMs = Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const { data: requestCount, error: rateErr } = await admin.rpc('strategy_backtest_increment_rate', {
      p_user_id: userId, p_window_start: new Date(windowStartMs).toISOString(),
    });
    if (rateErr) logger.warn('rate limit check failed, failing open', rateErr.message);
    const count = rateErr ? 0 : (requestCount as number);
    const resetAt = windowStartMs + RATE_WINDOW_MS;
    const rl: RateLimitResult = {
      allowed: count <= RATE_LIMIT, limit: RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - count),
      resetAt, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
    if (!rl.allowed) return tooManyRequestsResponse(rl, corsHeaders);
    const rlHeaders = rateLimitHeaders(rl);

    // Resolve strategy source: either a saved row (owned-by-caller, enforced
    // by RLS via the user's own client) or an ad-hoc run.
    let code: string, legA: string, legB: string, weightA: number, weightB: number, years: number, strategyId: string | undefined;
    if (body.strategyId) {
      const { data: row, error: rowErr } = await userClient
        .from('user_strategies')
        .select('id, code, leg_a, leg_b, weight_a, weight_b, years')
        .eq('id', body.strategyId)
        .maybeSingle();
      if (rowErr || !row) return json({ error: 'Strategy not found' }, 404);
      strategyId = row.id; code = row.code; legA = row.leg_a; legB = row.leg_b;
      weightA = Number(row.weight_a); weightB = Number(row.weight_b); years = row.years;
    } else {
      code = body.code!; legA = body.legA!; legB = body.legB!;
      weightA = body.weightA ?? 1; weightB = body.weightB ?? 1; years = body.years ?? 10;
    }

    if (!PRODUCTS[legA] || !PRODUCTS[legB]) return json({ error: 'Unknown commodity in legA/legB' }, 400, rlHeaders);
    if (legA === legB) return json({ error: 'legA and legB must be different commodities' }, 400, rlHeaders);

    const codeIssue = staticCodeCheck(code);
    if (codeIssue) return json({ error: codeIssue }, 400, rlHeaders);

    const to = new Date();
    const from = new Date(to.getTime() - years * 365 * 24 * 60 * 60 * 1000);
    const [barsA, barsB] = await Promise.all([
      fetchMassiveFrontMonthBars(PRODUCTS[legA].code, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)) as unknown as Promise<{ date: string; close: number }[]>,
      fetchMassiveFrontMonthBars(PRODUCTS[legB].code, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)) as unknown as Promise<{ date: string; close: number }[]>,
    ]);
    let bars = alignPair(
      (barsA ?? []).filter((b) => b?.close != null),
      (barsB ?? []).filter((b) => b?.close != null),
    );
    if (bars.length > MAX_BARS) bars = bars.slice(-MAX_BARS);
    if (bars.length < 20) return json({ error: 'Not enough overlapping price history for this pair' }, 400, rlHeaders);

    const sandboxResult = await runInSandbox(code, bars);
    if (!sandboxResult.ok) return json({ error: 'Strategy failed', message: sandboxResult.error }, 400, rlHeaders);

    const payload = computeResult(legA, legB, weightA, weightB, years, bars, sandboxResult.signals);

    if (strategyId) {
      await admin.from('user_strategies').update({ last_run_at: payload.generatedAt, last_result: payload }).eq('id', strategyId);
    }

    return json(payload, 200, rlHeaders);
  } catch (err) {
    logger.error('run-strategy-backtest failed', err);
    return json({ error: 'Backtest failed', message: (err as Error).message }, 500);
  }
});
