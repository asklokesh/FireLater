import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

const currentUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantSlug: 'acme',
  tenantId: 't',
  email: 'u@acme.test',
  roles: ['agent'] as string[],
};
const guardCalls: string[][] = [];

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn((...perms: string[]) => {
    guardCalls.push(perms);
    return async (request: { user: unknown }) => {
      request.user = currentUser;
    };
  }),
}));

vi.mock('../../../src/services/auth.js', () => ({
  authService: {
    getCachedPermissions: vi.fn(),
    getUserPermissions: vi.fn(),
    cacheUserPermissions: vi.fn(),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_acme') },
}));

vi.mock('../../../src/services/search.js', () => ({
  MAX_PER_PAGE: 100,
  searchService: {
    search: vi.fn().mockResolvedValue({ results: [], total: 0 }),
    suggest: vi.fn().mockResolvedValue({ history: [], popular: [], records: [] }),
    getHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(3),
    deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
    listTemplates: vi.fn().mockResolvedValue([]),
    getTemplate: vi.fn().mockResolvedValue({ id: 'x' }),
    createTemplate: vi.fn().mockResolvedValue({ id: 'new' }),
    updateTemplate: vi.fn().mockResolvedValue({ id: 'x' }),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    useTemplate: vi.fn().mockResolvedValue({ id: 'x', useCount: 1 }),
    getAnalytics: vi.fn().mockResolvedValue({ days: 30 }),
  },
}));

import searchRoutes from '../../../src/routes/search.js';
import { searchService } from '../../../src/services/search.js';
import { authService } from '../../../src/services/auth.js';

const TEMPLATE_ID = '33333333-3333-3333-3333-333333333333';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: 'Validation', issues: error.issues });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: error.message });
  });
  await app.register(searchRoutes, { prefix: '/v1/search' });
  await app.ready();
  return app;
}

describe('search routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentUser.roles = ['agent'];
    vi.mocked(authService.getCachedPermissions).mockResolvedValue(['issues:read', 'kb:read']);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('guards search with any entity read permission and analytics with report or admin read', () => {
    expect(guardCalls).toContainEqual(['issues:read', 'problems:read', 'changes:read', 'kb:read']);
    expect(guardCalls).toContainEqual(['reports:read', 'admin:read']);
  });

  it('GET / passes parsed query, types, filters and the permitted types to the service', async () => {
    const filters = { op: 'or', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    const res = await app.inject({
      method: 'GET',
      url: `/v1/search?q=vpn&types=issue,problem&page=2&per_page=10&sort=created&filters=${encodeURIComponent(JSON.stringify(filters))}`,
    });
    expect(res.statusCode).toBe(200);
    expect(searchService.search).toHaveBeenCalledWith(
      'acme',
      { userId: currentUser.userId, allowedTypes: ['issue', 'knowledge'] },
      { q: 'vpn', entityTypes: ['issue', 'problem'], filters, page: 2, perPage: 10, sort: 'created' }
    );
  });

  it('loads permissions from the database when not cached and caches them', async () => {
    vi.mocked(authService.getCachedPermissions).mockResolvedValue(null);
    vi.mocked(authService.getUserPermissions).mockResolvedValue(['changes:read']);
    await app.inject({ method: 'GET', url: '/v1/search?q=x' });
    expect(authService.getUserPermissions).toHaveBeenCalledWith(currentUser.userId, 'tenant_acme');
    expect(authService.cacheUserPermissions).toHaveBeenCalledWith(currentUser.userId, 'acme', ['changes:read']);
    expect(vi.mocked(searchService.search).mock.calls[0][1].allowedTypes).toEqual(['change']);
  });

  it('gives admins every entity type without a permission lookup', async () => {
    currentUser.roles = ['admin'];
    await app.inject({ method: 'GET', url: '/v1/search?q=x' });
    expect(authService.getCachedPermissions).not.toHaveBeenCalled();
    expect(vi.mocked(searchService.search).mock.calls[0][1].allowedTypes).toEqual(['issue', 'problem', 'change', 'knowledge']);
  });

  it('rejects malformed filter JSON and unknown types', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search?filters=%7Bnope' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search?types=widget' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search?per_page=500' })).statusCode).toBe(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('POST /query accepts a JSON filter tree', async () => {
    const body = {
      q: 'printer',
      entityTypes: ['issue'],
      filters: { op: 'and', conditions: [{ field: 'priority', operator: 'in', value: ['high'] }] },
      perPage: 5,
    };
    const res = await app.inject({ method: 'POST', url: '/v1/search/query', payload: body });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(searchService.search).mock.calls[0][2]).toEqual(body);
  });

  it('POST /query rejects invalid operators', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/search/query',
      payload: { filters: { op: 'and', conditions: [{ field: 'status', operator: 'regex', value: '.*' }] } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /fields lists fields only for permitted entity types', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search/fields' });
    const body = res.json();
    expect(body.entities.map((e: { type: string }) => e.type)).toEqual(['issue', 'knowledge']);
    expect(body.operators).toContain('in');
    expect(body.entities[0].fields).toContainEqual({ name: 'status', type: 'text' });
  });

  it('GET /suggest forwards the prefix and limit', async () => {
    await app.inject({ method: 'GET', url: '/v1/search/suggest?q=vp&limit=3' });
    expect(searchService.suggest).toHaveBeenCalledWith(
      'acme',
      { userId: currentUser.userId, allowedTypes: ['issue', 'knowledge'] },
      'vp',
      3
    );
  });

  it('history endpoints are scoped to the caller', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search/history?limit=5' })).json()).toEqual({ data: [] });
    expect(searchService.getHistory).toHaveBeenCalledWith('acme', currentUser.userId, 5);

    expect((await app.inject({ method: 'DELETE', url: '/v1/search/history' })).json()).toEqual({ deleted: 3 });
    expect(searchService.clearHistory).toHaveBeenCalledWith('acme', currentUser.userId);

    expect((await app.inject({ method: 'DELETE', url: `/v1/search/history/${TEMPLATE_ID}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/v1/search/history/not-a-uuid' })).statusCode).toBe(400);
  });

  it('template CRUD and use', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/search/templates',
      payload: { name: 'Critical VPN', queryText: 'vpn priority:critical', isShared: true },
    });
    expect(created.statusCode).toBe(201);
    expect(searchService.createTemplate).toHaveBeenCalledWith('acme', currentUser.userId, {
      name: 'Critical VPN',
      queryText: 'vpn priority:critical',
      isShared: true,
    });

    expect((await app.inject({ method: 'POST', url: '/v1/search/templates', payload: { name: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search/templates' })).json()).toEqual({ data: [] });
    expect((await app.inject({ method: 'GET', url: `/v1/search/templates/${TEMPLATE_ID}` })).statusCode).toBe(200);

    const patched = await app.inject({ method: 'PATCH', url: `/v1/search/templates/${TEMPLATE_ID}`, payload: { description: 'd' } });
    expect(patched.statusCode).toBe(200);
    expect(searchService.updateTemplate).toHaveBeenCalledWith('acme', currentUser.userId, TEMPLATE_ID, { description: 'd' });

    expect((await app.inject({ method: 'POST', url: `/v1/search/templates/${TEMPLATE_ID}/use` })).json()).toEqual({ id: 'x', useCount: 1 });
    expect((await app.inject({ method: 'DELETE', url: `/v1/search/templates/${TEMPLATE_ID}` })).statusCode).toBe(204);
  });

  it('GET /analytics validates days', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics?days=7' })).statusCode).toBe(200);
    expect(searchService.getAnalytics).toHaveBeenCalledWith('acme', 7);
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics?days=0' })).statusCode).toBe(400);
  });
});
