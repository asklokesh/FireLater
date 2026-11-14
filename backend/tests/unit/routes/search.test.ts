import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockSearch = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock('../../../src/services/search.js', () => ({
  searchService: { search: (...a: unknown[]) => mockSearch(...a) },
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
