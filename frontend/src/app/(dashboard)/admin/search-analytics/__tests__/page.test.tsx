import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SearchAnalyticsPage from '../page';
import { getSearchAnalytics } from '@/lib/search-analytics';

vi.mock('@/lib/search-analytics', () => ({ getSearchAnalytics: vi.fn() }));
vi.mock('@/components/charts/search-volume-chart', () => ({
  SearchVolumeChart: ({ data }: any) => <div data-testid="volume-chart">{data.length}</div>,
}));

const sample = {
  topQueries: [{ query: 'vpn', count: 5 }],
  zeroResultQueries: [{ query: 'xyzzy', count: 2 }],
  searchesPerDay: [{ day: '2024-01-01', count: 7 }],
  averageResultCount: 3.5,
};

describe('SearchAnalyticsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading then data', async () => {
    vi.mocked(getSearchAnalytics).mockResolvedValue(sample);
    render(<SearchAnalyticsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('vpn')).toBeInTheDocument();
    expect(screen.getByText('xyzzy')).toBeInTheDocument();
    expect(screen.getByTestId('avg-result-count')).toHaveTextContent('3.5');
    expect(screen.getByTestId('volume-chart')).toBeInTheDocument();
    expect(getSearchAnalytics).toHaveBeenCalledWith(30);
  });

  it('refetches when window changes', async () => {
    vi.mocked(getSearchAnalytics).mockResolvedValue(sample);
    render(<SearchAnalyticsPage />);
    await screen.findByText('vpn');
    fireEvent.change(screen.getByLabelText('Days window'), { target: { value: '7' } });
    await waitFor(() => expect(getSearchAnalytics).toHaveBeenCalledWith(7));
  });

  it('shows empty state', async () => {
    vi.mocked(getSearchAnalytics).mockResolvedValue({
      topQueries: [], zeroResultQueries: [], searchesPerDay: [], averageResultCount: 0,
    });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText(/No search activity/)).toBeInTheDocument();
  });

  it('shows message on 403', async () => {
    vi.mocked(getSearchAnalytics).mockRejectedValue({ response: { status: 403 } });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not have permission/);
  });

  it('shows message on other errors', async () => {
    vi.mocked(getSearchAnalytics).mockRejectedValue({ response: { status: 500, data: { message: 'Boom' } } });
    render(<SearchAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
  });
});
