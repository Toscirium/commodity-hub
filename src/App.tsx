import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
// Two independent toast systems are in active use: Sonner (above, used
// directly by a handful of components) and this Radix-based one, which the
// `useToast`/`toast` import from '@/hooks/use-toast' feeds — 23 call sites
// across the app (auth errors, security warnings, Messages, Team Workspace,
// portfolios, delete-account, etc.). Its <Toaster/> was never mounted, so
// every one of those calls updated state nothing rendered — silently
// swallowed, on every platform, not just this deploy. Mounting both here
// rather than migrating 23 call sites to Sonner.
import { Toaster as RadixToaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { RealtimeDataProvider } from '@/contexts/RealtimeDataContext';
import { ProViewProvider } from '@/contexts/ProViewContext';
import { createOptimizedQueryClient } from '@/lib/queryClient';
import { useCapacitorAuthDeepLink } from '@/hooks/useCapacitorAuthDeepLink';
import { useDesktopAuthDeepLink } from '@/hooks/useDesktopAuthDeepLink';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import SEOHead from '@/components/SEOHead';
import AnalyticsBridge from '@/components/AnalyticsBridge';
import Dashboard from '@/pages/Dashboard';
import Auth from '@/pages/Auth';
import BillingStatusBanner from '@/components/BillingStatusBanner';
import Today from '@/pages/Today';
import MobileBottomNavigation from '@/components/mobile/MobileBottomNavigation';

// Lazy-load every non-critical route so initial Dashboard paint stays fast
// and route transitions only fetch what they need.
const NotFound = lazy(() => import('@/pages/NotFound'));
const ProModeEntry = lazy(() => import('@/pages/ProModeEntry'));
const Portfolio = lazy(() => import('@/pages/Portfolio'));
const MarketStatus = lazy(() => import('@/pages/MarketStatus'));
const APIComparison = lazy(() => import('@/pages/APIComparison'));
const EconomicCalendar = lazy(() => import('@/pages/EconomicCalendar'));
const ExpertInsights = lazy(() => import('@/pages/ExpertInsights'));
const LearningHub = lazy(() => import('@/pages/LearningHub'));
const MarketCorrelation = lazy(() => import('@/pages/MarketCorrelation'));
const MarketScreener = lazy(() => import('@/pages/MarketScreener'));
const MarketSentiment = lazy(() => import('@/pages/MarketSentiment'));
const NewsSettings = lazy(() => import('@/pages/NewsSettings'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const AuthConfirm = lazy(() => import('@/pages/AuthConfirm'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const Watchlists = lazy(() => import('@/pages/Watchlists'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const AccountSettings = lazy(() => import('@/pages/AccountSettings'));
const VersionInfo = lazy(() => import('@/pages/VersionInfo'));
const CatalogAudit = lazy(() => import('@/pages/CatalogAudit'));
const Legal = lazy(() => import('@/pages/Legal'));
const Licenses = lazy(() => import('@/pages/Licenses'));
const PositionCalculator = lazy(() => import('@/pages/PositionCalculator'));
const PriceAlerts = lazy(() => import('@/pages/PriceAlerts'));
const ForwardCurves = lazy(() => import('@/pages/ForwardCurves'));
const SpreadCalculator = lazy(() => import('@/pages/SpreadCalculator'));
const COTReports = lazy(() => import('@/pages/COTReports'));
const RollScanner = lazy(() => import('@/pages/RollScanner'));
const VolatilityCone = lazy(() => import('@/pages/VolatilityCone'));
const TermStructure = lazy(() => import('@/pages/TermStructure'));
const Copilot = lazy(() => import('@/pages/Copilot'));
const Seasonality = lazy(() => import('@/pages/Seasonality'));
const SpreadMonitor = lazy(() => import('@/pages/SpreadMonitor'));
const DailyBrief = lazy(() => import('@/pages/DailyBrief'));
const RegimeScanner = lazy(() => import('@/pages/RegimeScanner'));
const PortfolioAnalytics = lazy(() => import('@/pages/PortfolioAnalytics'));
const Backtest = lazy(() => import('@/pages/Backtest'));
const Fundamentals = lazy(() => import('@/pages/Fundamentals'));
const OptionsChain = lazy(() => import('@/pages/OptionsChain'));
const ProAnalyticsWorkspace = lazy(() => import('@/pages/ProAnalyticsWorkspace'));
const DataExports = lazy(() => import('@/pages/DataExports'));
const DeveloperDocs = lazy(() => import('@/pages/DeveloperDocs'));
const DataApiLanding = lazy(() => import('@/pages/DataApiLanding'));
const DataApiUsage = lazy(() => import('@/pages/DataApiUsage'));
const FeedbackInbox = lazy(() => import('@/pages/FeedbackInbox'));
const TeamWorkspace = lazy(() => import('@/pages/TeamWorkspace'));
const StressTest = lazy(() => import('@/pages/StressTest'));
const Messages = lazy(() => import('@/pages/Messages'));
const Trade = lazy(() => import('@/pages/Trade'));
const CommodityNewsFeed = lazy(() => import('@/pages/CommodityNewsFeed'));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const NativeAuthBridge = () => {
  useCapacitorAuthDeepLink();
  useDesktopAuthDeepLink();
  usePushNotifications();
  return null;
};

const App = () => {
  // Create QueryClient directly without useMemo to avoid React hooks issues
  const queryClient = createOptimizedQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NativeAuthBridge />
          <BrowserRouter>
          <TooltipProvider>
            <RealtimeDataProvider>
             <ProViewProvider>
              <AnalyticsBridge />
              <SEOHead />
              <BillingStatusBanner />
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/today" element={<Today />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                
                
                <Route path="/market-status" element={<MarketStatus />} />
                <Route path="/api-comparison" element={<APIComparison />} />
                <Route path="/economic-calendar" element={<EconomicCalendar />} />
                <Route path="/expert-insights" element={<ExpertInsights />} />
                <Route path="/learning-hub" element={<LearningHub />} />
                <Route path="/market-correlation" element={<MarketCorrelation />} />
                <Route path="/correlation" element={<MarketCorrelation />} />
                <Route path="/market-screener" element={<MarketScreener />} />
                <Route path="/screener" element={<MarketScreener />} />
                <Route path="/market-sentiment" element={<MarketSentiment />} />
                <Route path="/sentiment" element={<MarketSentiment />} />
                <Route path="/insights" element={<ExpertInsights />} />
                <Route path="/learning" element={<LearningHub />} />
                <Route path="/calendar" element={<EconomicCalendar />} />
                <Route path="/news-settings" element={<NewsSettings />} />
                <Route path="/market-news" element={<CommodityNewsFeed />} />
                
                <Route path="/portfolio" element={<Portfolio />} />
                
                <Route path="/watchlists" element={<Watchlists />} />
                <Route path="/delete-account" element={<DeleteAccount />} />
                <Route path="/account-settings" element={<AccountSettings />} />
                <Route path="/exports" element={<DataExports />} />
                <Route path="/developers" element={<DeveloperDocs />} />
                <Route path="/docs" element={<DeveloperDocs />} />
                <Route path="/data-api" element={<DataApiLanding />} />
                <Route path="/api-pricing" element={<DataApiLanding />} />
                <Route path="/team" element={<TeamWorkspace />} />
                <Route path="/account" element={<AccountSettings />} />
                <Route path="/settings" element={<AccountSettings />} />
                <Route path="/billing" element={<AccountSettings />} />
                <Route path="/version" element={<VersionInfo />} />
                <Route path="/about" element={<VersionInfo />} />
                <Route path="/legal" element={<Legal />} />
                <Route path="/imprint" element={<Legal />} />
                <Route path="/licenses" element={<Licenses />} />
                <Route path="/attributions" element={<Licenses />} />
                <Route path="/position-calculator" element={<PositionCalculator />} />
                <Route path="/alerts" element={<PriceAlerts />} />
                <Route path="/price-alerts" element={<PriceAlerts />} />
                <Route path="/forward-curves" element={<ForwardCurves />} />
                <Route path="/spreads" element={<SpreadCalculator />} />
                <Route path="/spread-calculator" element={<SpreadCalculator />} />
                <Route path="/cot" element={<COTReports />} />
                <Route path="/cot-reports" element={<COTReports />} />
                <Route path="/roll-scanner" element={<RollScanner />} />
                <Route path="/volatility-cone" element={<VolatilityCone />} />
                <Route path="/term-structure" element={<TermStructure />} />
                <Route path="/copilot" element={<Copilot />} />
                <Route path="/copilot/:threadId" element={<Copilot />} />
                <Route path="/seasonality" element={<Seasonality />} />
                <Route path="/spread-monitor" element={<SpreadMonitor />} />
                <Route path="/daily-brief" element={<DailyBrief />} />
                <Route path="/regime-scanner" element={<RegimeScanner />} />
                <Route path="/portfolio-analytics" element={<PortfolioAnalytics />} />
                <Route path="/stress-test" element={<StressTest />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/fundamentals" element={<Fundamentals />} />
                <Route path="/options" element={<OptionsChain />} />
                <Route path="/options-chain" element={<OptionsChain />} />
                <Route path="/pro-analytics" element={<ProAnalyticsWorkspace />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/trade" element={<Trade />} />
                <Route path="/admin/catalog-audit" element={<CatalogAudit />} />
                <Route path="/admin/data-api-usage" element={<DataApiUsage />} />
                <Route path="/admin/feedback" element={<FeedbackInbox />} />
                <Route path="/pro" element={<ProModeEntry />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <MobileBottomNavigation />
              </Suspense>
              <Toaster />
              <RadixToaster />
             </ProViewProvider>
            </RealtimeDataProvider>
          </TooltipProvider>
        </BrowserRouter>
        </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
