import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const getOrSet = vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher());

vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: (...args: [string, () => Promise<unknown>]) => getOrSet(...args),
    invalidateTenant: vi.fn(),
  },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));
const warn = vi.fn();
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn(), debug: vi.fn() },
}));

import {
  searchIssues,
  listSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryEntry,
  getSuggestions,
} from '../../../src/services/search/search.js';

function setup(opts: { historyFails?: boolean } = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO')) {
      if (opts.historyFails) throw new Error('boom');
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT COUNT(*) FROM')) return { rows: [{ count: '3' }] };
    if (sql.includes('SELECT i.*')) return { rows: [{ id: '1', rank: 0.5 }] };
    if (sql.includes('fa.name')) return { rows: [{ value: 'app1', label: 'App One', count: '2' }] };
    if (sql.includes('fu.name')) return { rows: [{ value: 'u1', label: 'Alice', count: '1' }, { value: 'u2', label: 'Bob', count: '5' }] };
    if (sql.includes('GROUP BY i.status')) return { rows: [{ value: 'new', label: 'new', count: '3' }] };
    return { rows: [] };
  });
}

const base = { page: 1, perPage: 25 };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('searchIssues', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    getOrSet.mockClear();
    warn.mockClear();
  });

  it('orders by rank by default with text and uses tenant schema', async () => {
    setup();
    const r = await searchIssues('acme', 'u', { ...base, q: 'login' });
    const sql = mockQuery.mock.calls.map((c) => c[0] as string).find((s) => s.includes('SELECT i.*'))!;
    expect(sql).toContain('tenant_test.issues');
    expect(sql).toContain('ts_rank(i.search_vector');
    expect(sql).toContain('ORDER BY rank DESC');
    expect(r.data[0].rank).toBe(0.5);
    expect(r.pagination).toEqual({ page: 1, perPage: 25, total: 3, totalPages: 1 });
  });

  it('defaults to created_at without text', async () => {
    setup();
    await searchIssues('acme', 'u', { ...base, filter: { op: 'and', conditions: [] } });
    const sql = mockQuery.mock.calls.map((c) => c[0] as string).find((s) => s.includes('SELECT i.*'))!;
    expect(sql).toContain('ORDER BY i.created_at DESC');
  });

  it('combines parsed tokens and explicit filter with AND, bound as params', async () => {
    setup();
    await searchIssues('acme', 'u', {
      ...base,
      q: 'status:new login',
      filter: { op: 'and', conditions: [{ field: 'priority', operator: 'eq', value: 'high' }] },
    });
    const call = mockQuery.mock.calls.find((c) => (c[0] as string).includes('SELECT i.*'))!;
    expect(call[0]).toMatch(/i\.status = \$2\) AND \(i\.priority = \$3\)/);
    expect(call[1]).toEqual(['login', 'new', 'high', 25, 0]);
  });

  it('computes facets and maps labels', async () => {
    setup();
    const r = await searchIssues('acme', 'u', base);
    expect(r.facets.status).toEqual([{ value: 'new', label: 'new', count: 3 }]);
    expect(r.facets.application_id).toEqual([{ value: 'app1', label: 'App One', count: 2 }]);
    expect(r.facets.assigned_to.map((b) => b.label)).toEqual(['Bob', 'Alice']);
    expect(Object.keys(r.facets)).toEqual(['status', 'priority', 'severity', 'application_id', 'assigned_to']);
  });

  it('caches under the issues:search prefix', async () => {
    setup();
    await searchIssues('acme', 'u', base);
    expect(getOrSet.mock.calls[0][0].startsWith('acme:issues:search:')).toBe(true);
  });

  it('records history when text present and does not record when empty', async () => {
    setup();
    await searchIssues('acme', 'u', { ...base, q: 'login' });
    await flush();
    const ins = mockQuery.mock.calls.filter((c) => (c[0] as string).includes('INSERT INTO tenant_test.search_history'));
    expect(ins).toHaveLength(1);
    expect(ins[0][1][0]).toBe('u');
    mockQuery.mockClear();
    await searchIssues('acme', 'u', base);
    await flush();
    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('INSERT INTO'))).toBe(false);
  });

  it('swallows history insert failure', async () => {
    setup({ historyFails: true });
    const r = await searchIssues('acme', 'u', { ...base, q: 'login' });
    await flush();
    expect(r.pagination.total).toBe(3);
    expect(warn).toHaveBeenCalled();
  });
});

describe('search history', () => {
  beforeEach(() => mockQuery.mockReset());

  it('lists scoped to caller', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '1' }] });
    await listSearchHistory('acme', 'u1', 500);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_test.search_history');
    expect(sql).toContain('user_id = $1');
    expect(params).toEqual(['u1', 50]);
  });

  it('clears only caller rows', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });
    await clearSearchHistory('acme', 'u1');
    expect(mockQuery.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('deletes one row scoped to caller and 404s otherwise', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await deleteSearchHistoryEntry('acme', 'u1', 'h1');
    expect(mockQuery.mock.calls[0][0]).toContain('id = $1 AND user_id = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['h1', 'u1']);
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(deleteSearchHistoryEntry('acme', 'u1', 'h2')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('getSuggestions', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns empty for short q', async () => {
    expect(await getSuggestions('acme', 'u', 'a')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('merges history and popular, de-duplicated', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'login bug' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'Login Bug' }, { query: 'login error' }] });
    const r = await getSuggestions('acme', 'u', 'lo', 8);
    expect(r).toEqual([
      { text: 'login bug', source: 'history' },
      { text: 'login error', source: 'popular' },
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('lower(query) LIKE lower($2)');
    expect(mockQuery.mock.calls[1][0]).toContain('result_count > 0');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u', 'lo%', 8]);
  });
});
