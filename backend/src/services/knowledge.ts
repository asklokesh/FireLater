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
    try {
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

      return { articles: result.rows as Article[], total };
    } catch (error) {
      logger.error({ error, tenantSlug, params, filters }, 'Failed to list articles');
      throw error;
    }
  }

  async getArticleById(tenantSlug: string, id: string): Promise<Article> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      // Support both UUID and article_number
      const idColumn = id.startsWith('KB-') ? 'article_number' : 'id';
      
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

      return result.rows[0] as Article;
    } catch (error) {
      logger.error({ error, tenantSlug, id }, 'Failed to get article by ID');
      throw error;
    }
  }

  async createArticle(tenantSlug: string, userId: string, params: CreateArticleParams): Promise<Article> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      // Generate slug from title
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100);
      
      const result = await pool.query(
        `INSERT INTO ${schema}.kb_articles (
          title, slug, content, summary, type, visibility,
          category_id, author_id, tags, related_problem_id,
          related_issue_id, keywords
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          params.title,
          slug,
          params.content,
          params.summary || null,
          params.type || 'how_to',
          params.visibility || 'internal',
          params.categoryId || null,
          userId,
          params.tags ? JSON.stringify(params.tags) : null,
          params.relatedProblemId || null,
          params.relatedIssueId || null,
          params.keywords ? JSON.stringify(params.keywords) : null
        ]
      );

      return result.rows[0] as Article;
    } catch (error) {
      logger.error({ error, tenantSlug, userId, params }, 'Failed to create article');
      throw error;
    }
  }

  async updateArticle(tenantSlug: string, id: string, userId: string, params: UpdateArticleParams): Promise<Article> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      const existing = await this.getArticleById(tenantSlug, id);
      
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;
      
      const fieldMap: Record<string, string> = {
        title: 'title',
        content: 'content',
        summary: 'summary',
        type: 'type',
        visibility: 'visibility',
        categoryId: 'category_id',
        tags: 'tags',
        keywords: 'keywords'
      };
      
      for (const [key, column] of Object.entries(fieldMap)) {
        if (params[key as keyof UpdateArticleParams] !== undefined) {
          fields.push(`${column} = $${paramIndex++}`);
          const value = params[key as keyof UpdateArticleParams];
          values.push(
            ['tags', 'keywords'].includes(key) && Array.isArray(value) 
              ? JSON.stringify(value) 
              : value
          );
        }
      }
      
      if (fields.length === 0) {
        return existing;
      }
      
      // Handle slug regeneration if title changed
      if (params.title) {
        const slug = params.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 100);
        fields.push(`slug = $${paramIndex++}`);
        values.push(slug);
      }
      
      fields.push(`updated_at = NOW()`);
      fields.push(`version = version + 1`);
      values.push(id);
      
      const result = await pool.query(
        `UPDATE ${schema}.kb_articles 
         SET ${fields.join(', ')} 
         WHERE id = $${paramIndex} 
         RETURNING *`,
        values
      );
      
      return result.rows[0] as Article;
    } catch (error) {
      logger.error({ error, tenantSlug, id, userId, params }, 'Failed to update article');
      throw error;
    }
  }

  async deleteArticle(tenantSlug: string, id: string): Promise<void> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      const result = await pool.query(
        `UPDATE ${schema}.kb_articles 
         SET status = 'archived', updated_at = NOW() 
         WHERE id = $1`,
        [id]
      );
      
      if (result.rowCount === 0) {
        throw new NotFoundError('Article', id);
      }
    } catch (error) {
      logger.error({ error, tenantSlug, id }, 'Failed to delete article');
      throw error;
    }
  }

  async publishArticle(tenantSlug: string, id: string, userId: string): Promise<Article> {
    try {
      const schema = tenantService.getSchemaName(tenantSlug);
      
      const result = await pool.query(
        `UPDATE ${schema}.kb_articles 
         SET status = 'published', 
             published_at = NOW(), 
             published_by = $1, 
             updated_at = NOW(),
             version = version + 1
         WHERE id = $2 
         RETURNING *`,
        [userId, id]
      );
      
      if (result.rows.length === 0) {
        throw new NotFoundError('Article', id);
      }
      
      return result.rows[0] as Article;
    } catch (error) {
      logger.error({ error, tenantSlug, id, userId }, 'Failed to publish article');
      throw error;
    }
  }
}