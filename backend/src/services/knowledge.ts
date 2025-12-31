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

    // Fetch related assets for all articles in a single query
    if (articles.length > 0) {
      const articleIds = articles.map((article: any) => article.id);
      const assetsQuery = this.db('knowledge_article_assets as kaa')
        .leftJoin('assets as a', 'kaa.asset_id', 'a.id')
        .whereIn('kaa.article_id', articleIds)
        .select([
          'kaa.article_id',
          this.db.raw('json_agg(a.*) filter (where a.id is not null) as related_assets')
        ])
        .groupBy('kaa.article_id');
      
      const assetsResult = await assetsQuery;
      
      // Create a map of article_id to related_assets
      const assetsMap = new Map();
      assetsResult.forEach((assetRow: any) => {
        assetsMap.set(assetRow.article_id, assetRow.related_assets);
      });
      
      // Attach related_assets to each article
      articles.forEach((article: any) => {
        article.related_assets = assetsMap.get(article.id) || [];
      });
    } else {
      articles.forEach((article: any) => {
        article.related_assets = [];
      });
    }

    return {
      articles,
      total
    };
  }