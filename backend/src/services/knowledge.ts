import { redis } from '../config/redis.js';

export class KnowledgeService {
  private readonly ARTICLE_CACHE_PREFIX = 'kb_article';
  private readonly ARTICLE_CACHE_TTL = 300; // 5 minutes

  async getArticleById(tenantSlug: string, id: string): Promise<Article> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      // Support both UUID and article_number
      const idColumn = id.startsWith('KB-') ? 'article_number' : 'id';
      
      // Try to get from cache first
      const cacheKey = `${this.ARTICLE_CACHE_PREFIX}:${tenantSlug}:${id}`;
      const cachedArticle = await redis.get(cacheKey);
      if (cachedArticle) {
        return JSON.parse(cachedArticle) as Article;
      }
      
      const result = await pool.query(
        `SELECT a.*,
                u.name as author_name, u.email as author_email,
                r.name as reviewer_name,
                c.name as category_name,
                p.problem_number as related_problem_number,
                i.issue_number as related_issue_number
         FROM ${schema}.kb_articles a
         LEFT JOIN ${schema}.users u ON a.author_id = u.id
         LEFT JOIN ${schema}.users r ON a.reviewer_id = r.id
         LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
         LEFT JOIN ${schema}.problems p ON a.related_problem_id = p.id
         LEFT JOIN ${schema}.issues i ON a.related_issue_id = i.id
         WHERE a.${idColumn} = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Article', id);
      }

      const article = result.rows[0] as Article;
      
      // Cache the article
      await redis.setex(cacheKey, this.ARTICLE_CACHE_TTL, JSON.stringify(article));
      
      return article;
    } catch (error) {
      logger.error({ error, tenantSlug, id }, 'Failed to get article by ID');
      throw error;
    }
  }
}