    // Add ordering and pagination
    searchQuery += `
      ORDER BY rank DESC, a.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(pagination.perPage, offset);

    const result = await databaseService.executeQuery(searchQuery, params, { tenantSlug });
    return { articles: result.rows, total };