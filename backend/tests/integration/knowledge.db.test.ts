import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Knowledge base feedback and version history against a real PostgreSQL database,
 * through the real routes, validation and services (only authentication is stubbed).
 *
 * Runs only when KB_DB_TEST_URL points at a database migrated with
 * `npm run migrate` (it creates and drops its own tenant); skipped otherwise.
 */
const DB_URL = process.env.KB_DB_TEST_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

const SLUG = vi.hoisted(() => `kbdb${Date.now().toString(36)}`);

vi.mock('../../src/middleware/auth.js', () => ({
  requirePermission: () => async (request: { user?: unknown; headers: Record<string, unknown> }) => {
    request.user = { userId: request.headers['x-test-user'], tenantSlug: SLUG, roles: ['admin'] };
  },
}));

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DB_URL)('knowledge base feedback and history on PostgreSQL', () => {
  const schema = `tenant_${SLUG}`;
  let app: FastifyInstance;
  let pool: typeof import('../../src/config/database.js')['pool'];
  let tenantService: typeof import('../../src/services/tenant.js')['tenantService'];
  let author: string;
  let editor: string;
  let articleCount = 0;

  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, user: string, payload?: object) =>
    app.inject({ method, url: `/v1/kb${url}`, headers: { 'x-test-user': user }, payload });

  const newArticle = async (status = 'published') => {
    const res = await call('POST', '', author, {
      title: `Database test article ${++articleCount}`,
      content: 'Original body',
      status,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  };

  const vote = (articleId: string, user: string, payload: object) =>
    call('POST', `/${articleId}/feedback`, user, payload);

  const history = async (articleId: string) => {
    const res = await call('GET', `/${articleId}/history`, author);
    expect(res.statusCode).toBe(200);
    return res.json() as Array<Record<string, any>>;
  };

  /** Stored article counters next to the counts of the stored votes. */
  const tallies = async (articleId: string) =>
    (
      await q(
        `SELECT a.helpful_count, a.not_helpful_count,
                (SELECT COUNT(*)::int FROM ${schema}.kb_article_feedback f
                  WHERE f.article_id = a.id AND f.is_helpful) AS helpful_votes,
                (SELECT COUNT(*)::int FROM ${schema}.kb_article_feedback f
                  WHERE f.article_id = a.id AND NOT f.is_helpful) AS not_helpful_votes
           FROM ${schema}.kb_articles a WHERE a.id = $1`,
        [articleId]
      )
    )[0];

  const expectTallies = async (articleId: string, helpful: number, notHelpful: number) =>
    expect(await tallies(articleId)).toEqual({
      helpful_count: helpful,
      not_helpful_count: notHelpful,
      helpful_votes: helpful,
      not_helpful_votes: notHelpful,
    });

  beforeAll(async () => {
    pool = (await import('../../src/config/database.js')).pool;
    tenantService = (await import('../../src/services/tenant.js')).tenantService;
    const { validationPlugin } = await import('../../src/middleware/validation.js');
    const knowledgeRoutes = (await import('../../src/routes/knowledge.js')).default;

    await tenantService.create({
      name: 'KB DB test',
      slug: SLUG,
      adminEmail: 'author@example.test',
      adminName: 'Author',
      adminPassword: 'Passw0rd!Passw0rd',
    });
    author = (await q(`SELECT id FROM ${schema}.users WHERE email = 'author@example.test'`))[0].id;
    editor = (
      await q(
        `INSERT INTO ${schema}.users (email, name, status) VALUES ('editor@example.test', 'Editor', 'active') RETURNING id`
      )
    )[0].id;

    app = Fastify();
    await app.register(validationPlugin);
    await app.register(knowledgeRoutes, { prefix: '/v1/kb' });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await tenantService?.delete(SLUG);
    await pool?.end();
  });

  describe('feedback', () => {
    it('stores the vote and comment for the signed-in user', async () => {
      const article = await newArticle();

      const res = await vote(article.id, editor, { isHelpful: true, comment: 'Solved it' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        article_id: article.id,
        user_id: editor,
        is_helpful: true,
        comment: 'Solved it',
        helpful_count: 1,
        not_helpful_count: 0,
      });
      expect(
        await q(`SELECT user_id, is_helpful, comment FROM ${schema}.kb_article_feedback WHERE article_id = $1`, [
          article.id,
        ])
      ).toEqual([{ user_id: editor, is_helpful: true, comment: 'Solved it' }]);
      await expectTallies(article.id, 1, 0);
    });

    it('replaces an earlier vote from the same user', async () => {
      const article = await newArticle();
      await vote(article.id, author, { isHelpful: true });
      await vote(article.id, editor, { isHelpful: true, comment: 'Good' });

      const res = await vote(article.id, editor, { isHelpful: false });

      expect(res.statusCode).toBe(200);
      expect(
        await q(
          `SELECT is_helpful, comment FROM ${schema}.kb_article_feedback WHERE article_id = $1 AND user_id = $2`,
          [article.id, editor]
        )
      ).toEqual([{ is_helpful: false, comment: null }]);
      await expectTallies(article.id, 1, 1);
    });

    it('keeps the counters equal to the stored votes under concurrent voting', async () => {
      const article = await newArticle();
      const voters = await q(
        `INSERT INTO ${schema}.users (email, name, status)
         SELECT 'voter' || n || '@example.test', 'Voter ' || n, 'active' FROM generate_series(1, 12) n
         RETURNING id`
      );

      const responses = await Promise.all(
        voters.flatMap((v: { id: string }, i: number) => [
          vote(article.id, v.id, { isHelpful: i % 2 === 0 }),
          vote(article.id, v.id, { isHelpful: i % 3 === 0 }),
        ])
      );

      expect(responses.map((r) => r.statusCode)).toEqual(Array(24).fill(200));
      const counts = await tallies(article.id);
      expect(counts.helpful_count).toBe(counts.helpful_votes);
      expect(counts.not_helpful_count).toBe(counts.not_helpful_votes);
      expect(counts.helpful_votes + counts.not_helpful_votes).toBe(12);
    });

    it.each([MISSING_ID, 'not-a-uuid'])('returns 404 for the unknown article %s', async (id) => {
      const res = await vote(id, author, { isHelpful: true });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('Article');
    });

    it.each(['draft', 'archived'])('rejects a vote on a %s article with 400 and stores nothing', async (status) => {
      const article = await newArticle(status);

      const res = await vote(article.id, author, { isHelpful: true });

      expect(res.statusCode).toBe(400);
      await expectTallies(article.id, 0, 0);
    });

    it.each([{}, { isHelpful: 'yes' }, { isHelpful: true, comment: 'x'.repeat(2001) }])(
      'rejects the invalid body %# with 400',
      async (payload) => {
        const article = await newArticle();
        expect((await vote(article.id, author, payload)).statusCode).toBe(400);
        await expectTallies(article.id, 0, 0);
      }
    );
  });

  describe('version history', () => {
    it('records creation with version, user, action and the initial fields', async () => {
      const article = await newArticle('draft');

      const entries = await history(article.id);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        article_id: article.id,
        version: 1,
        changed_by: author,
        changed_by_name: 'Author',
        action: 'created',
        content_snapshot: '<p>Original body</p>\n',
      });
      expect(Object.keys(entries[0].changes).sort()).toEqual(['content', 'status', 'title', 'type', 'visibility']);
      expect(entries[0].changes.status).toEqual({ to: 'draft' });
    });

    it('increments the version on update and records who changed which fields', async () => {
      const article = await newArticle('draft');

      const res = await call('PUT', `/${article.id}`, editor, {
        status: 'published',
        content: 'Rewritten body',
        tags: ['vpn'],
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().version).toBe(2);
      const [latest] = await history(article.id);
      expect(latest).toMatchObject({
        version: 2,
        changed_by: editor,
        changed_by_name: 'Editor',
        action: 'updated',
        content_snapshot: '<p>Rewritten body</p>\n',
      });
      expect(latest.changes).toEqual({
        content: { from: '<p>Original body</p>\n' },
        status: { from: 'draft', to: 'published' },
        tags: { from: [], to: ['vpn'] },
      });
    });

    it('lists only fields whose value changed', async () => {
      const article = await newArticle('draft');

      await call('PUT', `/${article.id}`, author, { status: 'draft', summary: 'New summary' });

      const [latest] = await history(article.id);
      expect(latest.changes).toEqual({ summary: { from: null, to: 'New summary' } });
    });

    it('returns the entries of that article only, newest first', async () => {
      const article = await newArticle('draft');
      const other = await newArticle('draft');
      for (const summary of ['one', 'two', 'three']) {
        await call('PUT', `/${article.id}`, author, { summary });
      }
      await call('PUT', `/${other.id}`, author, { summary: 'other' });

      const entries = await history(article.id);

      expect(entries.map((e) => e.version)).toEqual([4, 3, 2, 1]);
      expect(entries.every((e) => e.article_id === article.id)).toBe(true);
    });

    it('gives concurrent updates distinct versions, each diffed against its predecessor', async () => {
      const article = await newArticle('draft');

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) => call('PUT', `/${article.id}`, author, { summary: `edit ${i}` }))
      );

      expect(responses.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
      const entries = await history(article.id);
      expect(entries.map((e) => e.version)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      for (let i = 0; i < 9; i++) {
        expect(entries[i].changes.summary.from).toBe(entries[i + 1].changes.summary.to);
      }
    });

    it('writes nothing when the update fails', async () => {
      const article = await newArticle('draft');

      expect((await call('PUT', `/${article.id}`, author, {})).statusCode).toBe(400);
      // The user id is not a UUID, so the history insert fails and takes the article update with it
      expect((await call('PUT', `/${article.id}`, 'nobody', { summary: 'lost' })).statusCode).toBe(500);

      expect(await history(article.id)).toHaveLength(1);
      expect(await q(`SELECT version, summary FROM ${schema}.kb_articles WHERE id = $1`, [article.id])).toEqual([
        { version: 1, summary: null },
      ]);
    });

    it.each([MISSING_ID, 'not-a-uuid'])('returns 404 for the history of the unknown article %s', async (id) => {
      const res = await call('GET', `/${id}/history`, author);
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain('Article');
    });
  });
});
