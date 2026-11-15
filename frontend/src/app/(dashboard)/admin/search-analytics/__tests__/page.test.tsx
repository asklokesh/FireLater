import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import SearchAnalyticsPage from '../page';
import { searchApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchApi: { analytics: vi.fn() },
}));

vi.mock('@/components/charts/search-volume-chart', () => ({
  SearchVolumeChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="volume-chart">{data.length} points</div>
  ),
}));

const sample = {
  period_days: 30,
  total_searches: 120,
  unique_queries: 45,
  zero_result_rate: 0.125,
  avg_took_ms: 23.4,
  top_queries: [{ query: 'vpn', count: 10, avg_results: 7 }],
  zero_result_queries: [{ query: 'xyzzy', count: 3 }],
  daily: [
    { date: '2026-01-01', count: 5 },
    { date: '2026-01-02', count: 8 },
  ],
};

const analytics = searchApi.analytics as unknown as ReturnType<typeof vi.fn>;

describe('SearchAnalyticsPage', () => {
  beforeEach(() => {
    analytics.mockReset();
  });

  it('shows loading state', () => {
    analytics.mockReturnValue(new Promise(() => {}));
    render(<SearchAnalyticsPage />);
    expect(screen.getByText('Loading search analytics...')).toBeInTheDocument();
  });

  it('renders summary, tables and chart; requests 30 days by default', async () => {
    analytics.mockResolvedValue(sample);
    render(<SearchAnalyticsPage />);
    await waitFor(() => expect(screen.getByTestId('card-Total Searches')).toHaveTextContent('120'));
    expect(analytics).toHaveBeenCalledWith(30);
    expect(screen.getByTestId('card-Unique Queries')).toHaveTextContent('45');
    expect(screen.getByTestId('card-Zero-Result Rate')).toHaveTextContent('12.5%');
    expect(screen.getByTestId('card-Avg Latency')).toHaveTextContent('23 ms');
    const top = within(screen.getByRole('table', { name: 'Top queries' }));
    expect(top.getByText('vpn')).toBeInTheDocument();
    expect(top.getByText('10')).toBeInTheDocument();
    expect(top.getByText('7')).toBeInTheDocument();
    const zero = within(screen.getByRole('table', { name: 'Zero-result queries' }));
    expect(zero.getByText('xyzzy')).toBeInTheDocument();
    expect(screen.getByTestId('volume-chart')).toHaveTextContent('2 points');
  });

  it('refetches when the period changes', async () => {
    analytics.mockResolvedValue(sample);
    render(<SearchAnalyticsPage />);
    await waitFor(() => expect(screen.getByTestId('card-Total Searches')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '7' } });
    await waitFor(() => expect(analytics).toHaveBeenCalledWith(7));
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '90' } });
    await waitFor(() => expect(analytics).toHaveBeenCalledWith(90));
  });

  it('shows error state', async () => {
    analytics.mockRejectedValue(new Error('boom'));
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText('Unable to load analytics')).toBeInTheDocument();
  });

  it('shows empty state when there are no searches', async () => {
    analytics.mockResolvedValue({ ...sample, total_searches: 0, top_queries: [], daily: [] });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText('No searches yet')).toBeInTheDocument();
  });
});
