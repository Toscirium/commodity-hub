import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MARKET_TOOLS, COMMUNITY_TOOLS, ACTIVITY_TOOLS, PRO_TOOLS } from "./constants";

const MarketToolsList = () => {
  const { setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();

  const handleNavigate = (path: string) => {
    navigate(path);
    // Auto-close mobile sidebar after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const renderToolButton = (tool: any) => {
    const Icon = tool.icon;
    const isActive = pathname === tool.path || pathname.startsWith(tool.path + '/');
    return (
      <button
        key={tool.id}
        type="button"
        onClick={() => handleNavigate(tool.path)}
        className={`relative w-full flex items-center gap-2.5 rounded-md transition-colors duration-100 ${
          isMobile ? 'px-3 py-3 min-h-[44px] text-sm' : 'px-2.5 py-1.5 text-[13px]'
        } ${isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-primary" />
        )}
        <Icon className="w-4 h-4 shrink-0 opacity-80" />
        <span className="flex-1 min-w-0 truncate text-left font-medium">{tool.label}</span>
      </button>
    );
  };

  const sectionLabel = "px-3 pt-5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70";
  const sectionList = "space-y-0.5 px-2";

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className={sectionLabel}>Tools</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className={sectionList}>{MARKET_TOOLS.map(renderToolButton)}</div>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className={sectionLabel}>Pro</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className={sectionList}>{PRO_TOOLS.map(renderToolButton)}</div>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className={sectionLabel}>Insights</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className={sectionList}>{COMMUNITY_TOOLS.map(renderToolButton)}</div>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className={sectionLabel}>Status</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className={sectionList}>{ACTIVITY_TOOLS.map(renderToolButton)}</div>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
};

export default MarketToolsList;