async function listAssets(
  request: FastifyRequest<{ Querystring: AssetListQuery }>,
  reply: FastifyReply
) {
  const { tenantSlug } = request.params as { tenantSlug: string };
  const {
    page = 1,
    perPage = 50,
    search,
    status,
    categoryId,
    ownerId,
    location,
    sortBy = 'name',
    sortOrder = 'asc'
  } = request.query;

  const schema = tenantService.getSchemaName(tenantSlug);
  const offset = (page - 1) * perPage;

  let whereClause = 'WHERE 1=1';
  const values: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (a.name ILIKE $${paramIndex++} OR a.serial_number ILIKE $${paramIndex++})`;
    values.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    whereClause += ` AND a.status = $${paramIndex++}`;
    values.push(status);
  }
  if (categoryId) {
    whereClause += ` AND a.category_id = $${paramIndex++}`;
    values.push(categoryId);
  }
  if (ownerId) {
    whereClause += ` AND a.owner_id = $${paramIndex++}`;
    values.push(ownerId);
  }
  if (location) {
    whereClause += ` AND a.location ILIKE $${paramIndex++}`;
    values.push(`%${location}%`);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM ${schema}.assets a ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Add index suggestion in comments for DBA
  // CREATE INDEX idx_assets_tenant_category_status ON assets(tenant_id, category_id, status);
  // CREATE INDEX idx_assets_owner_id ON assets(owner_id);
  // CREATE INDEX idx_assets_name_serial ON assets(name, serial_number);

  values.push(perPage, offset);
  const result = await pool.query(
    `SELECT a.*,
            c.name as category_name,
            u.name as owner_name,
            u.email as owner_email
     FROM ${schema}.assets a
     LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
     LEFT JOIN ${schema}.users u ON a.owner_id = u.id
     ${whereClause}
     ORDER BY a.${sortBy} ${sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return {
    assets: result.rows,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage)
    }
  };
}