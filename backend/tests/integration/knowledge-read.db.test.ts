import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Knowledge base article reads against a real PostgreSQL database.
 *
 * Runs only when KB_DB_TEST_URL points at a database migrated with
 * `npm run migrate` (it creates and drops its own tenant); skipped otherwise.
 * Mocked unit tests cannot catch a query naming a column that does not exist.
 */
const DB_URL = process.env.KB_DB_TEST_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

type Services = {
  pool: typeof import('../../src/config/database.js')['pool'];
  tenantService: typeof import('../../src/services/tenant.js')['tenantService'];
  knowledgeService: typeof import('../../src/services/knowledge.js')['knowledgeService'];
};

describe.skipIf(!DB_URL)('knowledge base article reads on PostgreSQL', () => {
  const slug = `kbread${Date.now().toString(36)}`;
  const schema = `tenant_${slug}`;
  const avatar = 'https://example.test/avatar.png';
  let s: Services;
  let articleId: string;
  let authorId: string;

  beforeAll(async () => {
    s = {
      pool: (await import('../../src/config/database.js')).pool,
      tenantService: (await import('../../src/services/tenant.js')).tenantService,
      knowledgeService: (await import('../../src/services/knowledge.js')).knowledgeService,
    };
    await s.tenantService.create({
      name: 'KB read DB test',
      slug,
      adminEmail: `admin@${slug}.test`,
      adminName: 'Admin',
      adminPassword: 'Str0ng!Passw0rd#2026',
    });
    authorId = (
      await s.pool.query(`UPDATE ${schema}.users SET avatar_url = $1 RETURNING id`, [avatar])
    ).rows[0].id;
    articleId = (
      await s.knowledgeService.createArticle(slug, {
        title: 'First article',
        content: 'Body text',
        status: 'published',
        authorId,
      })
    ).id;
  });

  afterAll(async () => {
    if (!s) return;
    await s.tenantService.delete(slug).catch(() => undefined);
    await s.pool.end();
  });

  it('reads a single article with its author and vote counters', async () => {
    const article = await s.knowledgeService.getArticleById(slug, articleId);

    expect(article).toMatchObject({
      id: articleId,
      status: 'published',
      helpful_count: 0,
      not_helpful_count: 0,
      author: { id: authorId, name: 'Admin', avatar },
    });
  });

  it('lists articles with their author', async () => {
    const result = await s.knowledgeService.listArticles(slug);

    expect(result.total).toBe(1);
    expect(result.articles[0].author).toMatchObject({ id: authorId, avatar });
  });
});
