import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const h = vi.hoisted(() => ({ get: vi.fn(), perm: vi.fn() }));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (...p: string[]) => {
    h.perm(...p);
    return async (req: { user: unknown }) => {
      req.user = { userId: 'u1', tenantSlug: 'acme', roles: ['admin'] };
    };
  },
}));
vi.mock('../../../src/services/search-analytics.js', () => ({ searchAnalyticsService: { get: h.get } }));

import routes from '../../../src/routes/search-analytics.js';

async function build() {
  const app = Fastify();
  await app.register(routes, { prefix: '/v1/search' });
  return app;
}

beforeEach(() => {
  h.get.mockReset();
  h.get.mockResolvedValue({ totals: { searches: 0 }, topQueries: [], zeroResultQueries: [], volumeByDay: [] });
});

describe('search analytics route', () => {
  it('requires admin:read', async () => {
    await build();
    expect(h.perm).toHaveBeenCalledWith('admin:read');
  });

  it('uses defaults', async () => {
    const app = await build();
    const res = await app.inject({ url: '/v1/search/analytics' });
    expect(res.statusCode).toBe(200);
    expect(h.get).toHaveBeenCalledWith('acme', 30, 10);
    expect(res.json()).toHaveProperty('topQueries');
  });

  it('accepts boundary values', async () => {
    const app = await build();
    await app.inject({ url: '/v1/search/analytics?days=90&limit=50' });
    expect(h.get).toHaveBeenCalledWith('acme', 90, 50);
    await app.inject({ url: '/v1/search/analytics?days=1&limit=1' });
    expect(h.get).toHaveBeenCalledWith('acme', 1, 1);
  });

  it.each(['days=0', 'days=91', 'limit=0', 'limit=51', 'days=abc', 'limit=1.5'])('rejects %s', async (qs) => {
    const app = await build();
    const res = await app.inject({ url: `/v1/search/analytics?${qs}` });
    expect(res.statusCode).toBe(400);
    expect(h.get).not.toHaveBeenCalled();
  });
});
