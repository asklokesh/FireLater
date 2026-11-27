import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Knowledge base feedback and version history against a real PostgreSQL database.
 *
 * Runs only when KB_DB_TEST_URL points at a database migrated with
 * `npm run migrate` (it creates and drops its own tenant); skipped otherwise.
 */
const DB_URL = process.env.KB_DB_TEST_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

type Services = {
  pool: typeof import('../../src/config/database.js')['pool'];
  tenantService: typeof import('../../src/services/tenant.js')['tenantService'];
  knowledgeService: typeof import('../../src/services/knowledge.js')['knowledgeService'];
};

describe.skipIf(!DB_URL)('knowledge base feedback and history on PostgreSQL', () => {
  const slug = `kbdb${Date.now().toString(36)}`;
  const schema = `tenant_${slug}`;
  let s: Services;
  let userA: string;
  let userB: string;

  const q = async (sql: string, params: unknown[] = []) => (await s.pool.query(sql, params)).rows;
  const newArticle = (status = 'published') =>
    s.knowledgeService.createArticle(slug, {
      title: `Article ${Math.random().toString(36).slice(2)}`,
      content: 'Body text',
      status,
      authorId: userA,
    });
  const counters = async (id: string) =>
    (await q(`SELECT helpful_count, not_helpful_count FROM ${schema}.kb_articles WHERE id = $1`, [id]))[0];

  beforeAll(async () => {
    s = {
      pool: (await import('../../src/config/database.js')).pool,
      tenantService: (await import('../../src/services/tenant.js')).tenantService,
      knowledgeService: (await import('../../src/services/knowledge.js')).knowledgeService,
    };
    await s.tenantService.create({
      name: 'KB DB test',
      slug,
      adminEmail: `admin@${slug}.test`,
      adminName: 'Admin',
      adminPassword: 'Str0ng!Passw0rd#2026',
    });
    userA = (await q(`SELECT id FROM ${schema}.users LIMIT 1`))[0].id;
    userB = (
      await q(
        `INSERT INTO ${schema}.users (email, password_hash, name, status)
         VALUES ($1, 'x', 'Second User', 'active') RETURNING id`,
        [`second@${slug}.test`]
      )
    )[0].id;
  });

  afterAll(async () => {
    if (!s) return;
    await s.tenantService.delete(slug).catch(() => undefined);
    await s.pool.end();
  });

  describe('feedback', () => {
    it('stores the vote and optional comment for the user and updates the counters', async () => {
      const article = await newArticle();
      const fb = await s.knowledgeService.submitFeedback(slug, article.id, userA, true, 'Clear steps');
      expect(fb).toMatchObject({ article_id: article.id, user_id: userA, is_helpful: true, comment: 'Clear steps' });
      expect(await counters(article.id)).toEqual({ helpful_count: 1, not_helpful_count: 0 });

      const noComment = await s.knowledgeService.submitFeedback(slug, article.id, userB, false);
      expect(noComment.comment).toBeNull();
      expect(await counters(article.id)).toEqual({ helpful_count: 1, not_helpful_count: 1 });
    });

    it('replaces an earlier vote from the same user and keeps the counters equal to the stored votes', async () => {
      const article = await newArticle();
      await s.knowledgeService.submitFeedback(slug, article.id, userA, true, 'first');
      await s.knowledgeService.submitFeedback(slug, article.id, userA, false, 'second');

      const rows = await q(`SELECT is_helpful, comment FROM ${schema}.kb_article_feedback WHERE article_id = $1`, [article.id]);
      expect(rows).toEqual([{ is_helpful: false, comment: 'second' }]);
      expect(await counters(article.id)).toEqual({ helpful_count: 0, not_helpful_count: 1 });
    });

    it('keeps counters consistent under concurrent votes', async () => {
      const article = await newArticle();
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          s.knowledgeService.submitFeedback(slug, article.id, i % 2 ? userA : userB, i % 3 === 0)
        )
      );
      const rows = await q(`SELECT is_helpful FROM ${schema}.kb_article_feedback WHERE article_id = $1`, [article.id]);
      expect(rows).toHaveLength(2);
      expect(await counters(article.id)).toEqual({
        helpful_count: rows.filter((r) => r.is_helpful).length,
        not_helpful_count: rows.filter((r) => !r.is_helpful).length,
      });
    });

    it.each(['abc', 'KB000001'])('returns 404 (not a PostgreSQL error) for the non-UUID id %s', async (id) => {
      await expect(s.knowledgeService.submitFeedback(slug, id, userA, true)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns 404 for an article that does not exist', async () => {
      await expect(
        s.knowledgeService.submitFeedback(slug, '00000000-0000-4000-8000-000000000000', userA, true)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects feedback on an article that is not published with 400 and stores nothing', async () => {
      for (const status of ['draft', 'archived']) {
        const article = await newArticle(status);
        await expect(s.knowledgeService.submitFeedback(slug, article.id, userA, true)).rejects.toMatchObject({
          statusCode: 400,
        });
        expect(await q(`SELECT 1 FROM ${schema}.kb_article_feedback WHERE article_id = $1`, [article.id])).toHaveLength(0);
        expect(await counters(article.id)).toEqual({ helpful_count: 0, not_helpful_count: 0 });
      }
    });
  });

  describe('version history', () => {
    it('writes a created entry with version 1, the author and the initial fields', async () => {
      const article = await newArticle('draft');
      const history = await s.knowledgeService.getArticleHistory(slug, article.id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        article_id: article.id,
        version: 1,
        changed_by: userA,
        changed_by_name: 'Admin',
        action: 'created',
        content_snapshot: article.content,
      });
      expect(history[0].changes.fields).toEqual(expect.arrayContaining(['title', 'content', 'status']));
    });

    it('increments version on update and records user, action and changed fields', async () => {
      const article = await newArticle('draft');
      const updated = await s.knowledgeService.updateArticle(slug, article.id, {
        status: 'published',
        summary: 'Short',
        updatedBy: userB,
      });
      expect(updated.version).toBe(2);

      const history = await s.knowledgeService.getArticleHistory(slug, article.id);
      expect(history[0]).toMatchObject({ version: 2, action: 'updated', changed_by: userB, changed_by_name: 'Second User' });
      expect(history[0].changes.fields).toEqual(['summary', 'status']);
      expect(history[0].changes.values.status).toEqual({ from: 'draft', to: 'published' });
      expect(history[0].changes.values.summary).toEqual({ from: null, to: 'Short' });
    });

    it('returns the entries newest first', async () => {
      const article = await newArticle('draft');
      for (let i = 0; i < 3; i++) {
        await s.knowledgeService.updateArticle(slug, article.id, { summary: `rev ${i}`, updatedBy: userA });
      }
      const history = await s.knowledgeService.getArticleHistory(slug, article.id);
      expect(history.map((h) => h.version)).toEqual([4, 3, 2, 1]);
      expect(history.map((h) => h.action)).toEqual(['updated', 'updated', 'updated', 'created']);
    });

    it('gives concurrent edits distinct versions', async () => {
      const article = await newArticle('draft');
      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          s.knowledgeService.updateArticle(slug, article.id, { summary: `c${i}`, updatedBy: userA })
        )
      );
      const history = await s.knowledgeService.getArticleHistory(slug, article.id);
      expect(history.map((h) => h.version)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    });

    it('does not write history or bump the version when the update fails', async () => {
      const article = await newArticle('draft');
      await expect(
        s.knowledgeService.updateArticle(slug, article.id, { summary: 'x', reviewerId: 'not-a-uuid' })
      ).rejects.toThrow();
      await expect(s.knowledgeService.updateArticle(slug, article.id, {})).rejects.toMatchObject({ statusCode: 400 });
      expect(await s.knowledgeService.getArticleHistory(slug, article.id)).toHaveLength(1);
      expect((await q(`SELECT version FROM ${schema}.kb_articles WHERE id = $1`, [article.id]))[0].version).toBe(1);
    });

    it('lists only the fields that changed when a client resubmits the whole article', async () => {
      const article = await newArticle('draft');
      await s.knowledgeService.updateArticle(slug, article.id, {
        title: article.title,
        content: article.content,
        tags: article.tags,
        summary: 'Now with a summary',
        updatedBy: userA,
      });
      const [entry] = await s.knowledgeService.getArticleHistory(slug, article.id);
      expect(entry.changes.fields).toEqual(['summary']);
      expect(Object.keys(entry.changes.values)).toEqual(['summary']);
    });

    it.each(['abc', 'KB000001'])('returns 404 for the history of the non-UUID id %s', async (id) => {
      await expect(s.knowledgeService.getArticleHistory(slug, id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns 404 for the history of an article that does not exist', async () => {
      await expect(
        s.knowledgeService.getArticleHistory(slug, '00000000-0000-4000-8000-000000000000')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
