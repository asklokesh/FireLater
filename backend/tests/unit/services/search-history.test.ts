import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn((s: string) => `tenant_${s}`) },
}));

import { searchHistoryService, escapeLike } from '../../../src/services/search-history.js';

describe('searchHistoryService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('trims rows older than 90 days and inserts when no recent duplicate', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const inserted = await searchHistoryService.record('acme', 'u1', { query: ' vpn ', resultCount: 3 });
    expect(inserted).toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM tenant_acme.search_history');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', '90']);
    expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO');
    expect(mockQuery.mock.calls[2][1]).toEqual(['u1', 'vpn', null, 3, null]);
  });

  it('skips insert when same query recorded within 60 seconds', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const inserted = await searchHistoryService.record('acme', 'u1', { query: 'vpn', resultCount: 1 });
    expect(inserted).toBe(false);
    expect(mockQuery.mock.calls[1][1]).toEqual(['u1', 'vpn', '60']);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('scopes history queries to the calling user and caps limit', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await searchHistoryService.listRecent('acme', 'u1', 500);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 50]);
    await searchHistoryService.clear('acme', 'u2');
    expect(mockQuery.mock.calls[1][0]).toContain('WHERE user_id = $1');
    expect(mockQuery.mock.calls[1][1]).toEqual(['u2']);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('suggests own history first, de-duplicated, with escaped prefix and capped limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'a%b one' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'A%B one' }, { query: 'a%b two' }] });
    const res = await searchHistoryService.suggest('acme', 'u1', 'a%b', 99);
    expect(res).toEqual([
      { query: 'a%b one', source: 'history' },
      { query: 'a%b two', source: 'popular' },
    ]);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'a\\%b%', 10]);
    expect(mockQuery.mock.calls[1][1]).toEqual(['a\\%b%', 10]);
  });

  it('returns analytics shape', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_searches: 4, unique_queries: 2, zero_result_rate: 0.25, avg_took_ms: 12 }] })
      .mockResolvedValueOnce({ rows: [{ query: 'vpn', count: 3, avg_result_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ query: 'xyz', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', count: 4 }] });
    const res = await searchHistoryService.analytics('acme', 1000);
    expect(res.total_searches).toBe(4);
    expect(res.zero_result_rate).toBe(0.25);
    expect(res.popular).toHaveLength(1);
    expect(mockQuery.mock.calls[0][1]).toEqual(['90']);
  });
});
