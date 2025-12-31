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

    let query = this.db('knowledge_articles as ka')
      .leftJoin('knowledge_categories as kc', 'ka.category', 'kc.id')
      .where('ka.tenant_slug', tenantSlug)
      .andWhere(qb => {
        if (filters.category) {
          qb.andWhere('ka.category', filters.category);
        }
        if (filters.status) {
          qb.andWhere('ka.status', filters.status);
        }
        // Use full-text search for better performance with proper indexing
        if (filters.search) {
          qb.andWhereRaw(
            "to_tsvector('english', ka.title || ' ' || ka.content) @@ plainto_tsquery('english', ?)",
            [filters.search]
          );
        }
      });

    const totalQuery = query.clone();
    const [totalResult] = await totalQuery.count('ka.id as count');
    const total = parseInt(totalResult.count as string, 10);

    const articles = await query
      .orderBy('ka.created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .select([
        'ka.*',
        'kc.name as category_name',
        'kc.description as category_description'
      ]);

    return {
      articles,
      total
    };
  }