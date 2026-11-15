import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SearchAnalyticsPage from '../page';
import { searchAnalyticsApi } from '@/lib/searchAnalytics';

vi.mock('@/lib/searchAnalytics', () => ({
  searchAnalyticsApi: { getAnalytics: vi.fn() },
}));

vi.mock('recharts', () => {
  const Stub = ({ children }: any) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const mock = vi.mocked(searchAnalyticsApi.getAnalytics);

const data = {
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T00:00:00Z',
  topSearches: [{ query: 'vpn issue', count: 5 }],
  zeroResultSearches: [{ query: 'xyzzy', count: 2 }],
  averageResultCount: 3.5,
  searchesPerDay: [{ date: '2024-01-01', count: 7 }],
};

describe('SearchAnalyticsPage', () => {
  beforeEach(() => {
    mock.mockReset();
  });

  it('shows data with links and avg', async () => {
    mock.mockResolvedValue(data);
    render(<SearchAnalyticsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    const link = await screen.findByText('vpn issue');
    expect(link.closest('a')).toHaveAttribute('href', '/search?q=vpn%20issue');
    expect(screen.getByText('xyzzy').closest('a')).toHaveAttribute('href', '/search?q=xyzzy');
    expect(screen.getByTestId('avg-result-count')).toHaveTextContent('3.5');
    expect(mock).toHaveBeenCalledWith(30);
  });

  it('refetches on range change', async () => {
    mock.mockResolvedValue(data);
    render(<SearchAnalyticsPage />);
    await screen.findByText('vpn issue');
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: '7' } });
    await waitFor(() => expect(mock).toHaveBeenCalledWith(7));
  });

  it('shows empty state', async () => {
    mock.mockResolvedValue({ ...data, topSearches: [], zeroResultSearches: [], searchesPerDay: [] });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText(/no search data/i)).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mock.mockRejectedValue({ response: { status: 500 } });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it('shows access denied on 403', async () => {
    mock.mockRejectedValue({ response: { status: 403 } });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
