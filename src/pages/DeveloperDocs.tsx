import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Zap, ShieldCheck, Code2, ExternalLink } from 'lucide-react';
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
];

const ERRORS: { status: string; error: string; meaning: string }[] = [
  { status: '401', error: 'api_key_required', meaning: 'No `Authorization: Bearer ch_live_...` header sent.' },
  { status: '401', error: 'invalid_api_key', meaning: 'Key not found, or revoked.' },
  { status: '400', error: 'commodity_required', meaning: '`resource=cot` was called without a `commodity` param.' },
  { status: '400', error: 'invalid_timeframe', meaning: '`resource=prices` timeframe must be one of 1d, 1m, 3m, 6m, 1y, 2y.' },
  { status: '404', error: 'commodity_not_found', meaning: '`resource=prices` commodity name didn’t match anything.' },
  { status: '404', error: 'series_not_found', meaning: '`series_id` does not match any fundamentals series.' },
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
              EIA/USDA/FRED fundamentals series, and your own saved portfolio and watchlist data.
              JSON in, JSON out, one header for auth. Free to start — no card, no per-request
              billing at any tier.
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
                  <CardTitle className="font-mono text-base">{r.title}</CardTitle>
                  <CardDescription>{r.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
