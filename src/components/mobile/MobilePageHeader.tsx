import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { useNavigate } from 'react-router-dom';

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showSidebarToggle?: boolean;
  children?: React.ReactNode;
}

export const MobilePageHeader: React.FC<MobilePageHeaderProps> = ({
  title,
  subtitle,
  showSidebarToggle = false,
  children
}) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  // Safely try to use sidebar hook, but don't fail if not available
  let toggleSidebar: (() => void) | undefined;
  try {
    const sidebar = useSidebar();
    toggleSidebar = sidebar.toggleSidebar;
  } catch (error) {
    // Sidebar not available, that's fine
    toggleSidebar = undefined;
  }

  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="container mx-auto px-4 py-3">
        {/* Navigation Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="default"
              onClick={() => navigate('/')}
              className="h-11 px-3 touch-manipulation focus-ring"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              <span className="text-sm">Dashboard</span>
            </Button>
            {/* Optional sidebar toggle for mobile */}
            {showSidebarToggle && isMobile && toggleSidebar && (
              <Button
                variant="ghost"
                size="default"
                onClick={toggleSidebar}
                className="h-11 w-11 p-0 touch-manipulation focus-ring"
                aria-label="Toggle sidebar menu"
              >
                <Menu className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Right side content */}
          {children && (
            <div className="flex items-center gap-2">
              {children}
            </div>
          )}
        </div>

        {/* Title Row */}
        <div>
          <h1 className={`
            font-bold text-foreground
            ${isMobile ? 'text-2xl' : 'text-3xl'}
          `}>
            {title}
          </h1>
          {subtitle && (
            <p className={`
              text-muted-foreground mt-1
              ${isMobile ? 'text-sm' : 'text-base'}
            `}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};