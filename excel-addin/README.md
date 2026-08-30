# Commodity Hub — Excel add-in

Commodity data as Excel formulas, under the `CH` namespace:

```excel
=CH.PRICE("Corn Futures")                          → 550.75   (cents/bushel, the native CBOT quote)
=CH.PRICE_IN("Corn Futures","USD/t")               → 216.82   (restated per tonne)
=CH.BASIS("Corn Futures",195,"EUR/t",0.92)         → -4.47    (your cash minus futures, same unit)
=CH.COT("Corn Futures","net_position")             → 143171
=CH.HISTORY("Corn Futures","6m")                   → spills date/close rows
=CH.LOTS_FOR("Corn Futures",1000,"tonne")          → 7.87     (lots to hedge 1,000 t)
=CH.CONTRACT_TONNES("Corn Futures")                → 127.01
```

## Why this exists

The people this product targets live in Excel. A tool they can't get numbers
out of doesn't change how they work, whatever it looks like in a browser.

`CONVERT`, `LOTS_FOR`, `LOTS_TO_QTY` and `CONTRACT_TONNES` are pure maths and
never call the API — they work offline and use no quota.

## The unit thing (why `PRICE` and `PRICE_IN` both exist)

CBOT quote conventions vary per commodity and are not normalised anywhere:

| Commodity | Quote | Unit |
|---|---|---|
| Corn, Wheat, Soybeans | 550.75 | **cents** per bushel |
| Soybean Meal | 350.40 | USD per **short** ton |
| Soybean Oil | 70.95 | **cents** per pound |

So subtracting a EUR/tonne cash price from a raw quote gives nonsense.
`PRICE_IN` and `BASIS` restate the futures side first, using commodity-specific
bushel weights (corn's 56 lb bushel is 39.3683 bu/t; wheat and soybeans' 60 lb
bushel is 36.7437).

Those factors are **imported from the main app** (`src/utils/commodityUnits.ts`,
`src/utils/hedgeMath.ts`), not copied — Excel and the web app must never
disagree about a number. A test asserts the add-in doesn't redefine them
locally.

## Build

```bash
npm run build:addin      # from the repo root
```

Produces `excel-addin/dist/`. The two bundles are built separately and are
each fully self-contained — see the comment in `vite.config.ts` for why
sharing a chunk breaks the functions runtime with an undebuggable `#NAME?`.

## Hosting

**This cannot be served from `app.commodity-hub.eu` or `commodity-hub.eu`.**
Both send `X-Frame-Options: DENY`, and Office renders the task pane in an
iframe in Excel on the web. The landing site additionally has a hash-based CSP
that would block the add-in's own scripts.

Deploy `excel-addin/` as its own Vercel project at `excel.commodity-hub.eu`;
`vercel.json` here sets `frame-ancestors` for the Office hosts and drops the
`X-Frame-Options` header. If you use a different hostname, update every URL in
`manifest.xml` to match — Office requires them to be absolute HTTPS.

## Installing it (sideload)

There is no AppSource listing, so this is a manual install. **Excel on the web
is by far the easiest** — start there when demoing to someone.

**Excel on the web**
1. Open a workbook → **Home** → **Add-ins** → **More Add-ins**
2. **My Add-ins** tab → **Upload My Add-in**
3. Choose `manifest.xml`

**Excel for Windows** — needs a shared folder catalogue:
1. Put `manifest.xml` in a folder, share it (right-click → Properties → Sharing)
2. Excel → **File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs**
3. Paste the share path (`\\MACHINE\folder`), tick **Show in Menu**, restart Excel
4. **Insert → My Add-ins → Shared Folder** → Commodity Hub

**Excel for Mac**
Copy `manifest.xml` into
`~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/`, restart Excel,
then **Insert → My Add-ins**.

## API key

Open the **Commodity Hub** button on the Home ribbon and paste a key from
[app.commodity-hub.eu/exports](https://app.commodity-hub.eu/exports).
Free tier is 1 key, 50 requests/day, no card.

The key is stored in Office's per-user add-in storage **on that device**. It is
never written into the workbook, so sharing the file does not share the key —
and it's never accepted as a formula argument, which would make it visible in
the cell and sync into OneDrive with the file.

## Quota behaviour

Excel recalculates aggressively — dragging a formula down 200 rows fires 200
calls. To stop that emptying a free tier in one paste:

- responses are cached 60 seconds per resource+params
- identical concurrent calls share a single request
- the four pure-maths functions never call the API

`HISTORY` is one call that returns many rows, so prefer it over 200 individual
`PRICE` calls when you want a series.

## Known limits

- **Not tested in Excel.** It builds, the bundles are verified self-contained
  and complete, and the metadata/registration wiring is covered by tests — but
  nobody has sideloaded it into a real Excel yet. Do that before showing it to
  a customer.
- Icons referenced by `manifest.xml` (`assets/icon-16/32/64/80.png`) are not
  generated yet — Excel will show a placeholder until they're added.
- The `Id` GUID in the manifest must stay stable across releases; changing it
  makes Excel treat this as a different add-in and users lose their install.
- Weight conversions cover grains and oilseeds only. Energy and metals have no
  tonne basis, and `PRICE_IN`/`BASIS` return an error rather than a wrong
  number for them.
