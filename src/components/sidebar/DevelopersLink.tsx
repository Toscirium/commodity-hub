import { Link, useLocation } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Code2 } from 'lucide-react';

/**
 * Sits in the sidebar footer beside feedback/theme — /developers (the REST
 * Data API reference and, as of 2026-09, the MCP server docs) had no nav
 * entry anywhere in the app before this; the only ways in were /exports'
 * "Full reference at /developers" line or already knowing the URL. Footer,
 * not the Tools/Pro/Insights groups above, because it isn't a market tool —
 * it's a reference page, same category as feedback.
 */
const DevelopersLink = () => {
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const isActive = pathname === '/developers';

  return (
    <SidebarGroup>
      <SidebarGroupContent className={isMobile ? 'px-4' : 'px-2'}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              onClick={() => isMobile && setOpenMobile(false)}
              className={`flex items-center gap-3 rounded-md transition-colors duration-150 ${
                isMobile ? 'px-4 py-3 min-h-[56px] touch-manipulation' : 'px-3 py-2'
              }`}
            >
              <Link to="/developers" aria-label="Developer docs: Data API and MCP server">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 text-muted-foreground">
                  <Code2 className="w-4 h-4" />
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">Developers</span>
                    {!isMobile && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Data API &amp; MCP server
                      </p>
                    )}
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default DevelopersLink;
