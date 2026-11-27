import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
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
  /** User making the change; recorded in the version history */
  updatedBy?: string;
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

const uuidSchema = z.string().uuid();

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

    const client = await pool.connect();
    let article: any;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO ${schema}.kb_articles (
          article_number, title, slug, content, summary,
          type, status, visibility, category_id, author_id,
          tags, keywords, related_problem_id, related_issue_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
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
      article = result.rows[0];

      const values: Record<string, unknown> = {
        title: article.title,
        summary: article.summary,
        type: article.type,
        status: article.status,
        visibility: article.visibility,
        categoryId: article.category_id,
        tags: article.tags,
        keywords: article.keywords,
      };
      await client.query(
        `INSERT INTO ${schema}.kb_article_history
           (article_id, version, changed_by, action, content_snapshot, changes)
         VALUES ($1, $2, $3, 'created', $4, $5)`,
        [
          article.id,
          article.version,
          params.authorId,
          article.content,
          JSON.stringify({ fields: ['content', ...Object.keys(values)], values }),
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    logger.info(`Created KB article ${articleNumber} in tenant ${tenantSlug}`);

    // Invalidate knowledge base cache for this tenant
    await this.invalidateCache(tenantSlug);

    return article;
  }

  /**
   * Update article
   */
  async updateArticle(tenantSlug: string, articleId: string, params: UpdateArticleParams) {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const values: any[] = [];
    // API field name -> column, for the history entry
    const changed: Record<string, string> = {};
    let paramCount = 0;

    const set = (field: string, column: string, value: unknown) => {
      paramCount++;
      updates.push(`${column} = $${paramCount}`);
      values.push(value);
      changed[field] = column;
    };

    if (params.title !== undefined) set('title', 'title', params.title);
    // Sanitize content to prevent XSS attacks
    if (params.content !== undefined) set('content', 'content', sanitizeMarkdown(params.content));
    if (params.summary !== undefined) set('summary', 'summary', params.summary);
    if (params.type !== undefined) set('type', 'type', params.type);
    if (params.status !== undefined) set('status', 'status', params.status);
    if (params.visibility !== undefined) set('visibility', 'visibility', params.visibility);
    if (params.categoryId !== undefined) set('categoryId', 'category_id', params.categoryId);
    if (params.reviewerId !== undefined) set('reviewerId', 'reviewer_id', params.reviewerId);
    if (params.tags !== undefined) set('tags', 'tags', params.tags);
    if (params.keywords !== undefined) set('keywords', 'keywords', params.keywords);

    if (updates.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`version = COALESCE(version, 1) + 1`);

    paramCount++;
    values.push(articleId);

    const client = await pool.connect();
    let article: any;
    try {
      await client.query('BEGIN');

      // Lock the row so concurrent edits get distinct versions and accurate before/after values
      const beforeResult = await client.query(
        `SELECT * FROM ${schema}.kb_articles WHERE id = $1 FOR UPDATE`,
        [articleId]
      );
      if (beforeResult.rows.length === 0) {
        throw new NotFoundError('Article', articleId);
      }
      const before = beforeResult.rows[0];

      const result = await client.query(
        `UPDATE ${schema}.kb_articles
         SET ${updates.join(', ')}
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      article = result.rows[0];

      // Record only the fields whose value actually changed; content is kept in
      // content_snapshot rather than the diff
      const fields = Object.keys(changed).filter(
        (field) => !isDeepStrictEqual(before[changed[field]], article[changed[field]])
      );
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of fields) {
        if (field === 'content') continue;
        diff[field] = { from: before[changed[field]], to: article[changed[field]] };
      }
      await client.query(
        `INSERT INTO ${schema}.kb_article_history
           (article_id, version, changed_by, action, content_snapshot, changes)
         VALUES ($1, $2, $3, 'updated', $4, $5)`,
        [
          article.id,
          article.version,
          params.updatedBy || null,
          article.content,
          JSON.stringify({ fields, values: diff }),
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    logger.info(`Updated KB article ${articleId} in tenant ${tenantSlug}`);

    // Invalidate knowledge base cache for this tenant
    await this.invalidateCache(tenantSlug);

    return article;
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
   * Record a helpful / not helpful vote. One vote per user per article:
   * a repeat vote replaces the earlier one. The article counters are
   * recomputed from the stored votes in the same transaction.
   */
  async submitFeedback(
    tenantSlug: string,
    articleId: string,
    userId: string,
    isHelpful: boolean,
    comment?: string
  ) {
    // Ids are UUIDs; anything else cannot name an article (and would make PostgreSQL raise 22P02)
    if (!uuidSchema.safeParse(articleId).success) {
      throw new NotFoundError('Article', articleId);
    }

    const schema = tenantService.getSchemaName(tenantSlug);

    const client = await pool.connect();
    let result: any;
    try {
      await client.query('BEGIN');

      // Row lock serializes concurrent votes on the same article
      const articleResult = await client.query(
        `SELECT status FROM ${schema}.kb_articles WHERE id = $1 FOR UPDATE`,
        [articleId]
      );
      if (articleResult.rows.length === 0) {
        throw new NotFoundError('Article', articleId);
      }
      if (articleResult.rows[0].status !== 'published') {
        throw new BadRequestError('Feedback can only be submitted on published articles');
      }

      const feedbackResult = await client.query(
        `INSERT INTO ${schema}.kb_article_feedback (article_id, user_id, is_helpful, comment)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (article_id, user_id)
         DO UPDATE SET is_helpful = EXCLUDED.is_helpful, comment = EXCLUDED.comment, created_at = NOW()
         RETURNING *`,
        [articleId, userId, isHelpful, comment || null]
      );

      const countsResult = await client.query(
        `UPDATE ${schema}.kb_articles a
         SET helpful_count = c.helpful, not_helpful_count = c.not_helpful
         FROM (
           SELECT COUNT(*) FILTER (WHERE is_helpful)::int AS helpful,
                  COUNT(*) FILTER (WHERE NOT is_helpful)::int AS not_helpful
           FROM ${schema}.kb_article_feedback WHERE article_id = $1
         ) c
         WHERE a.id = $1
         RETURNING a.helpful_count, a.not_helpful_count`,
        [articleId]
      );

      await client.query('COMMIT');
      result = {
        ...feedbackResult.rows[0],
        helpful_count: countsResult.rows[0].helpful_count,
        not_helpful_count: countsResult.rows[0].not_helpful_count,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.invalidateCache(tenantSlug);

    return result;
  }

  /**
   * Version history of an article, newest first
   */
  async getArticleHistory(tenantSlug: string, articleId: string) {
    if (!uuidSchema.safeParse(articleId).success) {
      throw new NotFoundError('Article', articleId);
    }

    const schema = tenantService.getSchemaName(tenantSlug);

    const exists = await pool.query(
      `SELECT 1 FROM ${schema}.kb_articles WHERE id = $1`,
      [articleId]
    );
    if (exists.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    const result = await pool.query(
      `SELECT h.id, h.article_id, h.version, h.changed_by, u.name AS changed_by_name,
              h.action, h.content_snapshot, h.changes, h.created_at
       FROM ${schema}.kb_article_history h
       LEFT JOIN ${schema}.users u ON u.id = h.changed_by
       WHERE h.article_id = $1
       ORDER BY h.version DESC NULLS LAST, h.created_at DESC, h.id DESC`,
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
