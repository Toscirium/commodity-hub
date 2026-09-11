import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The single page frame for the analytics surface.
 *
 * Before this, 30 of 56 pages built their own container: ten different
 * max-widths, eight different <h1> treatments across three font families, and
 * eight different vertical paddings. Individually fine, collectively it read
 * as unfinished — which matters most to exactly the serious retail traders the
 * app targets.
 *
 * The visual language is the terminal one already used by SpreadCalculator:
 * mono uppercase eyebrow, tight tracking, dense rows, semantic colour. That's
 * deliberate — it reads like trading software rather than a generic SaaS
 * dashboard, which is the right register here, and it was already the most
 * distinctive thing in the app.
 *
 * Deliberately NOT applied to all 56 pages. It covers the ~10 a prospect
 * actually sees; the rest can adopt it when someone touches them.
 */

export interface PageShellProps {
  /** Short mono label above the title, e.g. "CURVE". Terminal-style eyebrow. */
  eyebrow?: string;
  title: string;
  /** One line under the title. Keep it factual — what the page shows. */
  description?: React.ReactNode;
  /** Rendered inline after the title: tier badges, data-status badges. */
  badges?: React.ReactNode;
  /** Right-hand side of the header row: selectors, refresh, actions. */
  actions?: React.ReactNode;
  /** Where the back button goes. Omit to hide it. */
  backTo?: string;
  backLabel?: string;
  /**
   * Content width. Default 5xl matches the analytics pages that were already
   * consistent with each other; 6xl for wide tables (Hedge Book).
   */
  width?: '3xl' | '5xl' | '6xl';
  children: React.ReactNode;
}

const WIDTHS: Record<NonNullable<PageShellProps['width']>, string> = {
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

const PageShell: React.FC<PageShellProps> = ({
  eyebrow,
  title,
  description,
  badges,
  actions,
  backTo = '/dashboard',
  backLabel = 'Dashboard',
  width = '5xl',
  children,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className={cn('container mx-auto px-4 py-6', WIDTHS[width])}>
        {backTo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(backTo)}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {backLabel}
          </Button>
        )}

        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              {eyebrow && (
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                  {eyebrow}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {/* font-display is IBM Plex Sans Condensed — the heading face
                    already established by the typography work and used by
                    Dashboard, Today and Auth. Using it here consolidates onto
                    the existing system rather than adding another treatment. */}
                <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
                {badges}
              </div>
              {description && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
};

export default PageShell;
