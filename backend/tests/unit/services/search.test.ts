import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: { getOrSet: vi.fn((_k: string, f: () => unknown) => f()), invalidateTenant: vi.fn() },
}));

import { parseSearchQuery, buildFilterClause, searchService } from '../../../src/services/search.js';
import { cacheService } from '../../../src/utils/cache.js';

describe('parseSearchQuery', () => {
  it('keeps phrases, OR and exclusion', () => {
    expect(parseSearchQuery('"disk full" OR network -planned')).toBe('"disk full" OR network -planned');
  });
  it('neutralizes unbalanced quotes and dangling OR', () => {
    expect(parseSearchQuery('OR server "oops OR')).toBe('server oops');
  });
  it('returns null when nothing searchable', () => {
    expect(parseSearchQuery('  - "" OR ')).toBeNull();
  });
});

describe('buildFilterClause', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  it('builds nested AND/OR with bind parameters', () => {
    const { sql, values } = buildFilterClause({
      op: 'and',
      conditions: [
        { field: 'status', op: 'in', value: ['new', 'assigned'] },
        { op: 'or', conditions: [
          { field: 'priority', op: 'eq', value: 'high' },
          { field: 'assigned_to', op: 'neq', value: uuid },
        ] },
        { field: 'created_at', op: 'gte', value: '2025-01-01' },
      ],
    }, 3);
    expect(sql).toBe('(i.status = ANY($3) AND (i.priority = $4 OR i.assigned_to <> $5) AND i.created_at >= $6)');
    expect(values).toEqual([['new', 'assigned'], 'high', uuid, '2025-01-01']);
  });
  it('never inlines values', () => {
    const { sql } = buildFilterClause({ op: 'and', conditions: [{ field: 'status', op: 'eq', value: "x'; DROP TABLE" }] });
    expect(sql).not.toContain('DROP');
  });
  it('rejects unknown fields and operators', () => {
    expect(() => buildFilterClause({ op: 'and', conditions: [{ field: 'password', op: 'eq', value: 'x' }] })).toThrow(/Unknown filter field/);
    expect(() => buildFilterClause({ op: 'and', conditions: [{ field: 'status', op: 'like' as never, value: 'x' }] })).toThrow(/operator/);
  });
});

describe('searchService.search', () => {
  beforeEach(() => mockQuery.mockReset());
  it('orders by rank, returns total and facets', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', rank: '0.5', total_count: '7' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ facet: 'status', value: 'new', count: 3 }] });
    const res = await searchService.search('acme', { page: 1, perPage: 10 }, { q: 'server' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY rank DESC');
    expect(sql).toContain("search_vector @@ websearch_to_tsquery('english', $1)");
    expect(res.total).toBe(7);
    expect(res.issues[0].rank).toBe(0.5);
    expect(res.facets.status).toEqual([{ value: 'new', count: 3 }]);
    expect(res.facets.priority).toEqual([]);
    expect(vi.mocked(cacheService.getOrSet).mock.calls[0][0]).toMatch(/^acme:issues:search:/);
  });
});
