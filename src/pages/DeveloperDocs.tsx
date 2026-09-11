import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Zap, ShieldCheck, Code2, ExternalLink, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import SEOHead from '@/components/SEOHead';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const BASE_URL = `${SUPABASE_URL}/functions/v1/data-api`;
const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp`;

const CodeBlock: React.FC<{ children: string; label?: string }> = ({ children, label }) => (
  <div className="space-y-1">
    {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
    <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  </div>
);

type Resource = {
  id: string;
  title: string;
  description: string;
  /** Unset = available on the free trial. Set = gated the same as the app itself. */
  tier?: 'premium' | 'pro';
  params: { name: string; required?: boolean; note: string }[];
  example: string;
  response: string;
};

const RESOURCES: Resource[] = [
  {
    id: 'prices',
    title: 'resource=prices',
    description: 'Live and historical commodity prices — the same feed the app itself runs on.',
    params: [
      { name: 'commodity', note: "e.g. 'WTI Crude Oil'. Omit to get every commodity's current price in one call." },
      { name: 'timeframe', note: "One of 1d, 1m, 3m, 6m, 1y, 2y. Requires commodity. Omit for just the current price; set it to get historical chart data instead." },
    ],
    example: `# Current price, single commodity
curl "${BASE_URL}?resource=prices&commodity=WTI%20Crude%20Oil" \\
  -H "Authorization: Bearer ch_live_..."

# Historical, single commodity
curl "${BASE_URL}?resource=prices&commodity=WTI%20Crude%20Oil&timeframe=6m" \\
  -H "Authorization: Bearer ch_live_..."

# Every commodity, current price
curl "${BASE_URL}?resource=prices" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": {
    "symbol": "CL",
    "name": "WTI Crude Oil",
    "price": 80.32,
    "change": -0.41,
    "changePercent": -0.51,
    "category": "energy",
    "contractSize": "1,000 barrels",
    "venue": "NYMEX"
  },
  "generated_at": "2026-08-27T12:00:00.000Z"
}`,
  },
  {
    id: 'portfolio',
    title: 'resource=portfolio',
    description: 'The positions in your Commodity Hub portfolio.',
    params: [],
    example: `curl "${BASE_URL}?resource=portfolio" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "commodity_name": "WTI Crude Oil",
      "quantity": 2,
      "entry_price": 78.4,
      "entry_date": "2026-06-01",
      "notes": null,
      "created_at": "2026-06-01T14:02:11.000Z"
    }
  ],
  "generated_at": "2026-08-27T12:00:00.000Z"
}`,
  },
  {
    id: 'watchlists',
    title: 'resource=watchlists',
    description: 'Your saved watchlists and their items.',
    params: [],
    example: `curl "${BASE_URL}?resource=watchlists" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "Energy",
      "created_at": "2026-05-11T09:00:00.000Z",
      "watchlist_items": [
        { "commodity_name": "WTI Crude Oil", "commodity_symbol": "CL", "position": 0 }
      ]
    }
  ],
  "generated_at": "2026-08-27T12:00:00.000Z"
}`,
  },
  {
    id: 'cot',
    title: 'resource=cot',
    description: 'CFTC Commitments of Traders positioning, by commodity.',
    params: [
      { name: 'commodity', required: true, note: "e.g. 'WTI Crude Oil'" },
      { name: 'limit', note: 'Weekly reports to return. Default 52, max 520 (10 years).' },
    ],
    example: `curl "${BASE_URL}?resource=cot&commodity=WTI%20Crude%20Oil&limit=104" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "commodity": "WTI Crude Oil",
      "report_date": "2026-08-19",
      "managed_money_long": 241382,
      "managed_money_short": 98211,
      "commercials_long": 512004,
      "commercials_short": 601887,
      "net_position": 143171,
      "open_interest": 1834221
    }
  ],
  "generated_at": "2026-08-27T12:00:00.000Z"
}`,
  },
  {
    id: 'fundamentals',
    title: 'resource=fundamentals',
    description: 'EIA/USDA/FRED-sourced fundamentals series (inventories, production, etc).',
    params: [
      { name: 'series_id', note: "Return one series with its full observation history, e.g. 'PET.WCESTUS1.W'." },
      { name: 'dataset', note: "Filter the list view, e.g. 'petroleum'. Ignored if series_id is set." },
    ],
    example: `# List view (latest value per series, no full history)
curl "${BASE_URL}?resource=fundamentals&dataset=petroleum" \\
  -H "Authorization: Bearer ch_live_..."

# Single series, full history
curl "${BASE_URL}?resource=fundamentals&series_id=PET.WCESTUS1.W" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": {
    "series_id": "PET.WCESTUS1.W",
    "dataset": "petroleum",
    "label": "Cushing, OK Crude Oil Stocks",
    "unit": "Thousand Barrels",
    "observations": [{ "date": "2026-08-15", "value": 24831 }, "..."],
    "latest_value": 24831,
    "latest_period": "2026-08-15",
    "wow_change": -412,
    "yoy_change": 1893,
    "five_year_avg": 26210,
    "updated_at": "2026-08-16T11:00:00.000Z"
  },
  "generated_at": "2026-08-27T12:00:00.000Z"
}`,
  },
  {
    id: 'alerts',
    title: 'resource=alerts',
    description: 'Your saved price alerts.',
    params: [],
    example: `curl "${BASE_URL}?resource=alerts" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "id": "b7c1...",
      "commodity_name": "WTI Crude Oil",
      "commodity_symbol": "CL",
      "condition": "below",
      "target_price": 75,
      "is_active": true,
      "last_triggered_at": null,
      "cooldown_minutes": 60,
      "note": null,
      "created_at": "2026-07-02T10:00:00.000Z"
    }
  ],
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
  {
    id: 'sentiment',
    title: 'resource=sentiment',
    description: 'Community bullish/bearish votes per commodity. Free — same as the in-app sentiment page.',
    params: [
      { name: 'commodity', note: "e.g. 'WTI Crude Oil'. Omit to get every commodity's aggregate." },
    ],
    example: `curl "${BASE_URL}?resource=sentiment&commodity=WTI%20Crude%20Oil" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "commodity_name": "WTI Crude Oil",
      "bullish_votes": 412,
      "bearish_votes": 287,
      "total_votes": 699,
      "average_confidence": 3.4,
      "last_updated": "2026-08-29T09:00:00.000Z"
    }
  ],
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
  {
    id: 'news',
    title: 'resource=news',
    description: 'The RSS-based commodity news feed, filterable by category.',
    tier: 'premium',
    params: [
      { name: 'category', note: 'One of energy, metals, grains, livestock, softs, economic, geopolitical, general.' },
      { name: 'limit', note: 'Articles to return. Default 20, max 100.' },
    ],
    example: `curl "${BASE_URL}?resource=news&category=energy&limit=10" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": [
    {
      "title": "EIA cuts 2027 crude production forecast",
      "description": "...",
      "url": "https://...",
      "source_name": "OilPrice.com",
      "category": "energy",
      "published_at": "2026-08-29T08:12:00.000Z"
    }
  ],
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
  {
    id: 'vol_cone',
    title: 'resource=vol_cone',
    description: 'Historical realized volatility cone — annualized vol over rolling 10/20/60/120-day windows, with percentile ranks against the last ~5 years.',
    tier: 'pro',
    params: [
      { name: 'commodity', required: true, note: "A short slug — wti, brent, gold, silver, copper, platinum, palladium, corn, wheat, soybeans, cattle, hogs, or lumber. NOT the full display name prices/cot use." },
    ],
    example: `curl "${BASE_URL}?resource=vol_cone&commodity=wti" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": {
    "commodity": "wti",
    "label": "WTI Crude",
    "asOf": "2026-08-28",
    "currentVol": 31.2,
    "percentile1y": 64,
    "headlineWindow": 20,
    "cone": [
      { "window": 10, "current": 29.8, "min": 14.1, "p25": 21.3, "median": 27.6, "p75": 34.9, "max": 61.2 }
    ],
    "stale": false
  },
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
  {
    id: 'roll_scanner',
    title: 'resource=roll_scanner',
    description: 'Roll yield across every Massive-covered contract in one call — ranked by contango/backwardation. No commodity param; always the full universe.',
    tier: 'pro',
    params: [],
    example: `curl "${BASE_URL}?resource=roll_scanner" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": {
    "generatedAt": "2026-08-29T06:00:00.000Z",
    "results": [
      { "id": "wti", "label": "WTI Crude", "structure": "contango", "rollM1M2": 0.42, "annualizedRoll": 5.04 }
    ],
    "stale": false
  },
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
  {
    id: 'term_structure',
    title: 'resource=term_structure',
    description: 'The forward curve for a product, plus the same contracts priced 1 week and 1 month ago — so you can see how the curve shape shifted.',
    tier: 'pro',
    params: [
      { name: 'commodity', required: true, note: 'Short slug — same set as vol_cone.' },
      { name: 'months_ahead', note: 'How far out the curve extends. 3–18, default 12.' },
    ],
    example: `curl "${BASE_URL}?resource=term_structure&commodity=brent&months_ahead=9" \\
  -H "Authorization: Bearer ch_live_..."`,
    response: `{
  "data": {
    "commodity": "brent",
    "monthsAhead": 9,
    "label": "Brent Crude",
    "asOf": "2026-08-28",
    "points": [
      { "symbol": "BZU26", "expiry": "2026-09-30", "monthIdx": 0, "current": 82.14, "weekAgo": 81.90, "monthAgo": 80.55 }
    ],
    "stale": false
  },
  "generated_at": "2026-08-29T12:00:00.000Z"
}`,
  },
];

// Hand-mirrored from supabase/functions/mcp/index.ts's TOOLS array — one
// tool per REST resource above, same gating. No shared source of truth
// between this list and the edge function (see that file's own comment on
// the drift risk), so if a resource is added/changed there, update here too.
const MCP_TOOLS: { name: string; description: string; tier?: 'premium' | 'pro' }[] = [
  { name: 'get_prices', description: 'Current or historical prices, one commodity or all.' },
  { name: 'get_cot_positioning', description: 'CFTC Commitments of Traders weekly positioning.' },
  { name: 'get_fundamentals', description: 'EIA/USDA/FRED fundamentals series.' },
  { name: 'get_sentiment', description: 'Community bullish/bearish sentiment votes.' },
  { name: 'get_news', description: 'Recent commodity news articles.', tier: 'premium' },
  { name: 'get_vol_cone', description: 'Implied-volatility cone for a commodity.', tier: 'pro' },
  { name: 'get_term_structure', description: 'Futures term structure / forward curve for a commodity.', tier: 'pro' },
  { name: 'get_roll_scanner', description: 'Full-universe roll scanner (contango/backwardation).', tier: 'pro' },
  { name: 'list_portfolio', description: 'The key owner\'s own portfolio positions.' },
  { name: 'list_watchlists', description: 'The key owner\'s own watchlists and their items.' },
  { name: 'list_price_alerts', description: 'The key owner\'s own price alerts.' },
];

const ERRORS: { status: string; error: string; meaning: string }[] = [
  { status: '401', error: 'api_key_required', meaning: 'No `Authorization: Bearer ch_live_...` header sent.' },
  { status: '401', error: 'invalid_api_key', meaning: 'Key not found, or revoked.' },
  { status: '400', error: 'commodity_required', meaning: 'A `commodity` param is required for cot, vol_cone, and term_structure, and none was sent.' },
  { status: '400', error: 'invalid_commodity', meaning: '`vol_cone`/`term_structure` commodity must be one of the short slugs listed on that resource.' },
  { status: '400', error: 'invalid_months_ahead', meaning: '`resource=term_structure` months_ahead must be an integer from 3 to 18.' },
  { status: '400', error: 'invalid_timeframe', meaning: '`resource=prices` timeframe must be one of 1d, 1m, 3m, 6m, 1y, 2y.' },
  { status: '403', error: 'premium_required', meaning: '`resource=news` needs an active Premium or Pro subscription.' },
  { status: '403', error: 'pro_required', meaning: '`vol_cone`/`roll_scanner`/`term_structure` need an active Pro subscription.' },
  { status: '404', error: 'commodity_not_found', meaning: '`resource=prices` commodity name didn’t match anything.' },
  { status: '404', error: 'series_not_found', meaning: '`series_id` does not match any fundamentals series.' },
  { status: '404', error: 'snapshot_not_available', meaning: 'No cached value exists yet for that vol_cone/roll_scanner/term_structure request — these never compute live on-demand (see the note on those resources). Open the equivalent page in the app once to seed it, then retry.' },
  { status: '404', error: 'unknown_resource', meaning: '`resource` was missing/invalid and did not match a known value.' },
  { status: '429', error: 'rate_limited', meaning: 'More than 60 requests in the current 60-second window for this key (all tiers).' },
  { status: '429', error: 'trial_daily_limit_exceeded', meaning: 'Free-trial key made more than 50 requests today. Upgrade to Pro to remove it.' },
  { status: '500', error: 'data_unavailable', meaning: 'Transient read failure. Safe to retry.' },
];

const DeveloperDocs: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Data API - Commodity Hub for Developers"
        description="Programmatic access to commodities data — CFTC COT positioning, EIA/USDA/FRED fundamentals, and your own portfolio/watchlist data — via a simple REST API."
        keywords={['commodity data api', 'cot report api', 'commodities api', 'futures data api', 'fundamentals api']}
      />

      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Commodity Hub
          </Button>

          <div className="space-y-3">
            <Badge variant="secondary" className="gap-1">
              <Code2 className="h-3 w-3" /> Data API
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">Commodity Hub Data API</h1>
            <p className="max-w-2xl text-muted-foreground">
              Live and historical commodity prices, CFTC Commitments of Traders positioning,
              EIA/USDA/FRED fundamentals, news, community sentiment, your own portfolio/watchlist/
              alert data — plus the curve analytics (volatility cone, roll scanner, term structure)
              that don't exist anywhere else. JSON in, JSON out, one header for auth. Free to start
              — no card, no per-request billing at any tier.
            </p>
          </div>

          {/* Quickstart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5" /> Quickstart
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="ml-4 list-decimal space-y-2 text-sm text-muted-foreground">
                <li>
                  Sign in (free — no card) and create a key at{' '}
                  <Link to="/exports" className="underline">
                    /exports
                  </Link>
                  . Keys are shown once at creation — copy it immediately. Free accounts get 1 key
                  and 50 requests/day to evaluate the API; upgrading to{' '}
                  <Link to="/data-api" className="underline">
                    Pro
                  </Link>{' '}
                  removes both caps (unlimited keys, 60 req/min, no monthly ceiling).
                </li>
                <li>
                  Send it as a bearer token on every request:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    Authorization: Bearer ch_live_...
                  </code>
                </li>
              </ol>
              <CodeBlock label="Base URL">{BASE_URL}</CodeBlock>
              <CodeBlock label="Minimal example">{`curl "${BASE_URL}?resource=prices&commodity=WTI%20Crude%20Oil" \\
  -H "Authorization: Bearer ch_live_..."`}</CodeBlock>
            </CardContent>
          </Card>

          {/* Auth & limits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" /> Authentication & rate limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Every request needs a key created at{' '}
                <Link to="/exports" className="underline">
                  /exports
                </Link>
                , sent as <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer ch_live_...</code>.
                A key stops working immediately if you revoke it, or if the account's subscription
                lapses (Pro keys fall back to the free-trial cap, not a hard cutoff).
              </p>
              <p>
                <strong className="text-foreground">Free trial:</strong> 1 key, 50 requests/day —
                enough to actually evaluate the API, no card required.{' '}
                <strong className="text-foreground">Pro:</strong> unlimited keys, 60 requests/
                minute per key (enforced per key, not per IP — safe to call from a shared server),
                no monthly ceiling either way. There is no per-request billing at any tier. Every
                response carries:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li><code className="rounded bg-muted px-1 py-0.5 text-xs">X-RateLimit-Limit</code> — 60</li>
                <li><code className="rounded bg-muted px-1 py-0.5 text-xs">X-RateLimit-Remaining</code> — requests left in the current window</li>
                <li><code className="rounded bg-muted px-1 py-0.5 text-xs">X-RateLimit-Reset</code> — unix seconds when the window resets</li>
              </ul>
              <p>
                Exceeding the per-minute limit returns <code className="rounded bg-muted px-1 py-0.5 text-xs">429 rate_limited</code> with
                a <code className="rounded bg-muted px-1 py-0.5 text-xs">Retry-After</code> header (seconds). Exceeding the free-trial daily
                cap returns <code className="rounded bg-muted px-1 py-0.5 text-xs">429 trial_daily_limit_exceeded</code> instead — resets at
                midnight UTC.
              </p>
            </CardContent>
          </Card>

          {/* Resources */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Resources</h2>
            {RESOURCES.map((r) => (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-base">
                    {r.title}
                    {r.tier === 'premium' && <Badge variant="secondary">Premium+</Badge>}
                    {r.tier === 'pro' && <Badge variant="secondary">Pro</Badge>}
                  </CardTitle>
                  <CardDescription>{r.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(r.id === 'vol_cone' || r.id === 'roll_scanner' || r.id === 'term_structure') && (
                    <p className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                      Reads a cache the app itself keeps warm — it never computes live on request, so a
                      product nobody has opened in the app recently can 404 with{' '}
                      <code className="rounded bg-muted px-1 py-0.5">snapshot_not_available</code>, and a
                      successful response can carry <code className="rounded bg-muted px-1 py-0.5">stale: true</code>{' '}
                      if it's more than 6 hours old. This is deliberate — see the Errors table.
                    </p>
                  )}
                  {r.params.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Param</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.params.map((p) => (
                          <TableRow key={p.name}>
                            <TableCell className="font-mono text-xs">{p.name}</TableCell>
                            <TableCell>{p.required ? <Badge variant="outline">required</Badge> : '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.note}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <CodeBlock label="Request">{r.example}</CodeBlock>
                  <CodeBlock label="Response">{r.response}</CodeBlock>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* MCP */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <Bot className="h-5 w-5" /> Connect via MCP
                <Badge variant="secondary">New</Badge>
              </CardTitle>
              <CardDescription>
                The same key also speaks{' '}
                <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="underline">
                  MCP
                </a>{' '}
                — give it to Claude, Cursor, Claude Code, or any MCP-compatible AI tool, and every
                resource above becomes a callable tool instead of a REST call. Pair it with a
                broker's own MCP server (e.g.{' '}
                <a
                  href="https://www.interactivebrokers.com/en/trading/ai-integrations.php"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Interactive Brokers'
                </a>
                ) and the AI can reason over your real positions against our curves in one
                conversation — we never see your brokerage credentials, and the broker never sees
                this key.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Same auth, same rate limits, same tier gating as above — this is a second protocol
                over the same API, not a separate product. One key's budget covers both; using
                both doesn't double it. Currently key-based only: paste the header below into a
                client that takes a manually configured MCP server (Claude Code, Cursor, Claude
                Desktop's config file). Browser-based "Add connector" flows that expect OAuth
                aren't supported yet.
              </p>
              <CodeBlock label="Server URL">{MCP_URL}</CodeBlock>
              <CodeBlock label={'Claude Code / Cursor config (e.g. .mcp.json)'}>{`{
  "mcpServers": {
    "commodity-hub": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer ch_live_..." }
    }
  }
}`}</CodeBlock>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MCP_TOOLS.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        <div className="flex items-center gap-2">
                          {t.name}
                          {t.tier === 'premium' && <Badge variant="secondary">Premium+</Badge>}
                          {t.tier === 'pro' && <Badge variant="secondary">Pro</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Errors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Errors</CardTitle>
              <CardDescription>
                Errors are always <code className="rounded bg-muted px-1 py-0.5 text-xs">{`{ "error": "..." }`}</code>{' '}
                with a matching HTTP status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Meaning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ERRORS.map((e) => (
                    <TableRow key={e.error}>
                      <TableCell className="font-mono text-xs">{e.status}</TableCell>
                      <TableCell className="font-mono text-xs">{e.error}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.meaning}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5" /> Pricing
              </CardTitle>
              <CardDescription>
                Free trial with no card required (50 req/day, 1 key). Pro removes both caps and
                also unlocks the full app — no separate metering or per-request charges at either
                tier.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/exports">Get a free key</Link>
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`${SUPABASE_URL}/functions/v1/api-docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                >
                  Full OpenAPI spec <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <span className="text-sm text-muted-foreground">
                Need a higher limit or a dedicated key for your firm? Reach out via{' '}
                <Link to="/account-settings" className="underline">
                  account settings
                </Link>
                .
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default DeveloperDocs;
