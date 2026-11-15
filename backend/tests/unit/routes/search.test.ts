import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockSearch = vi.fn();
const mockFacets = vi.fn();
vi.mock('../../../src/services/search.js', () => ({
  search: (...a: unknown[]) => mockSearch(...a),
  getFacets: (...a: unknown[]) => mockFacets(...a),
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: () => async (request: any) => {
    if (!request.headers.authorization) {
      const err: any = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    }
    request.user = { tenantSlug: 'acme', userId: 'u1', roles: ['admin'] };
  },
}));

import searchRoutes from '../../../src/routes/search.js';

async function build() {
  const app = Fastify();
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error.name === 'ZodError' ? 400 : error.statusCode ?? 500;
    reply.status(status).send({ message: error.message });
  });
  await app.register(searchRoutes, { prefix: '/v1/search' });
  return app;
}

const auth = { authorization: 'Bearer x' };

describe('GET /v1/search', () => {
  beforeEach(() => {
    mockSearch.mockReset().mockResolvedValue({ results: [{ id: '1', rank: 1 }], total: 1 });
    mockFacets.mockReset().mockResolvedValue({ status: [] });
  });

  it('returns results, total and facets for valid input', async () => {
    const app = await build();
    const filters = encodeURIComponent(JSON.stringify({ conditions: [{ field: 'status', op: 'eq', value: 'new' }] }));
    const res = await app.inject({ method: 'GET', url: `/v1/search?q=disk&entity=issues&per_page=10&filters=${filters}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [{ id: '1', rank: 1 }], total: 1, facets: { status: [] } });
    expect(mockSearch).toHaveBeenCalledWith('acme', expect.objectContaining({ q: 'disk', perPage: 10 }));
  });

  it('rejects an invalid filter', async () => {
    const app = await build();
    const bad = encodeURIComponent(JSON.stringify({ conditions: [{ field: 'password', op: 'eq', value: 1 }] }));
    const res = await app.inject({ method: 'GET', url: `/v1/search?filters=${bad}`, headers: auth });
    expect(res.statusCode).toBe(400);
    const notJson = await app.inject({ method: 'GET', url: '/v1/search?filters=%7Bnope', headers: auth });
    expect(notJson.statusCode).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('rejects q longer than 200 chars', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: `/v1/search?q=${'a'.repeat(201)}`, headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated calls', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search?q=disk' });
    expect(res.statusCode).toBe(401);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
