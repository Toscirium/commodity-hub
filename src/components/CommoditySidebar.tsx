import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import CommodityGroupsList from "./sidebar/CommodityGroupsList";
import MarketToolsList from "./sidebar/MarketToolsList";
import ThemeSwitcher from "./sidebar/ThemeSwitcher";
import { CommodityCounts } from "./sidebar/types";

interface CommoditySidebarProps {
  activeGroup: string;
  onGroupSelect: (group: string) => void;
  commodityCounts: CommodityCounts;
}

const CommoditySidebar = React.memo(({ activeGroup, onGroupSelect, commodityCounts }: CommoditySidebarProps) => {
  const { state, openMobile } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Reset scroll position when sidebar opens
  React.useEffect(() => {
    if (openMobile && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [openMobile]);

  return (
    <Sidebar className="border-r border-border bg-background">
      <SidebarHeader className="border-b border-border bg-background">
        <div className={`flex items-center gap-2.5 ${isMobile ? 'px-4 py-4' : 'px-3 py-3'}`}>
          <div className="w-7 h-7 rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <h2 className="font-display text-[15px] font-semibold tracking-tight">Commodity Hub</h2>
              <p className="text-[11px] text-muted-foreground">Markets &amp; Analytics</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      
      <SidebarContent 
        ref={contentRef}
        className={`${isMobile ? 'bg-background' : ''} overflow-y-auto custom-scrollbar flex-1 min-h-0`}
        style={{ 
          maxHeight: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 120px)',
          scrollBehavior: 'smooth'
        }}
      >
        {/* Commodity Groups Section - Always at top */}
        <CommodityGroupsList 
          activeGroup={activeGroup}
          onGroupSelect={onGroupSelect}
          commodityCounts={commodityCounts}
        />
        
        {/* Market Tools Section - Always in middle */}
        <MarketToolsList />
        
      </SidebarContent>

      {/* Theme Switcher - Always at bottom */}
      <SidebarFooter className={`${isMobile ? 'px-4 py-2 bg-background' : 'p-2'} border-t flex-shrink-0`}>
        <ThemeSwitcher />
      </SidebarFooter>
    </Sidebar>
  );
});

export default CommoditySidebar;