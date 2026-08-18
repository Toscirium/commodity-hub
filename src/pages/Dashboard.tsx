import React, { useState, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import CommodityCard from '@/components/CommodityCard';
import VirtualizedCommodityList from '@/components/VirtualizedCommodityList';
import UserProfile from '@/components/UserProfile';
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import CommoditySidebar from '@/components/CommoditySidebar';
import { BarChart3, Menu, Loader, Zap, Coins, Wheat, Beef, Milk, Coffee, Factory } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeDataContext } from '@/contexts/RealtimeDataContext';
import { useAvailableCommodities, Commodity } from '@/hooks/useCommodityData';
import { Button } from '@/components/ui/button';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import PremiumUpsellCard from '@/components/PremiumUpsellCard';
import AlertNotificationBell from '@/components/AlertNotificationBell';
import GetTheAppButton from '@/components/GetTheAppButton';

const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeGroup, setActiveGroup] = useState("energy");
  const isMobile = useIsMobile();
  const auth = useAuth();
  const { isGuest, profile, loading: authLoading, isPremium } = (auth || { isGuest: true, profile: null, loading: false, isPremium: false }) as any;
  const { data: commodities, isLoading: commoditiesLoading, error: commoditiesError, refetch: refetchCommodities } = useAvailableCommodities();
  const [highlightCommodity, setHighlightCommodity] = useState<string | null>(null);

  // Handle ?group= URL param — jump straight to a commodity group from other pages
  useEffect(() => {
    const groupParam = searchParams.get('group');
    const validGroups = ['energy', 'metals', 'grains', 'livestock', 'dairy', 'softs', 'industrials'];
    if (groupParam && validGroups.includes(groupParam)) {
      setActiveGroup(groupParam);
      searchParams.delete('group');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  // Handle ?commodity= URL param — switch to correct group and highlight
  useEffect(() => {
    const commodityParam = searchParams.get('commodity');
    if (commodityParam && commodities && commodities.length > 0) {
      const found = commodities.find(c => c.name === commodityParam);
      if (found) {
        setActiveGroup(found.category);
        setHighlightCommodity(found.name);
        // Clear the param so it doesn't persist on refresh
        searchParams.delete('commodity');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, commodities]);

  // Show loading screen while auth is checking
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <Loader className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading application...</p>
          <p className="text-xs text-muted-foreground/60">
            If this takes too long, try refreshing the page
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardContent 
        activeGroup={activeGroup}
        setActiveGroup={setActiveGroup}
        isMobile={isMobile}
        profile={profile}
        commodities={commodities || []}
        loading={commoditiesLoading}
        error={commoditiesError?.message || null}
        onRetry={() => refetchCommodities()}
        highlightCommodity={highlightCommodity}
        isPremium={!!isPremium}
      />
    </SidebarProvider>
  );
};

const DashboardContent = ({ 
  activeGroup, 
  setActiveGroup,
  isMobile, 
  profile, 
  commodities, 
  loading, 
  error, 
  onRetry,
  highlightCommodity,
  isPremium
}: {
  activeGroup: string;
  setActiveGroup: (group: string) => void;
  isMobile: boolean;
  profile: any;
  commodities: Commodity[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  highlightCommodity?: string | null;
  isPremium: boolean;
}) => {
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { connected: realtimeConnected, delayStatus } = useRealtimeDataContext();

  // Edge-swipe handler for mobile sidebar. Only tracks drags that start
  // within a thin strip along the left edge of the screen (like a native
  // drawer), so panning gestures elsewhere on the page — e.g. dragging a
  // price chart left to scroll through history — aren't hijacked into
  // opening the sidebar mid-interaction.
  const EDGE_SWIPE_ZONE_PX = 24;
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const x = e.targetTouches[0].clientX;
    setTouchStart(x <= EDGE_SWIPE_ZONE_PX ? x : null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    // Swipe right to open sidebar
    if (diff < -100 && isMobile) {
      setOpenMobile(true);
    }
    setTouchStart(null);
  };

  // Get filtered commodities
  const filteredCommodities = React.useMemo(() => {
    return commodities.filter(commodity => commodity.category === activeGroup);
  }, [commodities, activeGroup]);

  // Get group info
  const getGroupInfo = React.useMemo(() => {
    const groups = {
      energy: { title: "Energy Commodities", icon: Zap },
      metals: { title: "Metal Commodities", icon: Coins },
      grains: { title: "Agricultural Commodities", icon: Wheat },
      livestock: { title: "Livestock Commodities", icon: Beef },
      dairy: { title: "Dairy Commodities", icon: Milk },
      softs: { title: "Soft Commodities", icon: Coffee },
      industrials: { title: "Industrial Commodities", icon: Factory },
    };
    return groups[activeGroup as keyof typeof groups] || groups.energy;
  }, [activeGroup]);

  const getCommodityCount = React.useCallback((category: string) => {
    return commodities.filter(commodity => commodity.category === category).length;
  }, [commodities]);

  return (
    <div 
      className="terminal-workspace min-h-screen flex w-full max-w-full overflow-x-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <CommoditySidebar 
        activeGroup={activeGroup} 
        onGroupSelect={setActiveGroup}
        commodityCounts={{
          energy: getCommodityCount('energy'),
          metals: getCommodityCount('metals'),
          grains: getCommodityCount('grains'),
          livestock: getCommodityCount('livestock'),
          dairy: getCommodityCount('dairy'),
          softs: getCommodityCount('softs'),
          industrials: getCommodityCount('industrials'),
        }}
      />
      
      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
        {/* Top bar */}
        <header
          className="app-top-bar sticky top-0 z-40 w-full border-b border-border bg-background/95"
        >
          <div className="flex h-14 items-center justify-between px-3 sm:px-5 gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (isMobile ? setOpenMobile(true) : toggleSidebar())}
              className="h-10 w-10 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="hidden sm:flex h-7 w-7 items-center justify-center border border-primary/45 bg-primary/10 text-primary">
                <getGroupInfo.icon className="w-3.5 h-3.5 shrink-0" />
              </div>
              <div className="min-w-0">
                <p className="terminal-label hidden sm:block mb-0.5">Commodity Monitor</p>
                <h1 className="font-mono text-[14px] sm:text-[15px] font-medium tracking-tight truncate leading-tight">
                  {getGroupInfo.title}
                </h1>
                <p className="text-[11px] text-muted-foreground number-display leading-tight">
                  {filteredCommodities.length} {filteredCommodities.length === 1 ? 'instrument' : 'instruments'} · {delayStatus.delayText}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <GetTheAppButton />
              <OfflineIndicator />
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  loading
                    ? 'bg-[hsl(var(--warning))]'
                    : error
                      ? 'bg-[hsl(var(--destructive))]'
                      : 'bg-[hsl(var(--success))]'
                }`}
                title={loading ? 'Loading' : error ? 'Error' : 'Live'}
              />
              <AlertNotificationBell />
              <UserProfile />
            </div>
          </div>
        </header>

        {/* Main Content — let the page (body) scroll instead of a nested
            overflow container. Nested scrolls fight native touch momentum
            on Android/iOS WebViews and feel laggy. */}
        <main className="flex-1 min-w-0 max-w-full overflow-x-hidden">
          <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-5 py-4 overflow-x-hidden">
            {/* Loading State */}
            {loading && (
              <div className="space-y-2 py-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[88px] rounded-lg border border-border bg-card animate-pulse" />
                ))}
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="rounded-lg border border-border bg-card p-6 text-center">
                <div className="w-9 h-9 mx-auto rounded-md bg-muted flex items-center justify-center mb-3">
                  <BarChart3 className="w-4 h-4 text-[hsl(var(--destructive))]" />
                </div>
                <p className="font-display text-base font-semibold">Connection issue</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
                <Button onClick={onRetry} size="sm" className="mt-4">Try again</Button>
              </div>
            )}

            {/* Premium Upsells — free users only */}
            {!loading && !error && !isPremium && activeGroup === 'energy' && (
              <PremiumUpsellCard variant="energy" />
            )}
            {!loading && !error && !isPremium && activeGroup === 'industrials' && (
              <PremiumUpsellCard variant="industrials" />
            )}
            {!loading && !error && !isPremium && activeGroup === 'metals' && (
              <PremiumUpsellCard variant="metals" />
            )}
            {!loading && !error && !isPremium && activeGroup === 'grains' && (
              <PremiumUpsellCard variant="grains" />
            )}
            {!loading && !error && !isPremium && activeGroup === 'softs' && (
              <PremiumUpsellCard variant="softs" />
            )}
            {!loading && !error && !isPremium && activeGroup === 'livestock' && (
              <PremiumUpsellCard variant="livestock" />
            )}

            {/* Commodities List */}
            {!loading && filteredCommodities.length > 0 && (
              <VirtualizedCommodityList 
                commodities={filteredCommodities} 
                loading={loading}
                highlightCommodity={highlightCommodity}
              />
            )}

            {/* Empty State — only shown when no premium upsell applies */}
            {!loading && !error && filteredCommodities.length === 0 && !(activeGroup === 'industrials' && !isPremium) && (
              <div className="text-center py-16">
                <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-xl font-semibold">No Commodities Available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  There are currently no commodities available in this category.
                </p>
                <Button onClick={onRetry} className="mt-4">
                  Refresh Data
                </Button>
              </div>
            )}

            {/* Footer: build/version link */}
            <div className="mt-8 pt-6 border-t border-border/50 text-center flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-2">
              <Link
                to="/version"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-2 min-h-[44px] flex items-center justify-center"
              >
                v{__APP_VERSION__} · Build info
              </Link>
              <span className="hidden sm:inline text-xs text-muted-foreground/60">·</span>
              <span className="text-xs text-muted-foreground/70 py-2">
                © 2026 Consilair OÜ. All rights reserved.
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground/60">·</span>
              <Link
                to="/legal"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline py-2 px-2 min-h-[44px] flex items-center justify-center"
              >
                Legal & Imprint
              </Link>
            </div>
            {/* Spacer to avoid Android gesture navigation overlap */}
            <div className="h-12 w-full shrink-0" />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
