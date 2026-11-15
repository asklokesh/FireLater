import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import { search, getFacets } from '../../../src/services/search.js';
import { SEARCH_TSVECTOR_EXPR } from '../../../src/lib/search-query.js';

describe('search service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('uses the shared tsvector expression and orders by rank', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', rank: 0.5 }] });
    const r = await search('t', { q: 'disk', entity: 'issues', page: 2, perPage: 500 });
    expect(r.total).toBe(1);
    expect(r.results[0].rank).toBe(0.5);
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toContain(SEARCH_TSVECTOR_EXPR);
    expect(sql).toContain('@@ websearch_to_tsquery');
    expect(sql).toContain('ORDER BY rank DESC');
    expect(mockQuery.mock.calls[1][1]).toEqual(['disk', 100, 100]);
  });

  it('applies only filters when q is empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await search('t', {
      q: '',
      filters: { conditions: [{ field: 'status', op: 'eq', value: 'new' }] },
    });
    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).not.toContain('websearch_to_tsquery');
    expect(sql).toContain('status = $1');
    expect(mockQuery.mock.calls[1][1]).toEqual(['new', 20, 0]);
  });

  it('records non-empty queries to history without blocking the result', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await search('t', { q: 'disk', userId: 'u1' });
    await new Promise((r) => setTimeout(r, 0));
    const call = mockQuery.mock.calls[2];
    expect(call[0]).toContain('INSERT INTO tenant_test.search_history');
    expect(call[1]).toEqual(['u1', 'disk', 'issues', 2]);
  });

  it('does not record empty queries', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await search('t', { q: '  ', userId: 'u1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('still succeeds when the history write fails', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', rank: 1 }] });
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const r = await search('t', { q: 'disk', userId: 'u1' });
    await new Promise((res) => setTimeout(res, 0));
    expect(r.total).toBe(1);
  });

  it('rejects invalid filters', async () => {
    await expect(
      search('t', { filters: { conditions: [{ field: 'bad', op: 'eq', value: 1 }] } })
    ).rejects.toThrow();
  });

  it('computes facets with q and filters', async () => {
    mockQuery.mockResolvedValue({ rows: [{ value: 'new', count: '3' }] });
    const f = await getFacets('t', { q: 'disk' });
    expect(Object.keys(f)).toEqual(['status', 'priority', 'severity', 'assigned_group']);
    expect(f.status).toEqual([{ value: 'new', count: 3 }]);
    expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY status');
    expect(mockQuery.mock.calls[0][0]).toContain('@@ websearch_to_tsquery');
    expect(mockQuery.mock.calls[0][1]).toEqual(['disk']);
  });
});
