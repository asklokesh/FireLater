import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const { search, advancedQuery, perms, user } = vi.hoisted(() => ({
  search: vi.fn(),
  advancedQuery: vi.fn(),
  perms: { value: [] as string[] },
  user: { roles: ['agent'] as string[] },
}));

vi.mock('../../../src/services/search.js', async (orig) => {
  const actual = await orig<typeof import('../../../src/services/search.js')>();
  return { ...actual, searchService: { search, advancedQuery } };
});
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = { userId: 'u1', tenantSlug: 'acme', roles: user.roles };
  }),
}));
vi.mock('../../../src/services/auth.js', () => ({
  authService: {
    getCachedPermissions: vi.fn(async () => perms.value),
    getUserPermissions: vi.fn(),
    cacheUserPermissions: vi.fn(),
  },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import searchRoutes from '../../../src/routes/search.js';
import { AppError } from '../../../src/utils/errors.js';

describe('search routes', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    user.roles = ['agent'];
    perms.value = ['issues:read', 'kb:read'];
    search.mockResolvedValue({ data: [], pagination: {}, facets: {}, took_ms: 1 });
    advancedQuery.mockResolvedValue({ data: [], pagination: {} });
    app = Fastify();
    app.setErrorHandler((err: any, _req, reply) => {
      if (err instanceof AppError || typeof err.statusCode === 'number') {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      if (err.name === 'ZodError') return reply.status(400).send({ message: 'invalid' });
      return reply.status(500).send({ message: err.message });
    });
    await app.register(searchRoutes, { prefix: '/v1/search' });
  });
  afterEach(async () => {
    await app.close();
  });

  it('requires q and caps its length at 200', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search' })).statusCode).toBe(400);
    const long = 'a'.repeat(201);
    expect((await app.inject({ method: 'GET', url: `/v1/search?q=${long}` })).statusCode).toBe(400);
  });

  it('rejects per_page over 50', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search?q=x&per_page=51' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search?q=x&per_page=50' })).statusCode).toBe(200);
  });

  it('gates types by permission', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search?q=x&types=issue,problem,kb&status=new,closed' });
    expect(res.statusCode).toBe(200);
    expect(search.mock.calls[0][1]).toMatchObject({ types: ['issue', 'kb'], status: ['new', 'closed'] });
  });

  it('returns 403 when the caller has none of the read permissions', async () => {
    perms.value = ['users:read'];
    expect((await app.inject({ method: 'GET', url: '/v1/search?q=x' })).statusCode).toBe(403);
  });

  it('admin sees all types', async () => {
    user.roles = ['admin'];
    perms.value = [];
    await app.inject({ method: 'GET', url: '/v1/search?q=x' });
    expect(search.mock.calls[0][1].types).toEqual(['issue', 'problem', 'request', 'kb']);
  });

  it('rejects an invalid type value', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search?q=x&types=bogus' })).statusCode).toBe(400);
  });

  it('POST /query rejects an invalid filter with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/search/query',
      payload: { entityType: 'issues', filter: { op: 'xor', conditions: [] } },
    });
    expect(res.statusCode).toBe(400);
    expect(advancedQuery).not.toHaveBeenCalled();
  });

  it('POST /query accepts a valid filter and checks permission', async () => {
    const payload = {
      entityType: 'issues',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
    };
    expect((await app.inject({ method: 'POST', url: '/v1/search/query', payload })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/search/query', payload: { ...payload, entityType: 'problems' } })).statusCode,
    ).toBe(403);
  });
});
