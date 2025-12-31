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

    // Optimize main query by selecting only needed fields and avoiding redundant joins
    let query = this.db('knowledge_articles as ka')
      .where('ka.tenant_slug', tenantSlug)
      .andWhere(qb => {
        if (filters.category) {
          qb.andWhere('ka.category', filters.category);
        }
        if (filters.status) {
          qb.andWhere('ka.status', filters.status);
        }
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

    // Select only necessary fields to improve performance
    const articles = await query
      .orderBy('ka.created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .select([
        'ka.id',
        'ka.title',
        'ka.content',
        'ka.status',
        'ka.category',
        'ka.created_at',
        'ka.updated_at'
      ]);

    // Fetch category names in a single query for all articles
    if (articles.length > 0) {
      const categoryIds = [...new Set(articles.map((article: any) => article.category).filter(Boolean))];
      let categoryMap = new Map();
      
      if (categoryIds.length > 0) {
        const categories = await this.db('knowledge_categories')
          .whereIn('id', categoryIds)
          .select('id', 'name', 'description');
        
        categoryMap = new Map(categories.map((cat: any) => [cat.id, cat]));
      }

      // Fetch related assets for all articles in a single query
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
        assetsMap.set(assetRow.article_id, assetRow.related_assets || []);
      });
      
      // Attach category info and related_assets to each article
      articles.forEach((article: any) => {
        const category = categoryMap.get(article.category);
        article.category_name = category?.name || null;
        article.category_description = category?.description || null;
        article.related_assets = assetsMap.get(article.id) || [];
      });
    } else {
      articles.forEach((article: any) => {
        article.category_name = null;
        article.category_description = null;
        article.related_assets = [];
      });
    }

    return {
      articles,
      total
    };
  }