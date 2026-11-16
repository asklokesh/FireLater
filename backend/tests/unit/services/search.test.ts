import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const getOrSet = vi.hoisted(() => vi.fn());
vi.mock('../../../src/config/database.js', () => ({ pool: { query } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));
vi.mock('../../../src/utils/cache.js', () => ({ cacheService: { getOrSet } }));

import { searchService, MAX_PER_PAGE, MAX_FACET_VALUES } from '../../../src/services/search.js';

const ALL = ['issues:read', 'problems:read', 'requests:read', 'kb:read'];
const base = { tenantSlug: 'acme', userId: 'u1', permissions: ALL };

beforeEach(() => {
  vi.clearAllMocks();
  getOrSet.mockImplementation((_k: string, fn: () => Promise<unknown>) => fn());
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 2 }] };
    if (sql.includes('GROUP BY')) return { rows: [{ value: 'new', count: 3 }, { value: 'closed', count: 1 }] };
    return { rows: [{ id: 'a', title: 'T', snippet: '<b>x</b>', rank: '0.9' }] };
  });
});

describe('searchService.search', () => {
  it('orders by ts_rank_cd and returns hit shape and totals', async () => {
    const res = await searchService.search({ ...base, q: 'vpn', entities: ['issues'] });
    const listSql = query.mock.calls.find((c) => String(c[0]).includes('ts_headline'))![0] as string;
    expect(listSql).toContain('ORDER BY ts_rank_cd');
    expect(listSql).toContain('tenant_acme.issues');
    expect(res.results.issues!.results[0]).toEqual({ id: 'a', title: 'T', snippet: '<b>x</b>', rank: 0.9 });
    expect(res.results.issues!.total).toBe(2);
  });

  it('returns facets as [{value,count}] per entity and field', async () => {
    const res = await searchService.search({ ...base, q: 'vpn', entities: ['issues'], facets: ['status', 'priority'] });
    expect(res.results.issues!.facets.status).toEqual([{ value: 'new', count: 3 }, { value: 'closed', count: 1 }]);
    expect(Object.keys(res.results.issues!.facets)).toEqual(['status', 'priority']);
  });

  it('limits facet values to top 20', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 0 }] };
      if (sql.includes('GROUP BY')) {
        expect(sql).toContain(`LIMIT ${MAX_FACET_VALUES}`);
        return { rows: Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, count: 1 })) };
      }
      return { rows: [] };
    });
    const res = await searchService.search({ ...base, q: 'x', entities: ['issues'], facets: ['status'] });
    expect(res.results.issues!.facets.status).toHaveLength(20);
  });

  it('rejects invalid filter tree and non-whitelisted field with 400-type error', async () => {
    await expect(searchService.search({ ...base, q: 'x', entities: ['issues'], filter: { op: 'xor' } }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Invalid filter tree') });
    await expect(searchService.search({
      ...base, q: 'x', entities: ['issues'],
      filter: { op: 'and', conditions: [{ field: 'password', operator: 'eq', value: 'a' }] },
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("'password'") });
  });

  it('applies valid filter and field:value tokens as bound params', async () => {
    await searchService.search({
      ...base, q: 'status:new vpn', entities: ['issues'],
      filter: { op: 'and', conditions: [{ field: 'priority', operator: 'eq', value: 'high' }] },
    });
    const call = query.mock.calls.find((c) => String(c[0]).includes('ts_headline'))!;
    expect(call[1]).toEqual(['vpn', 'new', 'high']);
  });

  it('leaves out entities without permission', async () => {
    const res = await searchService.search({ ...base, permissions: ['kb:read'], q: 'x' });
    expect(Object.keys(res.results)).toEqual(['kb']);
  });

  it('caps perPage, q length and result window', async () => {
    const res = await searchService.search({ ...base, q: 'x', entities: ['issues'], perPage: 999 });
    expect(res.perPage).toBe(MAX_PER_PAGE);
    const sql = query.mock.calls.find((c) => String(c[0]).includes('ts_headline'))![0] as string;
    expect(sql).toContain(`LIMIT ${MAX_PER_PAGE}`);
    await expect(searchService.search({ ...base, q: 'a'.repeat(201) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(searchService.search({ ...base, q: 'x', page: 1000, perPage: 50 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('runs entity and facet queries concurrently', async () => {
    let inflight = 0; let max = 0;
    query.mockImplementation(async (sql: string) => {
      inflight++; max = Math.max(max, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return sql.includes('COUNT(*)::int AS total') ? { rows: [{ total: 0 }] } : { rows: [] };
    });
    await searchService.search({ ...base, q: 'x' });
    expect(max).toBeGreaterThan(4);
  });

  it('caches 30s keyed by tenant, permissions, query and filter', async () => {
    const filter = { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    await searchService.search({ ...base, q: 'vpn', entities: ['issues'], filter });
    const [key, , opts] = getOrSet.mock.calls[0];
    expect(opts).toEqual({ ttl: 30 });
    expect(key).toContain('acme');
    expect(key).toContain('issues:read');
    expect(key).toContain('vpn');
    expect(key).toContain('"status"');
  });
});
