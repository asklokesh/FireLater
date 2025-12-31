  async listArticles(
    tenantSlug: string,
    filters: {
      category?: string;
      status?: string;
      search?: string;
    },
    pagination: { page: number; perPage: number }
  ) {
    const { page, perPage } = pagination;
    const offset = (page - 1) * perPage;

    let query = this.db('knowledge_articles')
      .where('tenant_slug', tenantSlug)
      .andWhere(qb => {
        if (filters.category) {
          qb.andWhere('category', filters.category);
        }
        if (filters.status) {
          qb.andWhere('status', filters.status);
        }
        // Use full-text search for better performance with proper indexing
        if (filters.search) {
          qb.andWhereRaw(
            "to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', ?)",
            [filters.search]
          );
        }
      });

    const totalQuery = query.clone();
    const [totalResult] = await totalQuery.count('id as count');
    const total = parseInt(totalResult.count as string, 10);

    const articles = await query
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .select('*');

    return {
      articles,
      total
    };
  }