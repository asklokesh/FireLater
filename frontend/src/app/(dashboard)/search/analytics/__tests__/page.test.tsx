import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import SearchAnalyticsPage from '../page';
import { searchApi } from '@/lib/api';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, searchApi: { analytics: vi.fn() } };
});

const analytics = {
  days: 30,
  totals: { searches: 120, uniqueUsers: 8, avgDurationMs: 14, avgResults: 6.5, zeroResultSearches: 12, zeroResultRate: 0.1 },
  topQueries: [{ query: 'vpn', count: 40, avgResults: 9, lastSearchedAt: '' }],
  zeroResultQueries: [{ query: 'sharepoint migration', count: 5, lastSearchedAt: '' }],
  searchesPerDay: [{ day: '2026-11-15', count: 60 }],
  entityTypeUsage: [{ entityType: 'issue', count: 100 }],
  topTemplates: [{ id: 't1', name: 'My open issues', useCount: 17 }],
};

describe('SearchAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchApi.analytics).mockResolvedValue(analytics);
  });

  it('renders totals, query tables, usage and templates', async () => {
    render(<SearchAnalyticsPage />);
    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(searchApi.analytics).toHaveBeenCalledWith(30);
    expect(screen.getByText('10.0%')).toBeInTheDocument();
    expect(screen.getByText('14 ms')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'vpn' })).toHaveAttribute('href', '/search?q=vpn');
    expect(screen.getByRole('link', { name: 'sharepoint migration' })).toHaveAttribute('href', '/search?q=sharepoint%20migration');
    expect(screen.getByText('Issues')).toBeInTheDocument();
    expect(screen.getByText('My open issues')).toBeInTheDocument();
    expect(screen.getByTestId('searches-per-day-chart')).toBeInTheDocument();
  });

  it('changes the time range', async () => {
    const user = userEvent.setup();
    render(<SearchAnalyticsPage />);
    await screen.findByText('120');
    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(searchApi.analytics).toHaveBeenCalledWith(7));
  });

  it('shows a permission hint on error', async () => {
    vi.mocked(searchApi.analytics).mockRejectedValue(new Error('403'));
    render(<SearchAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/report or admin read access/i);
  });
});
