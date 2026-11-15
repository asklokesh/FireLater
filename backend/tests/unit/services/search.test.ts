import { describe, it, expect, vi, beforeEach } from 'vitest';

const { clientQuery, release, connect } = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const release = vi.fn();
  const connect = vi.fn();
  return { clientQuery, release, connect };
});

vi.mock('../../../src/config/database.js', () => ({
  pool: { connect, query: vi.fn() },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import { searchService } from '../../../src/services/search.js';

describe('searchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query: clientQuery, release });
    clientQuery.mockResolvedValue({ rows: [] });
  });

  it('sets a 5s SET LOCAL statement_timeout inside a transaction', async () => {
    await searchService.search('acme', { q: 'vpn', types: ['issue'], page: 1, perPage: 10 });
    const sqls = clientQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toBe('SET LOCAL statement_timeout = 5000');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('binds q as a parameter and never interpolates it', async () => {
    await searchService.search('acme', { q: "vpn'; DROP TABLE x;--", types: ['issue'], page: 1, perPage: 10 });
    const facet = clientQuery.mock.calls.find((c) => String(c[0]).includes("'status' AS facet"))!;
    expect(facet[0]).toContain('websearch_to_tsquery(\'english\', $1)');
    expect(facet[0]).not.toContain('DROP TABLE');
    expect(facet[1]).toEqual(["vpn'; DROP TABLE x;--"]);
  });

  it('facet query groups by status and priority over the full match set (no LIMIT)', async () => {
    await searchService.search('acme', { q: 'vpn', types: ['issue'], page: 1, perPage: 10 });
    const facet = String(clientQuery.mock.calls.find((c) => String(c[0]).includes("'status' AS facet"))![0]);
    expect(facet).toContain('GROUP BY status');
    expect(facet).toContain('UNION ALL');
    expect(facet).not.toContain('LIMIT');
  });

  it('ANDs across facets and uses ANY (OR) within one facet', async () => {
    await searchService.search('acme', {
      q: 'vpn', types: ['issue'], status: ['new', 'closed'], priority: ['high'], page: 1, perPage: 10,
    });
    const facet = clientQuery.mock.calls.find((c) => String(c[0]).includes("'status' AS facet"))!;
    expect(facet[0]).toContain('status = ANY($2) AND priority = ANY($3)');
    expect(facet[1]).toEqual(['vpn', ['new', 'closed'], ['high']]);
  });

  it('merges by rank desc then created_at desc, with facets and pagination', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("'status' AS facet")) {
        return { rows: [{ facet: 'status', value: 'new', count: '2' }, { facet: 'priority', value: 'high', count: '2' }] };
      }
      if (sql.includes("'issue' AS type")) {
        return { rows: [
          { type: 'issue', id: '1', rank: '0.5', created_at: '2024-01-01' },
          { type: 'issue', id: '2', rank: '0.9', created_at: '2024-01-01' },
        ] };
      }
      if (sql.includes("'problem' AS type")) {
        return { rows: [{ type: 'problem', id: '3', rank: '0.5', created_at: '2024-02-01' }] };
      }
      return { rows: [] };
    });
    const res = await searchService.search('acme', { q: 'vpn', types: ['issue', 'problem'], page: 1, perPage: 10 });
    expect(res.data.map((d) => d.id)).toEqual(['2', '3', '1']);
    expect(res.facets.status).toEqual({ new: 4 });
    expect(res.facets.type).toEqual({ issue: 2, problem: 2 });
    expect(res.pagination.total).toBe(4);
    expect(typeof res.took_ms).toBe('number');
  });

  it('caps per page at 50', async () => {
    const res = await searchService.search('acme', { q: 'vpn', types: ['issue'], page: 1, perPage: 500 });
    expect(res.pagination.perPage).toBe(50);
  });

  it('field tokens exclude types that cannot satisfy them (kb)', async () => {
    await searchService.search('acme', { q: 'status:new', types: ['kb'], page: 1, perPage: 10 });
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('kb_articles'))).toBe(false);
  });

  it('maps a statement timeout to a 503 error and rolls back', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("'status' AS facet")) throw Object.assign(new Error('canceling'), { code: '57014' });
      return { rows: [] };
    });
    await expect(
      searchService.search('acme', { q: 'vpn', types: ['issue'], page: 1, perPage: 10 }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(clientQuery.mock.calls.map((c) => c[0])).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('advancedQuery compiles the filter with bound values', async () => {
    clientQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT COUNT') ? { rows: [{ count: '0' }] } : { rows: [] },
    );
    await searchService.advancedQuery('acme', {
      entityType: 'issues',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      page: 1,
      perPage: 100,
    });
    const count = clientQuery.mock.calls.find((c) => String(c[0]).startsWith('SELECT COUNT'))!;
    expect(count[0]).toContain('(i.status = $1)');
    expect(count[1]).toEqual(['new']);
    const list = clientQuery.mock.calls.find((c) => String(c[0]).includes('LEFT JOIN'))!;
    expect(list[1]).toEqual(['new', 50, 0]);
  });
});
