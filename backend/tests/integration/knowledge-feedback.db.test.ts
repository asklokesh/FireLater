import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Article feedback and version history against a real PostgreSQL database.
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

describe.skipIf(!DB_URL)('KB feedback and history on PostgreSQL', () => {
  const slug = `kbdb${Date.now().toString(36)}`;
  const schema = `tenant_${slug}`;
  let s: Services;
  let adminId: string;
  let readerId: string;

  const q = async (sql: string, params: unknown[] = []) => (await s.pool.query(sql, params)).rows;
  const createArticle = (status: string) =>
    s.knowledgeService.createArticle(slug, {
      title: `Article ${randomUUID()}`,
      content: 'First content',
      status,
      authorId: adminId,
      tags: ['vpn'],
    });
  /** Stored counters next to what the stored votes say they should be. */
  const counters = async (articleId: string) => {
    const [row] = await q(
      `SELECT helpful_count, not_helpful_count,
              (SELECT COUNT(*)::int FROM ${schema}.kb_article_feedback WHERE article_id = a.id AND is_helpful) AS yes,
              (SELECT COUNT(*)::int FROM ${schema}.kb_article_feedback WHERE article_id = a.id AND NOT is_helpful) AS no
         FROM ${schema}.kb_articles a WHERE id = $1`,
      [articleId]
    );
    return row;
  };

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
    adminId = (await q(`SELECT id FROM ${schema}.users LIMIT 1`))[0].id;
    readerId = (
      await q(
        `INSERT INTO ${schema}.users (email, name, password_hash, status)
         VALUES ($1, 'Reader', 'x', 'active') RETURNING id`,
        [`reader@${slug}.test`]
      )
    )[0].id;
  });

  afterAll(async () => {
    if (!s) return;
    await s.tenantService.delete(slug).catch(() => undefined);
    await s.pool.end();
  });

  it('keeps one vote per user, replaced by the next one, with matching counters', async () => {
    const { id } = await createArticle('published');

    await s.knowledgeService.submitFeedback(slug, id, adminId, { isHelpful: true, comment: 'Great' });
    await s.knowledgeService.submitFeedback(slug, id, readerId, { isHelpful: true });
    expect(await counters(id)).toEqual({ helpful_count: 2, not_helpful_count: 0, yes: 2, no: 0 });

    const replaced = await s.knowledgeService.submitFeedback(slug, id, adminId, { isHelpful: false });
    expect(replaced).toMatchObject({ is_helpful: false, comment: null, helpful_count: 1, not_helpful_count: 1 });
    expect(await counters(id)).toEqual({ helpful_count: 1, not_helpful_count: 1, yes: 1, no: 1 });
    expect(
      await q(`SELECT is_helpful, comment FROM ${schema}.kb_article_feedback WHERE article_id = $1 AND user_id = $2`, [id, adminId])
    ).toEqual([{ is_helpful: false, comment: null }]);
  });

  it('counters match the stored votes after concurrent votes', async () => {
    const { id } = await createArticle('published');
    const users = await q(
      `INSERT INTO ${schema}.users (email, name, password_hash, status)
       SELECT 'voter' || g || '@${slug}.test', 'Voter', 'x', 'active' FROM generate_series(1, 12) g RETURNING id`
    );

    await Promise.all(
      users.flatMap((u, i) => [
        s.knowledgeService.submitFeedback(slug, id, u.id, { isHelpful: true }),
        s.knowledgeService.submitFeedback(slug, id, u.id, { isHelpful: i % 3 === 0 }),
      ])
    );

    const result = await counters(id);
    expect(result.yes + result.no).toBe(12);
    expect(result).toMatchObject({ helpful_count: result.yes, not_helpful_count: result.no });
  });

  it('rejects feedback on missing and unpublished articles without storing it', async () => {
    const { id } = await createArticle('draft');

    await expect(
      s.knowledgeService.submitFeedback(slug, randomUUID(), adminId, { isHelpful: true })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      s.knowledgeService.submitFeedback(slug, id, adminId, { isHelpful: true })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await counters(id)).toEqual({ helpful_count: 0, not_helpful_count: 0, yes: 0, no: 0 });
  });

  it('records create and update with version, user, action and changed fields, newest first', async () => {
    const created = await createArticle('draft');
    expect(created.version).toBe(1);

    const updated = await s.knowledgeService.updateArticle(
      slug,
      created.id,
      // type is sent with its current value, so it is not a change
      { content: 'Second content', status: 'published', type: 'how_to' },
      readerId
    );
    expect(updated.version).toBe(2);

    const history = await s.knowledgeService.getArticleHistory(slug, created.id);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      article_id: created.id,
      version: 2,
      action: 'updated',
      changed_by: readerId,
      changed_by_name: 'Reader',
      content_snapshot: updated.content,
    });
    expect(updated.content).toContain('Second content');
    expect(history[0].changes).toEqual({
      content: { from: created.content, to: updated.content },
      status: { from: 'draft', to: 'published' },
    });
    expect(history[1]).toMatchObject({
      version: 1,
      action: 'created',
      changed_by: adminId,
      changed_by_name: 'Admin',
      content_snapshot: created.content,
    });
    expect(history[1].changes).toMatchObject({
      title: { from: null, to: created.title },
      tags: { from: null, to: ['vpn'] },
    });
    expect(history[1].changes).not.toHaveProperty('summary');
  });

  it('gives concurrent edits consecutive versions that chain to each other', async () => {
    const { id, title } = await createArticle('draft');

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        s.knowledgeService.updateArticle(slug, id, { title: `Concurrent title ${i}` }, adminId)
      )
    );

    const history = await s.knowledgeService.getArticleHistory(slug, id);
    expect(history.map((h: { version: number }) => h.version)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const oldestFirst = [...history].reverse();
    let previous = title;
    for (const entry of oldestFirst.slice(1)) {
      expect(entry.changes.title.from).toBe(previous);
      previous = entry.changes.title.to;
    }
    const [row] = await q(`SELECT title, version FROM ${schema}.kb_articles WHERE id = $1`, [id]);
    expect(row).toEqual({ title: previous, version: 11 });
  });

  it('writes no history for a failed update, and none is readable for a missing article', async () => {
    const missing = randomUUID();

    await expect(
      s.knowledgeService.updateArticle(slug, missing, { title: 'Nothing here' }, adminId)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await q(`SELECT 1 FROM ${schema}.kb_article_history WHERE article_id = $1`, [missing])).toEqual([]);
    await expect(s.knowledgeService.getArticleHistory(slug, missing)).rejects.toMatchObject({ statusCode: 404 });
  });
});
