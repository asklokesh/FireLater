import { databaseService } from './database.js';

  async getArticleById(tenantSlug: string, id: string): Promise<Article> {
    try {
      // Support both UUID and article_number
      const idColumn = id.startsWith('KB-') ? 'article_number' : 'id';
      
      // Try to get from cache first - include tenant in cache key for proper isolation
      const cacheKey = `${this.ARTICLE_CACHE_PREFIX}:${tenantSlug}:${idColumn}:${id}`;
      const cachedArticle = await redis.get(cacheKey);
      if (cachedArticle) {
        return JSON.parse(cachedArticle) as Article;
      }
      
      // Use explicit tenant filtering with proper index usage
      const result = await databaseService.executeQuery(
        `SELECT a.*,
                u.name as author_name, u.email as author_email,
                r.name as reviewer_name,
                c.id as category_id, c.name as category_name, c.description as category_description,
                p.problem_number as related_problem_number,
                i.issue_number as related_issue_number
         FROM kb_articles a
         LEFT JOIN users u ON a.author_id = u.id AND u.tenant_id = a.tenant_id
         LEFT JOIN users r ON a.reviewer_id = r.id AND r.tenant_id = a.tenant_id
         LEFT JOIN kb_categories c ON a.category_id = c.id AND c.tenant_id = a.tenant_id
         LEFT JOIN problems p ON a.related_problem_id = p.id AND p.tenant_id = a.tenant_id
         LEFT JOIN issues i ON a.related_issue_id = i.id AND i.tenant_id = a.tenant_id
         WHERE a.${idColumn} = $1 AND a.tenant_id = (SELECT id FROM tenants WHERE slug = $2)`,
        [id, tenantSlug]
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