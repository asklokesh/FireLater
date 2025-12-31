    // Add ordering and pagination
    searchQuery += `
      ORDER BY rank DESC, a.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(pagination.perPage, offset);

    const result = await databaseService.executeQuery(searchQuery, params, { tenantSlug });
    
    // Transform results to properly structure articles with categories and authors
    const articles = result.rows.map(row => {
      const article = { ...row };
      // Remove joined fields from the main article object
      delete article.category_id;
      delete article.category_name;
      delete article.category_slug;
      delete article.author_id;
      delete article.author_name;
      delete article.author_email;
      return article;
    });

    return { articles, total };