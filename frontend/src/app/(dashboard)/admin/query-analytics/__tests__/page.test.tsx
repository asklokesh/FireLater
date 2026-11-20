import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import QueryAnalyticsPage from '../page';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

import { api } from '@/lib/api';

const overview = {
  summary: { totalQueries: 42, totalErrors: 1, slowQueries: 3, slowThresholdMs: 100, uniqueFingerprints: 7 },
  mostFrequent: [
    { fingerprint: 'fp1', sample: 'select * from frequent_table', count: 30, errors: 0, avgMs: 2, maxMs: 5, avgRows: 4, slowCount: 0 },
  ],
  slowest: [
    { fingerprint: 'fp2', sample: 'select * from slow_table', count: 2, errors: 0, avgMs: 250, maxMs: 300, avgRows: 9, slowCount: 2 },
  ],
  recentSlow: [{ fingerprint: 'fp2', query: 'select * from slow_table', durationMs: 300, rowCount: 9, at: '2026-01-01T00:00:00Z' }],
  recommendations: [
    { table: 'issues', columns: ['status'], reason: 'Seq Scan on tenant_acme.issues', statement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_status ON tenant_acme.issues (status);', queries: 1 },
  ],
};

describe('QueryAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the overview endpoint and renders stats, queries and recommendations', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: overview });
    render(<QueryAnalyticsPage />);

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/v1/query-analytics', { params: { limit: 20 } });
    expect(screen.getByText('select * from slow_table', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText('select * from frequent_table')).toBeInTheDocument();
    expect(screen.getByText(/CREATE INDEX CONCURRENTLY/)).toBeInTheDocument();
    expect(screen.getByText(/300ms/)).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    render(<QueryAnalyticsPage />);
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
  });

  it('refreshes on button click', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: overview });
    render(<QueryAnalyticsPage />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});
