import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

/**
 * Article feedback and version history through the real routes and service,
 * with a mocked database. SQL behaviour (counters, history rows) is covered in
 * tests/integration/knowledge-feedback.db.test.ts.
 */
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  permissions: [] as string[],
  invalidateTenant: vi.fn(),
}));

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: mocks.query,
    connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug}` },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: mocks.invalidateTenant,
  },
}));

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (permission: string) => async (request: { user?: unknown }) => {
    mocks.permissions.push(permission);
    request.user = { userId: USER_ID, tenantSlug: 'acme', roles: [] };
  },
}));

import knowledgeRoutes from '../../../src/routes/knowledge.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ARTICLE_ID = '22222222-2222-4222-8222-222222222222';

describe('Knowledge feedback and history routes', () => {
  let app: FastifyInstance;
  let article: { status: string } | null;

  const sql = () => mocks.clientQuery.mock.calls.map((call) => String(call[0]));
  const sendFeedback = (payload: Record<string, unknown>, id = ARTICLE_ID) =>
    app.inject({ method: 'POST', url: `/v1/kb/${id}/feedback`, payload });

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.permissions.length = 0;
    article = { status: 'published' };

    mocks.clientQuery.mockImplementation(async (text: string, values?: unknown[]) => {
      if (text.startsWith('SELECT status')) return { rows: article ? [article] : [] };
      if (text.includes('INSERT INTO')) {
        const [article_id, user_id, is_helpful, comment] = values as unknown[];
        return { rows: [{ article_id, user_id, is_helpful, comment }] };
      }
      if (text.includes('UPDATE')) return { rows: [{ helpful_count: 1, not_helpful_count: 0 }] };
      return { rows: [] };
    });

    app = Fastify({ logger: false });
    await app.register(knowledgeRoutes, { prefix: '/v1/kb' });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /v1/kb/:articleId/feedback', () => {
    it('stores the vote and comment for the signed-in user and recounts in one transaction', async () => {
      const response = await sendFeedback({ isHelpful: true, comment: 'Solved it' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        article_id: ARTICLE_ID,
        user_id: USER_ID,
        is_helpful: true,
        comment: 'Solved it',
        helpful_count: 1,
        not_helpful_count: 0,
      });
      expect(mocks.permissions).toEqual(['kb:read']);

      const statements = sql();
      expect(statements[0]).toBe('BEGIN');
      expect(statements[1]).toContain('FOR UPDATE');
      expect(statements[2]).toContain('ON CONFLICT (article_id, user_id) DO UPDATE');
      expect(statements[3]).toContain('SET (helpful_count, not_helpful_count)');
      expect(statements[4]).toBe('COMMIT');
      expect(mocks.invalidateTenant).toHaveBeenCalledWith('acme', 'kb');
      expect(mocks.release).toHaveBeenCalledTimes(1);
    });

    it('stores a vote without a comment', async () => {
      const response = await sendFeedback({ isHelpful: false });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ is_helpful: false, comment: null });
    });

    it('returns 404 for an article that does not exist and writes nothing', async () => {
      article = null;

      const response = await sendFeedback({ isHelpful: true });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain('Article');
      expect(sql().some((s) => s.includes('INSERT INTO'))).toBe(false);
      expect(sql().at(-1)).toBe('ROLLBACK');
      expect(mocks.release).toHaveBeenCalledTimes(1);
    });

    it('returns 404 for an id that is not a UUID without querying the database', async () => {
      const response = await sendFeedback({ isHelpful: true }, 'no-such-article');

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain('Article');
      expect(mocks.clientQuery).not.toHaveBeenCalled();
    });

    it.each(['draft', 'archived', 'review'])('rejects feedback on a %s article with 400', async (status) => {
      article = { status };

      const response = await sendFeedback({ isHelpful: true });

      expect(response.statusCode).toBe(400);
      expect(sql().some((s) => s.includes('INSERT INTO'))).toBe(false);
      expect(sql().at(-1)).toBe('ROLLBACK');
    });

    it.each([{}, { isHelpful: 'yes' }, { isHelpful: true, comment: 'x'.repeat(2001) }])(
      'rejects an invalid body with 400 (case %#)',
      async (payload) => {
        const response = await sendFeedback(payload);

        expect(response.statusCode).toBe(400);
        expect(mocks.clientQuery).not.toHaveBeenCalled();
      }
    );
  });

  describe('GET /v1/kb/:articleId/history', () => {
    const history = () => app.inject({ method: 'GET', url: `/v1/kb/${ARTICLE_ID}/history` });

    it('returns the entries as an array, ordered newest first', async () => {
      const entries = [
        { id: 'h2', version: 2, action: 'updated', changed_by_name: 'Ada' },
        { id: 'h1', version: 1, action: 'created', changed_by_name: 'Ada' },
      ];
      mocks.query
        .mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID }] })
        .mockResolvedValueOnce({ rows: entries });

      const response = await history();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(entries);
      expect(mocks.permissions).toEqual(['kb:read']);
      expect(mocks.query.mock.calls[1][0]).toContain('ORDER BY h.version DESC, h.created_at DESC');
      expect(mocks.query.mock.calls[1][1]).toEqual([ARTICLE_ID]);
    });

    it('returns 404 for an article that does not exist', async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const response = await history();

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain('Article');
    });
  });

  describe('history writes', () => {
    it('creating an article writes its history entry in the same statement', async () => {
      mocks.query
        .mockResolvedValueOnce({ rows: [{ current_value: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID }] });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        payload: { title: 'Reset a password', content: 'Steps' },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.query.mock.calls[1][0]).toContain('INSERT INTO tenant_acme.kb_article_history');
    });

    it('updating an article increments the version and records the signed-in user', async () => {
      mocks.query.mockResolvedValueOnce({ rows: [{ id: ARTICLE_ID, version: 2 }] });

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/kb/${ARTICLE_ID}`,
        payload: { title: 'Reset your password' },
      });

      expect(response.statusCode).toBe(200);
      const [statement, values] = mocks.query.mock.calls[0];
      expect(statement).toContain('version = COALESCE(a.version, 1) + 1');
      expect(statement).toContain('INSERT INTO tenant_acme.kb_article_history');
      expect(values).toEqual(['Reset your password', ARTICLE_ID, USER_ID]);
    });
  });
});
