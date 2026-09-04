#!/usr/bin/env python3
"""Generates landing/commodities/<slug>.html from COMMODITIES below.

Each page is a full explainer article — what moves the price, how the
forward curve behaves, seasonality, how to read positioning, and the
recurring reports that move it — not a spec stub. Add a new entry to
COMMODITIES (fill in every prose field) and re-run to add a page:
    python landing/scripts/generate-commodity-pages.py

Also regenerates landing/commodities/index.html, and then runs
sync-csp-hashes.py so vercel.json's CSP script-src stays in sync with
whatever inline <script>/JSON-LD blocks the new pages contain — no manual
hash-copying step. Does NOT touch sitemap.xml — add new <loc> entries there
by hand.
"""
import html as _html
import json
import os
import subprocess
import sys

SITE = "https://commodity-hub.eu"
DATE_PUBLISHED = "2026-08-03"
DATE_MODIFIED = "2026-09-04"

GLOSSARY = {
    "contango": ("/glossary/contango-vs-backwardation", "contango and backwardation"),
    "cot": ("/glossary/cot-report", "COT positioning"),
    "crack": ("/glossary/crack-spread", "crack spreads"),
    "seasonality": ("/glossary/commodity-seasonality", "seasonality"),
    "rollyield": ("/glossary/roll-yield", "roll yield"),
    "openinterest": ("/glossary/open-interest", "open interest"),
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
            "priced off light, sweet crude delivered at Cushing, Oklahoma. It is the "
            "reference price behind most U.S. gasoline and diesel costs, and the crude "
            "leg of the NYMEX futures contract that refiners, producers, and traders "
            "use to hedge and speculate on oil prices."
        ),
        "drivers": [
            "WTI is the pricing anchor for U.S. light, sweet crude delivered at Cushing, "
            "Oklahoma, so its day-to-day moves track the balance between American "
            "production, refinery demand, and how full the Cushing tank farm is. The "
            "single most-watched input is the weekly EIA Petroleum Status Report: a "
            "crude build well above the seasonal norm pressures WTI, a draw supports it, "
            "and the market reacts within seconds of the 10:30 a.m. ET release.",
            "On the supply side, OPEC+ policy sets the global backdrop. When the group "
            "adds or withholds barrels it shifts the world balance WTI is priced "
            "against, even though none of those barrels are American. U.S. shale output "
            "— reported with a lag in the EIA's monthly data and previewed by the Baker "
            "Hughes rig count each Friday — is the domestic counterweight.",
            "Demand runs on the economic cycle and the season. Refinery run rates climb "
            "into summer driving season and the switch to winter heating fuels, and fall "
            "during spring and autumn maintenance turnarounds. A weaker U.S. dollar "
            "makes dollar-priced crude cheaper for foreign buyers and tends to lift "
            "WTI; a stronger dollar does the reverse. Geopolitics adds the tail risk — "
            "conflict near producing regions or shipping chokepoints such as the Strait "
            "of Hormuz can add several dollars of risk premium in a single session.",
        ],
        "curve": (
            "WTI's forward curve spends most of its time in mild backwardation — prompt "
            "barrels priced above deferred — because storing physical crude costs money "
            "and buyers usually pay up for immediate supply. It tips into contango when "
            "the front of the market is oversupplied: a Cushing inventory build, a "
            "refinery outage, or a demand shock. The front spread (first month minus "
            "second month) is the quickest read on physical tightness, and because WTI "
            "settles against physical delivery at Cushing it can diverge sharply from "
            "Brent when the bottleneck is specifically there."
        ),
        "seasonality": (
            "Crude itself is only loosely seasonal, but its demand drivers are not. "
            "Refiners buy crude ahead of the summer driving season, so spring often "
            "brings firmer crude demand and widening gasoline crack spreads; the autumn "
            "shoulder months bring maintenance season and softer runs before winter "
            "heating demand picks up. These patterns are real but are easily overwhelmed "
            "by supply news in any given year, so they belong in the background of a "
            "view rather than at the front of one."
        ),
        "positioning": (
            "For WTI the COT line to watch is managed-money net length in the combined "
            "NYMEX and ICE WTI contracts. Speculators are structurally long crude, so "
            "the signal is not the sign but the extreme: net length in the top decile of "
            "its multi-year range has historically preceded pullbacks, because the pool "
            "of new buyers is thin and a fast unwind can accelerate a sell-off "
            "regardless of fundamentals. Read it against price — a rally on falling net "
            "length is climbing a wall of worry; a rally on surging net length is more "
            "fragile."
        ),
        "reports": [
            ("EIA Weekly Petroleum Status Report", "Wednesdays 10:30 a.m. ET (Thursday after a Monday holiday) — crude, gasoline and distillate inventories, refinery utilisation, and implied demand."),
            ("API inventory report", "Tuesday afternoons — a privately compiled preview of the EIA numbers that often moves the overnight session."),
            ("OPEC+ ministerial meetings", "Roughly monthly — production-quota decisions that reset the global supply picture."),
            ("Baker Hughes rig count", "Fridays — a leading indicator of future U.S. shale supply."),
            ("EIA STEO, and the monthly OPEC and IEA oil market reports", "Supply and demand forecasts that reset the medium-term narrative."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — speculative and commercial positions as of the prior Tuesday."),
        ],
        "glossary": ["crack", "contango", "rollyield"],
        "faqs": [
            ("What is the ticker for WTI crude oil futures?",
             "The NYMEX WTI light sweet crude contract trades under the symbol CL, shown as CL=F for the continuous front-month series. Each contract is 1,000 barrels, and the front month stops trading around the third business day before the 25th of the month before delivery."),
            ("Why is WTI usually cheaper than Brent?",
             "WTI is landlocked at Cushing, Oklahoma, and has to be piped or railed to the coast to reach the export market, so it typically trades at a few dollars' discount to waterborne Brent to cover that transport cost. The spread widens when U.S. production is high relative to pipeline capacity and narrows when global seaborne supply is tight."),
            ("What time is the EIA oil inventory report released?",
             "10:30 a.m. Eastern on Wednesday most weeks, pushed to Thursday when there is a Monday holiday. It is the highest-frequency official read on the U.S. crude balance and routinely moves WTI by a dollar or more."),
            ("Does a strong U.S. dollar push oil prices down?",
             "Usually, at the margin. Crude is priced in dollars worldwide, so a stronger dollar raises the local-currency cost for non-U.S. buyers and tends to soften demand and price. It is one input among many — a genuine supply disruption will override the currency effect."),
        ],
    },
    {
        "slug": "brent-crude-oil",
        "name": "Brent Crude Oil",
        "symbol": "BZ=F",
        "exchange": "ICE",
        "category": "Energy",
        "unit": "1,000 barrels per contract",
        "description": (
            "Brent Crude is the international benchmark, priced off light, sweet crude "
            "produced in the North Sea. It sets the reference price for roughly "
            "two-thirds of the world's internationally traded crude, and its spread to "
            "WTI is one of the most closely watched numbers in the oil market."
        ),
        "drivers": [
            "Brent reflects the waterborne, globally traded crude market, so it responds "
            "to the world balance rather than to any one country's inventories. OPEC+ "
            "supply decisions, demand from China and the rest of Asia, and disruptions "
            "to seaborne flows through chokepoints such as the Strait of Hormuz and the "
            "Suez–Bab-el-Mandeb corridor are the primary movers.",
            "Because Brent is the benchmark most physical cargoes price against, "
            "differentials for competing grades — and the health of the underlying North "
            "Sea streams (Brent, Forties, Oseberg, Ekofisk, Troll) that back the "
            "contract — feed directly into it. Dated Brent, the physical assessment, and "
            "the futures contract move together but can drift apart when physical supply "
            "is unusually tight or loose.",
            "Macro conditions set the tone around the fundamentals: global growth "
            "expectations, the U.S. dollar, and risk sentiment all shift Brent even on "
            "days with no fresh supply news. Refining margins in Europe and Asia "
            "influence how aggressively refiners bid for crude, and a weak product "
            "market can cap Brent even when crude inventories look supportive.",
        ],
        "curve": (
            "Brent's curve, like WTI's, is usually in gentle backwardation and flips to "
            "contango when the seaborne market is oversupplied. Because Brent is not "
            "tied to a single inland storage hub it tends to give a cleaner read on the "
            "global balance than WTI does. The Brent–WTI spread itself is a widely "
            "traded instrument: it reflects transatlantic arbitrage economics, U.S. "
            "export capacity, and freight rates, and it widens when U.S. supply is "
            "abundant relative to pipeline and export infrastructure."
        ),
        "seasonality": (
            "Brent shows the same soft seasonal rhythm as crude generally — a spring "
            "build in refinery demand ahead of the northern-hemisphere driving season, "
            "a dip through autumn maintenance, and a winter lift from heating fuels. "
            "Asian demand patterns, including pre-winter stockpiling by large importers, "
            "add a second seasonal layer that WTI does not have. As with WTI, treat the "
            "calendar as context, not a signal on its own."
        ),
        "positioning": (
            "Managed-money net length in ICE Brent is the headline positioning number, "
            "and it is often read together with WTI speculative length to gauge overall "
            "crude sentiment. The interpretation is the same: speculators are habitually "
            "net long, so crowded length near multi-year highs is a fragility signal "
            "rather than a bullish one, and the speed of any change matters more than "
            "the level. Divergence between Brent and WTI positioning can flag a "
            "regional versus global story."
        ),
        "reports": [
            ("OPEC+ ministerial meetings and monthly OPEC Market Report", "Global supply policy and the group's own demand forecast."),
            ("IEA Oil Market Report", "Monthly — the demand-side counterweight to OPEC's view, closely watched in Europe."),
            ("EIA Weekly Petroleum Status Report", "Wednesdays 10:30 a.m. ET — U.S. data that still sets the tone for the global session."),
            ("China customs and refinery throughput data", "Monthly — the swing factor in global demand."),
            ("EIA Short-Term Energy Outlook", "Monthly — price and balance projections for both benchmarks."),
            ("CFTC Commitment of Traders and ICE COT", "Weekly — speculative positioning in Brent and WTI."),
        ],
        "glossary": ["contango", "crack", "rollyield"],
        "faqs": [
            ("What is the difference between Brent and WTI crude?",
             "Both are light, sweet crudes, but Brent is produced in the North Sea and traded as waterborne cargoes, while WTI is produced in the U.S. and delivered inland at Cushing, Oklahoma. Brent prices the international market; WTI prices the U.S. market. Brent usually trades at a small premium to WTI to reflect WTI's transport disadvantage."),
            ("What ticker is Brent crude oil?",
             "The ICE Brent futures contract trades as B, and is commonly shown as BZ=F for the continuous front-month series on data feeds. Each contract is 1,000 barrels and settles financially against the ICE Brent Index."),
            ("Why does the Brent–WTI spread change?",
             "It tracks the cost and capacity of moving crude from the U.S. interior to the global market. Abundant U.S. production, limited pipeline or export-terminal capacity, and high tanker freight rates all widen Brent's premium; tight international supply narrows it, and it can briefly invert."),
            ("Which oil benchmark should I follow for global prices?",
             "Brent, since it is the reference for most internationally traded crude and for products priced off it outside North America. Follow WTI as well if you care specifically about the U.S. balance or about the transatlantic arbitrage."),
        ],
    },
    {
        "slug": "gold",
        "name": "Gold",
        "symbol": "GC=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "100 troy oz per contract",
        "description": (
            "Gold futures trade on COMEX and track the price of physical gold bullion, "
            "the most widely held precious-metal reserve asset. Unlike industrial "
            "commodities, gold has minimal storage or consumption dynamics driving its "
            "price — its value is shaped by real interest rates, the U.S. dollar, and "
            "its role as a safe-haven asset during financial stress."
        ),
        "drivers": [
            "Gold pays no yield, so the biggest single driver is the real (inflation-"
            "adjusted) yield on U.S. Treasuries. When real yields fall, the opportunity "
            "cost of holding gold drops and the price tends to rise; when real yields "
            "climb, gold usually struggles. Market expectations for Federal Reserve "
            "policy, and the inflation data those expectations rest on, move gold "
            "through this channel almost every week.",
            "The U.S. dollar is the second lever. Gold is priced in dollars globally, so "
            "a weaker dollar makes it cheaper for the rest of the world and tends to "
            "support the price, while a stronger dollar is a headwind. Safe-haven demand "
            "is the third: during banking stress, geopolitical shocks, or sharp equity "
            "sell-offs, investors buy gold as insurance, and those flows can override "
            "the yield and currency picture for weeks at a time.",
            "Structural demand rounds it out. Central banks — especially outside the "
            "West — have been persistent net buyers as they diversify reserves away "
            "from the dollar, and their purchases, reported quarterly by the World Gold "
            "Council, provide a slow-moving floor. Physical demand for jewellery and "
            "bars, concentrated in India and China, is price-sensitive and seasonal but "
            "matters more at the margin than the investment flows.",
        ],
        "curve": (
            "Gold's forward curve is almost always in gentle contango, and for a clean "
            "reason: with no meaningful storage constraint and no consumption urgency, "
            "the future price is essentially the spot price plus the cost of carry "
            "(financing minus the lease rate). The curve steepens when interest rates "
            "rise and flattens when they fall. Sharp dislocations in the spot-to-"
            "futures basis are rare and usually signal a logistics squeeze — a shortage "
            "of deliverable bars at the exchange's vaults — rather than a change in the "
            "fundamental picture."
        ),
        "seasonality": (
            "Gold's seasonality is mild and demand-driven rather than supply-driven. "
            "Physical buying tends to firm up in late summer and autumn ahead of the "
            "Indian wedding and festival season and Diwali, and again around the "
            "Lunar New Year, which can lend the price a seasonal bid from roughly "
            "August into February. The effect is small relative to the macro drivers "
            "and should never be traded in isolation."
        ),
        "positioning": (
            "COMEX gold has a deep managed-money position, and speculative net length is "
            "one of the most reliable sentiment gauges in the metals complex. Extended "
            "net length near the top of its multi-year range marks a crowded trade that "
            "is vulnerable to a shakeout on any hawkish surprise; unusually low or net-"
            "short speculative positioning has often marked durable lows. Watch the "
            "direction of change week to week and compare it against gold-backed ETF "
            "holdings, which capture a slower, longer-term investor base."
        ),
        "reports": [
            ("U.S. CPI and PCE inflation releases", "Monthly — the data behind real-yield and Fed-path expectations."),
            ("FOMC meetings and the Fed chair's press conference", "Eight times a year — the single biggest scheduled risk event for gold."),
            ("U.S. nonfarm payrolls", "First Friday of the month — shifts rate expectations and the dollar."),
            ("World Gold Council Gold Demand Trends", "Quarterly — central-bank buying, ETF flows, and physical demand."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money net positioning in COMEX gold."),
        ],
        "glossary": ["contango", "cot", "rollyield"],
        "faqs": [
            ("What is the futures ticker for gold?",
             "The COMEX gold futures contract trades as GC, shown as GC=F for the continuous front-month series. Each contract represents 100 troy ounces, so a $1 move in the price is worth $100 per contract. A smaller 10-ounce contract (MGC) also trades."),
            ("Why does gold fall when interest rates rise?",
             "Gold produces no income, so it competes with interest-bearing assets. When real yields on Treasuries rise, holding gold means giving up more income, which lowers investment demand. The relationship is with inflation-adjusted yields, not headline rates — rate rises that merely keep pace with inflation need not hurt gold."),
            ("Is gold a good hedge against inflation?",
             "Over long horizons gold has broadly preserved purchasing power, but over any given year the link is loose. Gold tracks real yields and the dollar more closely than it tracks the CPI, so it can fall during an inflationary period if central banks are raising real rates aggressively."),
            ("What moves gold the most on a given day?",
             "Scheduled U.S. data that changes Fed expectations — CPI, payrolls, and FOMC decisions — plus unscheduled safe-haven events such as geopolitical escalation or banking stress. Day-to-day, the dollar and Treasury yields explain most of the move."),
        ],
    },
    {
        "slug": "silver",
        "name": "Silver",
        "symbol": "SI=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "5,000 troy oz per contract",
        "description": (
            "Silver futures trade on COMEX and track a metal that sits between gold and "
            "the industrial metals — priced partly on its monetary, safe-haven role like "
            "gold, and partly on real industrial demand from electronics and solar "
            "manufacturing. That dual identity makes silver notably more volatile than "
            "gold, in both directions."
        ),
        "drivers": [
            "Silver takes its macro cue from gold — real U.S. yields, the dollar, and "
            "safe-haven flows push both metals the same way — but silver moves more. In "
            "a precious-metals rally silver typically outperforms gold, and in a "
            "sell-off it falls harder, which is why traders watch the gold/silver ratio "
            "as a gauge of how aggressive the move is.",
            "The industrial half of demand is the differentiator. Roughly half of "
            "silver consumption is industrial, with photovoltaics (solar panels) the "
            "fastest-growing end use alongside electronics, and that demand is tied to "
            "the manufacturing cycle and to the pace of the energy transition. A "
            "strong global industrial economy can lift silver even when gold is flat.",
            "Supply is comparatively inelastic: most silver is a by-product of copper, "
            "lead, zinc, and gold mining, so it does not respond quickly to a higher "
            "silver price. When investment and industrial demand rise together against "
            "that stiff supply, the market can move into a persistent deficit drawn "
            "from above-ground stocks, and price responds sharply.",
        ],
        "curve": (
            "Like gold, silver's forward curve is normally in contango set by the cost "
            "of carry, since there is no urgency to consume it and storage is cheap "
            "relative to value. The curve is more prone to short, sharp backwardation "
            "episodes than gold, because the deliverable pool of good-delivery bars is "
            "smaller and industrial users sometimes compete with investors for prompt "
            "metal. A move to backwardation in silver is worth noticing — it usually "
            "means physical tightness rather than a change in the investment thesis."
        ),
        "seasonality": (
            "Silver inherits gold's soft late-summer-into-winter demand-season bid, "
            "amplified by its higher volatility. The industrial side adds sensitivity "
            "to manufacturing calendars and to solar-installation cycles, which vary by "
            "region. Neither pattern is strong enough to trade on its own; both are "
            "context for a view built on the macro and industrial-demand picture."
        ),
        "positioning": (
            "COMEX silver has a smaller, more concentrated managed-money position than "
            "gold, so speculative flows move price more per contract and positioning "
            "extremes are sharper. Crowded net length warns of a violent unwind; deep "
            "net-short positioning has repeatedly marked lows. Because the contract is "
            "smaller and periodically the target of retail-driven squeezes, cross-check "
            "COT data against exchange inventory levels and lease rates for a fuller "
            "picture of tightness."
        ),
        "reports": [
            ("FOMC meetings and U.S. CPI / PCE", "The macro driver silver shares with gold."),
            ("U.S. and global manufacturing PMIs", "Monthly — a read on the industrial half of demand."),
            ("The Silver Institute World Silver Survey", "Annual — supply, industrial and investment demand, and the market balance."),
            ("COMEX registered and eligible silver stocks", "Daily — the deliverable inventory behind the futures contract."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money net positioning in COMEX silver."),
        ],
        "glossary": ["contango", "cot", "rollyield"],
        "faqs": [
            ("What is the gold/silver ratio?",
             "The number of ounces of silver it takes to buy one ounce of gold, found by dividing the gold price by the silver price. A high ratio means silver is cheap relative to gold; a low ratio means the opposite. Traders use it to decide which metal to favour and as a gauge of how risk-on the precious-metals move is."),
            ("Why is silver more volatile than gold?",
             "The silver market is far smaller than the gold market, so the same flow of money moves the price more. Silver also carries industrial demand on top of investment demand, adding an extra source of swings, and its speculative positioning is more concentrated."),
            ("What is silver's futures ticker and contract size?",
             "COMEX silver trades as SI, shown as SI=F for the continuous front month. The full contract is 5,000 troy ounces, so a $0.01 move is worth $50. A 1,000-ounce mini contract (SIL) also trades."),
            ("Does solar demand really move the silver price?",
             "Increasingly, yes. Photovoltaics have grown into one of the largest single industrial uses of silver, and the sector's growth has been a structural addition to demand. It matters most when it coincides with firm investment demand against flat by-product supply."),
        ],
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
            "delivered at the Henry Hub interchange in Louisiana. It is one of the most "
            "seasonal and most volatile commodities on the board — demand swings hard "
            "between winter heating and summer power-generation loads, and weekly "
            "storage reports move the price sharply."
        ),
        "drivers": [
            "Weather is the dominant driver, because gas demand is heating in winter and "
            "power-generation cooling load in summer. Forecasts for heating and cooling "
            "degree days over the next two weeks move the front of the curve every day, "
            "and a single cold snap or heat dome can add or remove a large share of "
            "national demand within days.",
            "Storage is the scoreboard. The EIA's Weekly Natural Gas Storage Report "
            "(Thursdays 10:30 a.m. ET) shows the injection or withdrawal versus the "
            "five-year average, and a surprise of even 10–20 Bcf routinely moves the "
            "front month several percent. The market spends the year watching whether "
            "inventories will end the withdrawal season comfortably full or "
            "dangerously low.",
            "Structural supply and demand set the level around which weather swings it. "
            "Dry-gas production from the Appalachian, Permian, and Haynesville basins is "
            "the supply side; the demand side has been reshaped by LNG export terminals, "
            "which now tie U.S. prices to global gas markets, plus coal-to-gas switching "
            "in the power sector and industrial load. A new LNG train starting up is a "
            "step-change in demand.",
        ],
        "curve": (
            "Natural gas has the most distinctive forward curve of any major commodity: "
            "it is not a single contango or backwardation but a repeating sawtooth, with "
            "winter months priced well above the shoulder months around them because "
            "that is when the gas is needed and storage is scarce. The most watched "
            "spread is March–April, nicknamed the widow-maker, which prices the risk "
            "that a cold end to winter drains storage and leaves the market short. "
            "Curve analysis in gas is really about reading the seasonal spreads, not a "
            "single front-to-back slope."
        ),
        "seasonality": (
            "Gas seasonality is strong and physically grounded. The withdrawal season "
            "runs roughly November to March, the injection (refill) season April to "
            "October, with shoulder months in spring and autumn when demand is lowest. "
            "Prices and volatility typically peak in winter and again in mid-summer "
            "heat, and sag in the shoulders. Our month-by-month natural gas seasonality "
            "guide walks through the pattern and the traps in trading it."
        ),
        "positioning": (
            "Managed money in Henry Hub gas swings between net long and net short far "
            "more than in oil, tracking the weather narrative. Because the contract is "
            "volatile and positioning turns quickly, COT data is best used to spot "
            "crowding just before it unwinds: a large net short into a forecast change, "
            "or heavy net length into a warm winter outlook, are the setups where a "
            "positioning squeeze amplifies the fundamental move. Combine it with the "
            "storage surplus or deficit to the five-year average."
        ),
        "reports": [
            ("EIA Weekly Natural Gas Storage Report", "Thursdays 10:30 a.m. ET — injection/withdrawal versus the five-year average; the week's biggest scheduled mover."),
            ("Short and medium-range weather forecasts", "Daily — heating and cooling degree-day outlooks two weeks ahead."),
            ("EIA Natural Gas Monthly and Short-Term Energy Outlook", "Production, consumption, LNG feedgas, and price projections."),
            ("LNG feedgas and terminal status", "Daily — export demand is now a swing factor; an outage strands supply domestically."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money positioning in Henry Hub gas."),
        ],
        "glossary": ["seasonality", "contango", "rollyield"],
        "faqs": [
            ("Why is natural gas so much more volatile than oil?",
             "Gas is expensive to store and hard to move between regions, so supply and demand have to balance almost in real time. When a cold snap lifts demand there is little slack to absorb it, and price does the adjusting. Daily weather-forecast revisions feed straight into the front of the curve."),
            ("What is the 'widow-maker' spread?",
             "The price difference between the March and April natural gas futures contracts. March is the last month of winter withdrawal season and April the first of injection season, so the spread prices the risk of a late cold spell draining storage. It has produced spectacular blow-ups for traders who were short it into a cold March, hence the name."),
            ("When is the EIA natural gas storage report released?",
             "Thursdays at 10:30 a.m. Eastern, covering the week ending the previous Friday. It reports the change in working gas in underground storage and is compared against both the prior year and the five-year average for the same week."),
            ("What is natural gas's futures ticker and contract size?",
             "Henry Hub natural gas trades on NYMEX as NG, shown as NG=F for the continuous front month. Each contract is 10,000 MMBtu, so a $0.001 move is worth $10. A smaller contract (QG) covers 2,500 MMBtu."),
        ],
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
            "planted acreage, used for livestock feed, ethanol, and food processing. "
            "Price is driven by the planting-to-harvest weather calendar, USDA "
            "acreage and yield estimates, and export demand."
        ),
        "drivers": [
            "The U.S. growing-season weather calendar is the core driver. A wet spring "
            "that delays planting, a dry or hot spell during July pollination — the "
            "yield-critical window for corn — or an early autumn frost can each move "
            "price sharply months before the harvest confirms the outcome. The market "
            "trades the probability distribution of the crop, and it narrows as the "
            "season progresses.",
            "USDA reports are the scheduled catalysts. The Prospective Plantings report "
            "(late March) and the Acreage report (late June) set how much corn is in "
            "the ground; the monthly WASDE updates yield, production, and ending "
            "stocks; and the quarterly Grain Stocks reports true up how much is "
            "actually being used. A number far from the trade estimate can lock the "
            "contract limit-up or limit-down.",
            "Demand has three legs: livestock feed, ethanol (a large and policy-"
            "sensitive share of the U.S. crop), and exports. Export competitiveness "
            "versus Brazil and Argentina, the ethanol margin and the price of "
            "gasoline it blends into, and the size of the cattle, hog, and poultry "
            "herds all feed into the balance. The corn–soybean price ratio also "
            "influences how many acres farmers plant of each the following year.",
        ],
        "curve": (
            "The corn forward curve is organised around the U.S. harvest. New-crop "
            "contracts (December, and the following year's months) trade separately "
            "from old-crop (this year's July and September), and the old-crop/new-crop "
            "spread is a direct read on how tight supplies are before the combines "
            "roll. A large carry — deferred months well above the front — signals "
            "ample supply and pays growers to store grain; a flat or inverted curve "
            "signals scarcity and pulls grain out of storage now. Roll costs on a long "
            "position follow that shape."
        ),
        "seasonality": (
            "Corn has a well-known seasonal tendency: prices often firm from winter "
            "into spring and early summer as weather risk gets priced in, then soften "
            "into and after the autumn harvest as the new crop floods in — the so-"
            "called harvest low. The pattern is a tendency, not a rule; a drought year "
            "inverts it completely. Basis (local cash minus futures) has its own "
            "seasonal that matters to physical participants."
        ),
        "positioning": (
            "Managed money swings between large net long and large net short in corn, "
            "and the fund position often trends with the weather and the USDA balance "
            "sheet. Positioning extremes matter most around the report calendar: a "
            "heavily net-short fund community into a bullish WASDE, or a crowded net "
            "long into a benign forecast, sets up a positioning-driven move on top of "
            "the fundamental surprise. Commercial (producer and end-user) positioning "
            "on the other side of the fund is the hedging flow."
        ),
        "reports": [
            ("USDA WASDE", "Monthly, around the 12th — U.S. and world supply, demand, and ending stocks for corn."),
            ("USDA Prospective Plantings and Acreage", "Late March and late June — how many acres of corn are planted."),
            ("USDA Grain Stocks", "Quarterly — how much corn is actually in storage, a check on the demand estimate."),
            ("USDA Crop Progress and Conditions", "Weekly in season — planting pace, silking, and the good/excellent rating."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money and commercial positioning in CBOT corn."),
        ],
        "glossary": ["seasonality", "cot", "rollyield"],
        "faqs": [
            ("What is the futures ticker and contract size for corn?",
             "CBOT corn trades as ZC (open-outcry legacy symbol C), shown as ZC=F for the continuous front month. Each contract is 5,000 bushels, and the price is quoted in cents per bushel, so a one-cent move is worth $50."),
            ("Which months matter most for the corn crop?",
             "Planting in April and May, then pollination in July, which is the single most yield-sensitive period — heat and drought stress during silking do the most damage. Harvest runs from September into November. Weather scares outside the pollination window move price less."),
            ("What is the WASDE and why does it move corn?",
             "The World Agricultural Supply and Demand Estimates is the USDA's monthly balance sheet for major crops. It sets the official production and ending-stocks numbers the whole market anchors to, so a figure far from the trade's expectation can move corn the daily limit."),
            ("What is the old-crop/new-crop spread?",
             "The price difference between a contract that will be delivered from the current harvest (old crop, e.g. July) and one from the next harvest (new crop, e.g. December). It measures how tight supplies are in the gap before new grain is available."),
        ],
    },
    {
        "slug": "copper",
        "name": "Copper",
        "symbol": "HG=F",
        "exchange": "COMEX",
        "category": "Metals",
        "unit": "25,000 lbs per contract",
        "description": (
            "Copper futures trade on COMEX and track a metal used across construction, "
            "power grids, and electronics — often called “Dr. Copper” for its "
            "reputation as a barometer of industrial and economic activity. Its price "
            "leans almost entirely on real demand and inventory levels rather than "
            "safe-haven flows."
        ),
        "drivers": [
            "Copper is a growth trade. Global industrial production, construction "
            "activity, and — increasingly — electrification demand from EVs, grid "
            "upgrades, and data centres set the demand trend, and China is roughly half "
            "of world consumption, so Chinese property, infrastructure, and credit "
            "policy dominate sentiment. PMIs and Chinese activity data move copper on "
            "release.",
            "Inventories are the real-time tightness gauge. Stocks held in LME, COMEX, "
            "and Shanghai (SHFE) warehouses, and the direction they are moving, tell "
            "the market whether supply is keeping up. Falling exchange stocks with a "
            "firm price signal genuine tightness; rising stocks cap rallies. The "
            "spread between the three exchanges also drives physical arbitrage flows.",
            "Mine supply is slow to respond and prone to disruption — strikes, "
            "water and permitting constraints, and falling ore grades at ageing mines "
            "in Chile and Peru regularly take tonnes off the market. Treatment and "
            "refining charges (TC/RCs) negotiated between miners and smelters are a "
            "read on how tight concentrate supply is. The result is a market that can "
            "swing from surplus to deficit on modest demand changes.",
        ],
        "curve": (
            "COMEX and LME copper curves are usually close to flat, tipping between "
            "small contango and small backwardation as physical conditions change. "
            "Backwardation and a tight cash-to-three-month spread (on the LME) signal "
            "prompt scarcity, often tied to low warehouse stocks or a delivery squeeze; "
            "contango indicates comfortable near-term supply. Because copper is "
            "consumed continuously by industry, sustained steep contango is unusual and "
            "typically means a clear surplus."
        ),
        "seasonality": (
            "Copper's mild seasonality follows the construction and manufacturing "
            "calendar. Demand often firms in the northern-hemisphere spring building "
            "season and around China's post-Lunar-New-Year restocking, and softens "
            "during the summer lull and over Chinese holidays. As an industrial metal "
            "with no storage-cost story, copper's seasonal pattern is weaker and less "
            "reliable than that of gas or grains."
        ),
        "positioning": (
            "Managed-money positioning in COMEX copper is a widely used proxy for "
            "macro risk sentiment, since funds trade copper as an expression of the "
            "global growth view. Crowded net length near cycle highs is a classic "
            "late-cycle warning; a swing to heavy net short has often accompanied "
            "growth scares and marked capitulation lows. Read it with exchange "
            "inventories and the LME cash spread — positioning plus falling stocks is "
            "a stronger tightness signal than either alone."
        ),
        "reports": [
            ("China PMIs and monthly activity data", "Industrial production, fixed-asset investment, and property starts — the core of copper demand."),
            ("Global manufacturing PMIs", "Monthly — the developed-market demand pulse."),
            ("LME, COMEX and SHFE warehouse stocks", "Daily — the clearest real-time read on physical tightness."),
            ("ICSG monthly bulletin", "The International Copper Study Group's supply, demand, and market-balance data."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money positioning in COMEX copper."),
        ],
        "glossary": ["cot", "contango", "openinterest"],
        "faqs": [
            ("Why is copper called 'Dr. Copper'?",
             "Because its price is unusually good at signalling the health of the global economy. Copper is used in almost every part of industrial activity — wiring, plumbing, motors, electronics, construction — so demand for it rises and falls with growth, and the price is said to have a PhD in economics."),
            ("What is copper's futures ticker and contract size?",
             "COMEX copper trades as HG, shown as HG=F for the continuous front month. Each contract is 25,000 pounds, quoted in cents per pound, so a one-cent move is worth $250. The LME copper contract is 25 metric tonnes and quoted in dollars per tonne."),
            ("How does China affect the copper price?",
             "China consumes roughly half of the world's refined copper, so its construction cycle, grid investment, manufacturing output, and credit conditions set the demand trend. Chinese stimulus or property weakness moves copper more than almost any other single factor."),
            ("What does it mean when LME copper is in backwardation?",
             "The cash (immediate) price is above the three-month forward price, which means buyers are paying a premium for metal right now. It usually points to low available warehouse stock or a near-term delivery squeeze rather than a change in the long-term supply outlook."),
        ],
    },
    {
        "slug": "wheat",
        "name": "Wheat",
        "symbol": "ZW=F",
        "exchange": "CBOT",
        "category": "Grains",
        "unit": "5,000 bushels per contract",
        "description": (
            "CBOT wheat futures track the benchmark U.S. soft red winter wheat grade, "
            "though wheat is a genuinely global crop — Black Sea, EU, and Australian "
            "harvests all move price alongside U.S. supply. Growing-season weather and "
            "disruption to major exporting regions are the two biggest swing factors."
        ),
        "drivers": [
            "Wheat is grown and exported across many regions with staggered seasons, so "
            "the market watches weather almost year-round: the U.S. and European winter-"
            "wheat crop through spring, the Black Sea (Russia and Ukraine, the largest "
            "exporting bloc) and Canadian spring wheat through summer, and the "
            "Southern-Hemisphere crop in Australia and Argentina late in the year. "
            "Drought, heat, or excessive rain at harvest in any major exporter feeds "
            "into the global balance.",
            "Geopolitics carries unusual weight because so much exportable supply comes "
            "from the Black Sea. War, export restrictions or quotas, shipping-corridor "
            "agreements, and sanctions can remove or restore millions of tonnes from "
            "the world market quickly, and wheat has repeatedly been the grain most "
            "exposed to that risk.",
            "USDA and international reports set the scheduled catalysts: monthly WASDE "
            "world balances, U.S. Winter Wheat Seedings (January), quarterly Grain "
            "Stocks, and the weekly Crop Progress ratings. Wheat also has three U.S. "
            "futures markets — Chicago (soft red winter), Kansas City (hard red "
            "winter, the main milling grade), and Minneapolis (hard red spring) — and "
            "the spreads between them signal quality and protein premiums.",
        ],
        "curve": (
            "The CBOT wheat curve frequently shows a wide carry, with deferred months "
            "priced well above the front, because the U.S. soft red winter crop is "
            "often in comfortable surplus and the market pays to store it. That "
            "structural contango makes roll yield a real drag on long-only wheat "
            "positions and index products. The curve flattens or inverts when a supply "
            "shock — a Black Sea disruption, a drought in a major exporter — pulls "
            "prompt supply tight relative to later months."
        ),
        "seasonality": (
            "Wheat's clearest seasonal tendency is weakness into the Northern-"
            "Hemisphere harvest in June and July, when new supply is largest, and a "
            "tendency to firm through the winter and early spring as the market prices "
            "weather risk for the developing crop. Because harvests in the Southern "
            "Hemisphere and the Black Sea fall at different times, wheat's seasonality "
            "is noisier than corn's and is best treated as a weak background bias."
        ),
        "positioning": (
            "Managed money has spent long stretches heavily net short CBOT wheat, "
            "reflecting the structural surplus and the carrying cost of a long "
            "position. That means the positioning risk is often asymmetric: a bullish "
            "shock into a crowded short can force a rapid short-covering rally out of "
            "proportion to the news. Watch the size of the fund short relative to its "
            "historical range, and note that Kansas City wheat positioning can tell a "
            "different story when the milling-quality crop is the one under stress."
        ),
        "reports": [
            ("USDA WASDE", "Monthly — U.S. and world wheat supply, demand, and ending stocks, including the major exporters."),
            ("USDA Winter Wheat Seedings", "Mid-January — U.S. planted area for the winter crop."),
            ("USDA Grain Stocks", "Quarterly — wheat in storage."),
            ("USDA Crop Progress / Conditions", "Weekly in season — winter-wheat condition ratings and spring-wheat planting and harvest pace."),
            ("Black Sea export news and IGC / FAO reports", "Ongoing — export policy, corridor agreements, and global grain balances."),
            ("CFTC Commitment of Traders", "Fridays 3:30 p.m. ET — managed-money positioning in Chicago and Kansas City wheat."),
        ],
        "glossary": ["seasonality", "cot", "rollyield"],
        "faqs": [
            ("What is the difference between Chicago, Kansas City, and Minneapolis wheat?",
             "They are different wheat classes traded on different exchanges. Chicago (CBOT) is soft red winter wheat, used for pastries and crackers. Kansas City is hard red winter wheat, the main bread-flour milling grade. Minneapolis is hard red spring wheat, the highest-protein class. The price spreads between them reflect protein and milling-quality premiums."),
            ("What is wheat's futures ticker and contract size?",
             "CBOT (Chicago) wheat trades as ZW, shown as ZW=F for the continuous front month. Each contract is 5,000 bushels, quoted in cents per bushel, so a one-cent move is worth $50. Kansas City wheat trades as KE."),
            ("Why is wheat so sensitive to news from Russia and Ukraine?",
             "The Black Sea region is the largest wheat-exporting bloc in the world. Because global wheat trade depends on a handful of big exporters, a disruption there — conflict, an export ban, a blocked shipping corridor — removes a large share of available supply and the price reacts quickly."),
            ("Why does long-only wheat often underperform the spot price?",
             "CBOT wheat is frequently in contango, with each contract more expensive than the one expiring. Rolling a long position forward means repeatedly selling low and buying high, so roll yield is negative and erodes returns even when the headline price is flat."),
        ],
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
__ARTICLE_JSONLD__
</script>
<script type="application/ld+json">
__FAQ_JSONLD__
</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8597609154479605"
     crossorigin="anonymous"></script>
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
      <a href="/api">API</a>
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
      <h1>__NAME__ Price Today</h1>
      <div class="doc-updated">__CATEGORY__ · __EXCHANGE__ · __SYMBOL__ · updated __DATE_MODIFIED__</div>
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
        <p>The quote above is the live front-month __NAME__ futures price, the same feed used across Commodity Hub. The rest of this page explains what actually moves that number — the supply and demand drivers, how the forward curve behaves, the seasonal pattern, how to read positioning, and the recurring reports worth watching.</p>
      </section>
      <section>
        <h2>About __NAME__</h2>
        <p>__ABOUT__</p>
        <ul>
          <li><strong>Exchange:</strong> __EXCHANGE__</li>
          <li><strong>Ticker:</strong> __SYMBOL__</li>
          <li><strong>Contract size:</strong> __UNIT__</li>
          <li><strong>Category:</strong> __CATEGORY__</li>
        </ul>
      </section>
      <section>
        <h2>What moves the __NAME__ price</h2>
__DRIVERS__
      </section>
      <section>
        <h2>How the __NAME__ forward curve behaves</h2>
        <p>__CURVE__</p>
        <p>For the mechanics of reading a curve month by month, see <a href="/glossary/contango-vs-backwardation">contango vs. backwardation</a> and the <a href="/tools/roll-yield-calculator">roll yield calculator</a>.</p>
      </section>
      <section>
        <h2>__NAME__ and the calendar</h2>
        <p>__SEASONALITY__</p>
      </section>
      <section>
        <h2>Reading __NAME__ positioning</h2>
        <p>__POSITIONING__</p>
        <p>Background: <a href="/glossary/cot-report">how to read the COT report</a>.</p>
      </section>
      <section>
        <h2>Reports and events that move __NAME__</h2>
        <ul>
__REPORTS__
        </ul>
        <p>The <a href="/calendar">market data calendar</a> lists when these are released.</p>
      </section>
      <section>
        <h2>Related concepts</h2>
        <p>__GLOSSARY_LINKS__</p>
      </section>
      <section>
        <h2>Frequently asked questions</h2>
__FAQS__
      </section>
      <section>
        <h2>See __NAME__ live in Commodity Hub</h2>
        <p>Commodity Hub tracks __NAME__ alongside 30 other commodities with historical charts, forward curves, COT positioning, seasonality, and price alerts. <a href="https://app.commodity-hub.eu">Open the app</a> to see it live, or browse the <a href="/commodities">full commodity list</a>.</p>
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
        <a href="/learn">Learn</a>
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/about">About</a>
        <a href="https://app.commodity-hub.eu/delete-account">Delete account</a>
      </div>
    </div>
    <div class="footer-fine">
      Commodity Hub is an information service providing commodity market prices, news, and analytics. It does not execute trades, hold client funds, or provide investment advice. The "Trade" section of the app links to an independent, regulated third party (eToro); Commodity Hub may earn a referral commission from those links. © <span id="year"></span> Commodity Hub. All rights reserved.
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
<meta name="description" content="Live prices plus a full explainer for each commodity Commodity Hub tracks — what moves it, how its forward curve behaves, seasonality, and positioning." />
<meta name="theme-color" content="#0d0d0f" />
<link rel="canonical" href="__SITE__/commodities" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Commodity Hub" />
<meta property="og:url" content="__SITE__/commodities" />
<meta property="og:title" content="Live Commodity Prices — Commodity Hub" />
<meta property="og:description" content="Live prices plus a full explainer for each commodity Commodity Hub tracks — what moves it, how its forward curve behaves, seasonality, and positioning." />
<meta property="og:image" content="__SITE__/assets/app-icon.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Live Commodity Prices — Commodity Hub" />
<meta name="twitter:description" content="Live prices plus a full explainer for each commodity Commodity Hub tracks — what moves it, how its forward curve behaves, seasonality, and positioning." />
<meta name="twitter:image" content="__SITE__/assets/app-icon.png" />
<link rel="icon" href="/assets/app-icon.png" />
<link rel="apple-touch-icon" href="/assets/app-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8597609154479605"
     crossorigin="anonymous"></script>
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
      <a href="/api">API</a>
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
      <div class="doc-updated">Oil, metals, and grains — live price and a full explainer for each</div>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="doc">
      <section>
        <p>Each page below carries the live front-month futures price plus a plain-English guide to that market: the supply and demand drivers, how its forward curve behaves, the seasonal pattern, how to read CFTC positioning, and the recurring reports that move it.</p>
      </section>
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
        <a href="/learn">Learn</a>
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/about">About</a>
        <a href="https://app.commodity-hub.eu/delete-account">Delete account</a>
      </div>
    </div>
    <div class="footer-fine">
      Commodity Hub is an information service providing commodity market prices, news, and analytics. It does not execute trades, hold client funds, or provide investment advice. The "Trade" section of the app links to an independent, regulated third party (eToro); Commodity Hub may earn a referral commission from those links. © <span id="year"></span> Commodity Hub. All rights reserved.
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


def esc(s):
    # Body text and simple attribute values. Our content has no quote
    # characters, so escaping <, >, & is enough and keeps apostrophes readable.
    return _html.escape(s, quote=False)


def glossary_links_html(keys):
    links = []
    for key in keys:
        href, label = GLOSSARY[key]
        links.append('<a href="{}">{}</a>'.format(href, label))
    if len(links) == 1:
        joined = links[0]
    elif len(links) == 2:
        joined = " and ".join(links)
    else:
        joined = ", ".join(links[:-1]) + ", and " + links[-1]
    return "Relevant background: " + joined + "."


def drivers_html(paras):
    return "\n".join("        <p>{}</p>".format(esc(p)) for p in paras)


def reports_html(items):
    return "\n".join(
        "          <li><strong>{}</strong> — {}</li>".format(esc(name), esc(desc))
        for name, desc in items
    )


def faqs_html(items):
    out = []
    for q, a in items:
        out.append("        <p><strong>{}</strong></p>".format(esc(q)))
        out.append("        <p>{}</p>".format(esc(a)))
    return "\n".join(out)


def faq_jsonld(items):
    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in items
        ],
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def article_jsonld(c, canonical, description):
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "{} Price Today: What Moves It and How to Read the Market".format(c["name"]),
        "description": description,
        "datePublished": DATE_PUBLISHED,
        "dateModified": DATE_MODIFIED,
        "author": {"@type": "Organization", "name": "Commodity Hub"},
        "publisher": {
            "@type": "Organization",
            "name": "Commodity Hub",
            "logo": {"@type": "ImageObject", "url": SITE + "/assets/logo.png"},
        },
        "mainEntityOfPage": canonical,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def build_page(c):
    canonical = "{}/commodities/{}".format(SITE, c["slug"])
    title = "{} Price Today: Drivers, Curve & Positioning — Commodity Hub".format(c["name"])
    description = (
        "Live {} price ({}, {}) plus what moves it, how the forward curve behaves, "
        "seasonality, positioning, and the reports to watch.".format(
            c["name"], c["symbol"], c["exchange"]
        )
    )
    repl = {
        "__TITLE__": esc(title),
        "__DESCRIPTION__": esc(description),
        "__ABOUT__": esc(c["description"]),
        "__CANONICAL__": canonical,
        "__SITE__": SITE,
        "__NAME__": esc(c["name"]),
        "__CATEGORY__": esc(c["category"]),
        "__EXCHANGE__": esc(c["exchange"]),
        "__SYMBOL__": esc(c["symbol"]),
        "__UNIT__": esc(c["unit"]),
        "__DATE_PUBLISHED__": DATE_PUBLISHED,
        "__DATE_MODIFIED__": DATE_MODIFIED,
        "__DRIVERS__": drivers_html(c["drivers"]),
        "__CURVE__": esc(c["curve"]),
        "__SEASONALITY__": esc(c["seasonality"]),
        "__POSITIONING__": esc(c["positioning"]),
        "__REPORTS__": reports_html(c["reports"]),
        "__FAQS__": faqs_html(c["faqs"]),
        "__ARTICLE_JSONLD__": article_jsonld(c, canonical, description),
        "__FAQ_JSONLD__": faq_jsonld(c["faqs"]),
        "__GLOSSARY_LINKS__": glossary_links_html(c["glossary"]),
    }
    html = PAGE_TEMPLATE
    for k, v in repl.items():
        html = html.replace(k, v)
    return html


def build_index():
    by_category = {}
    for c in COMMODITIES:
        by_category.setdefault(c["category"], []).append(c)
    rows = []
    for category in sorted(by_category):
        rows.append("      <section>")
        rows.append("        <h2>{}</h2>".format(esc(category)))
        for c in by_category[category]:
            blurb = c["drivers"][0]
            if len(blurb) > 220:
                blurb = blurb[:217].rsplit(" ", 1)[0]
                while blurb.split() and blurb.split()[-1].lower() in (
                    "the", "a", "an", "and", "or", "but", "so", "of", "to", "in", "its", "—",
                ):
                    blurb = blurb.rsplit(" ", 1)[0]
                blurb = blurb.rstrip(",;:— ") + "…"
            rows.append(
                '        <p><a href="/commodities/{}">{} ({})</a> — {}</p>'.format(
                    c["slug"], esc(c["name"]), esc(c["symbol"]), esc(blurb)
                )
            )
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

    sync_script = os.path.join(os.path.dirname(__file__), "sync-csp-hashes.py")
    subprocess.run([sys.executable, sync_script], check=True)


if __name__ == "__main__":
    main()
