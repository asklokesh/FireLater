import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const svc = vi.hoisted(() => ({
  recordSearch: vi.fn(), getAnalytics: vi.fn(), listTemplates: vi.fn(), createTemplate: vi.fn(),
}));
const perm = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/search.js', () => ({ searchService: svc }));
vi.mock('../../../src/services/issues.js', () => ({
  issueService: { list: vi.fn().mockResolvedValue({ issues: [], total: 4, facets: undefined }) },
}));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (p: string) => { perm(p); return async () => {}; },
}));

import searchRoutes from '../../../src/routes/search.js';
import issueRoutes from '../../../src/routes/issues.js';

async function build() {
  const app = Fastify();
  app.addHook('preHandler', async (req) => { (req as any).user = { tenantSlug: 'acme', userId: 'u1' }; });
  await app.register(issueRoutes, { prefix: '/v1/issues' });
  await app.register(searchRoutes, { prefix: '/v1/search' });
  return app;
}

describe('search routes', () => {
  beforeEach(() => { Object.values(svc).forEach((f) => f.mockReset()); });

  it('requires reports:read for analytics', async () => {
    await build();
    expect(perm).toHaveBeenCalledWith('reports:read');
  });

  it('rejects invalid filter with 400', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/search/templates', payload: { name: 'x', filter: { op: 'bogus' } } });
    expect(res.statusCode).toBe(400);
  });

  it('records history on POST /v1/issues/search', async () => {
    svc.recordSearch.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/issues/search', payload: { q: 'vpn' } });
    expect(res.statusCode).toBe(200);
    expect(svc.recordSearch).toHaveBeenCalledWith('acme', expect.objectContaining({ userId: 'u1', query: 'vpn', resultCount: 4 }));
  });

  it('skips recording when q and filter are empty', async () => {
    const app = await build();
    await app.inject({ method: 'POST', url: '/v1/issues/search', payload: {} });
    expect(svc.recordSearch).not.toHaveBeenCalled();
  });

  it('still responds when recording fails', async () => {
    svc.recordSearch.mockRejectedValue(new Error('db'));
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/issues/search', payload: { q: 'vpn' } });
    expect(res.statusCode).toBe(200);
  });

  it('analytics returns service data', async () => {
    svc.getAnalytics.mockResolvedValue({ topQueries: [], zeroResultQueries: [], dailyVolume: [], averageResultCount: 0 });
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search/analytics?days=7' });
    expect(res.statusCode).toBe(200);
    expect(svc.getAnalytics).toHaveBeenCalledWith('acme', 7);
  });
});
