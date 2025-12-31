  async searchArticles(
    tenantSlug: string,
    query: string,
    pagination: PaginationParams,
    filters?: { categoryId?: string; status?: string }
  ): Promise<{ articles: unknown[]; total: number }> {
    const offset = getOffset(pagination);
    
    // Use PostgreSQL full-text search with asset aggregation
    let searchQuery = `
      SELECT a.*,
             u.name as author_name, u.email as author_email,
             r.name as reviewer_name,
             c.id as category_id, c.name as category_name,
             ts_rank_cd(a.search_vector, plainto_tsquery('english', $1)) as rank,
             COALESCE(
               (SELECT json_agg(row_to_json(asset)) 
                FROM (
                  SELECT id, name, type, url 
                  FROM kb_assets 
                  WHERE article_id = a.id AND tenant_id = a.tenant_id
                ) asset
               ), '[]'::json
             ) as assets
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id AND u.tenant_id = a.tenant_id
      LEFT JOIN users r ON a.reviewer_id = r.id AND r.tenant_id = a.tenant_id
      LEFT JOIN kb_categories c ON a.category_id = c.id AND c.tenant_id = a.tenant_id
      WHERE a.tenant_id = (SELECT id FROM tenants WHERE slug = $2)
        AND a.search_vector @@ plainto_tsquery('english', $1)
    `;
    
    const params: unknown[] = [query, tenantSlug];
    let paramIndex = 3;
    
    if (filters?.categoryId) {
      searchQuery += ` AND a.category_id = $${paramIndex++}`;
      params.push(filters.categoryId);
    }
    
    if (filters?.status) {
      searchQuery += ` AND a.status = $${paramIndex++}`;
      params.push(filters.status);
    }
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM kb_articles a
      WHERE a.tenant_id = (SELECT id FROM tenants WHERE slug = $2)
        AND a.search_vector @@ plainto_tsquery('english', $1)
    `;
    
    const countParams = [query, tenantSlug];
    if (filters?.categoryId) {
      countQuery += ` AND a.category_id = $3`;
      countParams.push(filters.categoryId);
    }
    if (filters?.status) {
      const index = filters?.categoryId ? 4 : 3;
      countQuery += ` AND a.status = $${index}`;
      countParams.push(filters.status);
    }
    
    const countResult = await databaseService.executeQuery(
      countQuery,
      countParams
    );
    
    const total = parseInt(countResult.rows[0]?.total || '0', 10);
    
    // Complete search query with ordering and pagination
    searchQuery += `
      ORDER BY rank DESC, a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(pagination.perPage, offset);
    
    const result = await databaseService.executeQuery(
      searchQuery,
      params
    );
    
    return { articles: result.rows, total };
  }