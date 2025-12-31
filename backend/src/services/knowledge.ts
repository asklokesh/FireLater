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
             COALESCE(ka.assets, '[]'::json) as assets
      FROM kb_articles a
      LEFT JOIN users u ON a.author_id = u.id AND u.tenant_id = a.tenant_id
      LEFT JOIN users r ON a.reviewer_id = r.id AND r.tenant_id = a.tenant_id
      LEFT JOIN kb_categories c ON a.category_id = c.id AND c.tenant_id = a.tenant_id
      LEFT JOIN (
        SELECT article_id, json_agg(row_to_json(asset)) as assets
        FROM (
          SELECT article_id, id, name, type, url 
          FROM kb_assets 
          WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $2)
        ) asset
        GROUP BY article_id
      ) ka ON ka.article_id = a.id
      WHERE a.tenant_id = (SELECT id FROM tenants WHERE slug = $2)
        AND a.search_vector @@ plainto_tsquery('english', $1)
        AND ts_rank_cd(a.search_vector, plainto_tsquery('english', $1)) > 0.1
    `;