import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Feedback and history routes with a mocked database. The SQL itself is
 * exercised against PostgreSQL in tests/integration/knowledge.db.test.ts.
 */
const { query, clientQuery, release, invalidateTenant, permissions, USER_ID } = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  invalidateTenant: vi.fn(),
  permissions: [] as string[],
  USER_ID: '11111111-1111-4111-8111-111111111111',
}));

vi.mock('../../src/config/database.js', () => ({
  pool: { query, connect: async () => ({ query: clientQuery, release }) },
}));
vi.mock('../../src/utils/cache.js', () => ({
  cacheService: { getOrSet: (_k: string, fetch: () => unknown) => fetch(), invalidateTenant },
}));
vi.mock('../../src/middleware/auth.js', () => ({
  requirePermission: (permission: string) => async (request: { user?: unknown; method: string; routeOptions: { url?: string } }) => {
    permissions.push(`${request.method} ${request.routeOptions.url} ${permission}`);
    request.user = { userId: USER_ID, tenantSlug: 'acme', roles: ['requester'] };
  },
}));

import { validationPlugin } from '../../src/middleware/validation.js';
import knowledgeRoutes from '../../src/routes/knowledge.js';

const ARTICLE_ID = '22222222-2222-4222-8222-222222222222';

describe('knowledge base feedback and history routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(validationPlugin);
    await app.register(knowledgeRoutes, { prefix: '/v1/kb' });
    await app.ready();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    release.mockClear();
    invalidateTenant.mockReset().mockResolvedValue(0);
    permissions.length = 0;
  });

  const statements = () => clientQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]);

  /** Answers the queries of one feedback transaction for an article with the given status. */
  const articleWithStatus = (status?: string) =>
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: status ? [{ status }] : [] };
      if (sql.includes('INSERT INTO')) return { rows: [{ id: 'fb-1', is_helpful: false, comment: 'Outdated' }] };
      if (sql.includes('helpful_count =')) return { rows: [{ helpful_count: 2, not_helpful_count: 1 }] };
      return { rows: [] };
    });

  const vote = (payload: object, id = ARTICLE_ID) =>
    app.inject({ method: 'POST', url: `/v1/kb/${id}/feedback`, payload });

  it('upserts the vote and recounts inside one transaction, requiring kb:read', async () => {
    articleWithStatus('published');

    const res = await vote({ isHelpful: false, comment: 'Outdated' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ is_helpful: false, helpful_count: 2, not_helpful_count: 1 });
    expect(permissions).toEqual(['POST /v1/kb/:articleId/feedback kb:read']);
    expect(statements()).toEqual(['BEGIN', 'SELECT', 'INSERT', 'UPDATE', 'COMMIT']);
    const [upsert, params] = clientQuery.mock.calls[2];
    expect(upsert).toContain('ON CONFLICT (article_id, user_id)');
    expect(params).toEqual([ARTICLE_ID, USER_ID, false, 'Outdated']);
    expect(invalidateTenant).toHaveBeenCalledWith('acme', 'kb');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing article', undefined, 404],
    ['a draft article', 'draft', 400],
    ['an archived article', 'archived', 400],
  ])('rolls back a vote on %s', async (_name, status, expected) => {
    articleWithStatus(status);

    const res = await vote({ isHelpful: true });

    expect(res.statusCode).toBe(expected);
    expect(statements()).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(invalidateTenant).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a malformed article id without querying', async () => {
    const res = await vote({ isHelpful: true }, 'KB000001');

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Article');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('rejects a body without isHelpful', async () => {
    const res = await vote({ comment: 'no vote' });

    expect(res.statusCode).toBe(400);
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('returns the history of an article as an array, newest first, requiring kb:read', async () => {
    const rows = [{ id: 'h2', version: 2 }, { id: 'h1', version: 1 }];
    query.mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID }] }).mockResolvedValueOnce({ rows });

    const res = await app.inject({ method: 'GET', url: `/v1/kb/${ARTICLE_ID}/history` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(rows);
    expect(permissions).toEqual(['GET /v1/kb/:articleId/history kb:read']);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('ORDER BY h.version DESC');
    expect(params).toEqual([ARTICLE_ID]);
  });

  it('returns 404 for the history of a missing article', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({ method: 'GET', url: `/v1/kb/${ARTICLE_ID}/history` });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('Article');
  });

  it('writes the history entry in the same statement that creates the article', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ current_value: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID, version: 1 }] });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/kb',
      payload: { title: 'Reset a password', content: 'Steps' },
    });

    expect(res.statusCode).toBe(201);
    const [sql] = query.mock.calls[1];
    expect(sql).toContain('kb_article_history');
    expect(sql).toContain("'created'");
  });

  it('increments the version and records the signed-in user when updating', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID, version: 2 }] });

    const res = await app.inject({ method: 'PUT', url: `/v1/kb/${ARTICLE_ID}`, payload: { summary: 'Short' } });

    expect(res.statusCode).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('version = COALESCE(a.version, 1) + 1');
    expect(sql).toContain('kb_article_history');
    expect(sql).toContain("'updated'");
    expect(params).toEqual(['Short', ARTICLE_ID, USER_ID, ['summary']]);
  });
});
