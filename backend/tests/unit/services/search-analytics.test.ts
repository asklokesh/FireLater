import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), getOrSet: vi.fn() }));
vi.mock('../../../src/config/database.js', () => ({ pool: { query: h.query } }));
vi.mock('../../../src/services/tenant.js', () => ({ tenantService: { getSchemaName: (s: string) => `tenant_${s}` } }));
vi.mock('../../../src/utils/cache.js', () => ({ cacheService: { getOrSet: h.getOrSet } }));

import { searchAnalyticsService } from '../../../src/services/search-analytics.js';

beforeEach(() => {
  vi.clearAllMocks();
  h.getOrSet.mockImplementation((_k: string, f: () => Promise<unknown>) => f());
});

describe('searchAnalyticsService', () => {
  it('maps rows to response shape with bound params', async () => {
    h.query
      .mockResolvedValueOnce({ rows: [{ searches: '10', unique_users: '3', zero_rate: '0.2', p50: '12', p95: '80.5' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'vpn', count: '4', avg_result_count: '2.5' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'zzz', count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', count: '10' }] });
    const r = await searchAnalyticsService.get('acme', 7, 5);
    expect(r.totals).toEqual({ searches: 10, uniqueUsers: 3, zeroResultRate: 0.2, p50DurationMs: 12, p95DurationMs: 80.5 });
    expect(r.topQueries).toEqual([{ query: 'vpn', count: 4, avgResultCount: 2.5 }]);
    expect(r.zeroResultQueries).toEqual([{ query: 'zzz', count: 2 }]);
    expect(r.volumeByDay).toEqual([{ date: '2026-01-01', count: 10 }]);
    expect(h.query).toHaveBeenCalledTimes(4);
    for (const c of h.query.mock.calls) {
      expect(c[0]).toContain('tenant_acme.search_history');
      expect(c[0]).toContain('created_at >=');
      expect(c[1][0]).toBe(7);
    }
    expect(h.query.mock.calls[1][1]).toEqual([7, 5]);
  });

  it('handles empty data', async () => {
    h.query.mockResolvedValue({ rows: [] });
    const r = await searchAnalyticsService.get('acme');
    expect(r.totals).toEqual({ searches: 0, uniqueUsers: 0, zeroResultRate: 0, p50DurationMs: 0, p95DurationMs: 0 });
    expect(r.topQueries).toEqual([]);
    expect(r.volumeByDay).toEqual([]);
  });

  it('caches 60s per tenant, days and limit', async () => {
    h.query.mockResolvedValue({ rows: [] });
    await searchAnalyticsService.get('acme', 14, 20);
    expect(h.getOrSet).toHaveBeenCalledWith('acme:search-analytics:14:20', expect.any(Function), { ttl: 60 });
  });
});
