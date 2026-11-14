import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import SearchAnalyticsPage from '../page';
import { searchAnalyticsApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchAnalyticsApi: { get: vi.fn() },
}));

vi.mock('@/components/charts/search-volume-chart', () => ({
  SearchVolumeChart: ({ data }: any) => <div data-testid="chart">{data.length} points</div>,
}));

const sample = {
  totalSearches: 123,
  uniqueUsers: 17,
  topQueries: [{ query: 'vpn', count: 40 }],
  zeroResultQueries: [{ query: 'foobar', count: 5 }],
  volumeByDay: [{ date: '2026-01-01', count: 10 }],
};

describe('SearchAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (searchAnalyticsApi.get as any).mockResolvedValue(sample);
  });

  it('renders summary, tables and chart with default 30 days', async () => {
    render(<SearchAnalyticsPage />);
    expect(await screen.findByTestId('total-searches')).toHaveTextContent('123');
    expect(screen.getByTestId('unique-users')).toHaveTextContent('17');
    expect(screen.getByText('vpn')).toBeInTheDocument();
    expect(screen.getByText('foobar')).toBeInTheDocument();
    expect(screen.getByText(/content or synonym gaps/i)).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    expect(searchAnalyticsApi.get).toHaveBeenCalledWith(30);
  });

  it('re-fetches when the range changes', async () => {
    render(<SearchAnalyticsPage />);
    await screen.findByTestId('total-searches');
    await userEvent.selectOptions(screen.getByLabelText('Time range'), '7');
    await waitFor(() => expect(searchAnalyticsApi.get).toHaveBeenCalledWith(7));
  });

  it('shows empty state', async () => {
    (searchAnalyticsApi.get as any).mockResolvedValue({
      totalSearches: 0,
      uniqueUsers: 0,
      topQueries: [],
      zeroResultQueries: [],
      volumeByDay: [],
    });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText('No search data')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    (searchAnalyticsApi.get as any).mockRejectedValue(new Error('boom'));
    render(<SearchAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('shows permission message on 403', async () => {
    (searchAnalyticsApi.get as any).mockRejectedValue({ response: { status: 403 } });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/reports:read/);
  });
});
