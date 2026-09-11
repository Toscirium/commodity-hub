# Commodity Hub MCP server

Last updated: 2026-09-11. Implements Option B from `docs/IBKR_INTEGRATION_OPTIONS.md`:
we publish our own MCP server so a user's AI tool can combine our analytics
with their broker's own MCP server (IBKR's, or anyone else's) in one
conversation — without either side ever touching the other's credentials.

## What this is

`supabase/functions/mcp` is a remote MCP server (Streamable HTTP transport,
JSON-RPC 2.0) exposing 11 read-only tools — prices, COT positioning,
fundamentals, sentiment, news, vol cone, term structure, roll scanner, and the
key owner's own portfolio/watchlists/price alerts. It is a second *protocol*
over the existing Data API, not a second product:

```
supabase/functions/_shared/dataApiResources.ts   <- resource logic (queries, gating, limits)
supabase/functions/data-api/index.ts             <- REST protocol over it (?resource=prices)
supabase/functions/mcp/index.ts                  <- MCP protocol over it (tools/call get_prices)
```

Both consume the exact same `ch_live_...` API keys, the same DB-backed rate
limit (60 req/min) and trial quota (50 req/day on a non-Pro key) via the same
`data_api_increment_rate` / `data_api_increment_trial_quota` RPCs, and the
same tier gating (Pro for vol_cone/term_structure/roll_scanner; Premium-or-Pro
for news). **A key's budget is shared across both protocols, not doubled by
using both.** Usage from MCP calls is recorded in the same `data_api_usage`
table as REST calls, tagged `mcp:<tool_name>` (e.g. `mcp:get_prices`) so
`data-api-usage`'s breakdown can tell the two apart.

## Deliberately out of scope for this pass

- **OAuth.** Auth is a static bearer API key (`Authorization: Bearer
  ch_live_...`), the same key created at `/exports` today. That's fine for
  CLI/agent MCP clients (Claude Code, Cursor — paste a token, no browser flow)
  but Claude.ai's own hosted custom connectors expect OAuth 2.1 + Dynamic
  Client Registration for a browser-based "Connect" button. Real follow-up
  work, not scaffolding — see `IBKR_INTEGRATION_OPTIONS.md` open question #3.
- **Write tools.** No order placement (we're not a broker — see
  `MARKETING_PLAN.md`'s "not a broker, not investment advice" positioning) and
  no alert-creation tool yet either, matching the REST API's own read-only
  scope today.
- **Marketing surface.** No mention on `/data-api` or `/developers` yet, no
  "Add to Claude" button, no MCP entry in `api-docs`'s OpenAPI spec (OpenAPI
  doesn't really describe JSON-RPC tool calls anyway — this doc is the
  reference until there's a dedicated page).
- **SSE / server push.** GET on the endpoint returns 405. There's nothing this
  server ever needs to push to the client unprompted, so the spec's optional
  standalone SSE stream isn't implemented.

## Deploying

Same shape as every other function here — see `[[edge-function-deploy-blocked]]`
if deploying from Claude Code directly hits the sandbox's live-prod-action
classifier; run these yourself via `!` if so.

```
supabase functions deploy mcp --project-ref kcxhsmlqqyarhlmcapmj
supabase functions deploy data-api --project-ref kcxhsmlqqyarhlmcapmj
```

(`data-api` needs redeploying too — it now imports the shared
`dataApiResources.ts` module instead of inlining that logic. No migration,
no new tables, no new secrets: this reuses `data_api_keys` and the existing
rate-limit/usage RPCs exactly as they are.)

## Trying it

Get a key at `https://app.commodity-hub.eu/exports` (any signed-in account,
free). Then:

```bash
# List available tools
curl -s https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/mcp \
  -H "Authorization: Bearer ch_live_..." -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq

# Call one
curl -s https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/mcp \
  -H "Authorization: Bearer ch_live_..." -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_prices","arguments":{"commodity":"WTI Crude Oil"}}}' | jq
```

To connect it from an actual MCP client (Claude Code, Cursor, Claude Desktop):
add a remote/HTTP MCP server pointing at
`https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/mcp` with an
`Authorization: Bearer ch_live_...` header. Exact config UI varies by client —
this is the same "custom connector" shape any Streamable-HTTP MCP server uses.

Once the custom domain migration lands (`docs/SUPABASE_CUSTOM_DOMAIN.md`), this
should move to something like `mcp.commodity-hub.eu` — a hardcoded
`kcxhsmlqqyarhlmcapmj.supabase.co` URL is not a great look for something users
paste into their AI tool's config by hand. Add it to that doc's checklist.

## Notes for whoever builds the follow-ups

- The 11 tools are a straight 1:1 mirror of the 8 REST resources (`prices`
  covers `get_prices`, the three `analytics_snapshots`-backed resources each
  get their own tool, etc.) — see `mcp/index.ts`'s `TOOLS` array. Adding a
  REST resource and forgetting the matching tool (or vice versa) is the
  obvious drift risk now that the two protocols share `dataApiResources.ts`
  for logic but not for their tool/resource *lists* — worth a test that
  asserts the two catalogs stay in sync if this grows past a handful more
  resources.
- `PROTOCOL_VERSION` in `mcp/index.ts` is hardcoded to `2025-06-18`. MCP spec
  revisions happen; check whether a client's `initialize` request is asking
  for something newer before assuming this is still current.
- Tool descriptions were written for a model reading them cold (not for a
  human reading REST docs) — keep that framing if you edit them.
