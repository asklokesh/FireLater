import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

type ArticleStatus = 'draft' | 'review' | 'published' | 'archived';
type ArticleType = 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error';
type ArticleVisibility = 'public' | 'internal' | 'restricted';

interface CreateArticleParams {
  title: string;
  content: string;
  summary?: string;
  type?: ArticleType;
  visibility?: ArticleVisibility;
  categoryId?: string;
  tags?: string[];
  relatedProblemId?: string;
  relatedIssueId?: string;
  keywords?: string[];
}

interface UpdateArticleParams {
  title?: string;
  content?: string;
  summary?: string;
  type?: ArticleType;
  visibility?: ArticleVisibility;
  categoryId?: string;
  tags?: string[];
  keywords?: string[];
}

interface Article {
  id: string;
  article_number: string;
  title: string;
  slug: string;
  content: string;
  summary: string | null;
  type: ArticleType;
  status: ArticleStatus;
  visibility: ArticleVisibility;
  category_id: string | null;
  author_id: string;
  reviewer_id: string | null;
  published_at: Date | null;
  published_by: string | null;
  last_reviewed_at: Date | null;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  related_problem_id: string | null;
  related_issue_id: string | null;
  tags: string[] | null;
  keywords: string[] | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
  article_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ArticleFeedback {
  id: string;
  article_id: string;
  user_id: string;
  is_helpful: boolean;
  comment: string | null;
  created_at: Date;
}

export class KnowledgeService {
  // Article CRUD Operations
  async listArticles(tenantSlug: string, params: PaginationParams, filters?: {
    status?: ArticleStatus;
    type?: ArticleType;
    visibility?: ArticleVisibility;
    categoryId?: string;
    authorId?: string;
    search?: string;
    tag?: string;
    publishedOnly?: boolean;
  }): Promise<{ articles: Article[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClause += ` AND a.status = $${paramIndex++}`;
      values.push(filters.status);
    }
    if (filters?.type) {
      whereClause += ` AND a.type = $${paramIndex++}`;
      values.push(filters.type);
    }
    if (filters?.visibility) {
      whereClause += ` AND a.visibility = $${paramIndex++}`;
      values.push(filters.visibility);
    }
    if (filters?.categoryId) {
      whereClause += ` AND a.category_id = $${paramIndex++}`;
      values.push(filters.categoryId);
    }
    if (filters?.authorId) {
      whereClause += ` AND a.author_id = $${paramIndex++}`;
      values.push(filters.authorId);
    }
    if (filters?.tag) {
      whereClause += ` AND $${paramIndex++} = ANY(a.tags)`;
      values.push(filters.tag);
    }
    if (filters?.publishedOnly) {
      whereClause += ` AND a.status = 'published'`;
    }
    if (filters?.search) {
      whereClause += ` AND (
        a.title ILIKE $${paramIndex} OR
        a.content ILIKE $${paramIndex} OR
        a.summary ILIKE $${paramIndex} OR
        a.article_number ILIKE $${paramIndex} OR
        $${paramIndex++} = ANY(a.keywords)
      )`;
      values.push(`%${filters.search}%`);
    }

    const allowedSortColumns = ['created_at', 'updated_at', 'title', 'view_count', 'helpful_count', 'published_at', 'article_number'];
    const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'created_at';
    const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.kb_articles a ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

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
       ${whereClause}
       ORDER BY a.${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { articles: result.rows, total };
  }

  async getArticleById(tenantSlug: string, articleId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*,
              u.name as author_name, u.email as author_email,
              r.name as reviewer_name,
              c.name as category_name,
              p.problem_number as related_problem_number, p.title as related_problem_title,
              i.issue_number as related_issue_number, i.title as related_issue_title
       FROM ${schema}.kb_articles a
       LEFT JOIN ${schema}.users u ON a.author_id = u.id
       LEFT JOIN ${schema}.users r ON a.reviewer_id = r.id
       LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
       LEFT JOIN ${schema}.problems p ON a.related_problem_id = p.id
       LEFT JOIN ${schema}.issues i ON a.related_issue_id = i.id
       WHERE a.id = $1`,
      [articleId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', articleId);
    }

    return result.rows[0];
  }

  async getArticleBySlug(tenantSlug: string, slug: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*,
              u.name as author_name, u.email as author_email,
              r.name as reviewer_name,
              c.name as category_name
       FROM ${schema}.kb_articles a
       LEFT JOIN ${schema}.users u ON a.author_id = u.id
       LEFT JOIN ${schema}.users r ON a.reviewer_id = r.id
       LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
       WHERE a.slug = $1 AND a.status = 'published'`,
      [slug]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Article', slug);
    }

    return result.rows[0];
  }

  async createArticle(tenantSlug: string, authorId: string, params: CreateArticleParams): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const articleNumber = await this.generateArticleNumber(schema);
    const slug = this.generateSlug(params.title);

    const result = await pool.query(
      `INSERT INTO ${schema}.kb_articles (
        article_number, title, slug, content, summary, type, visibility,
        category_id, author_id, tags, keywords, related_problem_id, related_issue_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        articleNumber,
        params.title,
        slug,
        params.content,
        params.summary || null,
        params.type || 'how_to',
        params.visibility || 'internal',
        params.categoryId || null,
        authorId,
        params.tags || null,
        params.keywords || null,
        params.relatedProblemId || null,
        params.relatedIssueId || null,
      ]
    );

    const article = result.rows[0];

    // Record in history
    await this.recordArticleVersion(schema, article.id, authorId, 'created', article.content);

    logger.info({ articleId: article.id, articleNumber }, 'KB article created');
    return article;
  }

  async updateArticle(tenantSlug: string, articleId: string, params: UpdateArticleParams, userId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const existing = await this.getArticleById(tenantSlug, articleId);

    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(params.title);
      updates.push(`slug = $${paramIndex++}`);
      values.push(this.generateSlug(params.title));
    }
    if (params.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(params.content);
      updates.push(`version = version + 1`);
    }
    if (params.summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`);
      values.push(params.summary);
    }
    if (params.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(params.type);
    }
    if (params.visibility !== undefined) {
      updates.push(`visibility = $${paramIndex++}`);
      values.push(params.visibility);
    }
    if (params.categoryId !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      values.push(params.categoryId);
    }
    if (params.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(params.tags);
    }
    if (params.keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`);
      values.push(params.keywords);
    }

    values.push(articleId);

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    const article = result.rows[0];

    // Record version if content changed
    if (params.content !== undefined && params.content !== existing.content) {
      await this.recordArticleVersion(schema, articleId, userId, 'updated', params.content);
    }

    logger.info({ articleId }, 'KB article updated');
    return article;
  }

  async deleteArticle(tenantSlug: string, articleId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.kb_articles WHERE id = $1 RETURNING id`,
      [articleId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Article', articleId);
    }

    logger.info({ articleId }, 'KB article deleted');
  }

  // Article Status Management
  async submitForReview(tenantSlug: string, articleId: string, userId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const article = await this.getArticleById(tenantSlug, articleId);

    if (article.status !== 'draft') {
      throw new BadRequestError('Only draft articles can be submitted for review');
    }

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles
       SET status = 'review', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [articleId]
    );

    await this.recordArticleVersion(schema, articleId, userId, 'submitted_for_review');
    logger.info({ articleId }, 'KB article submitted for review');
    return result.rows[0];
  }

  async publishArticle(tenantSlug: string, articleId: string, userId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const article = await this.getArticleById(tenantSlug, articleId);

    if (!['draft', 'review'].includes(article.status)) {
      throw new BadRequestError('Article cannot be published from current status');
    }

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles
       SET status = 'published', published_at = NOW(), published_by = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [articleId, userId]
    );

    await this.recordArticleVersion(schema, articleId, userId, 'published');
    logger.info({ articleId }, 'KB article published');
    return result.rows[0];
  }

  async archiveArticle(tenantSlug: string, articleId: string, userId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles
       SET status = 'archived', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [articleId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Article', articleId);
    }

    await this.recordArticleVersion(schema, articleId, userId, 'archived');
    logger.info({ articleId }, 'KB article archived');
    return result.rows[0];
  }

  async revertToDraft(tenantSlug: string, articleId: string, userId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles
       SET status = 'draft', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [articleId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Article', articleId);
    }

    await this.recordArticleVersion(schema, articleId, userId, 'reverted_to_draft');
    return result.rows[0];
  }

  // View and Feedback tracking
  async incrementViewCount(tenantSlug: string, articleId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `UPDATE ${schema}.kb_articles SET view_count = view_count + 1 WHERE id = $1`,
      [articleId]
    );
  }

  async submitFeedback(tenantSlug: string, articleId: string, userId: string, isHelpful: boolean, comment?: string): Promise<ArticleFeedback> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if user already submitted feedback
    const existing = await pool.query(
      `SELECT id FROM ${schema}.kb_article_feedback WHERE article_id = $1 AND user_id = $2`,
      [articleId, userId]
    );

    if (existing.rows.length > 0) {
      // Update existing feedback
      const result = await pool.query(
        `UPDATE ${schema}.kb_article_feedback
         SET is_helpful = $3, comment = $4, created_at = NOW()
         WHERE article_id = $1 AND user_id = $2 RETURNING *`,
        [articleId, userId, isHelpful, comment || null]
      );
      return result.rows[0];
    }

    // Create new feedback
    const result = await pool.query(
      `INSERT INTO ${schema}.kb_article_feedback (article_id, user_id, is_helpful, comment)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [articleId, userId, isHelpful, comment || null]
    );

    // Update article helpful counts
    const countField = isHelpful ? 'helpful_count' : 'not_helpful_count';
    await pool.query(
      `UPDATE ${schema}.kb_articles SET ${countField} = ${countField} + 1 WHERE id = $1`,
      [articleId]
    );

    return result.rows[0];
  }

  // Category Operations
  async listCategories(tenantSlug: string): Promise<ArticleCategory[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM ${schema}.kb_articles a WHERE a.category_id = c.id AND a.status = 'published') as article_count
       FROM ${schema}.kb_categories c
       ORDER BY c.sort_order, c.name`
    );

    return result.rows;
  }

  async createCategory(tenantSlug: string, data: {
    name: string;
    description?: string;
    parentId?: string;
    icon?: string;
    sortOrder?: number;
  }): Promise<ArticleCategory> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const slug = this.generateSlug(data.name);

    const result = await pool.query(
      `INSERT INTO ${schema}.kb_categories (name, slug, description, parent_id, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.name, slug, data.description || null, data.parentId || null, data.icon || null, data.sortOrder || 0]
    );

    return result.rows[0];
  }

  async updateCategory(tenantSlug: string, categoryId: string, data: {
    name?: string;
    description?: string;
    parentId?: string | null;
    icon?: string;
    sortOrder?: number;
  }): Promise<ArticleCategory> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
      updates.push(`slug = $${paramIndex++}`);
      values.push(this.generateSlug(data.name));
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.parentId !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      values.push(data.parentId);
    }
    if (data.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(data.icon);
    }
    if (data.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(data.sortOrder);
    }

    values.push(categoryId);

    const result = await pool.query(
      `UPDATE ${schema}.kb_categories SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Category', categoryId);
    }

    return result.rows[0];
  }

  async deleteCategory(tenantSlug: string, categoryId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if category has articles
    const articleCount = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.kb_articles WHERE category_id = $1`,
      [categoryId]
    );

    if (parseInt(articleCount.rows[0].count, 10) > 0) {
      throw new BadRequestError('Cannot delete category with existing articles');
    }

    const result = await pool.query(
      `DELETE FROM ${schema}.kb_categories WHERE id = $1 RETURNING id`,
      [categoryId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Category', categoryId);
    }
  }

  // Article Version History
  async getArticleHistory(tenantSlug: string, articleId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.kb_article_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.article_id = $1
       ORDER BY h.created_at DESC`,
      [articleId]
    );

    return result.rows;
  }

  // Search
  async searchArticles(tenantSlug: string, query: string, params: PaginationParams): Promise<{ articles: Article[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    // Full-text search with ranking
    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM ${schema}.kb_articles a
       WHERE a.status = 'published' AND (
         a.title ILIKE $1 OR
         a.content ILIKE $1 OR
         a.summary ILIKE $1 OR
         $1 = ANY(a.keywords) OR
         $1 = ANY(a.tags)
       )`,
      [`%${query}%`]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT a.*,
              u.name as author_name,
              c.name as category_name,
              ts_rank(
                to_tsvector('english', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content, '')),
                plainto_tsquery('english', $1)
              ) as relevance
       FROM ${schema}.kb_articles a
       LEFT JOIN ${schema}.users u ON a.author_id = u.id
       LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
       WHERE a.status = 'published' AND (
         a.title ILIKE $2 OR
         a.content ILIKE $2 OR
         a.summary ILIKE $2 OR
         $2 = ANY(a.keywords) OR
         $2 = ANY(a.tags)
       )
       ORDER BY relevance DESC, a.view_count DESC
       LIMIT $3 OFFSET $4`,
      [query, `%${query}%`, params.perPage, offset]
    );

    return { articles: result.rows, total };
  }

  // Link article to problem/issue
  async linkToProblem(tenantSlug: string, articleId: string, problemId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles SET related_problem_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [articleId, problemId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Article', articleId);
    }

    return result.rows[0];
  }

  async linkToIssue(tenantSlug: string, articleId: string, issueId: string): Promise<Article> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.kb_articles SET related_issue_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [articleId, issueId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Article', articleId);
    }

    return result.rows[0];
  }

  // Get articles linked to a problem
  async getArticlesForProblem(tenantSlug: string, problemId: string): Promise<Article[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*, u.name as author_name, c.name as category_name
       FROM ${schema}.kb_articles a
       LEFT JOIN ${schema}.users u ON a.author_id = u.id
       LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
       WHERE a.related_problem_id = $1 AND a.status = 'published'
       ORDER BY a.helpful_count DESC, a.view_count DESC`,
      [problemId]
    );

    return result.rows;
  }

  // Get articles linked to an issue
  async getArticlesForIssue(tenantSlug: string, issueId: string): Promise<Article[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.*, u.name as author_name, c.name as category_name
       FROM ${schema}.kb_articles a
       LEFT JOIN ${schema}.users u ON a.author_id = u.id
       LEFT JOIN ${schema}.kb_categories c ON a.category_id = c.id
       WHERE a.related_issue_id = $1 AND a.status = 'published'
       ORDER BY a.helpful_count DESC, a.view_count DESC`,
      [issueId]
    );

    return result.rows;
  }

  // Private helper methods
  private async generateArticleNumber(schema: string): Promise<string> {
    try {
      const result = await pool.query(`SELECT ${schema}.next_id('KB') as article_number`);
      return result.rows[0].article_number;
    } catch {
      // Fallback if sequence doesn't exist
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${schema}.kb_articles`);
      const count = parseInt(countResult.rows[0].count, 10) + 1;
      return `KB-${String(count).padStart(5, '0')}`;
    }
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  private async recordArticleVersion(
    schema: string,
    articleId: string,
    userId: string,
    action: string,
    content?: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO ${schema}.kb_article_history (article_id, changed_by, action, content_snapshot)
       VALUES ($1, $2, $3, $4)`,
      [articleId, userId, action, content || null]
    );
  }
}

export const knowledgeService = new KnowledgeService();
