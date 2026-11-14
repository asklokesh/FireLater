import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import { searchAnalyticsService } from '../../../src/services/search-analytics.js';

describe('searchAnalyticsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates in a single SQL query and maps the result', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        total_searches: '5', unique_users: '2',
        top_queries: [{ query: 'a', count: 3 }],
        zero_result_queries: [{ query: 'b', count: 1 }],
        volume_by_day: [{ date: '2026-01-01', count: 5 }],
      }],
    });
    const out = await searchAnalyticsService.getAnalytics('acme', 30);
    expect(out).toEqual({
      totalSearches: 5, uniqueUsers: 2,
      topQueries: [{ query: 'a', count: 3 }],
      zeroResultQueries: [{ query: 'b', count: 1 }],
      volumeByDay: [{ date: '2026-01-01', count: 5 }],
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('tenant_acme.search_history');
    expect(sql).toContain('GROUP BY');
    expect(mockQuery.mock.calls[0][1]).toEqual([30]);
  });

  it('caps the window at the 90 day retention and handles empty data', async () => {
    mockQuery.mockResolvedValue({ rows: [{}] });
    const out = await searchAnalyticsService.getAnalytics('acme', 365);
    expect(mockQuery.mock.calls[0][1]).toEqual([90]);
    expect(out.totalSearches).toBe(0);
    expect(out.topQueries).toEqual([]);
  });
});
