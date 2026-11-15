import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const svc = vi.hoisted(() => ({
  record: vi.fn(),
  listRecent: vi.fn(),
  clear: vi.fn(),
  suggest: vi.fn(),
  analytics: vi.fn(),
}));
vi.mock('../../../src/services/search-history.js', () => ({ searchHistoryService: svc }));

const state = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn(() => async (request: any) => {
    request.user = { userId: 'u1', tenantSlug: 'acme', roles: state.roles };
  }),
  requireRole: vi.fn((...roles: string[]) => async (request: any, reply: any) => {
    request.user = { userId: 'u1', tenantSlug: 'acme', roles: state.roles };
    if (!roles.some((r) => state.roles.includes(r))) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  }),
}));

import routes from '../../../src/routes/search-history.js';

async function build() {
  const app = Fastify();
  app.setErrorHandler((err: any, _req, reply) => {
    reply.status(err.name === 'ZodError' ? 400 : 500).send({ message: err.message });
  });
  await app.register(routes, { prefix: '/v1/search' });
  return app;
}

describe('search-history routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.roles = ['agent'];
  });

  it('POST /history returns 201 and passes caller identity', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/search/history', payload: { query: ' vpn ', resultCount: 2 } });
    expect(res.statusCode).toBe(201);
    expect(svc.record).toHaveBeenCalledWith('acme', 'u1', { query: 'vpn', resultCount: 2 });
  });

  it('POST /history validates body', async () => {
    const app = await build();
    for (const payload of [
      { query: '   ', resultCount: 1 },
      { query: 'x'.repeat(201), resultCount: 1 },
      { query: 'x', resultCount: -1 },
      { query: 'x', resultCount: 1.5 },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/v1/search/history', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('GET /history defaults limit 10 and rejects over 50', async () => {
    svc.listRecent.mockResolvedValue([]);
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/history' })).statusCode).toBe(200);
    expect(svc.listRecent).toHaveBeenCalledWith('acme', 'u1', 10);
    expect((await app.inject({ method: 'GET', url: '/v1/search/history?limit=51' })).statusCode).toBe(400);
  });

  it('DELETE /history clears only caller rows with 204', async () => {
    const app = await build();
    const res = await app.inject({ method: 'DELETE', url: '/v1/search/history' });
    expect(res.statusCode).toBe(204);
    expect(svc.clear).toHaveBeenCalledWith('acme', 'u1');
  });

  it('GET /suggestions validates prefix and limit', async () => {
    svc.suggest.mockResolvedValue([]);
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/suggestions?prefix=ab' })).statusCode).toBe(200);
    expect(svc.suggest).toHaveBeenCalledWith('acme', 'u1', 'ab', 8);
    expect((await app.inject({ method: 'GET', url: '/v1/search/suggestions' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/search/suggestions?prefix=a&limit=11' })).statusCode).toBe(400);
  });

  it('GET /analytics is admin only and validates days', async () => {
    svc.analytics.mockResolvedValue({ total_searches: 0 });
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics' })).statusCode).toBe(403);
    state.roles = ['admin'];
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics' })).statusCode).toBe(200);
    expect(svc.analytics).toHaveBeenCalledWith('acme', 30);
    expect((await app.inject({ method: 'GET', url: '/v1/search/analytics?days=91' })).statusCode).toBe(400);
  });
});
