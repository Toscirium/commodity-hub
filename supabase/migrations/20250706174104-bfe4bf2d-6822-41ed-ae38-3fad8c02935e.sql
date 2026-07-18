-- Add Trading Strategies tutorial
INSERT INTO tutorials (category_id, title, description, difficulty_level, estimated_time_minutes, content, sort_order) 
SELECT 
  id as category_id,
  'Introduction to Commodity Trading Strategies' as title,
  'Learn fundamental trading strategies specifically designed for commodity futures markets.' as description,
  'intermediate' as difficulty_level,
  40 as estimated_time_minutes,
  'Commodity futures markets offer unique trading opportunities due to their physical nature and fundamental supply/demand dynamics. Here are key strategies for successful commodity trading.

Trend Following Strategies:

Why Commodities Trend:
• Supply disruptions create lasting price moves
• Demand shifts take time to develop and resolve
• Inventory cycles create multi-month trends
• Weather patterns affect entire growing seasons

Moving Average Systems:
• Buy when price crosses above moving average
• Sell when price crosses below moving average
• Use multiple timeframes for confirmation
• Common periods: 20, 50, 100, 200 days

Breakout Strategies:
• Trade breakouts from consolidation ranges
• Higher probability after extended consolidation
• Volume should confirm breakout direction
• Use volatility-based position sizing

Seasonal Trading:

Agricultural Seasonality:
• Plant-to-harvest cycles affect grain prices
• Weather-sensitive periods create volatility
• Storage costs influence price patterns
• Export seasons drive demand cycles

Energy Seasonality:
• Winter heating demand affects natural gas
• Summer driving season impacts gasoline
• Hurricane season creates supply disruptions
• Refinery maintenance schedules

Spread Trading:

Calendar Spreads:
• Trade price differences between delivery months
• Profit from storage cost changes
• Lower risk than outright positions
• Example: Buy March wheat, sell May wheat

Inter-Commodity Spreads:
• Trade relationships between related commodities
• Crack spreads: Crude oil vs refined products
• Crush spreads: Soybeans vs meal and oil
• Relative value opportunities

Risk Management Rules:
1. Never risk more than 2% per trade
2. Use stop losses on every position
3. Diversify across commodity sectors
4. Size positions based on volatility
5. Have a written trading plan

Common Mistakes to Avoid:
• Ignoring seasonal patterns
• Fighting obvious trends
• Overleveraging positions
• Not using stop losses
• Emotional decision making
• Lack of position sizing discipline

Success in commodity trading requires patience, discipline, and respect for market forces beyond your control.' as content,
  1 as sort_order
FROM tutorial_categories 
WHERE name = 'Trading Strategies' 
LIMIT 1;