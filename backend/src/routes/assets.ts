// Replace individual sequential queries with batch operations
// Before: multiple await databaseService.executeQuery() calls in loops
// After: single batch query using VALUES or unnest

// Example fix for bulk asset creation:
async function createBulkAssets(tenantSlug: string, assets: AssetCreatePayload[]) {
  const schema = tenantService.getSchemaName(tenantSlug);
  
  // Use unnest for batch insert instead of looping individual inserts
  const query = `
    INSERT INTO ${schema}.assets (
      name, description, category_id, status, assigned_to, location, 
      purchase_date, warranty_expiry, metadata, tenant_id
    )
    SELECT 
      unnest($1::text[]), unnest($2::text[]), unnest($3::uuid[]), 
      unnest($4::text[]), unnest($5::uuid[]), unnest($6::text[]),
      unnest($7::date[]), unnest($8::date[]), unnest($9::jsonb[]), $10
    RETURNING *
  `;

  const values = [
    assets.map(a => a.name),
    assets.map(a => a.description || null),
    assets.map(a => a.categoryId || null),
    assets.map(a => a.status || 'active'),
    assets.map(a => a.assignedTo || null),
    assets.map(a => a.location || null),
    assets.map(a => a.purchaseDate || null),
    assets.map(a => a.warrantyExpiry || null),
    assets.map(a => JSON.stringify(a.metadata || {})),
    tenantSlug
  ];

  return await pool.query(query, values);
}

// Example fix for bulk updates:
async function updateBulkAssets(tenantSlug: string, updates: AssetUpdatePayload[]) {
  const schema = tenantService.getSchemaName(tenantSlug);
  
  // Use VALUES clause for batch update
  const query = `
    UPDATE ${schema}.assets 
    SET 
      name = v.name,
      description = v.description,
      status = v.status,
      updated_at = NOW()
    FROM (
      VALUES ${updates.map((_, i) => `($${i * 4 + 1}::uuid, $${i * 4 + 2}::text, $${i * 4 + 3}::text, $${i * 4 + 4}::text)`).join(',')}
    ) AS v(id, name, description, status)
    WHERE assets.id = v.id AND assets.tenant_id = $${updates.length * 4 + 1}
    RETURNING assets.*
  `;

  const values = updates.flatMap(u => [u.id, u.name, u.description || null, u.status || 'active']);
  values.push(tenantSlug);

  return await pool.query(query, values);
}