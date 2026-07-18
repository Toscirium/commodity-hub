-- Add Market Analysis tutorial
INSERT INTO tutorials (category_id, title, description, difficulty_level, estimated_time_minutes, content, sort_order) 
SELECT 
  id as category_id,
  'Technical Analysis and Chart Patterns' as title,
  'Master technical analysis techniques specifically for commodity futures markets.' as description,
  'intermediate' as difficulty_level,
  35 as estimated_time_minutes,
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

Combining fundamental and technical analysis provides the most complete market picture.' as content,
  2 as sort_order
FROM tutorial_categories 
WHERE name = 'Market Analysis' 
LIMIT 1;