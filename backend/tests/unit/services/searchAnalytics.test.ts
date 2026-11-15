import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import { searchAnalyticsService } from '../../../src/services/searchAnalytics.js';

describe('searchAnalyticsService', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns aggregates for the range', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'vpn', count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'zzz', count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ avg: '3.5' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', count: 7 }] });
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-31T00:00:00Z');
    const r = await searchAnalyticsService.getAnalytics('acme', { from, to });
    expect(r.topSearches).toEqual([{ query: 'vpn', count: 5 }]);
    expect(r.zeroResultSearches).toEqual([{ query: 'zzz', count: 2 }]);
    expect(r.averageResultCount).toBe(3.5);
    expect(r.searchesPerDay).toEqual([{ date: '2026-01-01', count: 7 }]);
    expect(mockQuery.mock.calls[0][1]).toEqual([from.toISOString(), to.toISOString()]);
    expect(mockQuery.mock.calls[1][0]).toContain('result_count = 0');
  });

  it('defaults average to 0 with no data', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const r = await searchAnalyticsService.getAnalytics('acme', { from: new Date(0), to: new Date() });
    expect(r.averageResultCount).toBe(0);
  });

  it('rejects inverted ranges', async () => {
    await expect(
      searchAnalyticsService.getAnalytics('acme', { from: new Date(10), to: new Date(5) })
    ).rejects.toThrow(/before/);
  });
});
