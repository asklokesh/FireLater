// Replace the individual sequential queries with batched JOIN queries
async function getAssetsWithRelations(tenantSlug: string, query: any) {
  const schema = tenantService.getSchemaName(tenantSlug);
  
  let baseQuery = pool.query(`
    SELECT 
      a.*,
      c.name as category_name,
      l.name as location_name,
      u.name as assigned_to_name,
      u.email as assigned_to_email
    FROM ${schema}.assets a
    LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
    LEFT JOIN ${schema}.locations l ON a.location_id = l.id
    LEFT JOIN ${schema}.users u ON a.assigned_to_id = u.id
    WHERE a.tenant_slug = $1
  `, [tenantSlug]);

  if (query.category) {
    baseQuery = pool.query(`
      SELECT 
        a.*,
        c.name as category_name,
        l.name as location_name,
        u.name as assigned_to_name,
        u.email as assigned_to_email
      FROM ${schema}.assets a
      LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
      LEFT JOIN ${schema}.locations l ON a.location_id = l.id
      LEFT JOIN ${schema}.users u ON a.assigned_to_id = u.id
      WHERE a.tenant_slug = $1 AND a.category_id = $2
    `, [tenantSlug, query.category]);
  }

  // Add other filter conditions similarly
  
  const result = await baseQuery;
  return result.rows;
}