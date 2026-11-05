import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const tpl = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const hist = vi.hoisted(() => ({
  record: vi.fn(),
  listRecent: vi.fn(),
  suggest: vi.fn(),
  clear: vi.fn(),
}));
const issueSearch = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/searchTemplates.js', () => ({ searchTemplatesService: tpl }));
vi.mock('../../../src/services/searchHistory.js', () => ({ searchHistoryService: hist }));
vi.mock('../../../src/services/issues.js', () => ({ issueService: { search: issueSearch } }));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

import searchRoutes from '../../../src/routes/search.js';
import issueRoutes from '../../../src/routes/issues.js';

const ID = '11111111-1111-4111-8111-111111111111';

async function build() {
  const app = Fastify();
  app.decorateRequest('user', null as never);
  app.addHook('onRequest', async (req) => {
    (req as unknown as { user: unknown }).user = { tenantSlug: 'test', userId: 'u1' };
  });
  await app.register(searchRoutes, { prefix: '/v1/search' });
  await app.register(issueRoutes, { prefix: '/v1/issues' });
  return app;
}

describe('Search routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /templates lists templates', async () => {
    tpl.list.mockResolvedValue([{ id: 't1' }]);
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search/templates' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [{ id: 't1' }] });
    expect(tpl.list).toHaveBeenCalledWith('test', 'u1', undefined);
  });

  it('POST /templates validates body', async () => {
    const app = await build();
    const bad = await app.inject({ method: 'POST', url: '/v1/search/templates', payload: {} });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(tpl.create).not.toHaveBeenCalled();

    tpl.create.mockResolvedValue({ id: 't1' });
    const ok = await app.inject({ method: 'POST', url: '/v1/search/templates', payload: { name: 'mine', query: 'vpn' } });
    expect(ok.statusCode).toBe(201);
    expect(tpl.create).toHaveBeenCalledWith('test', 'u1', expect.objectContaining({ name: 'mine' }));
  });

  it('rejects non-uuid template id', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search/templates/abc' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(tpl.get).not.toHaveBeenCalled();
  });

  it('PUT and DELETE delegate with user id', async () => {
    tpl.update.mockResolvedValue({ id: ID });
    tpl.delete.mockResolvedValue(undefined);
    const app = await build();
    const put = await app.inject({ method: 'PUT', url: `/v1/search/templates/${ID}`, payload: { name: 'x' } });
    expect(put.statusCode).toBe(200);
    expect(tpl.update).toHaveBeenCalledWith('test', 'u1', ID, expect.objectContaining({ name: 'x' }));
    const del = await app.inject({ method: 'DELETE', url: `/v1/search/templates/${ID}` });
    expect(del.statusCode).toBe(204);
    expect(tpl.delete).toHaveBeenCalledWith('test', 'u1', ID);
  });

  it('GET/DELETE /history', async () => {
    hist.listRecent.mockResolvedValue(['a']);
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search/history?limit=5' });
    expect(res.json()).toEqual({ data: ['a'] });
    expect(hist.listRecent).toHaveBeenCalledWith('test', 'u1', 5);
    const del = await app.inject({ method: 'DELETE', url: '/v1/search/history' });
    expect(del.statusCode).toBe(204);
    expect(hist.clear).toHaveBeenCalledWith('test', 'u1');
  });

  it('GET /suggestions requires prefix', async () => {
    hist.suggest.mockResolvedValue(['vpn']);
    const app = await build();
    const bad = await app.inject({ method: 'GET', url: '/v1/search/suggestions' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    const ok = await app.inject({ method: 'GET', url: '/v1/search/suggestions?prefix=vp' });
    expect(ok.json()).toEqual({ data: ['vpn'] });
    expect(hist.suggest).toHaveBeenCalledWith('test', 'u1', 'vp', 10);
  });

  it('POST /v1/issues/search records history', async () => {
    issueSearch.mockResolvedValue({ issues: [], total: 2, facets: {} });
    hist.record.mockResolvedValue(undefined);
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/issues/search', payload: { q: 'vpn' } });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(hist.record).toHaveBeenCalledWith('test', 'u1', expect.objectContaining({ query: 'vpn', resultCount: 2 }));
  });

  it('does not record history when no q or filter', async () => {
    issueSearch.mockResolvedValue({ issues: [], total: 0, facets: {} });
    const app = await build();
    await app.inject({ method: 'POST', url: '/v1/issues/search', payload: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(hist.record).not.toHaveBeenCalled();
  });

  it('history insert failure does not fail POST /v1/issues/search', async () => {
    issueSearch.mockResolvedValue({ issues: [], total: 1, facets: {} });
    hist.record.mockRejectedValue(new Error('db down'));
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/issues/search', payload: { q: 'vpn' } });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(hist.record).toHaveBeenCalled();
  });

  it('history synchronous throw does not fail the search', async () => {
    issueSearch.mockResolvedValue({ issues: [], total: 1, facets: {} });
    hist.record.mockImplementation(() => {
      throw new Error('boom');
    });
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/issues/search', payload: { q: 'vpn' } });
    expect(res.statusCode).toBe(200);
  });
});
