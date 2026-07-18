// AI Commodity Copilot - streams chat responses via Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const BodySchema = z.object({
  messages: z.array(z.object({ role: z.string(), parts: z.array(z.unknown()) }).passthrough()).min(1).max(20),
  threadId: z.string().uuid(),
});

const SYSTEM_PROMPT = `You are Commodity Copilot, an expert AI assistant for commodity traders, hedgers, and investors.

You help users understand commodity markets across energy (oil, gas), metals (gold, silver, copper), agricultural (wheat, corn, soy), softs (coffee, sugar, cocoa), and livestock.

You have tools to:
- Look up live commodity prices
- Read the user's portfolio holdings
- Read the user's watchlists
- Read the user's active price alerts
- Fetch recent commodity news
- (Pro users only) Read the latest spread snapshot, seasonality history, market-regime map, and portfolio risk metrics (VaR, drawdown, beta)

Always:
- Be concise, data-driven, and practical
- Cite numbers when you have them
- Explain reasoning briefly (term structure, COT positioning, supply/demand)
- Never give regulated financial advice; frame ideas as analysis, not recommendations
- When the user references "my portfolio" / "my alerts", use the appropriate tool first

Format responses in clean markdown with bold for key numbers.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    if (JSON.stringify(body).length > 60_000) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages, threadId } = parsed.data;

    // Verify thread belongs to user
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: thread } = await admin
      .from("ai_threads")
      .select("id,user_id,title")
      .eq("id", threadId)
      .single();
    if (!thread || thread.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist incoming user message (last one)
    const lastMsg = messages[messages.length - 1] as UIMessage | undefined;
    if (lastMsg && lastMsg.role === "user") {
      await admin.from("ai_messages").insert({
        thread_id: threadId,
        user_id: userId,
        role: "user",
        parts: lastMsg.parts ?? [],
      });

      // Auto-title from first user message
      if (thread.title === "New conversation") {
        const txt = (lastMsg.parts as any[])
          ?.map((p) => (p.type === "text" ? p.text : ""))
          .join(" ")
          .slice(0, 60);
        if (txt) await admin.from("ai_threads").update({ title: txt }).eq("id", threadId);
      }
    }

    const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
    const model = gateway("google/gemini-3-flash-preview");

    // Detect Pro tier to expose extra grounding tools.
    const { data: tierData } = await admin.rpc('get_user_tier', { _user_id: userId });
    const isPro = tierData === 'pro';
    const { data: quotaAllowed, error: quotaError } = await admin.rpc('consume_ai_request_quota', {
      _user_id: userId,
      _limit: isPro ? 200 : 30,
    });
    if (quotaError) throw quotaError;
    if (!quotaAllowed) {
      return new Response(JSON.stringify({ error: 'Daily AI request limit reached' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' },
      });
    }

    const baseTools = {
      get_portfolio: tool({
        description: "Get the user's current portfolio positions and total value",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await admin
            .from("portfolio_positions")
            .select("commodity_name, quantity, entry_price, current_price, position_type")
            .eq("user_id", userId);
          return { positions: data ?? [] };
        },
      }),
      get_watchlists: tool({
        description: "Get commodities the user is watching",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await admin
            .from("watchlist_items")
            .select("commodity_name, target_price, notes, watchlists!inner(name,user_id)")
            .eq("user_id", userId);
          return { items: data ?? [] };
        },
      }),
      get_active_alerts: tool({
        description: "Get the user's active price alerts",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await admin
            .from("price_alerts")
            .select("commodity_name, alert_type, condition, target_price, config")
            .eq("user_id", userId)
            .eq("is_active", true);
          return { alerts: data ?? [] };
        },
      }),
      get_commodity_news: tool({
        description: "Fetch recent news for a specific commodity",
        inputSchema: z.object({
          commodity: z.string().describe("Commodity name e.g. 'Crude Oil', 'Gold'"),
        }),
        execute: async ({ commodity }) => {
          try {
            const res = await admin.functions.invoke("enhanced-commodity-news", {
              body: { commodity, limit: 5 },
            });
            return { news: res.data ?? [] };
          } catch (e) {
            return { news: [], error: String(e) };
          }
        },
      }),
      get_commodity_price: tool({
        description: "Get the latest price for a commodity",
        inputSchema: z.object({
          commodity: z.string().describe("Commodity name e.g. 'Crude Oil', 'Gold'"),
        }),
        execute: async ({ commodity }) => {
          try {
            const res = await admin.functions.invoke("fetch-commodity-prices", {
              body: { commodities: [commodity] },
            });
            return { price: res.data ?? null };
          } catch (e) {
            return { price: null, error: String(e) };
          }
        },
      }),
    };

    const proTools = isPro ? {
      get_spread_snapshot: tool({
        description: "Pro: Latest inter-commodity spread snapshot (crack 3-2-1, soybean crush, WTI-Brent, gold-silver ratio, etc.) with z-scores and rich/cheap tags.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await admin.from('pro_analytics_cache').select('payload, updated_at').eq('key', 'spreads:all').maybeSingle();
          return { spreads: (data?.payload as { rows?: unknown[] } | null)?.rows ?? [], asOf: data?.updated_at ?? null };
        },
      }),
      get_seasonality: tool({
        description: "Pro: 20-year monthly seasonality (avg return, hit rate) for a given commodity. Use short IDs like 'wti', 'natgas', 'gold', 'corn'.",
        inputSchema: z.object({ commodity: z.string() }),
        execute: async ({ commodity }) => {
          const { data } = await admin.from('pro_analytics_cache').select('payload').eq('key', `seasonality:${commodity}`).maybeSingle();
          return { seasonality: data?.payload ?? null };
        },
      }),
      get_market_regime: tool({
        description: "Pro: Trend (up/down/sideways) and vol regime (low/normal/high) across every tracked commodity.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await admin.from('pro_analytics_cache').select('payload, updated_at').eq('key', 'regime:all').maybeSingle();
          return { regime: (data?.payload as { rows?: unknown[] } | null)?.rows ?? [], asOf: data?.updated_at ?? null };
        },
      }),
      get_portfolio_risk: tool({
        description: "Pro: Compute the user's portfolio risk metrics — Value-at-Risk 95%, max drawdown, annualized volatility, Sharpe, and crude beta.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const res = await admin.functions.invoke('pro-analytics', {
              body: { route: 'portfolio_analytics' },
              headers: { Authorization: authHeader },
            });
            return { risk: res.data ?? null };
          } catch (e) {
            return { risk: null, error: String(e) };
          }
        },
      }),
    } : {};

    const tools = { ...baseTools, ...proTools };

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages as UIMessage[]),
      tools,
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages as UIMessage[],
      headers: corsHeaders,
      onFinish: async ({ messages: finalMessages }) => {
        const assistantMsg = finalMessages[finalMessages.length - 1];
        if (assistantMsg?.role === "assistant") {
          await admin.from("ai_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "assistant",
            parts: assistantMsg.parts ?? [],
          });
          await admin.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        }
      },
    });
  } catch (err) {
    console.error("ai-copilot error", err);
    const msg = String((err as Error)?.message ?? err);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
