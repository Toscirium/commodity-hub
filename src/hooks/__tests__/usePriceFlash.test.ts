import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceFlash } from '@/hooks/usePriceFlash';

describe('usePriceFlash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not flash on mount', () => {
    // A list of quotes mounting must not light up every row at once.
    const { result } = renderHook(() => usePriceFlash(100));
    expect(result.current).toBeNull();
  });

  it('flashes up when the value rises, then clears', () => {
    const { result, rerender } = renderHook(({ price }) => usePriceFlash(price), {
      initialProps: { price: 100 },
    });

    rerender({ price: 101 });
    expect(result.current).toBe('up');

    act(() => { vi.advanceTimersByTime(900); });
    expect(result.current).toBeNull();
  });

  it('flashes down when the value falls', () => {
    const { result, rerender } = renderHook(({ price }) => usePriceFlash(price), {
      initialProps: { price: 100 },
    });

    rerender({ price: 99 });
    expect(result.current).toBe('down');
  });

  it('does not flash when the value is unchanged', () => {
    const { result, rerender } = renderHook(({ price }) => usePriceFlash(price), {
      initialProps: { price: 100 },
    });

    rerender({ price: 100 });
    expect(result.current).toBeNull();
  });

  it('ignores transitions into and out of a null price', () => {
    // A quote arriving for the first time, or dropping out, is not a tick.
    const { result, rerender } = renderHook(
      ({ price }: { price: number | null }) => usePriceFlash(price),
      { initialProps: { price: null as number | null } },
    );

    rerender({ price: 100 });
    expect(result.current).toBeNull();

    rerender({ price: null });
    expect(result.current).toBeNull();
  });

  it('respects a custom duration', () => {
    const { result, rerender } = renderHook(
      ({ price }) => usePriceFlash(price, 300),
      { initialProps: { price: 100 } },
    );

    rerender({ price: 101 });
    expect(result.current).toBe('up');

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('up');

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBeNull();
  });
});
