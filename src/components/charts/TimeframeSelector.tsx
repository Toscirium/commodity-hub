import React from 'react';
import { cn } from '@/lib/utils';
import type { TimeframeOption } from './chartUtils';

interface TimeframeSelectorProps {
  options: TimeframeOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Equal-width buttons that stretch to fill the container. */
  fill?: boolean;
  className?: string;
  buttonClassName?: string;
  /** Shape/position of the sliding highlight — callers match their own container's look (rounded pill vs. edge-to-edge bar). */
  indicatorClassName?: string;
}

/**
 * A segmented timeframe control with one highlight that slides/resizes to
 * the active option instead of each button independently flipping its own
 * background — the same interaction TradingView/Robinhood-style range
 * pickers use. Built on measured DOM rects rather than framer-motion (not a
 * project dependency, see SwipeableCard.tsx) so the highlight tracks
 * whatever width each button actually renders at, including the "fill"
 * layout where widths change with the viewport.
 */
const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  fill = false,
  className,
  buttonClassName,
  indicatorClassName,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);
  // The very first measurement must land in place with no slide-in from the
  // edge — only transitions triggered by a later selection/resize animate.
  const [animated, setAnimated] = React.useState(false);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    const button = buttonRefs.current.get(value);
    if (!container || !button) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setIndicator({ left: buttonRect.left - containerRect.left, width: buttonRect.width });
  }, [value]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, options]);

  // Buttons in the "fill" layout resize with the viewport (equal-width
  // flex-1 cells), so the highlight has to re-measure on more than just
  // selection changes.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = options.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const next = options[nextIndex];
    onChange(next.value);
    buttonRefs.current.get(next.value)?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-orientation="horizontal"
      className={cn('relative flex items-center', fill && 'w-full', className)}
    >
      {indicator && (
        <div
          aria-hidden
          className={cn(
            'absolute left-0 inset-y-1 rounded-md bg-primary shadow-sm pointer-events-none motion-reduce:transition-none',
            animated && 'transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            indicatorClassName,
          )}
          style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
        />
      )}
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(opt.value, el);
              else buttonRefs.current.delete(opt.value);
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              'relative z-10 font-semibold transition-[color,transform] duration-200 ease-out',
              'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.94]',
              fill && 'flex-1',
              selected ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              buttonClassName,
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default TimeframeSelector;
