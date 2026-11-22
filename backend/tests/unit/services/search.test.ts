import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: vi.fn(async () => ({ query: (...args: unknown[]) => mockClientQuery(...args), release: mockRelease })),
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  searchService,
  MAX_RESULT_WINDOW,
  HIGHLIGHT_START,
  HIGHLIGHT_END,
  POPULAR_MIN_DISTINCT_USERS,
  RANK_WEIGHTS,
} from '../../../src/services/search.js';
import { cacheService } from '../../../src/utils/cache.js';
import { logger } from '../../../src/utils/logger.js';
import { SEARCH_ENTITIES, SEARCH_ENTITY_TYPES, allowedEntityTypes } from '../../../src/lib/search/entities.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../src/utils/errors.js';

const tenant = 'test';
const userId = '11111111-1111-1111-1111-111111111111';
const allCaller = { userId, allowedTypes: [...SEARCH_ENTITY_TYPES] };

const facetRows = [
  { entity_type: null, status: null, priority: null, count: 3, g_entity: 1, g_status: 1, g_priority: 1 },
  { entity_type: 'issue', status: null, priority: null, count: 2, g_entity: 0, g_status: 1, g_priority: 1 },
  { entity_type: 'knowledge', status: null, priority: null, count: 1, g_entity: 0, g_status: 1, g_priority: 1 },
  { entity_type: null, status: 'new', priority: null, count: 2, g_entity: 1, g_status: 0, g_priority: 1 },
  { entity_type: null, status: 'published', priority: null, count: 1, g_entity: 1, g_status: 0, g_priority: 1 },
  { entity_type: null, status: null, priority: 'high', count: 2, g_entity: 1, g_status: 1, g_priority: 0 },
  { entity_type: null, status: null, priority: null, count: 1, g_entity: 1, g_status: 1, g_priority: 0 },
];

const pageRows = [
  {
    entity_type: 'issue',
    id: 'a1',
    number: 'ISS-00001',
    title: 'VPN drops',
    status: 'new',
    priority: 'high',
    assigned_to: null,
    created_at: new Date('2026-11-01T00:00:00Z'),
    updated_at: new Date('2026-11-02T00:00:00Z'),
    rank: '0.6',
    snippet: `${HIGHLIGHT_START}VPN${HIGHLIGHT_END} drops hourly`,
  },
];

function primeSearch() {
  mockClientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('GROUPING SETS')) return { rows: facetRows };
    if (sql.includes('ts_headline') || sql.includes('page AS')) return { rows: pageRows };
    return { rows: [] };
  });
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
}

function sqlCalls(): string[] {
  return mockClientQuery.mock.calls.map((c) => c[0] as string);
}

describe('search entities', () => {
  it('builds the same vector with and without an alias', () => {
    const v = SEARCH_ENTITIES.issue.vector();
    expect(v).toContain("setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')");
    expect(SEARCH_ENTITIES.issue.vector('t').replace(/t\./g, '')).toBe(v);
  });

  it('limits allowed types by permission', () => {
    expect(allowedEntityTypes(['issues:read', 'kb:read'], false)).toEqual(['issue', 'knowledge']);
    expect(allowedEntityTypes([], true)).toEqual(SEARCH_ENTITY_TYPES);
    expect(allowedEntityTypes([], false)).toEqual([]);
  });
});

describe('SearchService.search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  it('runs facets and page queries in a read-only transaction with a statement timeout', async () => {
    primeSearch();
    const res = await searchService.search(tenant, allCaller, { q: 'vpn' });

    const calls = sqlCalls();
    expect(calls[0]).toBe('BEGIN READ ONLY');
    expect(calls[1]).toMatch(/SET LOCAL statement_timeout = \d+/);
    expect(calls).toContain('COMMIT');
    expect(mockRelease).toHaveBeenCalled();

    expect(res.total).toBe(3);
    expect(res.facets.entityType).toEqual([
      { value: 'issue', count: 2 },
      { value: 'knowledge', count: 1 },
    ]);
    expect(res.facets.status).toEqual([
      { value: 'new', count: 2 },
      { value: 'published', count: 1 },
    ]);
    expect(res.facets.priority).toEqual([{ value: 'high', count: 2 }]);
    expect(res.results[0]).toMatchObject({
      entityType: 'issue',
      number: 'ISS-00001',
      rank: 0.6,
      url: '/issues/a1',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    expect(res.totalPages).toBe(1);
    expect(res.query.sort).toBe('relevance');
  });

  it('uses websearch_to_tsquery with the text bound as a parameter, never inlined', async () => {
    primeSearch();
    await searchService.search(tenant, allCaller, { q: "vpn'; DROP TABLE issues; --" });
    const facetCall = mockClientQuery.mock.calls.find((c) => (c[0] as string).includes('GROUPING SETS'))!;
    expect(facetCall[0]).toContain("websearch_to_tsquery('english', $1)");
    expect(facetCall[0]).not.toContain('DROP TABLE');
    expect(facetCall[1][0]).toBe("vpn'; DROP TABLE issues; --");
  });

  it('ranks with weights that keep a title match above repeated body matches', async () => {
    primeSearch();
    await searchService.search(tenant, allCaller, { q: 'database' });
    const pageCall = sqlCalls().find((c) => c.includes('ORDER BY rank DESC'))!;
    expect(pageCall).toContain("ts_rank_cd('{0.02, 0.05, 0.15, 1.0}'::float4[], ");
    const [d, c, b, a] = RANK_WEIGHTS.match(/[\d.]+(?=[,}])/g)!.map(Number);
    expect(a).toBeGreaterThan(5 * b);
    expect(d).toBeLessThan(c);
  });

  it('only queries the entity tables the caller may read', async () => {
    primeSearch();
    await searchService.search(tenant, { userId, allowedTypes: ['knowledge'] }, { q: 'vpn' });
    const facetSql = sqlCalls().find((s) => s.includes('GROUPING SETS'))!;
    expect(facetSql).toContain('tenant_test.kb_articles');
    expect(facetSql).not.toContain('tenant_test.issues');
  });

  it('warns and drops requested types without permission', async () => {
    primeSearch();
    const res = await searchService.search(tenant, { userId, allowedTypes: ['knowledge'] }, { q: 'vpn', entityTypes: ['issue', 'knowledge'] });
    expect(res.query.entityTypes).toEqual(['knowledge']);
    expect(res.query.warnings).toEqual(['No permission to search: issue']);
  });

  it('returns an empty response without querying when no type is allowed', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await searchService.search(tenant, { userId, allowedTypes: [] }, { q: 'vpn' });
    expect(res.total).toBe(0);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('honours type: in the query string', async () => {
    primeSearch();
    const res = await searchService.search(tenant, allCaller, { q: 'type:change vpn' });
    expect(res.query.entityTypes).toEqual(['change']);
    expect(res.query.text).toBe('vpn');
  });

  it('applies qualifiers and explicit filters as bound parameters', async () => {
    primeSearch();
    await searchService.search(tenant, { userId, allowedTypes: ['issue'] }, {
      q: 'status:new',
      filters: { op: 'or', conditions: [{ field: 'priority', operator: 'in', value: ['high', 'critical'] }] },
    });
    const facetCall = mockClientQuery.mock.calls.find((c) => (c[0] as string).includes('GROUPING SETS'))!;
    expect(facetCall[0]).toContain('t.status = $1::text');
    expect(facetCall[0]).toContain('t.priority = ANY($2::text[])');
    expect(facetCall[1]).toEqual(['new', ['high', 'critical']]);
  });

  it('defaults to sorting by updated when there is no text', async () => {
    primeSearch();
    const res = await searchService.search(tenant, allCaller, { q: 'status:new' });
    expect(res.query.sort).toBe('updated');
    const pageSql = sqlCalls().find((s) => s.includes('page AS'))!;
    expect(pageSql).toContain('ORDER BY updated_at DESC NULLS LAST, id');
    expect(pageSql).not.toContain('ts_headline');
  });

  it('matches record numbers exactly alongside full text', async () => {
    primeSearch();
    await searchService.search(tenant, { userId, allowedTypes: ['issue'] }, { q: 'iss-00002' });
    const facetCall = mockClientQuery.mock.calls.find((c) => (c[0] as string).includes('GROUPING SETS'))!;
    expect(facetCall[0]).toContain('t.issue_number = ANY($2::text[])');
    expect(facetCall[1][1]).toEqual(['ISS-00002']);
  });

  it('limits each branch to offset + perPage rows for the page query', async () => {
    primeSearch();
    await searchService.search(tenant, allCaller, { q: 'vpn', page: 3, perPage: 10 });
    const pageSql = sqlCalls().find((s) => s.includes('page AS'))!;
    expect(pageSql.match(/LIMIT 30\)/g)).toHaveLength(SEARCH_ENTITY_TYPES.length);
  });

  it('rejects paging past the result window', async () => {
    await expect(searchService.search(tenant, allCaller, { q: 'vpn', page: 11, perPage: 100 })).rejects.toThrow(
      `first ${MAX_RESULT_WINDOW}`
    );
  });

  it('clamps perPage to the maximum', async () => {
    primeSearch();
    const res = await searchService.search(tenant, allCaller, { q: 'vpn', perPage: 1000 });
    expect(res.perPage).toBe(100);
  });

  it('rejects unknown filter fields', async () => {
    await expect(
      searchService.search(tenant, allCaller, { filters: { op: 'and', conditions: [{ field: 'secret', operator: 'eq', value: 'x' }] } })
    ).rejects.toThrow(BadRequestError);
  });

  it('records history outside the cache so cache hits are still counted', async () => {
    const cached = {
      results: [],
      total: 4,
      page: 1,
      perPage: 20,
      totalPages: 1,
      facets: { entityType: [], status: [], priority: [] },
    };
    vi.mocked(cacheService.getOrSet).mockResolvedValueOnce(cached);
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await searchService.search(tenant, allCaller, { q: '  VPN  Reset ' });
    expect(res.total).toBe(4);
    expect(mockClientQuery).not.toHaveBeenCalled();
    const insert = mockQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO tenant_test.search_history'))!;
    expect(insert[1][0]).toBe(userId);
    expect(insert[1][1]).toBe('  VPN  Reset ');
    expect(insert[1][2]).toBe('vpn reset');
    expect(insert[1][5]).toBe(4);
  });

  it('records history for page 1 only', async () => {
    primeSearch();
    await searchService.search(tenant, allCaller, { q: 'vpn', page: 2 });
    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('search_history'))).toBe(false);
  });

  it('does not record history for an empty search', async () => {
    primeSearch();
    await searchService.search(tenant, allCaller, {});
    expect(mockQuery.mock.calls.some((c) => (c[0] as string).includes('search_history'))).toBe(false);
  });

  it('never fails the search when history recording fails', async () => {
    primeSearch();
    mockQuery.mockRejectedValue(new Error('db down'));
    const res = await searchService.search(tenant, allCaller, { q: 'vpn' });
    expect(res.total).toBe(3);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps statement timeouts to a friendly 400 and rolls back', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('GROUPING SETS')) throw Object.assign(new Error('canceling statement'), { code: '57014' });
      return { rows: [] };
    });
    await expect(searchService.search(tenant, allCaller, { q: 'vpn' })).rejects.toThrow('took too long');
    expect(sqlCalls()).toContain('ROLLBACK');
    expect(mockRelease).toHaveBeenCalled();
  });

  it('rethrows other database errors', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('GROUPING SETS')) throw new Error('boom');
      return { rows: [] };
    });
    await expect(searchService.search(tenant, allCaller, { q: 'vpn' })).rejects.toThrow('boom');
  });
});

describe('SearchService history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  it('returns the latest distinct searches for the user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'h1', query_text: 'vpn', filters: {}, entity_types: ['issue'], result_count: 3, created_at: new Date('2026-11-16T00:00:00Z') }],
    });
    const history = await searchService.getHistory(tenant, userId, 500);
    expect(history).toEqual([
      { id: 'h1', queryText: 'vpn', filters: {}, entityTypes: ['issue'], resultCount: 3, createdAt: '2026-11-16T00:00:00.000Z' },
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT ON');
    expect(mockQuery.mock.calls[0][1]).toEqual([userId, 100]);
  });

  it('clears only the caller history', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 7 });
    expect(await searchService.clearHistory(tenant, userId)).toBe(7);
    expect(mockQuery.mock.calls[0]).toEqual(['DELETE FROM tenant_test.search_history WHERE user_id = $1', [userId]]);
  });

  it('deletes all occurrences of a history entry for the caller', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ normalized_query: 'vpn', filters: '{}' }] }).mockResolvedValueOnce({ rowCount: 2 });
    await searchService.deleteHistoryEntry(tenant, userId, 'h1');
    expect(mockQuery.mock.calls[1][1]).toEqual([userId, 'vpn', '{}']);
  });

  it('throws NotFound for a history entry owned by someone else', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(searchService.deleteHistoryEntry(tenant, userId, 'h1')).rejects.toThrow(NotFoundError);
  });
});

describe('SearchService.suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  it('returns nothing for a blank prefix without querying', async () => {
    expect(await searchService.suggest(tenant, allCaller, '   ')).toEqual({ history: [], popular: [], records: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('combines history, popular queries and prefix record matches', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query_text: 'vpn reset' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'vpn' }] })
      .mockResolvedValueOnce({ rows: [{ entity_type: 'problem', id: 'p1', number: 'PRB-1', title: 'VPN' }] });
    const res = await searchService.suggest(tenant, { userId, allowedTypes: ['problem'] }, 'VP_%');
    expect(res).toEqual({
      history: ['vpn reset'],
      popular: ['vpn'],
      records: [{ entityType: 'problem', id: 'p1', number: 'PRB-1', title: 'VPN', url: '/problems/p1' }],
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([userId, 'vp\\_\\%%', 5]);
    // Popular suggestions need several distinct users so nobody's own searches leak.
    expect(mockQuery.mock.calls[1][0]).toContain('HAVING COUNT(DISTINCT user_id) >= $3');
    expect(mockQuery.mock.calls[1][1]).toEqual(['vp\\_\\%%', 5, POPULAR_MIN_DISTINCT_USERS]);
    expect(POPULAR_MIN_DISTINCT_USERS).toBeGreaterThanOrEqual(2);
    expect(mockQuery.mock.calls[2][0]).toContain("to_tsquery('english', $1)");
    expect(mockQuery.mock.calls[2][0]).toContain('tenant_test.problems');
    expect(mockQuery.mock.calls[2][1]).toEqual(['VP:*', 5]);
  });

  it('skips record lookup when the caller has no readable types', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await searchService.suggest(tenant, { userId, allowedTypes: [] }, 'vpn');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('SearchService templates', () => {
  const row = {
    id: 't1',
    user_id: userId,
    name: 'My VPN',
    description: null,
    query_text: 'vpn',
    filters: {},
    entity_types: ['issue'],
    is_shared: false,
    use_count: 0,
    last_used_at: null,
    created_at: new Date('2026-11-16T00:00:00Z'),
    updated_at: new Date('2026-11-16T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  it('creates a template and invalidates the search cache', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const t = await searchService.createTemplate(tenant, userId, { name: '  My VPN ', queryText: 'vpn' });
    expect(t).toMatchObject({ id: 't1', name: 'My VPN', isOwner: true, useCount: 0, lastUsedAt: null });
    expect(mockQuery.mock.calls[0][1][1]).toBe('My VPN');
    expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenant, 'search');
  });

  it('maps duplicate names to ConflictError', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(searchService.createTemplate(tenant, userId, { name: 'My VPN' })).rejects.toThrow(ConflictError);
  });

  it('validates the filter tree and query qualifiers before saving', async () => {
    await expect(
      searchService.createTemplate(tenant, userId, {
        name: 'bad',
        filters: { op: 'and', conditions: [{ field: 'nope', operator: 'eq', value: 'x' }] },
      })
    ).rejects.toThrow(BadRequestError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lists own and shared templates and flags ownership', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row, { ...row, id: 't2', user_id: 'other', is_shared: true }] });
    const list = await searchService.listTemplates(tenant, userId);
    expect(list.map((t) => [t.id, t.isOwner])).toEqual([
      ['t1', true],
      ['t2', false],
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('user_id = $1 OR is_shared = true');
  });

  it('only lets the owner update a template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(searchService.updateTemplate(tenant, userId, 't1', { name: 'x' })).rejects.toThrow(NotFoundError);
    expect(mockQuery.mock.calls[0][0]).toContain('WHERE id = $2 AND user_id = $3');
  });

  it('updates only provided columns', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...row, is_shared: true }] });
    const t = await searchService.updateTemplate(tenant, userId, 't1', { isShared: true });
    expect(t.isShared).toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain('SET is_shared = $1, updated_at = NOW()');
  });

  it('returns the template unchanged when no fields are given', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const t = await searchService.updateTemplate(tenant, userId, 't1', {});
    expect(t.id).toBe('t1');
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT * FROM tenant_test.saved_searches');
  });

  it('only lets the owner delete a template', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(searchService.deleteTemplate(tenant, userId, 't1')).rejects.toThrow(NotFoundError);
  });

  it('increments use count for own or shared templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...row, use_count: 1, last_used_at: new Date('2026-11-16T01:00:00Z') }] });
    const t = await searchService.useTemplate(tenant, userId, 't1');
    expect(t.useCount).toBe(1);
    expect(t.lastUsedAt).toBe('2026-11-16T01:00:00.000Z');
    expect(mockQuery.mock.calls[0][0]).toContain('use_count = use_count + 1');
  });

  it('throws NotFound for a template the caller cannot see', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(searchService.getTemplate(tenant, userId, 't9')).rejects.toThrow(NotFoundError);
  });
});

describe('SearchService.getAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  it('aggregates totals, top and zero-result queries, daily volume, type usage and templates', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT user_id)'))
        return { rows: [{ searches: 10, unique_users: 3, avg_duration_ms: 12, avg_results: 2.5, zero_results: 4 }] };
      if (sql.includes('result_count = 0')) return { rows: [{ query: 'foo', count: 4, last_searched_at: new Date('2026-11-15T00:00:00Z') }] };
      if (sql.includes('to_char')) return { rows: [{ day: '2026-11-15', count: 10 }] };
      if (sql.includes('unnest')) return { rows: [{ entity_type: 'issue', count: 9 }] };
      if (sql.includes('saved_searches')) return { rows: [{ id: 't1', name: 'Mine', use_count: 5 }] };
      return { rows: [{ query: 'vpn', count: 6, avg_results: 3, last_searched_at: new Date('2026-11-15T00:00:00Z') }] };
    });

    const a = await searchService.getAnalytics(tenant, 9999);
    expect(a.days).toBe(365);
    expect(a.totals).toEqual({
      searches: 10,
      uniqueUsers: 3,
      avgDurationMs: 12,
      avgResults: 2.5,
      zeroResultSearches: 4,
      zeroResultRate: 0.4,
    });
    expect(a.topQueries).toEqual([{ query: 'vpn', count: 6, avgResults: 3, lastSearchedAt: '2026-11-15T00:00:00.000Z' }]);
    expect(a.zeroResultQueries).toEqual([{ query: 'foo', count: 4, lastSearchedAt: '2026-11-15T00:00:00.000Z' }]);
    expect(a.searchesPerDay).toEqual([{ day: '2026-11-15', count: 10 }]);
    expect(a.entityTypeUsage).toEqual([{ entityType: 'issue', count: 9 }]);
    expect(a.topTemplates).toEqual([{ id: 't1', name: 'Mine', useCount: 5 }]);
    expect(vi.mocked(cacheService.getOrSet).mock.calls[0][0]).toBe('test:search:analytics:365');
  });

  it('reports a zero rate when there are no searches', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const a = await searchService.getAnalytics(tenant);
    expect(a.days).toBe(30);
    expect(a.totals.searches).toBe(0);
    expect(a.totals.zeroResultRate).toBe(0);
  });
});
