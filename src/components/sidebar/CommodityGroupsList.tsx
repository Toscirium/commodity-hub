import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/useHaptics";
import { COMMODITY_GROUPS } from "./constants";
import { CommodityCounts } from "./types";

interface CommodityGroupsListProps {
  activeGroup: string;
  onGroupSelect: (group: string) => void;
  commodityCounts: CommodityCounts;
}

const CommodityGroupsList = ({ activeGroup, onGroupSelect, commodityCounts }: CommodityGroupsListProps) => {
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const { vibrateSelection } = useHaptics();
  const collapsed = state === "collapsed";

  const getGroupCount = (groupId: string) => {
    return commodityCounts[groupId as keyof CommodityCounts] || 0;
  };

  const handleGroupSelect = (groupId: string) => {
    // Haptic feedback for mobile selection
    if (isMobile) {
      vibrateSelection();
    }
    
    onGroupSelect(groupId);
    // Auto-close mobile sidebar after selection for better UX
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Markets
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-0.5 px-2">
          {COMMODITY_GROUPS.map((group) => {
            const Icon = group.icon;
            const isActive = activeGroup === group.id;
            const count = getGroupCount(group.id);
            
            return (
              <SidebarMenuItem key={group.id}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => handleGroupSelect(group.id)}
                  className={`relative flex items-center gap-2.5 rounded-md transition-colors duration-100 ${
                    isMobile ? 'px-3 py-3 min-h-[44px] text-sm' : 'px-2.5 py-1.5 text-[13px]'
                  } ${isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                  aria-label={`View ${group.label} commodities (${count} available)`}
                  aria-pressed={isActive}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-primary" />
                  )}
                  <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 min-w-0 truncate font-medium">{group.label}</span>
                      <span
                        className="text-[11px] tabular-nums text-muted-foreground/70"
                        aria-label={`${count} commodities in this category`}
                      >
                        {count}
                      </span>
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default CommodityGroupsList;