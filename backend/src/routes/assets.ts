async function listAssets(
  tenantSlug: string,
  pagination: PaginationParams,
  filters?: AssetFilters
): Promise<{ assets: unknown[]; total: number }> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const offset = getOffset(pagination);

  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.categoryId) {
    whereClause += ` AND a.category_id = $${paramIndex++}`;
    params.push(filters.categoryId);
  }

  if (filters?.status) {
    whereClause += ` AND a.status = $${paramIndex++}`;
    params.push(filters.status);
  }

  if (filters?.locationId) {
    whereClause += ` AND a.location_id = $${paramIndex++}`;
    params.push(filters.locationId);
  }

  if (filters?.custodianId) {
    whereClause += ` AND a.custodian_id = $${paramIndex++}`;
    params.push(filters.custodianId);
  }

  if (filters?.search) {
    whereClause += ` AND (a.name ILIKE $${paramIndex++} OR a.serial_number ILIKE $${paramIndex++})`;
    params.push(`%${filters.search}%`, `%${filters.search}%`);
    paramIndex += 2;
  }

  // Single query with JOINs instead of separate queries
  const query = `
    SELECT a.*,
           c.name as category_name,
           l.name as location_name,
           cu.name as custodian_name,
           cu.email as custodian_email
    FROM ${schema}.assets a
    LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
    LEFT JOIN ${schema}.locations l ON a.location_id = l.id
    LEFT JOIN ${schema}.users cu ON a.custodian_id = cu.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;
  params.push(pagination.perPage, offset);

  const countQuery = `SELECT COUNT(*) FROM ${schema}.assets a ${whereClause}`;
  const countResult = await pool.query(countQuery, params.slice(0, paramIndex - 2));
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(query, params);
  return { assets: result.rows, total };
}

async function getAssetById(tenantSlug: string, assetId: string): Promise<unknown> {
  const schema = tenantService.getSchemaName(tenantSlug);

  // Single query with JOINs to fetch all related data
  const result = await pool.query(`
    SELECT a.*,
           c.name as category_name,
           l.name as location_name,
           cu.name as custodian_name,
           cu.email as custodian_email
    FROM ${schema}.assets a
    LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
    LEFT JOIN ${schema}.locations l ON a.location_id = l.id
    LEFT JOIN ${schema}.users cu ON a.custodian_id = cu.id
    WHERE a.id = $1
  `, [assetId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Asset not found');
  }

  return result.rows[0];
}