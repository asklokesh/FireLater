    // Add category filter if provided
    if (filters?.categoryId) {
      searchQuery += ` AND a.category_id = $3`;
      params.push(filters.categoryId);
    }

    // Add status filter if provided
    if (filters?.status) {
      const statusParamIndex = filters.categoryId ? 4 : 3;
      searchQuery += ` AND a.status = $${statusParamIndex}`;
      params.push(filters.status);
    }

    // Add ordering and pagination
    searchQuery += `
      ORDER BY rank DESC, a.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(pagination.perPage, offset);

    const result = await databaseService.executeQuery(searchQuery, params, { tenantSlug });
    return { articles: result.rows, total };
  }