// Replace the list method in AssetService class with this optimized version
async list(
  tenantSlug: string,
  pagination: PaginationParams,
  filters: AssetFilters = {}
): Promise<{ assets: unknown[]; total: number }> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const offset = getOffset(pagination);

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search) {
    whereClause += ` AND (a.name ILIKE $${paramIndex++} OR a.serial_number ILIKE $${paramIndex++})`;
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.categoryId) {
    whereClause += ` AND a.category_id = $${paramIndex++}`;
    params.push(filters.categoryId);
  }

  if (filters.status) {
    whereClause += ` AND a.status = $${paramIndex++}`;
    params.push(filters.status);
  }

  if (filters.locationId) {
    whereClause += ` AND a.location_id = $${paramIndex++}`;
    params.push(filters.locationId);
  }

  if (filters.custodianId) {
    whereClause += ` AND a.custodian_id = $${paramIndex++}`;
    params.push(filters.custodianId);
  }

  // Single query with JOINs instead of sequential calls
  const query = `
    SELECT 
      a.*,
      c.name as category_name,
      c.description as category_description,
      l.name as location_name,
      l.description as location_description,
      cust.name as custodian_name,
      cust.email as custodian_email
    FROM ${schema}.assets a
    LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
    LEFT JOIN ${schema}.locations l ON a.location_id = l.id
    LEFT JOIN ${schema}.users cust ON a.custodian_id = cust.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  
  params.push(pagination.perPage, offset);
  
  const result = await pool.query(query, params);
  
  // Get total count with same filters
  const countQuery = `SELECT COUNT(*) FROM ${schema}.assets a ${whereClause}`;
  const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove LIMIT/OFFSET params
  const total = parseInt(countResult.rows[0].count, 10);
  
  return { assets: result.rows, total };
}