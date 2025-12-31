class AssetService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: AssetFilters
  ): Promise<{ assets: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClause += ` AND a.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.categoryId) {
      whereClause += ` AND a.category_id = $${paramIndex++}`;
      params.push(filters.categoryId);
    }

    if (filters?.assigneeId) {
      whereClause += ` AND a.assignee_id = $${paramIndex++}`;
      params.push(filters.assigneeId);
    }

    if (filters?.locationId) {
      whereClause += ` AND a.location_id = $${paramIndex++}`;
      params.push(filters.locationId);
    }

    if (filters?.search) {
      whereClause += ` AND (a.name ILIKE $${paramIndex++} OR a.serial_number ILIKE $${paramIndex++})`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
      paramIndex++;
    }

    // Single query with JOINs for all related data
    const query = `
      SELECT 
        a.*,
        c.name as category_name,
        u.name as assignee_name,
        u.email as assignee_email,
        l.name as location_name
      FROM ${schema}.assets a
      LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
      LEFT JOIN ${schema}.users u ON a.assignee_id = u.id
      LEFT JOIN ${schema}.locations l ON a.location_id = l.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(pagination.perPage, offset);

    const countQuery = `SELECT COUNT(*) FROM ${schema}.assets a ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(query, params);
    return { assets: result.rows, total };
  }
}