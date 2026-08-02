-- Insert tutorial categories for commodity trading education
INSERT INTO tutorial_categories (name, description, sort_order) VALUES
('Futures Basics', 'Learn the fundamentals of futures contracts and how they work', 1),
('Market Analysis', 'Technical and fundamental analysis techniques for commodity markets', 2),
('Trading Strategies', 'Proven strategies for successful commodity trading', 3),
('Risk Management', 'Essential risk management techniques and position sizing', 4),
('Commodity Types', 'Deep dive into different commodity sectors and their characteristics', 5);

-- Insert comprehensive tutorials about futures contracts and commodity trading
INSERT INTO tutorials (category_id, title, description, difficulty_level, estimated_time_minutes, content, sort_order) VALUES
(
  (SELECT id FROM tutorial_categories WHERE name = 'Futures Basics'),
  'What Are Futures Contracts?',
  'Learn the basic definition, purpose, and mechanics of futures contracts in commodity markets.',
  'beginner',
  15,
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

Most traders never take physical delivery - they close positions before expiration by taking an opposite position.',
  1
),
(
  (SELECT id FROM tutorial_categories WHERE name = 'Futures Basics'),
  'Contract Specifications and Standardization',
  'Understanding contract sizes, delivery months, and standardization in futures markets.',
  'beginner',
  20,
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

Understanding these specifications is crucial for calculating profit/loss and managing risk effectively.',
  2
),
(
  (SELECT id FROM tutorial_categories WHERE name = 'Futures Basics'),
  'Margin and Leverage in Futures Trading',
  'Learn how margin requirements work and understand the leverage in futures contracts.',
  'intermediate',
  25,
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

Understanding leverage is crucial for successful futures trading and risk management.',
  3
);