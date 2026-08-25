import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCommodityNewsFeed } from '@/hooks/useCommodityNewsFeed';
import { createTestQueryClient } from '@/test/utils';

const FAKE_ROWS = [
  {
    id: '1',
    title: 'Crude stocks fall',
    description: 'desc',
    url: 'https://example.com/1',
    source_name: 'OilPrice.com',
    category: 'energy',
    published_at: '2026-08-25T10:00:00.000Z',
  },
];

// vi.mock's factory below is hoisted above regular top-level code, so any
// mock fn it references has to be declared via vi.hoisted (not a plain
// const) — otherwise the factory runs before those consts are initialized
// and throws a TDZ ReferenceError.
const { limitMock, orderMock, selectMock, fromMock, onMock, subscribeMock, channelMock, removeChannelMock, insertHandlers } =
  vi.hoisted(() => {
    const insertHandlers: Array<() => void> = [];
    // Real data is set in beforeEach (FAKE_ROWS isn't reachable here — this
    // hoisted block runs before regular top-level const declarations too).
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderMock = vi.fn(() => ({ limit: limitMock }));
    const selectMock = vi.fn(() => ({ order: orderMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    const subscribeMock = vi.fn(() => ({}));
    const onMock = vi.fn((_event: string, _config: unknown, handler: () => void) => {
      insertHandlers.push(handler);
      return { subscribe: subscribeMock };
    });
    const channelMock = vi.fn(() => ({ on: onMock }));
    const removeChannelMock = vi.fn();
    return { limitMock, orderMock, selectMock, fromMock, onMock, subscribeMock, channelMock, removeChannelMock, insertHandlers };
  });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
}));

describe('useCommodityNewsFeed', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    orderMock.mockClear();
    limitMock.mockClear();
    limitMock.mockResolvedValue({ data: FAKE_ROWS, error: null });
    channelMock.mockClear();
    onMock.mockClear();
    subscribeMock.mockClear();
    removeChannelMock.mockClear();
    insertHandlers.length = 0;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = createTestQueryClient();
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

  it('reads commodity_news_feed ordered by published_at desc, limited, and returns the rows', async () => {
    const { result } = renderHook(() => useCommodityNewsFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromMock).toHaveBeenCalledWith('commodity_news_feed');
    expect(orderMock).toHaveBeenCalledWith('published_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(100);
    expect(result.current.data).toEqual(FAKE_ROWS);
  });

  it('subscribes to a realtime channel for INSERT events on mount', async () => {
    renderHook(() => useCommodityNewsFeed(), { wrapper });

    await waitFor(() => expect(channelMock).toHaveBeenCalledWith('commodity_news_feed_changes'));
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'INSERT', schema: 'public', table: 'commodity_news_feed' }),
      expect.any(Function),
    );
    expect(subscribeMock).toHaveBeenCalled();
  });

  it('removes the channel on unmount', async () => {
    const { unmount } = renderHook(() => useCommodityNewsFeed(), { wrapper });
    await waitFor(() => expect(channelMock).toHaveBeenCalled());

    unmount();

    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the realtime channel reports a new INSERT — the actual "live" behavior', async () => {
    const { result } = renderHook(() => useCommodityNewsFeed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(insertHandlers.length).toBe(1));

    limitMock.mockClear();
    insertHandlers[0](); // simulate Supabase delivering a postgres_changes INSERT event

    await waitFor(() => expect(limitMock).toHaveBeenCalled());
  });

  it('propagates a query error rather than throwing during render', async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useCommodityNewsFeed(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
