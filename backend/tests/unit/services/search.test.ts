import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import { searchService, parseSearchQuery } from '../../../src/services/search.js';

describe('parseSearchQuery', () => {
  it('keeps terms, phrases, OR and exclusion', () => {
    expect(parseSearchQuery('  disk   "out of space" OR memory -backup ')).toBe(
      'disk "out of space" OR memory -backup'
    );
  });
  it('drops unbalanced quotes', () => {
    expect(parseSearchQuery('foo "bar')).toBe('foo bar');
  });
  it('returns empty for undefined', () => {
    expect(parseSearchQuery(undefined)).toBe('');
  });
});

describe('SearchService.search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses tsvector @@ (not ILIKE), ranks, and returns numeric rank', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', rank: '0.5' }] });

    const res = await searchService.search('t', { q: 'disk -backup' });

    const countSql = mockQuery.mock.calls[0][0];
    const rowsSql = mockQuery.mock.calls[1][0];
    expect(countSql).toContain('i.search_vector @@ websearch_to_tsquery');
    expect(rowsSql).toContain('ts_rank(i.search_vector');
    expect(rowsSql).toContain('ORDER BY rank DESC');
    expect(rowsSql).not.toContain('ILIKE');
    expect(mockQuery.mock.calls[0][1]).toEqual(['disk -backup']);
    expect(res.data[0].rank).toBe(0.5);
    expect(res.pagination).toEqual({ page: 1, perPage: 20, total: 1, totalPages: 1 });
  });

  it('supports created_at sort and caps perPage at 100', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '250' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await searchService.search('t', { sort: 'created_at', order: 'asc', perPage: 500, page: 2 });

    expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY i.created_at ASC');
    expect(mockQuery.mock.calls[1][1]).toEqual([100, 100]);
    expect(res.pagination.totalPages).toBe(3);
  });

  it('combines filter parameters after the query parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchService.search('t', {
      q: 'x',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
    });

    expect(mockQuery.mock.calls[0][0]).toContain('i.status::text = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['x', 'new']);
  });

  it('computes facets in one bounded query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { field: 'status', value: 'new', count: '2' },
        { field: 'priority', value: 'high', count: '1' },
      ],
    });

    const res = await searchService.search('t', { q: 'x', facets: true });

    expect(mockQuery).toHaveBeenCalledTimes(3);
    const facetSql = mockQuery.mock.calls[2][0];
    expect(facetSql).toContain('LIMIT 50');
    expect(facetSql).toContain('search_vector @@');
    expect(res.facets?.status).toEqual([{ value: 'new', count: 2 }]);
    expect(res.facets?.priority).toEqual([{ value: 'high', count: 1 }]);
    expect(res.facets?.severity).toEqual([]);
    expect(Object.keys(res.facets!)).toEqual(['status', 'priority', 'severity', 'assigned_group', 'application_id']);
  });

  it('rejects malicious filter fields', async () => {
    await expect(
      searchService.search('t', { filter: { field: '1=1;--', operator: 'eq', value: 'a' } })
    ).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
