import React from 'react';

/**
 * App Store assets and metadata for Play Store listing
 */

// Generate app icons for different densities
export const generateAppIcons = () => {
  const iconSizes = [
    { size: 48, density: 'mdpi' },
    { size: 72, density: 'hdpi' }, 
    { size: 96, density: 'xhdpi' },
    { size: 144, density: 'xxhdpi' },
    { size: 192, density: 'xxxhdpi' },
    { size: 512, density: 'play-store' }
  ];

  return iconSizes.map(({ size, density }) => ({
    src: `/icons/icon-${size}.webp`,
    sizes: `${size}x${size}`,
    type: 'image/webp',
    density
  }));
};

// Screenshots for Play Store listing  
export const PLAY_STORE_SCREENSHOTS = {
  phone: [
    {
      url: '/screenshots/phone-dashboard.png',
      description: 'Real-time commodity dashboard with price alerts and market data'
    },
    {
      url: '/screenshots/phone-charts.png', 
      description: 'Interactive price charts with technical analysis tools'
    },
    {
      url: '/screenshots/phone-portfolio.png',
      description: 'Portfolio tracking and performance analytics'
    },
    {
      url: '/screenshots/phone-news.png',
      description: 'Latest market news and expert insights'
    },
    {
      url: '/screenshots/phone-comparison.png',
      description: 'Side-by-side commodity price comparison'
    }
  ],
  tablet: [
    {
      url: '/screenshots/tablet-dashboard.png',
      description: 'Full-featured dashboard optimized for tablets'
    },
    {
      url: '/screenshots/tablet-analysis.png',
      description: 'Advanced market analysis and screening tools'
    }
  ]
};

// Feature graphic for Play Store
export const FEATURE_GRAPHIC = {
  url: '/store-assets/feature-graphic.png',
  dimensions: '1024x500',
  description: 'Live commodity prices and market insights across energy, metals, grains, softs, and livestock'
};

// App store description with key features
export const APP_STORE_DESCRIPTION = {
  short: "Live commodity prices, charts, and market insights — energy, metals, grains, softs & livestock.",

  full: `🚀 Stay on top of global commodity markets with live prices and professional charts.

Commodity Hub is the easiest way to track commodity prices in real time. From crude oil and natural gas to gold, copper, wheat, and coffee — get clean charts, market news, and expert insights in one place.

✨ KEY FEATURES

📊 REAL-TIME MARKET DATA
• Live prices for major commodity markets
• Professional-grade charts with technical indicators
• Price alerts and custom notifications
• Market depth and volume analysis

📈 ADVANCED ANALYTICS
• Technical analysis tools and indicators
• Market correlation analysis
• Historical price data
• Multi-currency pricing (USD, EUR, CNY, INR)

📱 WATCHLISTS & PORTFOLIO
• Track favorite commodities in custom watchlists
• Manual portfolio for personal price tracking
• Performance overview at a glance

🔍 MARKET INTELLIGENCE
• Breaking news and market analysis
• Economic calendar with key events
• Expert insights and research reports
• Supply and demand forecasts

⚡ HANDY TOOLS
• Market screening and filtering
• Price comparison across commodities
• Custom watchlists and price alerts

🎯 FOR EVERYONE
• Suitable from beginners to market professionals
• Educational content and commodity guides
• Clean, distraction-free interface

🔒 SECURITY & RELIABILITY
• Bank-level encryption and security
• Secure cloud infrastructure
• Data privacy compliance (GDPR)
• 99.9% uptime guarantee

💼 PREMIUM FEATURES
• Advanced charting tools
• Extended historical data
• Priority customer support
• 60+ specialty commodities unlocked

ℹ️ DISCLAIMER
Commodity Hub is a market data and information app. It does not provide investment advice and does not allow trade execution. Always consult a qualified financial advisor before making investment decisions.

Download Commodity Hub today and follow the world's commodity markets in real time!`,

  keywords: [
    "commodity prices",
    "price tracker",
    "market data",
    "investment tools",
    "portfolio tracker",
    "trading analytics",
    "market analysis",
    "financial markets",
    "real-time data",
    "trading charts",
    "crude oil",
    "gold trading",
    "agricultural commodities",
    "futures trading",
    "market intelligence"
  ]
};

// Play Store metadata
export const PLAY_STORE_METADATA = {
  title: "Commodity Hub - Trading Analytics",
  developer: "Commodity Hub Team",
  website: "https://commodity-hub.lovableproject.com",
  email: "support@commodityhub.com",
  privacyPolicy: "https://commodity-hub.lovable.app/privacy-policy",
  termsOfService: "https://commodity-hub.lovableproject.com/terms-of-service",
  category: "Finance",
  contentRating: "Teen", // 13+ due to financial content
  countries: ["US", "CA", "GB", "AU", "DE", "FR", "JP", "SG"],
  languages: ["en-US"],
  pricing: {
    free: true,
    containsAds: false,
    inAppPurchases: true,
    priceRange: "$4.99 - $19.99 per item"
  }
};

// App version and release notes
export const RELEASE_NOTES = {
  version: "1.0.0",
  buildNumber: 1,
  releaseDate: new Date().toISOString().split('T')[0],
  notes: `🎉 Welcome to Commodity Hub v1.0!

✨ What's New:
• Real-time commodity price tracking
• Interactive charts with technical analysis
• Portfolio management and tracking
• Market news and expert insights
• Price comparison tools
• Custom watchlists and alerts

🔧 Features:
• Professional-grade trading tools
• Advanced market analytics
• Risk management calculators
• Economic calendar integration
• Multi-device synchronization
• Dark/light mode support

🛡️ Security:
• Bank-level encryption
• Secure user authentication
• Privacy-compliant data handling
• Regular security updates

📱 Optimized for mobile and tablet devices with intuitive touch controls and responsive design.

Thank you for choosing Commodity Hub for your trading needs!`
};

// Component for displaying app store compliance
export const AppStoreCompliance: React.FC = () => {
  return (
    <div className="bg-card p-6 rounded-lg border" data-testid="financial-disclaimer">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        ⚠️ Important Investment Disclaimer
      </h3>
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          <strong>Trading commodities involves substantial risk of loss</strong> and may not be suitable for all investors. 
          The value of commodities can fluctuate significantly due to market conditions, supply and demand factors, 
          geopolitical events, and other economic factors.
        </p>
        <p>
          <strong>Past performance is not indicative of future results.</strong> All trading decisions should be made 
          based on your own research, risk tolerance, and financial situation.
        </p>
        <p>
          <strong>This application provides information and tools only</strong> and does not constitute investment advice, 
          financial advice, trading advice, or any other sort of advice. Always consult with qualified financial 
          advisors before making any investment decisions.
        </p>
        <p>
          <strong>Only invest what you can afford to lose.</strong> Never invest borrowed money or funds that you 
          cannot afford to lose entirely.
        </p>
      </div>
    </div>
  );
};