import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { sanitizeMarkdown, ContentType } from '../utils/contentSanitization.js';

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

class KnowledgeService {
  /**
   * Get all articles with pagination and filtering
   * Optimized to avoid N+1 queries by:
   * 1. Using LEFT JOINs to fetch category data in main query
   * 2. Using window function COUNT(*) OVER() to get total in single query
   * 3. Batch fetching author/reviewer details with single query
   */
  async listArticles(
    tenantSlug: string,
    filters: SearchFilters = {},
    pagination: PaginationParams = { page: 1, perPage: 20 }
  ) {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { page = 1, perPage = 20 } = pagination;
    const offset = getOffset(page, perPage);

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
   */
  async getArticleById(tenantSlug: string, articleId: string) {
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

    const result = await pool.query(
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

    logger.info(`Created KB article ${articleNumber} in tenant ${tenantSlug}`);

    return result.rows[0];
  }

  /**
   * Update article
   */
  async updateArticle(tenantSlug: string, articleId: string, params: UpdateArticleParams) {
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

    paramCount++;
    values.push(articleId);

    const query = `
      UPDATE ${schema}.kb_articles
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    logger.info(`Updated KB article ${articleId} in tenant ${tenantSlug}`);

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

    return { success: true };
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
   */
  async listCategories(tenantSlug: string) {
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
}

export const knowledgeService = new KnowledgeService();
