import React from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { MessageSquarePlus } from 'lucide-react';
import FeedbackDialog from '@/components/FeedbackDialog';

/**
 * Sits in the sidebar footer beside the theme switcher — persistent and on
 * every page, so someone who hits a wall can report it at the moment it
 * happens rather than having to go looking for a contact route (there wasn't
 * one at all before this).
 */
const FeedbackButton = () => {
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  const collapsed = state === 'collapsed';
  const [open, setOpen] = React.useState(false);

  const handleClick = () => {
    setOpen(true);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className={isMobile ? 'px-4' : 'px-2'}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleClick}
                aria-label="Send feedback"
                className={`flex items-center gap-3 rounded-md transition-colors duration-150 ${
                  isMobile ? 'px-4 py-3 min-h-[56px] touch-manipulation' : 'px-3 py-2'
                }`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 text-muted-foreground">
                  <MessageSquarePlus className="w-4 h-4" />
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">Send feedback</span>
                    {!isMobile && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tell me what's broken
                      </p>
                    )}
                  </div>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default FeedbackButton;
