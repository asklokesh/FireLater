// In the asset listing route handler, replace separate queries for related data with JOINs
// Example of problematic pattern (N+1):
/*
const assets = await assetService.list(tenantSlug, pagination, filters);
const assetsWithRelations = await Promise.all(
  assets.map(async (asset: any) => {
    const category = await categoryService.findById(tenantSlug, asset.category_id);
    const owner = await userService.findById(tenantSlug, asset.owner_id);
    const location = await locationService.findById(tenantSlug, asset.location_id);
    return { ...asset, category, owner, location };
  })
);
*/

// Should be replaced with a single query using JOINs in the service:
/*
const result = await pool.query(
  `SELECT a.*,
          c.name as category_name,
          u.name as owner_name,
          u.email as owner_email,
          l.name as location_name
   FROM ${schema}.assets a
   LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
   LEFT JOIN ${schema}.users u ON a.owner_id = u.id
   LEFT JOIN ${schema}.locations l ON a.location_id = l.id
   WHERE ${whereClause}
   ORDER BY a.created_at DESC
   LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
  [...values, pagination.perPage, offset]
);
*/