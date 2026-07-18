import { useState } from 'react';
import { SidebarProvider } from "@/components/ui/sidebar";
import CommoditySidebar from '@/components/CommoditySidebar';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';

import UserProfile from '@/components/UserProfile';

const APIComparison = () => {
  const [activeGroup, setActiveGroup] = useState("energy");
  const isMobile = useIsMobile();
  const { profile } = useAuth();

  const commodityCounts = {
    energy: 0,
    metals: 0,
    grains: 0,
    livestock: 0,
    dairy: 0,
    softs: 0,
    industrials: 0,
    other: 0
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <CommoditySidebar 
          activeGroup={activeGroup} 
          onGroupSelect={setActiveGroup}
          commodityCounts={commodityCounts}
        />
        
        
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
            <div className="container flex h-16 sm:h-20 items-center justify-between px-3 sm:px-4 md:px-6">
              <div className="flex items-center gap-4">
                <h1 className="text-xl sm:text-2xl font-bold">Data Sources</h1>
              </div>
              <UserProfile />
            </div>
          </header>
          
          {/* Main Content */}
          <main className="flex-1 container px-3 sm:px-4 md:px-6 py-6 space-y-8">
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="text-center py-8 space-y-3">
                <h2 className="text-2xl font-bold">Live Data Sources</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Energy commodities are sourced from <strong>OilPriceAPI</strong>. Non-energy commodities
                  (metals, grains, softs, lumber) are sourced from <strong>CommodityPriceAPI v2</strong>.
                  FX rates come from <strong>Frankfurter.app</strong> (ECB-published daily rates).
                </p>
                <p className="text-xs text-muted-foreground">
                  Quotes are cached for up to 1 hour to stay within provider rate limits.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default APIComparison;
