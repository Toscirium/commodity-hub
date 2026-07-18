// Market hours utility functions
export interface MarketStatus {
  isOpen: boolean;
  nextOpen?: Date;
  nextClose?: Date;
}

// Market hours for different exchanges (in EST/EDT)
const MARKET_HOURS = {
  // US Commodity Markets (CME, NYMEX, CBOT, ICE)
  COMMODITIES: {
    // Sunday 6 PM EST to Friday 5 PM EST with daily breaks
    weekDays: [0, 1, 2, 3, 4, 5], // Sunday to Friday
    openHour: 18, // 6 PM EST Sunday
    closeHour: 17, // 5 PM EST Friday
    dailyBreakStart: 17, // 5 PM EST
    dailyBreakEnd: 18, // 6 PM EST next day
  },
  // Energy markets (24/5 with brief maintenance)
  ENERGY: {
    weekDays: [0, 1, 2, 3, 4, 5],
    openHour: 18, // Sunday 6 PM EST
    closeHour: 17, // Friday 5 PM EST
    maintenanceStart: 17, // 5 PM EST daily
    maintenanceEnd: 18, // 6 PM EST daily
  },
  // Agricultural markets (more traditional hours)
  AGRICULTURE: {
    weekDays: [1, 2, 3, 4, 5], // Monday to Friday
    openHour: 8, // 8 AM EST
    closeHour: 14, // 2 PM EST
  }
};

// Categorize commodities by their trading patterns
const COMMODITY_CATEGORIES = {
  ENERGY: [
    'WTI Crude Oil', 'Brent Crude Oil', 'Natural Gas', 
    'Heating Oil', 'Gasoline RBOB'
  ],
  AGRICULTURE: [
    'Corn Futures', 'Wheat Futures', 'Soybean Futures',
    'Oat Futures', 'Rough Rice', 'Sugar', 'Cotton',
    'Coffee', 'Cocoa', 'Orange Juice'
  ],
  COMMODITIES: [
    'Gold Futures', 'Micro Gold Futures', 'Silver Futures',
    'Micro Silver Futures', 'Copper', 'Aluminum', 'Platinum',
    'Palladium', 'Live Cattle Futures', 'Feeder Cattle Futures',
    'Lean Hogs Futures', 'Class III Milk Futures', 'Lumber Futures'
  ]
};

function getCommodityCategory(commodityName: string): keyof typeof MARKET_HOURS {
  if (COMMODITY_CATEGORIES.ENERGY.includes(commodityName)) {
    return 'ENERGY';
  }
  if (COMMODITY_CATEGORIES.AGRICULTURE.includes(commodityName)) {
    return 'AGRICULTURE';
  }
  return 'COMMODITIES';
}

export function getMarketStatus(commodityName: string): MarketStatus {
  const now = new Date();
  const category = getCommodityCategory(commodityName);
  const marketHours = MARKET_HOURS[category];
  
  // Convert to EST/EDT (UTC-5 in winter, UTC-4 in summer)
  const estOffset = isDST(now) ? 4 : 5; // DST adjustment
  const estNow = new Date(now.getTime() - (estOffset * 60 * 60 * 1000));
  
  const currentDay = estNow.getDay(); // 0 = Sunday, 6 = Saturday
  const currentHour = estNow.getHours();
  const currentMinute = estNow.getMinutes();
  const currentTime = currentHour + currentMinute / 60;

  // Check if it's a trading day
  if (!marketHours.weekDays.includes(currentDay)) {
    return { isOpen: false };
  }

  // Handle different market types
  switch (category) {
    case 'AGRICULTURE':
      // Traditional market hours: Mon-Fri 8 AM - 2 PM EST
      return {
        isOpen: currentTime >= marketHours.openHour && currentTime < marketHours.closeHour
      };
    
    case 'ENERGY':
    case 'COMMODITIES':
      // Nearly 24/5 markets with brief maintenance windows
      if (currentDay === 0) {
        // Sunday: opens at 6 PM EST
        return { isOpen: currentTime >= 18 };
      } else if (currentDay === 5) {
        // Friday: closes at 5 PM EST
        return { isOpen: currentTime < 17 };
      } else {
        // Monday-Thursday: closed only during maintenance (5-6 PM EST)
        const isMaintenanceTime = currentTime >= 17 && currentTime < 18;
        return { isOpen: !isMaintenanceTime };
      }
    
    default:
      return { isOpen: false };
  }
}

// Helper function to determine if Daylight Saving Time is in effect
function isDST(date: Date): boolean {
  const year = date.getFullYear();
  
  // DST in US: Second Sunday in March to First Sunday in November
  const march = new Date(year, 2, 1); // March 1st
  const november = new Date(year, 10, 1); // November 1st
  
  // Find second Sunday in March
  const dstStart = new Date(year, 2, 8 + (7 - march.getDay()) % 7);
  
  // Find first Sunday in November  
  const dstEnd = new Date(year, 10, 1 + (7 - november.getDay()) % 7);
  
  return date >= dstStart && date < dstEnd;
}

// Simple market status text
export function getMarketStatusText(commodityName: string): string {
  const status = getMarketStatus(commodityName);
  return status.isOpen ? 'Market Open' : 'Market Closed';
}