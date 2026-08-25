import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import CommodityNewsFeedCard from '@/components/CommodityNewsFeedCard';
import type { CommodityNewsItem } from '@/hooks/useCommodityNewsFeed';

const openExternalUrlMock = vi.fn();
vi.mock('@/utils/openExternalUrl', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
}));

const item: CommodityNewsItem = {
  id: '1',
  title: 'Crude oil stocks fall as refiners ramp up runs',
  description: 'Weekly EIA data showed a larger-than-expected draw.',
  url: 'https://example.com/articles/1',
  source_name: 'OilPrice.com',
  category: 'energy',
  published_at: new Date().toISOString(),
};

describe('CommodityNewsFeedCard', () => {
  it('renders the category label, source, title and description', () => {
    renderWithProviders(<CommodityNewsFeedCard item={item} />);
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('OilPrice.com')).toBeInTheDocument();
    expect(screen.getByText(item.title)).toBeInTheDocument();
    expect(screen.getByText(item.description)).toBeInTheDocument();
  });

  it('shows "Just now" for a very recent article', () => {
    renderWithProviders(<CommodityNewsFeedCard item={{ ...item, published_at: new Date().toISOString() }} />);
    expect(screen.getByText('Just now')).toBeInTheDocument();
  });

  it('shows an hours-ago label for an article published a few hours back', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    renderWithProviders(<CommodityNewsFeedCard item={{ ...item, published_at: threeHoursAgo }} />);
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('shows a days-ago label for an article published a couple days back', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    renderWithProviders(<CommodityNewsFeedCard item={{ ...item, published_at: twoDaysAgo }} />);
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('opens the article URL via openExternalUrl when clicked', async () => {
    const { user } = renderWithProviders(<CommodityNewsFeedCard item={item} />);
    await user.click(screen.getByText(item.title));
    expect(openExternalUrlMock).toHaveBeenCalledWith(item.url);
  });

  it('does not render a description block when the article has none', () => {
    renderWithProviders(<CommodityNewsFeedCard item={{ ...item, description: '' }} />);
    expect(screen.queryByText(item.description)).not.toBeInTheDocument();
  });
});
