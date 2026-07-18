-- Add more tutorials for different categories
INSERT INTO tutorials (category_id, title, description, difficulty_level, estimated_time_minutes, content, sort_order) VALUES
(
  (SELECT id FROM tutorial_categories WHERE name = 'Market Analysis'),
  'Fundamental Analysis for Commodities',
  'Learn how supply and demand factors drive commodity prices and how to analyze market fundamentals.',
  'intermediate',
  30,
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

Successful fundamental analysis requires understanding the unique supply/demand dynamics of each commodity sector.',
  1
),
(
  (SELECT id FROM tutorial_categories WHERE name = 'Risk Management'),
  'Position Sizing and Risk Control',
  'Master the essential skills of position sizing and risk control in futures trading.',
  'advanced',
  45,
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

Common Risk Management Mistakes:
• Risking too much per trade
• Not using stop losses
• Adding to losing positions
• Ignoring correlation between positions
• Emotional decision making

Remember: You can always make more money, but you cannot trade without capital.',
  1
);

-- Insert glossary terms for commodity trading
INSERT INTO glossary_terms (term, definition, category, examples) VALUES
('Futures Contract', 'A standardized legal agreement to buy or sell a commodity at a predetermined price at a specified time in the future.', 'Futures Basics', 'Crude oil futures, gold futures, wheat futures traded on exchanges like NYMEX and CBOT.'),
('Margin', 'The deposit required to open and maintain a futures position, typically 5-15% of the contract value.', 'Futures Basics', 'If crude oil futures are worth $70,000, the margin requirement might be $3,500.'),
('Leverage', 'The ability to control a large position with a relatively small amount of capital through margin trading.', 'Risk Management', 'With $5,000 margin, you might control a $100,000 gold futures contract, providing 20:1 leverage.'),
('Contango', 'A market condition where futures prices are higher than the current spot price, typically indicating oversupply.', 'Market Analysis', 'When December crude oil trades at $72 while current spot price is $70.'),
('Backwardation', 'A market condition where futures prices are lower than the current spot price, typically indicating supply shortage.', 'Market Analysis', 'When December crude oil trades at $68 while current spot price is $70.'),
('Open Interest', 'The total number of outstanding futures contracts that have not been settled or closed.', 'Market Analysis', 'If 50,000 crude oil contracts are open, the open interest is 50,000 contracts.'),
('Tick Size', 'The minimum price movement for a futures contract.', 'Trading Rules', 'Crude oil futures move in $0.01 increments, with each tick worth $10 per contract.'),
('Stop Loss', 'An order to close a position when the price moves against you by a predetermined amount.', 'Risk Management', 'Setting a stop loss at $68 when long crude oil at $70 to limit losses to $2 per barrel.'),
('Spread Trading', 'Simultaneously buying and selling related futures contracts to profit from price differences.', 'Trading Strategies', 'Buying December wheat and selling March wheat to profit from seasonal price differences.'),
('Commercial Trader', 'Market participants who use futures contracts to hedge their business operations involving physical commodities.', 'Market Participants', 'Oil companies, grain elevators, mining companies that hedge their production or consumption.'),
('Speculator', 'Traders who buy and sell futures contracts to profit from price movements without intending to take delivery.', 'Market Participants', 'Fund managers, individual traders, and hedge funds trading for profit rather than hedging.'),
('Basis', 'The difference between the futures price and the cash (spot) price of a commodity.', 'Pricing', 'If wheat futures trade at $6.50 per bushel and local cash price is $6.20, the basis is -30 cents.'),
('Roll Over', 'Closing a position in a near-term futures contract and opening a similar position in a longer-term contract.', 'Trading Operations', 'Closing a March crude oil position and opening an identical June crude oil position.');