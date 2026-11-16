import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const h = vi.hoisted(() => ({
  search: vi.fn(),
  record: vi.fn(),
  recent: vi.fn(),
  clear: vi.fn(),
  suggestions: vi.fn(),
  perms: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(async (req: { user: unknown; headers: Record<string, string> }) => {
    req.user = { userId: 'u1', tenantSlug: 'acme', roles: (req.headers['x-roles'] ?? 'agent').split(',') };
  }),
}));
vi.mock('../../../src/services/auth.js', () => ({
  authService: { getCachedPermissions: h.perms, getUserPermissions: h.perms },
}));
vi.mock('../../../src/services/tenant.js', () => ({ tenantService: { getSchemaName: (s: string) => `tenant_${s}` } }));
vi.mock('../../../src/services/search-history.js', () => ({
  searchHistoryService: { record: h.record, recent: h.recent, clear: h.clear, suggestions: h.suggestions },
}));
vi.mock('../../../src/services/search.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/services/search.js')>('../../../src/services/search.js').catch(() => null);
  void actual;
  const ENTITY_PERMISSIONS = { issues: 'issues:read', problems: 'problems:read', requests: 'requests:read', kb: 'kb:read' };
  const SEARCH_ENTITIES = ['issues', 'problems', 'requests', 'kb'];
  return {
    SEARCH_ENTITIES, ENTITY_PERMISSIONS, MAX_PER_PAGE: 50, MAX_QUERY_LENGTH: 200,
    searchService: {
      search: h.search,
      permittedEntities: (perms: string[], admin = false, req?: string[]) =>
        SEARCH_ENTITIES.filter((e) => (!req || !req.length || req.includes(e)) && (admin || perms.includes((ENTITY_PERMISSIONS as Record<string, string>)[e]))),
    },
  };
});

import searchRoutes from '../../../src/routes/search.js';
import { BadRequestError } from '../../../src/utils/errors.js';

async function build() {
  const app = Fastify();
  await app.register(searchRoutes, { prefix: '/v1/search' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.perms.mockResolvedValue(['issues:read', 'kb:read']);
  h.search.mockResolvedValue({ q: 'vpn', page: 1, perPage: 20, results: { issues: { results: [], total: 5, facets: {} } } });
  h.record.mockResolvedValue(undefined);
});

describe('search routes', () => {
  it('GET passes parsed params and permissions, records history', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search?q=vpn&entities=issues,kb&perPage=10&facets=status' });
    expect(res.statusCode).toBe(200);
    expect(h.search).toHaveBeenCalledWith(expect.objectContaining({
      tenantSlug: 'acme', userId: 'u1', q: 'vpn', entities: ['issues', 'kb'], perPage: 10, facets: ['status'],
      permissions: ['issues:read', 'kb:read'],
    }));
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', query: 'vpn', resultCount: 5 }));
  });

  it('does not record history for empty q', async () => {
    const app = await build();
    await app.inject({ method: 'GET', url: '/v1/search' });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('rejects perPage above 50 and q above 200 chars', async () => {
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search?q=x&perPage=51' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/v1/search?q=${'a'.repeat(201)}` })).statusCode).toBe(400);
  });

  it('returns 403 when no entity is readable', async () => {
    h.perms.mockResolvedValue(['assets:read']);
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/v1/search?q=x' });
    expect(res.statusCode).toBe(403);
    expect(h.search).not.toHaveBeenCalled();
  });

  it('POST returns 400 with the validation message for bad filter', async () => {
    h.search.mockRejectedValue(new BadRequestError("Field 'password' is not filterable for issues"));
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'x', filter: { op: 'and', conditions: [] } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("'password'");
  });

  it('POST forwards filter and sort', async () => {
    const app = await build();
    const filter = { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    const res = await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'x', entities: ['issues'], filter, sort: 'date', page: 2, perPage: 5 } });
    expect(res.statusCode).toBe(200);
    expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ filter, sort: 'date', page: 2, perPage: 5 }));
  });

  it('POST rejects unknown entity', async () => {
    const app = await build();
    expect((await app.inject({ method: 'POST', url: '/v1/search', payload: { q: 'x', entities: ['users'] } })).statusCode).toBe(400);
  });

  it('history, clear and suggestions use the current user', async () => {
    h.recent.mockResolvedValue([{ query: 'vpn', lastSearchedAt: 't' }]);
    h.clear.mockResolvedValue(2);
    h.suggestions.mockResolvedValue(['vpn down']);
    const app = await build();
    expect((await app.inject({ method: 'GET', url: '/v1/search/history?limit=5' })).json().data).toHaveLength(1);
    expect(h.recent).toHaveBeenCalledWith('acme', 'u1', 5);
    expect((await app.inject({ method: 'DELETE', url: '/v1/search/history' })).json()).toEqual({ deleted: 2 });
    expect(h.clear).toHaveBeenCalledWith('acme', 'u1');
    expect((await app.inject({ method: 'GET', url: '/v1/search/suggestions?prefix=vp' })).json().data).toEqual(['vpn down']);
    expect(h.suggestions).toHaveBeenCalledWith('acme', 'u1', 'vp');
  });
});
