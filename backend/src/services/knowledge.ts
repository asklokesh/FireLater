import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { sanitizeMarkdown } from '../utils/contentSanitization.js';
import { cacheService } from '../utils/cache.js';

interface CreateArticleParams {
  title: string;
  content: string;
  summary?: string;
  type?: string;
  status?: string;
  visibility?: string;
  categoryId?: string;
  authorId: string;
  tags?: string[];
  keywords?: string[];
  relatedProblemId?: string;
  relatedIssueId?: string;
}

interface UpdateArticleParams {
  title?: string;
  content?: string;
  summary?: string;
  type?: string;
  status?: string;
  visibility?: string;
  categoryId?: string;
  reviewerId?: string;
  tags?: string[];
  keywords?: string[];
}

interface SearchFilters {
  q?: string;
  category?: string;
  status?: string;
  type?: string;
  visibility?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface FeedbackParams {
  isHelpful: boolean;
  comment?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class KnowledgeService {
  /**
   * Get all articles with pagination and filtering
   * Optimized to avoid N+1 queries by:
   * 1. Using LEFT JOINs to fetch category data in main query
   * 2. Using window function COUNT(*) OVER() to get total in single query
   * 3. Batch fetching author/reviewer details with single query
   * 4. Redis caching with 5-minute TTL to reduce database load
   */
  async listArticles(
    tenantSlug: string,
    filters: SearchFilters = {},
    pagination: PaginationParams = { page: 1, perPage: 20 }
  ) {
    const { page = 1, perPage = 20 } = pagination;

    // Generate cache key based on tenant, filters, and pagination
    const cacheKey = `${tenantSlug}:kb:articles:${JSON.stringify({
      filters,
      page,
      perPage,
    })}`;

    // Use cache with 5-minute TTL (300 seconds)
    return cacheService.getOrSet(
      cacheKey,
      async () => this.listArticlesUncached(tenantSlug, filters, pagination),
      { ttl: 300 }
    );
  }

  /**
   * Internal uncached implementation of listArticles
   * Called by listArticles when cache misses
   */
  private async listArticlesUncached(
    tenantSlug: string,
    filters: SearchFilters = {},
    pagination: PaginationParams = { page: 1, perPage: 20 }
  ) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { page = 1, perPage = 20 } = pagination;
    const offset = getOffset({ page, perPage });

    // Build optimized query with LEFT JOINs for category
    let query = `
      SELECT
        a.id,
        a.article_number,
        a.title,
        a.slug,
        a.content,
        a.summary,
        a.type,
        a.status,
        a.visibility,
        a.author_id,
        a.reviewer_id,
        a.published_at,
        a.published_by,
        a.last_reviewed_at,
        a.next_review_at,
        a.view_count,
        a.helpful_count,
        a.not_helpful_count,
        a.tags,
        a.keywords,
        a.version,
        a.created_at,
        a.updated_at,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.icon as category_icon,
        COUNT(*) OVER() as total_count
      FROM ${schema}.kb_articles a
      LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    // Apply filters
    if (filters.category) {
      paramCount++;
      query += ` AND a.category_id = $${paramCount}`;
      params.push(filters.category);
    }

    if (filters.status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.type) {
      paramCount++;
      query += ` AND a.type = $${paramCount}`;
      params.push(filters.type);
    }

    if (filters.visibility) {
      paramCount++;
      query += ` AND a.visibility = $${paramCount}`;
      params.push(filters.visibility);
    }

    if (filters.q) {
      paramCount++;
      query += ` AND (
        to_tsvector('english', COALESCE(a.title, '') || ' ' || COALESCE(a.summary, '') || ' ' || COALESCE(a.content, ''))
        @@ plainto_tsquery('english', $${paramCount})
      )`;
      params.push(filters.q);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      query += ` AND a.tags && $${paramCount}`;
      params.push(filters.tags);
    }

    // Order and paginate
    query += ` ORDER BY a.created_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(perPage);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const articlesResult = await pool.query(query, params);
    const articles = articlesResult.rows;
    const total = articles.length > 0 ? parseInt(articles[0].total_count, 10) : 0;

    // Remove total_count from each article
    articles.forEach((article: any) => {
      delete article.total_count;
    });

    // Batch fetch author and reviewer details if articles exist
    if (articles.length > 0) {
      const userIds = new Set<string>();
      articles.forEach((article: any) => {
        if (article.author_id) userIds.add(article.author_id);
        if (article.reviewer_id) userIds.add(article.reviewer_id);
        if (article.published_by) userIds.add(article.published_by);
      });

      if (userIds.size > 0) {
        const usersResult = await pool.query(
          `SELECT id, name, email, avatar FROM ${schema}.users WHERE id = ANY($1)`,
          [Array.from(userIds)]
        );

        const usersMap = new Map();
        usersResult.rows.forEach((user: any) => {
          usersMap.set(user.id, user);
        });

        // Attach user details to articles
        articles.forEach((article: any) => {
          article.author = article.author_id ? usersMap.get(article.author_id) || null : null;
          article.reviewer = article.reviewer_id ? usersMap.get(article.reviewer_id) || null : null;
          article.publisher = article.published_by ? usersMap.get(article.published_by) || null : null;

          // Clean up raw IDs
          delete article.author_id;
          delete article.reviewer_id;
          delete article.published_by;
        });
      }
    }

    return {
      articles,
      total,
      page,
      perPage,
      pages: Math.ceil(total / perPage)
    };
  }

  /**
   * Get single article by ID
   * Optimized with single query using LEFT JOINs
   * Cached with 5-minute TTL to reduce database load
   */
  async getArticleById(tenantSlug: string, articleId: string) {
    const cacheKey = `${tenantSlug}:kb:article:${articleId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this.getArticleByIdUncached(tenantSlug, articleId),
      { ttl: 300 }
    );
  }

  /**
   * Internal uncached implementation of getArticleById
   */
  private async getArticleByIdUncached(tenantSlug: string, articleId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT
        a.*,
        c.id as category_id,
        c.name as category_name,
        c.slug as category_slug,
        c.icon as category_icon,
        c.description as category_description,
        au.id as author_id,
        au.name as author_name,
        au.email as author_email,
        au.avatar as author_avatar,
        rv.id as reviewer_id,
        rv.name as reviewer_name,
        rv.email as reviewer_email,
        pb.id as publisher_id,
        pb.name as publisher_name
      FROM ${schema}.kb_articles a
      LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
      LEFT JOIN ${schema}.users au ON a.author_id = au.id
      LEFT JOIN ${schema}.users rv ON a.reviewer_id = rv.id
      LEFT JOIN ${schema}.users pb ON a.published_by = pb.id
      WHERE a.id = $1`,
      [articleId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    const article = result.rows[0];

    // Restructure nested objects
    const formattedArticle = {
      ...article,
      category: article.category_id ? {
        id: article.category_id,
        name: article.category_name,
        slug: article.category_slug,
        icon: article.category_icon,
        description: article.category_description
      } : null,
      author: article.author_id ? {
        id: article.author_id,
        name: article.author_name,
        email: article.author_email,
        avatar: article.author_avatar
      } : null,
      reviewer: article.reviewer_id ? {
        id: article.reviewer_id,
        name: article.reviewer_name,
        email: article.reviewer_email
      } : null,
      publisher: article.publisher_id ? {
        id: article.publisher_id,
        name: article.publisher_name
      } : null
    };

    // Clean up flattened fields
    delete formattedArticle.category_id;
    delete formattedArticle.category_name;
    delete formattedArticle.category_slug;
    delete formattedArticle.category_icon;
    delete formattedArticle.category_description;
    delete formattedArticle.author_id;
    delete formattedArticle.author_name;
    delete formattedArticle.author_email;
    delete formattedArticle.author_avatar;
    delete formattedArticle.reviewer_id;
    delete formattedArticle.reviewer_name;
    delete formattedArticle.reviewer_email;
    delete formattedArticle.publisher_id;
    delete formattedArticle.publisher_name;

    return formattedArticle;
  }

  /**
   * Create new article
   */
  async createArticle(tenantSlug: string, params: CreateArticleParams) {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Sanitize content to prevent XSS attacks
    const sanitizedContent = sanitizeMarkdown(params.content);

    // Get next article number
    const seqResult = await pool.query(
      `UPDATE ${schema}.id_sequences
       SET current_value = current_value + 1
       WHERE entity_type = 'KB'
       RETURNING current_value`
    );
    const articleNumber = `KB${String(seqResult.rows[0].current_value).padStart(6, '0')}`;

    // Generate slug from title
    const slug = params.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // One statement, so the article and its first history entry are saved together
    const result = await pool.query(
      `WITH created AS (
        INSERT INTO ${schema}.kb_articles (
          article_number, title, slug, content, summary,
          type, status, visibility, category_id, author_id,
          tags, keywords, related_problem_id, related_issue_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      ), history AS (
        INSERT INTO ${schema}.kb_article_history
          (article_id, version, changed_by, action, content_snapshot, changes)
        SELECT c.id, c.version, c.author_id, 'created', c.content,
          (SELECT jsonb_object_agg(f.key, jsonb_build_object('from', 'null'::jsonb, 'to', f.value))
             FROM jsonb_each(to_jsonb(c.*)) f
            WHERE f.key IN ('title', 'content', 'summary', 'type', 'status', 'visibility',
                            'category_id', 'tags', 'keywords', 'related_problem_id', 'related_issue_id')
              AND f.value NOT IN ('null'::jsonb, '[]'::jsonb))
        FROM created c
      )
      SELECT * FROM created`,
      [
        articleNumber,
        params.title,
        slug,
        sanitizedContent,
        params.summary || null,
        params.type || 'how_to',
        params.status || 'draft',
        params.visibility || 'internal',
        params.categoryId || null,
        params.authorId,
        params.tags || [],
        params.keywords || [],
        params.relatedProblemId || null,
        params.relatedIssueId || null
      ]
    );

    logger.info(`Created KB article ${articleNumber} in tenant ${tenantSlug}`);

    // Invalidate knowledge base cache for this tenant
    await this.invalidateCache(tenantSlug);

    return result.rows[0];
  }

  /**
   * Update article, increment its version and record the change in its history
   */
  async updateArticle(
    tenantSlug: string,
    articleId: string,
    params: UpdateArticleParams,
    userId?: string
  ) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (params.title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(params.title);
    }

    if (params.content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      // Sanitize content to prevent XSS attacks
      values.push(sanitizeMarkdown(params.content));
    }

    if (params.summary !== undefined) {
      paramCount++;
      updates.push(`summary = $${paramCount}`);
      values.push(params.summary);
    }

    if (params.type !== undefined) {
      paramCount++;
      updates.push(`type = $${paramCount}`);
      values.push(params.type);
    }

    if (params.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(params.status);
    }

    if (params.visibility !== undefined) {
      paramCount++;
      updates.push(`visibility = $${paramCount}`);
      values.push(params.visibility);
    }

    if (params.categoryId !== undefined) {
      paramCount++;
      updates.push(`category_id = $${paramCount}`);
      values.push(params.categoryId);
    }

    if (params.reviewerId !== undefined) {
      paramCount++;
      updates.push(`reviewer_id = $${paramCount}`);
      values.push(params.reviewerId);
    }

    if (params.tags !== undefined) {
      paramCount++;
      updates.push(`tags = $${paramCount}`);
      values.push(params.tags);
    }

    if (params.keywords !== undefined) {
      paramCount++;
      updates.push(`keywords = $${paramCount}`);
      values.push(params.keywords);
    }

    if (updates.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    updates.push(`updated_at = NOW()`);

    updates.push(`version = COALESCE(a.version, 1) + 1`);

    values.push(articleId, userId ?? null);
    const idParam = paramCount + 1;
    const userParam = paramCount + 2;

    // One statement: the row lock makes `previous` the exact state being replaced,
    // also under concurrent edits, and the history entry is saved with the update.
    const query = `
      WITH previous AS (
        SELECT * FROM ${schema}.kb_articles WHERE id = $${idParam} FOR UPDATE
      ), updated AS (
        UPDATE ${schema}.kb_articles a
        SET ${updates.join(', ')}
        FROM previous
        WHERE a.id = previous.id
        RETURNING a.*
      ), history AS (
        INSERT INTO ${schema}.kb_article_history
          (article_id, version, changed_by, action, content_snapshot, changes, created_at)
        SELECT u.id, u.version, $${userParam}::uuid, 'updated', u.content,
          COALESCE(
            (SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
               FROM jsonb_each(to_jsonb(u.*)) n
               JOIN jsonb_each(to_jsonb(p.*)) o ON o.key = n.key
              WHERE n.value IS DISTINCT FROM o.value
                AND n.key NOT IN ('version', 'updated_at')),
            '{}'::jsonb
          ),
          clock_timestamp()
        FROM updated u
        JOIN previous p ON p.id = u.id
      )
      SELECT * FROM updated
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    logger.info(`Updated KB article ${articleId} in tenant ${tenantSlug}`);

    // Invalidate knowledge base cache for this tenant
    await this.invalidateCache(tenantSlug);

    return result.rows[0];
  }

  /**
   * Delete article
   */
  async deleteArticle(tenantSlug: string, articleId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.kb_articles WHERE id = $1 RETURNING article_number`,
      [articleId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    logger.info(`Deleted KB article ${result.rows[0].article_number} in tenant ${tenantSlug}`);

    // Invalidate knowledge base cache for this tenant
    await this.invalidateCache(tenantSlug);

    return { success: true };
  }

  /**
   * Save a user's helpful / not helpful vote on a published article.
   * A user has one vote per article; voting again replaces vote and comment.
   * The article's counters are recounted from the stored votes in the same
   * transaction.
   */
  async submitFeedback(
    tenantSlug: string,
    articleId: string,
    userId: string,
    params: FeedbackParams
  ) {
    const schema = tenantService.getSchemaName(tenantSlug);

    if (!UUID_RE.test(articleId)) {
      throw new NotFoundError('Article', articleId);
    }

    const client = await pool.connect();
    let saved;
    try {
      await client.query('BEGIN');

      // Locking the article serializes votes on it, so no recount misses a vote
      const article = await client.query(
        `SELECT status FROM ${schema}.kb_articles WHERE id = $1 FOR UPDATE`,
        [articleId]
      );

      if (article.rows.length === 0) {
        throw new NotFoundError('Article', articleId);
      }

      if (article.rows[0].status !== 'published') {
        throw new BadRequestError('Feedback can only be given on published articles');
      }

      const feedback = await client.query(
        `INSERT INTO ${schema}.kb_article_feedback (article_id, user_id, is_helpful, comment)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (article_id, user_id) DO UPDATE
         SET is_helpful = EXCLUDED.is_helpful, comment = EXCLUDED.comment, created_at = NOW()
         RETURNING *`,
        [articleId, userId, params.isHelpful, params.comment || null]
      );

      const counts = await client.query(
        `UPDATE ${schema}.kb_articles
         SET (helpful_count, not_helpful_count) = (
           SELECT COUNT(*) FILTER (WHERE is_helpful), COUNT(*) FILTER (WHERE NOT is_helpful)
           FROM ${schema}.kb_article_feedback
           WHERE article_id = $1
         )
         WHERE id = $1
         RETURNING helpful_count, not_helpful_count`,
        [articleId]
      );

      await client.query('COMMIT');
      saved = { ...feedback.rows[0], ...counts.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Cached articles and lists carry the counters
    await this.invalidateCache(tenantSlug);

    return saved;
  }

  /**
   * Get the version history of an article, newest first
   * Cached with 5-minute TTL, invalidated with the other KB caches
   */
  async getArticleHistory(tenantSlug: string, articleId: string) {
    if (!UUID_RE.test(articleId)) {
      throw new NotFoundError('Article', articleId);
    }

    const cacheKey = `${tenantSlug}:kb:history:${articleId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this.getArticleHistoryUncached(tenantSlug, articleId),
      { ttl: 300 }
    );
  }

  /**
   * Internal uncached implementation of getArticleHistory
   */
  private async getArticleHistoryUncached(tenantSlug: string, articleId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const article = await pool.query(
      `SELECT id FROM ${schema}.kb_articles WHERE id = $1`,
      [articleId]
    );

    if (article.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.kb_article_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.article_id = $1
       ORDER BY h.version DESC, h.created_at DESC`,
      [articleId]
    );

    return result.rows;
  }

  /**
   * Search articles using full-text search
   * Optimized with GIN index on tsvector
   */
  async searchArticles(tenantSlug: string, filters: SearchFilters) {
    return this.listArticles(tenantSlug, filters);
  }

  /**
   * Get all categories
   * Optimized to fetch parent categories in single query
   * Cached with 10-minute TTL (admin-configured data)
   */
  async listCategories(tenantSlug: string) {
    const cacheKey = `${tenantSlug}:kb:categories:list`;

    return cacheService.getOrSet(
      cacheKey,
      async () => this.listCategoriesUncached(tenantSlug),
      { ttl: 600 }
    );
  }

  /**
   * Internal uncached implementation of listCategories
   */
  private async listCategoriesUncached(tenantSlug: string) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT
        c.*,
        p.id as parent_id,
        p.name as parent_name,
        p.slug as parent_slug,
        COUNT(a.id) as article_count
      FROM ${schema}.kb_categories c
      LEFT JOIN ${schema}.kb_categories p ON c.parent_id = p.id
      LEFT JOIN ${schema}.kb_articles a ON a.category_id = c.id
      GROUP BY c.id, p.id, p.name, p.slug
      ORDER BY c.sort_order ASC, c.name ASC`
    );

    const categories = result.rows.map((cat: any) => ({
      ...cat,
      parent: cat.parent_id ? {
        id: cat.parent_id,
        name: cat.parent_name,
        slug: cat.parent_slug
      } : null
    }));

    // Clean up flattened fields
    categories.forEach((cat: any) => {
      delete cat.parent_id;
      delete cat.parent_name;
      delete cat.parent_slug;
    });

    return categories;
  }

  /**
   * Increment view count
   */
  async incrementViewCount(tenantSlug: string, articleId: string) {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `UPDATE ${schema}.kb_articles SET view_count = view_count + 1 WHERE id = $1`,
      [articleId]
    );
  }

  /**
   * Invalidate all knowledge base cache entries for a tenant
   * Called after create/update/delete operations to ensure cache consistency
   * Clears article lists, individual articles, and category caches
   */
  private async invalidateCache(tenantSlug: string): Promise<void> {
    try {
      // Invalidate all KB caches for tenant (articles, categories)
      // Cache keys: cache:{tenantSlug}:kb:articles:*, cache:{tenantSlug}:kb:article:*, cache:{tenantSlug}:kb:categories:*
      const deleted = await cacheService.invalidateTenant(tenantSlug, 'kb');
      logger.debug(
        { tenantSlug, deletedKeys: deleted },
        'Invalidated knowledge base cache'
      );
    } catch (error) {
      // Log error but don't fail the operation
      logger.error(
        { err: error, tenantSlug },
        'Failed to invalidate knowledge base cache'
      );
    }
  }
}

export const knowledgeService = new KnowledgeService();
