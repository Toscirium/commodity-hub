# ICP validation interviews

## The decision this exists to settle

Commodity Hub currently describes its audience, in its own source, as
"serious retail traders" (`src/components/PageShell.tsx`). Pricing follows
from that: Free → Premium $6.99/mo → Pro $19.99/mo.

But a second, richer ICP's toolkit is already built and sitting in the side
pockets of the repo:

| Asset | Where | Who it's actually for |
|---|---|---|
| Excel add-in | `excel-addin/` | Procurement / hedging teams live in Excel |
| Developer API + docs | `supabase/functions/data-api`, `/api-docs` | Systems integration |
| Forward curves | `fetch-forward-curve` | Hedgers pricing forward exposure |
| Basis tracker | `docs/BASIS_TRACKER_SETUP.md` | Physical buyers vs. futures |
| Vessel tracking | `fetch-vessel-positions` | Physical flow, not screen trading |
| COT positioning | `fetch-cot-report` | Positioning analysis |
| Contract size + venue on every row | `commodity-mappings.ts` | Physical contract literacy |

None of that is retail-trader shaped. It's **physical commodity procurement
and hedging** shaped: energy buyers, agri co-ops, food manufacturers,
treasury and hedging desks.

The question these calls answer is a single one:

> Is there a buyer with a budget line who will pay 10–100× our current ACV
> for what we have already built?

Ten conversations. No code until they're done.

## Rule: past behaviour and real spend only

The failure mode of these calls is a warm, encouraging hour that teaches you
nothing. Enthusiasm is free; budget is not. So:

- Ask what they **did**, not what they **would** do.
- Ask what they **pay for now**, not what they'd **be willing** to pay.
- Never describe the product until the last five minutes. Once you pitch,
  they start being polite and the data stops.
- "That's interesting, we'd definitely take a look" is a **no**.

## Who to talk to

Aim for ten, weighted toward the first two rows.

| Segment | Title to ask for | Where to find them |
|---|---|---|
| Food / bev manufacturer | Procurement Manager, Commodity Buyer | LinkedIn Sales Nav; industry assocs |
| Energy buyer (haulage, marine, utilities) | Fuel Procurement, Energy Manager | Trade bodies, fuel-buying groups |
| Agri co-op / grain merchant | Risk Manager, Merchandiser | Regional co-op directories |
| Small trading desk | Head of Trading, Risk | Commodity trading Slack/Discord |
| CFO at commodity-exposed SME | CFO, Treasury | Warm intros only — cold rate is poor |

Estonian/EU base (Consilair OÜ) is an advantage for EU industrials: data
residency and invoicing in-region are real objections for US vendors.

## The script

### Opening (do not pitch)

> "I'm researching how companies with commodity exposure actually track
> prices and manage hedging. I'm not selling anything today — I'd just like
> to understand your workflow. Fifteen minutes?"

### The eight questions

1. **"Walk me through the last time you needed a commodity price for a real
   decision. What did you actually do?"**
   *Testing: the real workflow. Listen for Excel, a PDF from a broker, a
   phone call, a Bloomberg terminal someone else owns.*

2. **"How do you know what you paid versus what the market was?"**
   *Testing: basis. If they can't answer cleanly, that's the bleeding wound
   — and the basis tracker is already built.*

3. **"What do you currently pay for market data, and who signs that off?"**
   *Testing: budget existence and approver. The single most important
   answer in the call. "Nothing" is a red flag for the whole thesis.*

4. **"What's the last thing you rebuilt by hand in a spreadsheet this
   month?"**
   *Testing: the Excel add-in's wedge. Anything recurring and manual here is
   a product.*

5. **"When you hedge, how do you decide the tenor? Where does the forward
   curve come from?"**
   *Testing: whether curves are a daily need or an abstraction.*

6. **"What happens if the number you used turns out to be wrong?"**
   *Testing: the cost of a bad price. If the answer involves a customer
   quote or a signed contract, data provenance is worth money — and that's
   the thing this codebase is already unusually disciplined about.*

7. **"Who else touches this data — and how does it get to them?"**
   *Testing: seat count. Retail is one seat; a procurement team is five to
   fifty.*

8. **"If this workflow disappeared tomorrow, what breaks?"**
   *Testing: whether it's a painkiller or a vitamin.*

### Only now, the last five minutes

Show the forward curve and the Excel add-in. Say nothing else. Then:

> "What would have to be true for your company to pay for something like
> this?"

Then shut up and write down every word.

## Reading the results

**Strong signal — pivot upmarket:**
- ≥6 of 10 already pay for *something* (broker terminal, Platts/Argus, a
  data subscription)
- ≥5 describe a recurring manual spreadsheet job
- Anyone names a number above €200/month without flinching
- Anyone asks about seats, SSO, invoicing, or data residency unprompted

**Weak signal — stay retail, fix the free-fountain problem instead:**
- Most say "we just use the broker's number" and feel fine about it
- Nobody has a budget line; every answer routes to a CFO who isn't in the room
- The pain is real but annual, not weekly

**Ambiguous — keep both, sell the Excel add-in as the wedge:**
- Interest is genuine but budget is quarterly/slow. Then the play is a
  low-friction paid add-in rather than a platform sale.

## Log every call

One row each, in a sheet. The pattern only shows up in aggregate.

| Date | Company | Size | Role | Pays for data today (€/mo) | Manual spreadsheet job | Cost of a wrong price | Seats | Would pay? | Verbatim quote |
|---|---|---|---|---|---|---|---|---|---|

The verbatim quote column is the one that matters. Exact words, not your
summary of them — your summary is already a sales pitch.

## What this does not settle

Whether to *abandon* retail. It probably isn't either/or: the retail app is
the top of the funnel and the marketing surface. The question is only where
pricing, roadmap and the front door point.
