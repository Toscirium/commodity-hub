/**
 * Play Store compliance utilities and validations
 */

// Data safety and privacy compliance
export const PRIVACY_SETTINGS = {
  // Required disclosures for Play Store
  DATA_COLLECTION: {
    personalInfo: {
      name: true,
      email: true,
      userIds: true,
    },
    financialInfo: {
      userPaymentInfo: false, // Payments handled by Google Play Billing / RevenueCat
      purchaseHistory: true,
    },
    appActivity: {
      appInteractions: true,
      searchHistory: false,
      installedApps: false,
    },
    webBrowsing: {
      webBrowsingHistory: false,
    },
    location: {
      approximateLocation: false,
      preciseLocation: false,
    },
    deviceIdentifiers: {
      deviceId: true,
    },
    // App ships without ads — no advertising IDs collected or shared.
    advertisingData: {
      advertisingId: false,
      adMeasurement: false,
      adTargeting: false,
    },
  },
  
  // Data sharing
  DATA_SHARING: {
    analytics: true,
    advertising: false, // No AdMob, AdSense, or third-party ad networks
    appFunctionality: true,
    accountManagement: true,
  },

  // Security practices
  SECURITY_PRACTICES: {
    dataEncryptedInTransit: true,
    dataEncryptedAtRest: true,
    userCanRequestDataDeletion: true,
    dataDeletionUrl: 'https://app.commodity-hub.eu/delete-account',
    followsPlayFamiliesPolicy: true,
  }
};

// Content rating requirements
export const CONTENT_RATING = {
  targetAudience: 'Everyone', // Read-only price data, no trading, no UGC
  contentDescriptors: [
    'digital_purchases', // Premium subscription
  ],
  interactiveElements: [
    'shares_info', // Account email for auth
    'digital_purchases', // In-app subscription
  ]
};

// Required permissions and justifications
export const PERMISSIONS = {
  INTERNET: 'Required to fetch live commodity prices and market data',
};

// Validate app compliance before release
export const validatePlayStoreCompliance = (): {
  isCompliant: boolean;
  issues: string[];
  warnings: string[];
} => {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check required legal pages
  const hasPrivacyPolicy = window.location.pathname === '/privacy-policy' || 
    document.querySelector('a[href="/privacy-policy"]');
  const hasTermsOfService = window.location.pathname === '/terms-of-service' || 
    document.querySelector('a[href="/terms-of-service"]');

  if (!hasPrivacyPolicy) {
    issues.push('Privacy Policy page is required');
  }

  if (!hasTermsOfService) {
    issues.push('Terms of Service page is required');
  }

  // Check app icon requirements
  const iconExists = document.querySelector('link[rel="icon"]');
  if (!iconExists) {
    issues.push('App icon is required');
  }

  // Check manifest.json
  try {
    fetch('/manifest.json')
      .then(response => response.json())
      .then(manifest => {
        if (!manifest.name || manifest.name.length === 0) {
          issues.push('App name is required in manifest');
        }
        if (!manifest.description || manifest.description.length < 50) {
          warnings.push('App description should be at least 50 characters');  
        }
        if (!manifest.icons || manifest.icons.length === 0) {
          issues.push('App icons are required in manifest');
        }
      })
      .catch(() => {
        issues.push('Manifest.json is required');
      });
  } catch (error) {
    issues.push('Failed to validate manifest.json');
  }

  // Check for financial disclaimers
  const hasFinancialDisclaimer = document.querySelector('[data-testid="financial-disclaimer"]') ||
    document.body.textContent?.includes('investment risk') ||
    document.body.textContent?.includes('not financial advice');

  if (!hasFinancialDisclaimer) {
    warnings.push('Consider adding financial/investment disclaimers');
  }

  // Check for error boundaries
  const hasErrorBoundary = document.querySelector('[data-error-boundary]');
  if (!hasErrorBoundary) {
    warnings.push('Consider implementing error boundaries for better crash handling');
  }

  return {
    isCompliant: issues.length === 0,
    issues,
    warnings
  };
};

// Generate Play Store listing metadata
//
// Kept in sync with the actual app, not what it looked like at an earlier
// stage — this drifted badly before (described as a $4.99 one-time
// purchase with no ads/subs/IAP, when the real app is freemium with
// Premium/Pro subscriptions). A stale draft here is worse than none: if it
// ever gets pasted into Play Console, the declared pricing model wouldn't
// match actual billing behavior. See src/utils/tiers.ts (TIER_PRICING) for
// the source of truth on pricing if this needs updating again.
export const generatePlayStoreMetadata = () => {
  return {
    // Play Console's title field caps at 30 chars — the previous draft
    // (39 chars) would have been truncated or rejected outright.
    title: "Commodity Hub: Live Prices",
    // Play Console's short description caps at 80 chars — this is the
    // highest-ASO-weight field (shown in search results), so front-load
    // real search terms rather than marketing copy.
    shortDescription: "Live commodity prices, charts, portfolio tracking & AI market insights",
    pricing: {
      model: "freemium" as const,
      hasInAppPurchases: true, // Premium/Pro subscriptions, sold via Play Billing
      hasAds: false,
      hasSubscriptions: true,
      tiers: {
        free: { priceUSD: 0 },
        premium: { priceUSD: 6.99, billingPeriod: "monthly", annualDiscountAvailable: true },
        pro: { priceUSD: 19.99, billingPeriod: "monthly", annualDiscountAvailable: true },
      },
    },
    fullDescription: `
Commodity Hub is the easiest way to follow live commodity prices, charts, and market insights — free to start, with Premium and Pro tiers for active traders and desks.

🚀 FREE, NO CREDIT CARD REQUIRED:
• Live prices for 60+ commodities (energy, metals, grains, softs, livestock, industrials)
• Interactive price charts, price alerts, and a starter watchlist
• Manual portfolio tracking
• Market news, economic calendar, and market sentiment tracker

⭐ PREMIUM ($6.99/mo, annual plan available):
• More active price alerts and portfolios
• CSV export of positions and alerts
• Full standard commodity catalog
• Ad-free experience

💼 PRO ($19.99/mo, annual plan available):
• Everything in Premium, plus:
• Advanced analytics: spread monitor, seasonality, regime scanner
• Backtest sandbox with portfolio VaR & drawdown
• COT positioning reports and forward curves
• AI market copilot with a higher daily quota
• Team Workspace: share notes and approvals with your desk
• Programmatic Data API access to your portfolio, COT, and fundamentals data
• Priority data refresh

🔒 SECURITY & PRIVACY:
• Encrypted in transit; direct message bodies encrypted at rest
• No ads, no advertising ID, no third-party ad SDKs
• Account deletion available in-app

Whether you follow crude oil, gold, agricultural products, or specialty metals, Commodity Hub gives you the prices and insights you need at a glance.

IMPORTANT: Commodity Hub is a market data and information app. It does not provide investment advice and does not allow trade execution. Always consult a qualified financial advisor before making investment decisions.
    `,
    keywords: [
      "commodity prices",
      "price tracker",
      "market data",
      "price alerts",
      "watchlist",
      "portfolio tracker",
      "commodity analytics",
      "market analysis",
      "financial markets",
      "real-time data",
      "price charts",
      "COT report",
      "forward curves"
    ],
    category: "Finance",
    // Best-effort placeholder, not a submission — the real rating comes
    // from Play Console's IARC questionnaire. Worth re-running that
    // questionnaire specifically because of the messaging/community
    // feature added since this was last set — direct messaging between
    // users can push a rating up depending on how the questionnaire is
    // answered (moderation controls in place: block + report, see
    // src/pages/TeamWorkspace.tsx and the messages edge function).
    contentRating: "Teen",
    website: "https://app.commodity-hub.eu",
    email: "support@commodityhub.com",
    privacyPolicy: "https://app.commodity-hub.eu/privacy-policy"
  };
};

// Pre-launch checklist
export const PRE_LAUNCH_CHECKLIST = [
  "✅ Privacy Policy and Terms of Service implemented",
  "✅ App icons created for all required sizes", 
  "✅ Screenshots prepared (phone + tablet)",
  "✅ App description optimized with keywords",
  "✅ Content rating questionnaire completed",
  "✅ Target SDK version updated to latest",
  "✅ Permissions minimized and justified",
  "✅ App bundle optimized and tested",
  "✅ Crash reporting implemented",
  "✅ Analytics and performance monitoring setup",
  "✅ Security review completed",
  "✅ Beta testing with real users",
  "⚠️ Google Play Console account setup",
  "⚠️ App signing key generated and secured",
  "⚠️ Store listing assets prepared",
  "⚠️ Developer program policies reviewed"
];
