import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn(() => async () => undefined),
}));
vi.mock('../../../src/services/search/search.js', () => ({
  searchIssues: vi.fn(),
  listSearchHistory: vi.fn(),
  clearSearchHistory: vi.fn(),
  deleteSearchHistoryEntry: vi.fn(),
  getSuggestions: vi.fn(),
}));

import searchRoutes, { searchIssuesBodySchema } from '../../../src/routes/search.js';
import { searchIssues } from '../../../src/services/search/search.js';
import { AppError, BadRequestError } from '../../../src/utils/errors.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    (req as unknown as { user: unknown }).user = { tenantSlug: 'acme', userId: 'u' };
  });
  await app.register(searchRoutes);
  return app;
}

describe('POST /issues error mapping', () => {
  it('returns 400 for the rejected window', async () => {
    vi.mocked(searchIssues).mockRejectedValueOnce(new BadRequestError('Narrow the query or filters'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/issues', payload: { page: 401 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Narrow/);
  });

  it('returns 503 for a search timeout', async () => {
    vi.mocked(searchIssues).mockRejectedValueOnce(new AppError(503, 'Service Unavailable', 'Search timed out. Please retry'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/issues', payload: {} });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/retry/);
  });
});

describe('searchIssuesBodySchema', () => {
  it('accepts a valid body and applies defaults', () => {
    const r = searchIssuesBodySchema.parse({
      q: 'status:new login',
      filter: { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      sort: 'relevance',
      order: 'desc',
    });
    expect(r.page).toBe(1);
    expect(r.perPage).toBe(25);
  });

  it('rejects perPage 101', () => {
    expect(searchIssuesBodySchema.safeParse({ perPage: 101 }).success).toBe(false);
  });

  it('rejects q over 500 characters', () => {
    expect(searchIssuesBodySchema.safeParse({ q: 'a'.repeat(501) }).success).toBe(false);
  });

  it('rejects an unknown filter field', () => {
    const r = searchIssuesBodySchema.safeParse({
      filter: { op: 'and', conditions: [{ field: 'bogus', operator: 'eq', value: 'x' }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid sort', () => {
    expect(searchIssuesBodySchema.safeParse({ sort: 'title' }).success).toBe(false);
  });
});
