import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug}` },
}));

import { buildFilterClause, searchService } from '../../../src/services/search';

describe('buildFilterClause', () => {
  it('returns TRUE for no filter', () => {
    expect(buildFilterClause(undefined)).toEqual({ sql: 'TRUE', params: [] });
  });

  it('builds a parameterized condition', () => {
    const r = buildFilterClause({ field: 'status', op: 'eq', value: 'new' });
    expect(r.sql).toBe('i.status = $1');
    expect(r.params).toEqual(['new']);
  });

  it('combines AND/OR groups with correct param numbering and offset', () => {
    const r = buildFilterClause(
      {
        and: [
          { field: 'priority', op: 'in', value: ['high', 'critical'] },
          { or: [{ field: 'status', op: 'eq', value: 'new' }, { field: 'assigned_to', op: 'is_null' }] },
        ],
      },
      3
    );
    expect(r.sql).toBe('(i.priority::text = ANY($3::text[]) AND (i.status = $4 OR i.assigned_to IS NULL))');
    expect(r.params).toEqual([['high', 'critical'], 'new']);
  });

  it('rejects non-whitelisted fields (no SQL injection via column name)', () => {
    expect(() => buildFilterClause({ field: 'status; DROP TABLE issues', op: 'eq', value: 'x' })).toThrow(/Unsupported filter field/);
    expect(() => buildFilterClause({ field: 'constructor', op: 'eq', value: 'x' })).toThrow(/Unsupported filter field/);
  });

  it('rejects unknown operators', () => {
    expect(() => buildFilterClause({ field: 'status', op: 'like' as never, value: 'x' })).toThrow(/Unsupported operator/);
  });

  it('rejects ordering operators on uuid fields', () => {
    expect(() => buildFilterClause({ field: 'assigned_to', op: 'gt', value: 'x' })).toThrow(/not valid/);
  });

  it('rejects empty groups and mixed groups', () => {
    expect(() => buildFilterClause({ and: [] })).toThrow(/empty/);
    expect(() => buildFilterClause({ and: [], or: [] })).toThrow(/exactly one/);
  });

  it('rejects excessive nesting', () => {
    let node: unknown = { field: 'status', op: 'eq', value: 'a' };
    for (let i = 0; i < 6; i++) node = { and: [node] };
    expect(() => buildFilterClause(node as never)).toThrow(/too deep/);
  });
});

describe('searchService', () => {
  beforeEach(() => mockQuery.mockReset());

  it('ranks by ts_rank using websearch_to_tsquery and records history', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', title: 't', rank: 0.5, total_count: '1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await searchService.searchIssues('acme', 'u1', { q: 'vpn "login fail"' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("websearch_to_tsquery('english', $1)");
    expect(sql).toContain('ORDER BY rank DESC');
    expect(sql).toContain('tenant_acme.issues');
    expect(params[0]).toBe('vpn "login fail"');
    expect(r.total).toBe(1);
    expect(r.data[0]).not.toHaveProperty('total_count');
    expect(mockQuery.mock.calls[1][0]).toContain('search_history');
  });

  it('does not record history when there is no query text', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await searchService.searchIssues('acme', 'u1', { filter: { field: 'status', op: 'eq', value: 'new' } });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY i.created_at DESC');
  });

  it('escapes LIKE wildcards in suggestions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ query: '100%' }] });
    const s = await searchService.suggest('acme', 'u1', '100%_');
    expect(mockQuery.mock.calls[0][1][1]).toBe('100\\%\\_%');
    expect(s).toEqual(['100%']);
  });

  it('only deletes the caller own saved filter', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(searchService.deleteFilter('acme', 'u1', 'id1')).rejects.toThrow();
    expect(mockQuery.mock.calls[0][1]).toEqual(['id1', 'u1']);
  });
});
