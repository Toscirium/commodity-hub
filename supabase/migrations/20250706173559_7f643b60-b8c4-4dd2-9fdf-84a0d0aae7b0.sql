-- Insert tutorial categories for commodity trading education
INSERT INTO tutorial_categories (name, description, sort_order) VALUES
('Futures Basics', 'Learn the fundamentals of futures contracts and how they work', 1),
('Market Analysis', 'Technical and fundamental analysis techniques for commodity markets', 2),
('Trading Strategies', 'Proven strategies for successful commodity trading', 3),
('Risk Management', 'Essential risk management techniques and position sizing', 4),
('Commodity Types', 'Deep dive into different commodity sectors and their characteristics', 5)
ON CONFLICT (name) DO NOTHING;

-- Get category IDs for tutorial insertion
WITH category_ids AS (
  SELECT id, name FROM tutorial_categories WHERE name IN ('Futures Basics', 'Market Analysis', 'Trading Strategies', 'Risk Management', 'Commodity Types')
)

-- Insert comprehensive tutorials about futures contracts and commodity trading
INSERT INTO tutorials (category_id, title, description, difficulty_level, estimated_time_minutes, content, sort_order)
SELECT 
  c.id,
  t.title,
  t.description,
  t.difficulty_level,
  t.estimated_time_minutes,
  t.content,
  t.sort_order
FROM category_ids c
CROSS JOIN (
  VALUES
  -- Futures Basics Category
  ('Futures Basics', 'What Are Futures Contracts?', 'Learn the basic definition, purpose, and mechanics of futures contracts in commodity markets.', 'beginner', 15, 
   'A futures contract is a standardized legal agreement to buy or sell a commodity at a predetermined price at a specified time in the future. These contracts are traded on organized exchanges and serve two primary purposes: price discovery and risk management.

Key Components of a Futures Contract:
• Underlying Asset: The commodity being bought/sold (oil, gold, wheat, etc.)
• Contract Size: The standardized quantity (e.g., 1,000 barrels of oil)
• Delivery Date: When the contract expires
• Price: The agreed-upon price for future delivery
• Margin Requirements: Deposit required to trade

Why Futures Exist:
Futures contracts were originally created to help farmers and businesses manage price risk. A wheat farmer could sell wheat futures before harvest to lock in a price, protecting against price drops. Similarly, a bread manufacturer could buy wheat futures to protect against price increases.

Key Benefits:
• Price Risk Management: Lock in prices for future transactions
• Leverage: Control large positions with relatively small capital
• Liquidity: Easy to enter and exit positions
• Standardization: Uniform contract terms across all participants

Most traders never take physical delivery - they close positions before expiration by taking an opposite position.', 1),

  ('Futures Basics', 'Contract Specifications and Standardization', 'Understanding contract sizes, delivery months, and standardization in futures markets.', 'beginner', 20,
   'Futures contracts are highly standardized to ensure liquidity and fair trading. Each contract specifies exact terms that cannot be changed.

Standard Contract Specifications:

Contract Size Examples:
• Crude Oil: 1,000 barrels per contract
• Gold: 100 troy ounces per contract  
• Corn: 5,000 bushels per contract
• Natural Gas: 10,000 MMBtu per contract
• Coffee: 37,500 pounds per contract

Delivery Months:
Most commodities have specific delivery months:
• Energy: All 12 months typically available
• Grains: March, May, July, September, December
• Metals: February, April, June, August, October, December

Price Quotations:
• Crude Oil: Dollars per barrel
• Gold: Dollars per troy ounce
• Corn: Cents per bushel
• Natural Gas: Dollars per MMBtu

Minimum Price Fluctuation (Tick Size):
• Crude Oil: $0.01 per barrel = $10 per contract
• Gold: $0.10 per ounce = $10 per contract
• Corn: $0.0025 per bushel = $12.50 per contract

Daily Price Limits:
Many contracts have daily price limits to prevent excessive volatility:
• Limit Up: Maximum price increase allowed in one day
• Limit Down: Maximum price decrease allowed in one day
• Circuit Breakers: Trading halts during extreme moves

Understanding these specifications is crucial for calculating profit/loss and managing risk effectively.', 2),

  ('Futures Basics', 'Margin and Leverage in Futures Trading', 'Learn how margin requirements work and understand the leverage in futures contracts.', 'intermediate', 25,
   'Futures trading uses a margin system that allows traders to control large positions with relatively small amounts of capital, creating significant leverage.

Types of Margin:

Initial Margin:
• The deposit required to open a futures position
• Typically 3-12% of contract value
• Set by exchanges and can change based on volatility
• Example: Crude oil contract worth $70,000 might require $3,500 initial margin

Maintenance Margin:
• Minimum equity required to keep position open
• Usually 75-80% of initial margin
• If account falls below this level, a margin call occurs
• Must deposit funds to bring account back to initial margin level

Variation Margin:
• Daily settlement of gains and losses
• Profits/losses added to or subtracted from account daily
• Called "mark-to-market" settlement

Leverage Examples:
• Gold contract: $200,000 value, $8,000 margin = 25:1 leverage
• Crude oil: $70,000 value, $3,500 margin = 20:1 leverage
• Corn: $23,000 value, $1,200 margin = 19:1 leverage

Risk Management with Leverage:
• Small price movements create large gains/losses
• $1 move in crude oil = $1,000 gain/loss per contract
• Risk management is essential
• Never risk more than 2-3% of capital per trade
• Use stop-loss orders to limit downside

Margin Calls:
When account equity falls below maintenance margin:
1. Broker issues margin call
2. Must deposit additional funds immediately
3. If not met, broker will liquidate positions
4. Can result in losses exceeding initial investment

Understanding leverage is crucial for successful futures trading and risk management.', 3),

  -- Market Analysis Category  
  ('Market Analysis', 'Fundamental Analysis for Commodities', 'Learn how supply and demand factors drive commodity prices and how to analyze market fundamentals.', 'intermediate', 30,
   'Fundamental analysis in commodity markets focuses on supply and demand factors that drive price movements. Unlike stocks, commodities are physical goods with real-world supply constraints and demand drivers.

Key Supply Factors:

Weather and Climate:
• Droughts, floods, freezes affect agricultural production
• Hurricanes disrupt oil/gas production and refining
• Temperature affects heating oil and natural gas demand

Geopolitical Events:
• Wars, sanctions, trade disputes
• OPEC production decisions for oil
• Export restrictions on grains, metals
• Currency fluctuations in producing countries

Production Levels:
• Mining output for metals
• Crop planting and harvest data
• Oil rig counts and production capacity
• Inventory levels and storage capacity

Key Demand Factors:

Economic Growth:
• Industrial metals demand tied to manufacturing
• Energy demand linked to economic activity
• Infrastructure development drives commodity needs

Population Growth:
• More people need more food, energy, materials
• Urbanization increases demand for metals, energy

Seasonal Patterns:
• Heating oil demand peaks in winter
• Gasoline demand peaks in summer driving season
• Agricultural commodities have planting/harvest cycles

Important Data Sources:
• USDA reports for agricultural commodities
• EIA reports for energy markets
• LME and COMEX inventory data for metals
• Weather services and crop condition reports

Economic Indicators to Watch:
• GDP growth rates
• Manufacturing PMI indices
• Construction spending
• Currency exchange rates
• Interest rates and inflation

Successful fundamental analysis requires understanding the unique supply/demand dynamics of each commodity sector.', 1),

  ('Market Analysis', 'Technical Analysis and Chart Patterns', 'Master technical analysis techniques specifically for commodity futures markets.', 'intermediate', 35,
   'Technical analysis in commodity futures uses price charts and trading volume to identify trends and predict future price movements. Commodities often follow technical patterns due to their cyclical nature.

Key Technical Indicators for Commodities:

Moving Averages:
• Simple Moving Average (SMA): Average price over X periods
• Exponential Moving Average (EMA): Gives more weight to recent prices
• Common periods: 10, 20, 50, 100, 200 days
• Golden Cross: 50-day MA crosses above 200-day MA (bullish)
• Death Cross: 50-day MA crosses below 200-day MA (bearish)

Momentum Indicators:
• RSI (Relative Strength Index): Measures overbought/oversold conditions
• MACD: Shows relationship between two moving averages
• Stochastic: Compares closing price to price range over period

Volume Analysis:
• Volume confirms price movements
• High volume on breakouts indicates strong moves
• Volume precedes price in many commodity moves
• Open Interest: Number of outstanding contracts

Chart Patterns Common in Commodities:

Trend Patterns:
• Uptrends: Higher highs and higher lows
• Downtrends: Lower highs and lower lows
• Sideways: Horizontal support and resistance

Reversal Patterns:
• Head and Shoulders: Three peaks with middle highest
• Double Top/Bottom: Two equal highs or lows
• Cup and Handle: Rounded bottom with small consolidation

Continuation Patterns:
• Triangles: Converging trend lines
• Rectangles: Horizontal support/resistance
• Flags and Pennants: Brief consolidations in trends

Support and Resistance:
• Support: Price level where buying emerges
• Resistance: Price level where selling emerges
• Previous highs become resistance, lows become support
• Round numbers often act as psychological levels

Commodity-Specific Considerations:
• Seasonal patterns affect technical signals
• News events can override technical levels
• Limit moves can gap through technical levels
• Backwardation/contango affects chart interpretation

Combining fundamental and technical analysis provides the most complete market picture.', 2),

  -- Trading Strategies Category
  ('Trading Strategies', 'Trend Following in Commodity Markets', 'Learn how to identify and trade with commodity trends using proven systematic approaches.', 'intermediate', 40,
   'Trend following is one of the most successful long-term strategies in commodity futures. Commodities often trend for extended periods due to fundamental supply/demand imbalances.

Why Commodities Trend:

Fundamental Drivers:
• Supply disruptions create lasting price moves
• Demand shifts take time to develop and resolve
• Inventory cycles create multi-month trends
• Weather patterns affect entire growing seasons

Market Structure:
• Commercial hedgers provide trend continuity
• Speculators often follow commercial money
• Limited arbitrage opportunities versus other assets
• Physical delivery constraints support price moves

Classic Trend Following Strategies:

Moving Average Crossovers:
• Buy when price crosses above moving average
• Sell when price crosses below moving average
• Use multiple timeframes for confirmation
• Exit when trend reverses

Breakout Systems:
• Buy breakouts above recent highs
• Sell breakdowns below recent lows
• Use volatility-based stops
• Common lookback periods: 20, 50, 100 days

Channel Breakouts:
• Trade breakouts from consolidation ranges
• Higher probability after extended consolidation
• Measure target based on channel width
• Volume should confirm breakout

Risk Management for Trend Following:

Position Sizing:
• Risk 1-2% of capital per trade
• Use volatility-adjusted position sizes
• Smaller positions in highly volatile markets
• Scale into positions as trends develop

Stop Loss Placement:
• Use Average True Range (ATR) for stops
• Place stops below support in uptrends
• Allow room for normal market volatility
• Trail stops as trends develop

Trend Following Rules:
1. Let profits run, cut losses short
2. Add to winning positions, not losing ones
3. Don\'t fight the tape - go with the flow
4. Be patient - trends take time to develop
5. Accept that most trades will be small losses

Common Mistakes:
• Taking profits too early
• Using stops that are too tight
• Fighting obvious trends
• Trying to pick tops and bottoms
• Ignoring risk management rules

Trend following requires discipline and patience but can be highly profitable in commodity markets.', 1),

  -- Risk Management Category
  ('Risk Management', 'Position Sizing and Risk Control', 'Master the essential skills of position sizing and risk control in futures trading.', 'advanced', 45,
   'Proper position sizing is the most important aspect of successful futures trading. Even the best trading strategy will fail without appropriate risk management.

The 2% Rule:
Never risk more than 2% of your trading capital on any single trade.

Calculating Position Size:
1. Determine risk per trade: Account Size × 2% = Maximum Risk
2. Calculate stop loss distance: Entry Price - Stop Loss Price
3. Find contract value per point movement
4. Calculate position size: Max Risk ÷ (Stop Distance × Contract Value)

Example Calculation:
• Account Size: $50,000
• Max Risk: $50,000 × 2% = $1,000
• Crude Oil Entry: $70.00, Stop: $68.50
• Stop Distance: $1.50 per barrel
• Contract Value: $1,000 per $1 move
• Position Size: $1,000 ÷ ($1.50 × $1,000) = 0.67 contracts

Therefore, trade only 1 contract (never use partial contracts).

Risk Management Techniques:

Portfolio Heat:
• Never have more than 6-8% of capital at risk simultaneously
• Spread risk across different commodity sectors
• Avoid correlated positions (e.g., crude oil and heating oil)

Stop Loss Orders:
• Always use stop losses - never hold and hope
• Place stops based on technical levels, not round numbers
• Use volatility-based stops (ATR method)
• Never move stops against your position

Volatility Adjustment:
• Use smaller positions in highly volatile markets
• Calculate Average True Range (ATR) for stop placement
• Adjust for market conditions and volatility cycles

Time-Based Risk:
• Set maximum holding periods for positions
• Review and reassess positions regularly
• Close positions before major news events if uncertain

Kelly Criterion:
Advanced position sizing based on win rate and average win/loss:
Position Size = (Win Rate × Average Win - Loss Rate × Average Loss) ÷ Average Win

Diversification Rules:
• Trade multiple commodity sectors
• Use different timeframes and strategies  
• Limit sector concentration to 25% of portfolio
• Maintain cash reserves for opportunities

Common Risk Management Mistakes:
• Risking too much per trade
• Not using stop losses
• Adding to losing positions
• Ignoring correlation between positions
• Emotional decision making

Remember: You can always make more money, but you can\'t trade without capital.', 1)
) AS t(category_name, title, description, difficulty_level, estimated_time_minutes, content, sort_order)
WHERE c.name = t.category_name;

-- Insert glossary terms for commodity trading
INSERT INTO glossary_terms (term, definition, category, examples) VALUES
('Futures Contract', 'A standardized legal agreement to buy or sell a commodity at a predetermined price at a specified time in the future.', 'Futures Basics', 'Crude oil futures, gold futures, wheat futures traded on exchanges like NYMEX and CBOT.'),

('Margin', 'The deposit required to open and maintain a futures position, typically 5-15% of the contract value.', 'Futures Basics', 'If crude oil futures are worth $70,000, the margin requirement might be $3,500.'),

('Leverage', 'The ability to control a large position with a relatively small amount of capital through margin trading.', 'Risk Management', 'With $5,000 margin, you might control a $100,000 gold futures contract, providing 20:1 leverage.'),

('Contango', 'A market condition where futures prices are higher than the current spot price, typically indicating oversupply.', 'Market Analysis', 'When December crude oil trades at $72 while current spot price is $70.'),

('Backwardation', 'A market condition where futures prices are lower than the current spot price, typically indicating supply shortage.', 'Market Analysis', 'When December crude oil trades at $68 while current spot price is $70.'),

('Open Interest', 'The total number of outstanding futures contracts that have not been settled or closed.', 'Market Analysis', 'If 50,000 crude oil contracts are open, the open interest is 50,000 contracts.'),

('Limit Move', 'The maximum price change allowed for a futures contract in a single trading session.', 'Trading Rules', 'Crude oil has daily price limits of $10 per barrel up or down from the previous close.'),

('Delivery Month', 'The month when a futures contract expires and physical delivery of the commodity may occur.', 'Futures Basics', 'March, May, July, September, and December are common delivery months for many agricultural commodities.'),

('Tick Size', 'The minimum price movement for a futures contract.', 'Trading Rules', 'Crude oil futures move in $0.01 increments, with each tick worth $10 per contract.'),

('Stop Loss', 'An order to close a position when the price moves against you by a predetermined amount.', 'Risk Management', 'Setting a stop loss at $68 when long crude oil at $70 to limit losses to $2 per barrel.'),

('Spread Trading', 'Simultaneously buying and selling related futures contracts to profit from price differences.', 'Trading Strategies', 'Buying December wheat and selling March wheat to profit from seasonal price differences.'),

('Commercial Trader', 'Market participants who use futures contracts to hedge their business operations involving physical commodities.', 'Market Participants', 'Oil companies, grain elevators, mining companies that hedge their production or consumption.'),

('Speculator', 'Traders who buy and sell futures contracts to profit from price movements without intending to take delivery.', 'Market Participants', 'Fund managers, individual traders, and hedge funds trading for profit rather than hedging.'),

('Basis', 'The difference between the futures price and the cash (spot) price of a commodity.', 'Pricing', 'If wheat futures trade at $6.50 per bushel and local cash price is $6.20, the basis is -30 cents.'),

('Roll Over', 'Closing a position in a near-term futures contract and opening a similar position in a longer-term contract.', 'Trading Operations', 'Closing a March crude oil position and opening an identical June crude oil position.')

ON CONFLICT (term) DO NOTHING;