# Connecting user IBKR accounts — what's actually possible

Last updated: 2026-09-11. Companion to `MONETIZATION` work and `GROWTH_PLAN_2026H2.md`.

Prompted by IBKR's 2026-07-28 announcement that they opened AI connectivity to
any tool built on the MCP standard. This doc works out whether that gives us a
way to let users connect their IBKR account to Commodity Hub, and concludes
that **MCP is not that mechanism** — but two other things are, and one of them
is a better strategic fit than account-linking ever was.

## Sourcing caveat, read this first

`interactivebrokers.com` returns HTTP 403 to automated fetches, so most of the
detail below comes from secondary sources (press-release mirrors, IBKR Campus
excerpts via search, community MCP server READMEs that claim parity with the
official one) rather than from IBKR's own pages read directly. Specifically
**unverified against a primary source**: the exact tool list, and whether IBKR's
terms permit a hosted multi-tenant service to act as the MCP client. Confirm
both with IBKR before building anything on them. Everything marked *verified*
below appeared consistently across multiple independent sources.

## 1. What IBKR actually shipped

*Verified.* A remote MCP server at:

```
https://api.ibkr.com/v1/api/mcp-public
```

- **Auth is browser OAuth against IBKR's own login screen.** No API keys or
  passwords are shared with the AI tool. The user authorises **a single
  account**, and revokes it from Settings → Manage Third-Party Consents.
- **Any MCP client can connect** — the press release names Claude Code, Cursor,
  Perplexity, Windsurf, with ChatGPT/Claude/Grok going through certified
  marketplaces and Gemini "forthcoming."
- **The AI cannot execute trades. Ever.** It can only draft instructions, which
  land in an **AI Instructions** tab inside an IBKR platform, where the client
  clicks Review & Submit (or Reject). IBKR enforces this server-side; it isn't a
  convention we could opt out of.
- Not available in India or Japan.

Tool surface — 11 tools, 9 read-only + 2 write (*unverified*, from a community
server claiming parity):

| Read-only | Write |
|---|---|
| `ib_account_summary`, `ib_positions`, `ib_open_orders`, `ib_trades` | `Create Order Instruction` |
| `ib_price_snapshot`, `ib_price_history` | `Delete Order Instruction` |
| `ib_search_contracts`, `ib_contract_details`, `ib_news_providers` | |

## 2. The thing to understand: MCP points the other way

The instinct is "IBKR has MCP, so we can use MCP to pull user accounts into our
app." That inverts what shipped.

IBKR's MCP server exists so a user can connect **their own IBKR account** to
**an AI tool they operate**. The mental model is "I have Claude, I want it to
see my portfolio." It is not a brokerage-linking API for a SaaS product to
onboard thousands of customers — that product category is IBKR's Web API
third-party OAuth, which is a completely separate, compliance-gated path
(see Option C).

Two constraints make this concrete, and they're the reason Option A below is
not the recommendation:

- **Only one AI platform per IBKR account at a time.** *Verified.* Authorising
  a new one **automatically disconnects the previous one**. So asking a user to
  connect Commodity Hub means asking them to disconnect ChatGPT or Claude. We
  would be competing for a single slot against the frontier labs, with our
  Gemini-3-Flash Copilot as the pitch. We lose that trade every time.
- **No paper/simulated account.** *Verified.* The account picker shows only
  accounts you can actually trade on. There is no sandbox — which means no safe
  way to develop or test an integration, against real customer money.

## 3. The four options

### Option A — Copilot becomes an IBKR MCP client

Our `ai-copilot` edge function adds IBKR's MCP server as a per-user tool source;
each user OAuths to IBKR and we hold their token.

**Why it's tempting:** Portfolio would auto-populate instead of the CSV import
in `src/lib/statementImport.ts`, and Copilot could reason over real positions.

**Why not:** the one-slot rule above kills the value proposition outright. Plus
we'd be storing brokerage OAuth tokens for every user (a security and liability
step-change from anything we hold today), with no sandbox to develop against,
and it's exactly the "vendor interacting with client accounts it has no formal
relationship with" shape that IBKR's compliance process exists to gate. Surfacing
`Create Order Instruction` would also put order flow in our product, which cuts
directly against the *not a broker, not investment advice* line that
`MARKETING_PLAN.md` treats as a trust asset.

**Verdict: don't.**

### Option B — We publish *our own* MCP server ✅ recommended

Invert it. Don't consume IBKR's MCP — **be the other server the user connects.**

The user attaches both IBKR's MCP server *and* `mcp.commodity-hub.eu` to
whatever AI they already use. The AI combines them: their real IBKR positions,
against our forward curves, COT positioning, seasonality, basis, term structure,
vessel flows, and fundamentals. We supply the analytics layer nobody else has;
IBKR supplies the account. Neither of us has to hold the other's data.

Why this is the right shape:

- **The one-slot limit doesn't apply to us.** That cap is on IBKR's side, one AI
  *platform* per account. Additional MCP servers attached to the same AI are
  unaffected. We're not competing with Claude for the slot — we're riding along
  inside it.
- **Zero brokerage credentials, zero compliance exposure, zero regulatory
  posture change.** We never touch the account.
- **It is Engine 02 from `GROWTH_PLAN_2026H2.md`, in its 2026 form.** That doc's
  whole thesis is distributing our data through other people's surfaces rather
  than buying our own audience. The embeddable widget does this for web pages;
  an MCP server does it for every AI assistant. Same play, new channel.
- **It monetises through machinery we already have.** `supabase/functions/data-api`
  already does API keys, rate limiting, and tier gating, with usage tracking in
  `data-api-usage`. An MCP server is a second protocol over the same handlers —
  free tier as the acquisition engine, Pro/API tiers for depth. That is the
  Alpha Vantage engine the growth plan already argues for.

**Cost:** meaningful but bounded — a Streamable-HTTP MCP endpoint wrapping
existing data-api handlers, plus OAuth or API-key auth. Days, not months, and no
external approval gates.

**Status: scaffolded 2026-09-11.** `supabase/functions/mcp` — 11 read-only
tools, API-key auth (reusing `ch_live_` keys), same rate limit/trial quota/tier
gating as the REST API. Not yet deployed or marketed. See
`docs/MCP_SERVER_SETUP.md` for what's built, what's deliberately deferred
(OAuth, a marketing page, write tools), and deploy steps.

### Option C — IBKR Web API third-party OAuth (the real account-linking path)

If the actual goal is durable "link your IBKR account to Commodity Hub"
portfolio sync, this is the only IBKR-sanctioned route for it.

*Verified:* third-party vendors onboard via a form to
`webapionboarding@interactivebrokers.com`, need **an established business entity
and a public online presence**, and must clear **Compliance approval** before
integrating. Critically, **OAuth 2.0 is not open to third-party vendors — only
OAuth 1.0a**; OAuth 2.0 is reserved for licensed Organizations, Financial
Advisors and IBrokers, and isn't available to Individual account structures at
all.

**Verdict:** real, but it's a months-long compliance project, and 1.0a request
signing is genuinely unpleasant. Only worth starting if account sync becomes a
core pillar rather than a nice-to-have.

### Option D — IBKR Flex Web Service (the cheap 80% of account-linking)

*Verified.* The long-standing, no-approval-needed, read-only mechanism that most
portfolio trackers actually use. The user creates a Flex Query in Client Portal
(Performance & Reports → Flex Queries), enables the Flex Web Service, and pastes
a **Query ID + token** into our app once. We then fetch their Open Positions and
Account Info as XML on a schedule — no credentials, no OAuth, no IBKR approval.

- Read-only reporting data, but note that's their **entire financial history** —
  treat the token as a high-value secret (Supabase vault, never the client).
- Not real-time; it's report-grade data, typically a nightly sync. For a
  positions view against our curves, that's fine.
- Slots almost directly into the existing import path — `statementImport.ts` and
  `brokerPositions.ts` already normalise broker instrument names; this replaces
  the manual CSV upload step with a scheduled fetch, reusing the mapping logic.

**Verdict:** if we want "connect your IBKR account" shipped this quarter, this is
how. It delivers the actual user-visible outcome (portfolio populates itself)
with none of Option A's or C's problems.

## 4. Recommendation

**Do B. Then D if users ask for account sync. Never A. C only if sync becomes a pillar.**

B and D are complementary and independent — B is a distribution/growth play that
reaches users inside the AI tools they already use, D is a retention feature for
users already in our app. Neither blocks the other, and neither needs anything
from IBKR's approvals desk.

The one-line version: *IBKR's MCP launch isn't an opportunity to pull accounts
in; it's a signal that AI assistants are now a distribution channel, and the way
to win there is to be a server on that surface, not a client of IBKR's.*

## 5. Open questions before building

1. Does IBKR's MCP/AI-integration agreement say anything about a hosted service
   acting as the MCP client on behalf of many users? (Blocks A. Not blocking for
   B or D.)
2. Flex Web Service rate limits and token lifetime/rotation — needs checking
   against current IBKR docs before we design the sync cadence.
3. For B: do we authenticate MCP clients with our existing Data API keys, or
   implement OAuth 2.1 + Dynamic Client Registration (what Claude.ai custom
   connectors expect)? API keys are far less work and probably right for v1.

## Sources

- IBKR press release, 2026-07-28 — "Interactive Brokers Opens AI Connectivity to
  Any Tool Built on the MCP Standard" (read via stocktitan.net mirror)
- IBKR AI Integrations page, `interactivebrokers.com/en/trading/ai-integrations.php`
  (via search excerpts; direct fetch 403s)
- IBKR AI Instructions guide, `ibkrguides.com/clientportal/gen-ai-instructions.htm`
- IBKR Web API OAuth 2.0 registration docs + Campus OAuth 1.0a pages (via search excerpts)
- IBKR Flex Web Service configuration guides (`ibkrguides.com`) and third-party
  tracker setup writeups
- `adwiteeymauriya/ibkr-portfolio-builder-mcp` README — claimed parity tool list
  for the official server
