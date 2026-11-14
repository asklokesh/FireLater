import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockSearch = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock('../../../src/services/search.js', () => ({
  searchService: { search: (...a: unknown[]) => mockSearch(...a) },
}));
const mockRecord = vi.fn();
const mockHistoryList = vi.fn();
const mockClear = vi.fn();
const mockSuggest = vi.fn();
const mockTplList = vi.fn();
const mockTplCreate = vi.fn();
const mockTplDelete = vi.fn();
const mockAnalytics = vi.fn();

vi.mock('../../../src/services/search-history.js', () => ({
  searchHistoryService: {
    record: (...a: unknown[]) => mockRecord(...a),
    list: (...a: unknown[]) => mockHistoryList(...a),
    clear: (...a: unknown[]) => mockClear(...a),
    suggest: (...a: unknown[]) => mockSuggest(...a),
  },
}));
vi.mock('../../../src/services/saved-filter.js', () => ({
  savedFilterService: {
    list: (...a: unknown[]) => mockTplList(...a),
    create: (...a: unknown[]) => mockTplCreate(...a),
    delete: (...a: unknown[]) => mockTplDelete(...a),
  },
}));
vi.mock('../../../src/services/search-analytics.js', () => ({
  searchAnalyticsService: { getAnalytics: (...a: unknown[]) => mockAnalytics(...a) },
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (...a: unknown[]) => {
    mockRequirePermission(...a);
    return async () => undefined;
  },
}));

import { searchRoutes, searchBodySchema } from '../../../src/routes/search.js';

describe('POST /v1/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function build() {
    const app = Fastify();
    app.decorateRequest('tenant', null as never);
    app.addHook('onRequest', async (req) => {
      (req as unknown as { tenant: unknown }).tenant = { slug: 'acme' };
    });
    app.setErrorHandler((err, _req, reply) => {
      reply.status(400).send({ error: err.message });
    });
    await app.register(searchRoutes, { prefix: '/v1/search' });
    return app;
  }

  it('requires issues:read and scopes to the tenant', async () => {
    mockSearch.mockResolvedValue({ data: [], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } });
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'disk', facets: true } });
    expect(res.statusCode).toBe(200);
    expect(mockRequirePermission).toHaveBeenCalledWith('issues:read');
    expect(mockSearch).toHaveBeenCalledWith('acme', { q: 'disk', facets: true });
    expect(res.json().pagination.total).toBe(0);
  });

  it('rejects q over 200 chars and perPage over 100', async () => {
    const app = await build();
    expect((await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'x'.repeat(201) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/search', payload: { perPage: 101 } })).statusCode).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('validates filter fields, operators and sort', () => {
    expect(searchBodySchema.safeParse({ filter: { field: 'bogus', operator: 'eq', value: 'a' } }).success).toBe(false);
    expect(searchBodySchema.safeParse({ filter: { field: 'status', operator: 'like', value: 'a' } }).success).toBe(false);
    expect(searchBodySchema.safeParse({ sort: 'title' }).success).toBe(false);
    expect(
      searchBodySchema.safeParse({
        sort: 'relevance',
        filter: { op: 'or', conditions: [{ field: 'status', operator: 'in', value: ['new'] }] },
      }).success
    ).toBe(true);
  });
});

describe('search persistence routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function build() {
    const app = Fastify();
    app.decorateRequest('tenant', null as never);
    app.decorateRequest('user', null as never);
    app.addHook('onRequest', async (req) => {
      (req as unknown as { tenant: unknown }).tenant = { slug: 'acme' };
      (req as unknown as { user: unknown }).user = { userId: 'u1' };
    });
    app.setErrorHandler((err, _req, reply) => {
      reply.status(400).send({ error: err.message });
    });
    await app.register(searchRoutes, { prefix: '/v1/search' });
    return app;
  }

  it('records history after a successful search and skips empty queries', async () => {
    mockSearch.mockResolvedValue({ data: [], pagination: { page: 1, perPage: 20, total: 7, totalPages: 1 } });
    const app = await build();
    await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'disk' } });
    expect(mockRecord).toHaveBeenCalledWith('acme', 'u1', { query: 'disk', filter: undefined, resultCount: 7 });
    mockRecord.mockClear();
    await app.inject({ method: 'POST', url: '/v1/search', payload: { q: '  ' } });
    await app.inject({ method: 'POST', url: '/v1/search', payload: {} });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('does not fail the search when recording fails', async () => {
    mockSearch.mockResolvedValue({ data: [], pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } });
    mockRecord.mockRejectedValue(new Error('db down'));
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'disk' } });
    expect(res.statusCode).toBe(200);
  });

  it('serves history, suggestions and clear for the caller', async () => {
    mockHistoryList.mockResolvedValue([{ id: '1', query: 'a', resultCount: 2, createdAt: 'x' }]);
    mockSuggest.mockResolvedValue(['disk full']);
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/history' })).json().data).toHaveLength(1);
    expect(mockHistoryList).toHaveBeenCalledWith('acme', 'u1');
    expect((await app.inject({ method: 'GET', url: '/v1/search/suggest?q=di' })).json()).toEqual({ data: ['disk full'] });
    expect(mockSuggest).toHaveBeenCalledWith('acme', 'u1', 'di');
    expect((await app.inject({ method: 'DELETE', url: '/v1/search/history' })).statusCode).toBe(204);
    expect(mockClear).toHaveBeenCalledWith('acme', 'u1');
  });

  it('handles templates', async () => {
    mockTplList.mockResolvedValue([]);
    mockTplCreate.mockResolvedValue({ id: 'i', name: 'n', query: null, filter: null, isShared: false, createdAt: 'x' });
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/templates' })).json()).toEqual({ data: [] });
    const created = await app.inject({ method: 'POST', url: '/v1/search/templates', payload: { name: 'n' } });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/v1/search/templates', payload: {} })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/search/templates', payload: { name: 'n', filter: { field: 'x' } } })).statusCode
    ).toBe(400);
    const id = '11111111-1111-4111-8111-111111111111';
    expect((await app.inject({ method: 'DELETE', url: `/v1/search/templates/${id}` })).statusCode).toBe(204);
    expect(mockTplDelete).toHaveBeenCalledWith('acme', 'u1', id);
  });

  it('requires reports:read for analytics and validates days', async () => {
    mockAnalytics.mockResolvedValue({ totalSearches: 0 });
    const app = await build();
    expect(mockRequirePermission).toHaveBeenCalledWith('reports:read');
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics' })).statusCode).toBe(200);
    expect(mockAnalytics).toHaveBeenCalledWith('acme', 30);
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics?days=0' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics?days=366' })).statusCode).toBe(400);
  });
});
