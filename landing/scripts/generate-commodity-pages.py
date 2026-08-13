#!/usr/bin/env python3
"""Generates landing/commodities/<slug>.html from COMMODITIES below.

Add a new entry to COMMODITIES and re-run to add a page:
    python landing/scripts/generate-commodity-pages.py

Also regenerates landing/commodities/index.html. Does NOT touch
sitemap.xml or vercel.json's CSP hashes — after running, recompute each
new/changed inline <script> block's hash with:
    python -c "import hashlib,base64;print(base64.b64encode(hashlib.sha256(open('/dev/stdin','rb').read()).digest()).decode())"
(pipe just the script body in), add the `'sha256-...'` value to the
script-src list in landing/vercel.json, and add new <loc> entries to
sitemap.xml by hand.
"""
import os

SITE = "https://commodity-hub.eu"
GLOSSARY = {
    "contango": ("/glossary/contango-vs-backwardation", "contango and backwardation"),
    "cot": ("/glossary/cot-report", "COT positioning"),
    "crack": ("/glossary/crack-spread", "crack spreads"),
    "seasonality": ("/glossary/commodity-seasonality", "seasonality"),
}

COMMODITIES = [
    {
        "slug": "wti-crude-oil",
        "name": "WTI Crude Oil",
        "symbol": "CL=F",
        "exchange": "NYMEX",
        "category": "Energy",
        "unit": "1,000 barrels per contract",
        "description": (
            "West Texas Intermediate (WTI) is the U.S. benchmark crude oil grade, "
            "priced off light, sweet crude delivered at Cushing, Oklahoma. It's the "
            "reference price behind most U.S. gasoline and diesel costs, and the "
            "crude leg of the NYMEX futures contract that refiners, producers, and "
            "traders use to hedge and speculate on oil prices."
        ),
        "glossary": ["crack", "contango"],
    },
    {
        "slug": "brent-crude-oil",
        "name": "Brent Crude Oil",
        "symbol": "BZ=F",
        "exchange": "ICE",
        "category": "Energy",
        "unit": "1,000 barrels per contract",
        "description": (
            "Brent Crude is the international benchmark, priced off light, sweet "
            "crude produced in the North Sea. It sets the reference price for "
            "roughly two-thirds of the world's internationally traded crude, and "
            "its spread to WTI is one of the most closely watched numbers in the "
            "oil market, reflecting transport costs and regional supply-demand "
            "imbalances."
        ),
        "glossary": ["crack", "contango"],
    },
    {
        "slug": "gold",
        "name": "Gold",
        "symbol": "GC=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "100 troy oz per contract",
        "description": (
            "Gold futures trade on COMEX and track the price of physical gold "
            "bullion, the most widely held precious-metal reserve asset. Unlike "
            "industrial commodities, gold has minimal storage or consumption "
            "dynamics driving its price — its curve and demand are shaped more by "
            "real interest rates, the U.S. dollar, and its role as a safe-haven "
            "asset during financial stress."
        ),
        "glossary": ["contango", "cot"],
    },
    {
        "slug": "silver",
        "name": "Silver",
        "symbol": "SI=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "5,000 troy oz per contract",
        "description": (
            "Silver futures trade on COMEX and track a metal that sits between "
            "gold and industrial metals — priced partly on its monetary, "
            "safe-haven role like gold, and partly on real industrial demand from "
            "electronics and solar-panel manufacturing. That dual identity makes "
            "silver notably more volatile than gold, in both directions."
        ),
        "glossary": ["contango", "cot"],
    },
    {
        "slug": "natural-gas",
        "name": "Natural Gas",
        "symbol": "NG=F",
        "exchange": "NYMEX",
        "category": "Energy",
        "unit": "10,000 MMBtu per contract",
        "description": (
            "Henry Hub natural gas futures track the U.S. benchmark price for gas "
            "delivered at the Henry Hub pipeline interchange in Louisiana. It's one "
            "of the most seasonal commodities on the board — demand swings hard "
            "between winter heating season and summer cooling and power-generation "
            "demand — and weekly storage-injection and withdrawal reports move "
            "price sharply."
        ),
        "glossary": ["seasonality", "contango"],
    },
    {
        "slug": "corn",
        "name": "Corn",
        "symbol": "ZC=F",
        "exchange": "CBOT",
        "category": "Grains",
        "unit": "5,000 bushels per contract",
        "description": (
            "Corn futures trade on the CBOT and track the largest U.S. row crop by "
            "planted acreage, used for livestock feed, ethanol, and food "
            "processing. Price is driven by the planting-to-harvest weather "
            "calendar — a wet spring delaying planting or a dry summer stressing "
            "pollination can move corn sharply months before harvest confirms the "
            "outcome."
        ),
        "glossary": ["seasonality", "cot"],
    },
    {
        "slug": "copper",
        "name": "Copper",
        "symbol": "HG=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "25,000 lbs per contract",
        "description": (
            "Copper futures trade on COMEX and track a metal used across "
            "construction, power grids, and electronics — often called “Dr. "
            "Copper” for its reputation as a barometer of industrial and "
            "economic activity. Unlike gold, copper's price leans almost entirely "
            "on real demand and inventory levels rather than safe-haven flows."
        ),
        "glossary": ["cot", "contango"],
    },
    {
        "slug": "wheat",
        "name": "Wheat",
        "symbol": "ZW=F",
        "exchange": "CBOT",
        "category": "Grains",
        "unit": "5,000 bushels per contract",
        "description": (
            "Wheat futures on the CBOT track the benchmark U.S. wheat grade, "
            "though wheat is a genuinely global crop — Black Sea, EU, and "
            "Australian harvests all move price alongside U.S. supply. Weather "
            "during the growing season and disruption to major exporting regions "
            "are the two biggest swing factors."
        ),
        "glossary": ["seasonality", "cot"],
    },
]

PAGE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__TITLE__</title>
<meta name="description" content="__DESCRIPTION__" />
<meta name="theme-color" content="#0d0d0f" />
<link rel="canonical" href="__CANONICAL__" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Commodity Hub" />
<meta property="og:url" content="__CANONICAL__" />
<meta property="og:title" content="__TITLE__" />
<meta property="og:description" content="__DESCRIPTION__" />
<meta property="og:image" content="__SITE__/assets/app-icon.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="__TITLE__" />
<meta name="twitter:description" content="__DESCRIPTION__" />
<meta name="twitter:image" content="__SITE__/assets/app-icon.png" />
<link rel="icon" href="/assets/app-icon.png" />
<link rel="apple-touch-icon" href="/assets/app-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "__NAME__ Price Today",
  "description": "__DESCRIPTION__",
  "datePublished": "2026-08-03",
  "dateModified": "2026-08-03",
  "author": { "@type": "Organization", "name": "Commodity Hub" },
  "publisher": {
    "@type": "Organization",
    "name": "Commodity Hub",
    "logo": { "@type": "ImageObject", "url": "__SITE__/assets/logo.png" }
  },
  "mainEntityOfPage": "__CANONICAL__"
}
</script>
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a class="brand" href="/">
      <img src="/assets/logo.png" alt="" />
      <span class="brand-word">Commodity Hub</span>
    </a>
    <div class="nav-links">
      <a href="/#coverage">Coverage</a>
      <a href="/#toolkit">Toolkit</a>
      <a href="/#pricing">Pricing</a>
    </div>
    <div class="nav-right">
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle theme">☮/☀</button>
      <a class="nav-cta" href="https://app.commodity-hub.eu">Open the app</a>
    </div>
  </div>
</nav>

<header class="hero hero-doc">
  <div class="container">
    <div class="doc">
      <h1>__NAME__</h1>
      <div class="doc-updated">__CATEGORY__ · __EXCHANGE__ · __SYMBOL__</div>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="doc">
      <section>
        <div class="quote-card" id="liveQuote" data-symbol="__SYMBOL__">
          <div class="quote-price">Loading live price…</div>
          <div class="quote-meta"></div>
        </div>
      </section>
      <section>
        <h2>About __NAME__</h2>
        <p>__DESCRIPTION__</p>
        <ul>
          <li><strong>Exchange:</strong> __EXCHANGE__</li>
          <li><strong>Ticker:</strong> __SYMBOL__</li>
          <li><strong>Contract size:</strong> __UNIT__</li>
        </ul>
      </section>
      <section>
        <h2>Related concepts</h2>
        <p>__GLOSSARY_LINKS__</p>
      </section>
      <section>
        <h2>See the full picture</h2>
        <p>Commodity Hub tracks __NAME__ alongside 30 other commodities with historical charts, forward curves, COT positioning, and price alerts. <a href="https://app.commodity-hub.eu">Open the app</a> to see it live.</p>
      </section>
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div class="footer-grid">
      <a class="brand" href="/">
        <img src="/assets/logo.png" alt="" />
        <span class="brand-word">Commodity Hub</span>
      </a>
      <div class="footer-links">
        <a href="/commodities">Commodities</a>
        <a href="/glossary">Glossary</a>
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/about">About</a>
        <a href="https://app.commodity-hub.eu/delete-account">Delete account</a>
      </div>
    </div>
    <div class="footer-fine">
      Commodity Hub is an information service providing commodity market prices, news, and analytics. It does not execute trades, hold client funds, or provide investment advice. The "Trade" section of the app links to independent, regulated third parties (Capital.com, eToro, Kalshi); Commodity Hub may earn a referral commission from those links. © <span id="year"></span> Commodity Hub. All rights reserved.
    </div>
  </div>
</footer>

<script>
  document.getElementById('year').textContent = new Date().getFullYear();
  var t = document.getElementById('themeToggle');
  var root = document.documentElement;
  t.addEventListener('click', function () {
    var current = root.getAttribute('data-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var effectiveDark = current ? current === 'dark' : prefersDark;
    root.setAttribute('data-theme', effectiveDark ? 'light' : 'dark');
  });
</script>
<script>
  (function () {
    var el = document.getElementById('liveQuote');
    var SYMBOL = el.getAttribute('data-symbol');
    var SUPABASE_URL = 'https://kcxhsmlqqyarhlmcapmj.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjeGhzbWxxcXlhcmhsbWNhcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3ODM0MDcsImV4cCI6MjA2MTM1OTQwN30.qC25iAjNhbPVotryl7GONMgYkvg0DzEYp8uxioWzkfs';

    function formatPrice(p) {
      if (typeof p !== 'number' || !isFinite(p)) return '';
      return p >= 100 ? p.toFixed(2) : p.toFixed(p >= 10 ? 2 : 3);
    }

    fetch(SUPABASE_URL + '/functions/v1/fetch-all-commodities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ dataDelay: 'realtime' }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        var c = (data.commodities || []).find(function (x) { return x && x.symbol === SYMBOL; });
        if (!c) return;
        var pct = typeof c.changePercent === 'number' ? c.changePercent : 0;
        var dir = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
        var arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
        var pctText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';

        var priceEl = el.querySelector('.quote-price');
        priceEl.textContent = '';
        var priceSpan = document.createElement('span');
        priceSpan.className = 'data';
        priceSpan.textContent = '$' + formatPrice(c.price);
        var changeSpan = document.createElement('span');
        changeSpan.className = 'quote-change ' + dir;
        changeSpan.textContent = ' ' + arrow + ' ' + pctText;
        priceEl.appendChild(priceSpan);
        priceEl.appendChild(changeSpan);

        var metaEl = el.querySelector('.quote-meta');
        metaEl.textContent = 'Live price · updated ' + new Date().toLocaleTimeString();
      })
      .catch(function () {
        el.querySelector('.quote-price').textContent = 'Live price unavailable right now — see it in the app.';
      });
  })();
</script>
</body>
</html>
"""

INDEX_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Live Commodity Prices — Commodity Hub</title>
<meta name="description" content="Live prices, contract specs, and analysis for the commodities Commodity Hub tracks — oil, gold, metals, and grains." />
<meta name="theme-color" content="#0d0d0f" />
<link rel="canonical" href="__SITE__/commodities" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Commodity Hub" />
<meta property="og:url" content="__SITE__/commodities" />
<meta property="og:title" content="Live Commodity Prices — Commodity Hub" />
<meta property="og:description" content="Live prices, contract specs, and analysis for the commodities Commodity Hub tracks — oil, gold, metals, and grains." />
<meta property="og:image" content="__SITE__/assets/app-icon.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Live Commodity Prices — Commodity Hub" />
<meta name="twitter:description" content="Live prices, contract specs, and analysis for the commodities Commodity Hub tracks — oil, gold, metals, and grains." />
<meta name="twitter:image" content="__SITE__/assets/app-icon.png" />
<link rel="icon" href="/assets/app-icon.png" />
<link rel="apple-touch-icon" href="/assets/app-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a class="brand" href="/">
      <img src="/assets/logo.png" alt="" />
      <span class="brand-word">Commodity Hub</span>
    </a>
    <div class="nav-links">
      <a href="/#coverage">Coverage</a>
      <a href="/#toolkit">Toolkit</a>
      <a href="/#pricing">Pricing</a>
    </div>
    <div class="nav-right">
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle theme">☮/☀</button>
      <a class="nav-cta" href="https://app.commodity-hub.eu">Open the app</a>
    </div>
  </div>
</nav>

<header class="hero hero-doc">
  <div class="container">
    <div class="doc">
      <h1>Live Commodity Prices</h1>
      <div class="doc-updated">Oil, metals, and grains — more added regularly</div>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="doc">
__ROWS__
    </div>
  </div>
</section>

<footer>
  <div class="container">
    <div class="footer-grid">
      <a class="brand" href="/">
        <img src="/assets/logo.png" alt="" />
        <span class="brand-word">Commodity Hub</span>
      </a>
      <div class="footer-links">
        <a href="/commodities">Commodities</a>
        <a href="/glossary">Glossary</a>
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/about">About</a>
        <a href="https://app.commodity-hub.eu/delete-account">Delete account</a>
      </div>
    </div>
    <div class="footer-fine">
      Commodity Hub is an information service providing commodity market prices, news, and analytics. It does not execute trades, hold client funds, or provide investment advice. The "Trade" section of the app links to independent, regulated third parties (Capital.com, eToro, Kalshi); Commodity Hub may earn a referral commission from those links. © <span id="year"></span> Commodity Hub. All rights reserved.
    </div>
  </div>
</footer>

<script>
  document.getElementById('year').textContent = new Date().getFullYear();
  var t = document.getElementById('themeToggle');
  var root = document.documentElement;
  t.addEventListener('click', function () {
    var current = root.getAttribute('data-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var effectiveDark = current ? current === 'dark' : prefersDark;
    root.setAttribute('data-theme', effectiveDark ? 'light' : 'dark');
  });
</script>
</body>
</html>
"""


def glossary_links_html(keys):
    links = []
    for key in keys:
        href, label = GLOSSARY[key]
        links.append('<a href="{}">{}</a>'.format(href, label))
    if len(links) == 1:
        joined = links[0]
    else:
        joined = " and ".join([", ".join(links[:-1]), links[-1]]) if len(links) > 2 else " and ".join(links)
    return "Relevant background: " + joined + "."


def build_page(c):
    canonical = "{}/commodities/{}".format(SITE, c["slug"])
    title = "{} Price Today — Commodity Hub".format(c["name"])
    description = "Live {} price ({}, {}) with historical chart, forward curve, and COT positioning — free on Commodity Hub.".format(
        c["name"], c["symbol"], c["exchange"]
    )
    html = PAGE_TEMPLATE
    html = html.replace("__TITLE__", title)
    html = html.replace("__DESCRIPTION__", description)
    html = html.replace("__CANONICAL__", canonical)
    html = html.replace("__SITE__", SITE)
    html = html.replace("__NAME__", c["name"])
    html = html.replace("__CATEGORY__", c["category"])
    html = html.replace("__EXCHANGE__", c["exchange"])
    html = html.replace("__SYMBOL__", c["symbol"])
    html = html.replace("__UNIT__", c["unit"])
    html = html.replace("__GLOSSARY_LINKS__", glossary_links_html(c["glossary"]))
    return html


def build_index():
    by_category = {}
    for c in COMMODITIES:
        by_category.setdefault(c["category"], []).append(c)
    rows = []
    for category in sorted(by_category):
        rows.append("      <section>")
        rows.append("        <h2>{}</h2>".format(category))
        rows.append("        <ul>")
        for c in by_category[category]:
            rows.append(
                '          <li><a href="/commodities/{}">{}</a> ({})</li>'.format(
                    c["slug"], c["name"], c["symbol"]
                )
            )
        rows.append("        </ul>")
        rows.append("      </section>")
    html = INDEX_TEMPLATE.replace("__ROWS__", "\n".join(rows))
    html = html.replace("__SITE__", SITE)
    return html


def main():
    base = os.path.join(os.path.dirname(__file__), "..", "commodities")
    os.makedirs(base, exist_ok=True)
    for c in COMMODITIES:
        path = os.path.join(base, c["slug"] + ".html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(build_page(c))
        print("wrote", path)
    index_path = os.path.join(base, "index.html")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(build_index())
    print("wrote", index_path)


if __name__ == "__main__":
    main()
