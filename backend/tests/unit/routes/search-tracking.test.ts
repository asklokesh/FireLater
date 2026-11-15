import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const svc = vi.hoisted(() => ({
  createTemplate: vi.fn(), listTemplates: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(),
  recentSearches: vi.fn(), clearHistory: vi.fn(), suggest: vi.fn(), getAnalytics: vi.fn(),
}));
vi.mock('../../../src/services/search-tracking.js', () => svc);
vi.mock('../../../src/services/search.js', () => ({ search: vi.fn(), getFacets: vi.fn() }));

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (perm: string) => async (request: any) => {
    if (!request.headers.authorization) {
      const err: any = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    }
    if (perm === 'admin:read' && request.headers['x-admin'] !== '1') {
      const err: any = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    request.user = { tenantSlug: 'acme', userId: 'u1' };
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
const id = '11111111-1111-4111-8111-111111111111';

describe('search tracking routes', () => {
  beforeEach(() => Object.values(svc).forEach((f) => f.mockReset().mockResolvedValue([])));

  it('lists templates', async () => {
    const res = await (await build()).inject({ method: 'GET', url: '/v1/search/templates', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(svc.listTemplates).toHaveBeenCalledWith('acme', 'u1');
  });

  it('creates a template and validates the body', async () => {
    const app = await build();
    svc.createTemplate.mockResolvedValue({ id });
    const ok = await app.inject({ method: 'POST', url: '/v1/search/templates', headers: auth, payload: { name: 'n' } });
    expect(ok.statusCode).toBe(201);
    const bad = await app.inject({ method: 'POST', url: '/v1/search/templates', headers: auth, payload: { name: '' } });
    expect(bad.statusCode).toBe(400);
  });

  it('updates and deletes by uuid', async () => {
    const app = await build();
    const put = await app.inject({ method: 'PUT', url: `/v1/search/templates/${id}`, headers: auth, payload: { name: 'x' } });
    expect(put.statusCode).toBe(200);
    const del = await app.inject({ method: 'DELETE', url: `/v1/search/templates/${id}`, headers: auth });
    expect(del.statusCode).toBe(204);
    const bad = await app.inject({ method: 'DELETE', url: '/v1/search/templates/nope', headers: auth });
    expect(bad.statusCode).toBe(400);
  });

  it('history get and delete', async () => {
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/history?limit=5', headers: auth })).statusCode).toBe(200);
    expect(svc.recentSearches).toHaveBeenCalledWith('acme', 'u1', 5);
    expect((await app.inject({ method: 'DELETE', url: '/v1/search/history', headers: auth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/search/history?limit=0', headers: auth })).statusCode).toBe(400);
  });

  it('suggestions', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search/suggestions?prefix=di', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(svc.suggest).toHaveBeenCalledWith('acme', 'u1', 'di', 10);
  });

  it('analytics requires admin permission', async () => {
    const app = await build();
    svc.getAnalytics.mockResolvedValue({ topQueries: [] });
    const denied = await app.inject({ method: 'GET', url: '/v1/search/analytics', headers: auth });
    expect(denied.statusCode).toBe(403);
    expect(svc.getAnalytics).not.toHaveBeenCalled();
    const ok = await app.inject({ method: 'GET', url: '/v1/search/analytics?days=7', headers: { ...auth, 'x-admin': '1' } });
    expect(ok.statusCode).toBe(200);
    expect(svc.getAnalytics).toHaveBeenCalledWith('acme', 7);
    const bad = await app.inject({ method: 'GET', url: '/v1/search/analytics?days=0', headers: { ...auth, 'x-admin': '1' } });
    expect(bad.statusCode).toBe(400);
  });
});
