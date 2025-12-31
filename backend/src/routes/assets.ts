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

    // Apply filters
    if (filters?.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters?.categoryId) {
      whereClause += ` AND category_id = $${paramIndex++}`;
      params.push(filters.categoryId);
    }
    if (filters?.assignedToUserId) {
      whereClause += ` AND assigned_to_user_id = $${paramIndex++}`;
      params.push(filters.assignedToUserId);
    }
    if (filters?.locationId) {
      whereClause += ` AND location_id = $${paramIndex++}`;
      params.push(filters.locationId);
    }
    if (filters?.search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR asset_tag ILIKE $${paramIndex} OR serial_number ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.assets ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get assets with related data
    params.push(pagination.perPage, offset);
    const result = await pool.query(
      `SELECT a.*,
              cat.name as category_name,
              loc.name as location_name,
              assigned.name as assigned_to_name,
              assigned.email as assigned_to_email,
              managed.name as managed_by_name,
              managed.email as managed_by_email
       FROM ${schema}.assets a
       LEFT JOIN ${schema}.asset_categories cat ON a.category_id = cat.id
       LEFT JOIN ${schema}.locations loc ON a.location_id = loc.id
       LEFT JOIN ${schema}.users assigned ON a.assigned_to_user_id = assigned.id
       LEFT JOIN ${schema}.users managed ON a.managed_by_user_id = managed.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    const assets = result.rows;

    // Batch fetch all related resources for health scoring
    const assetIds = assets.map((asset: any) => asset.id);
    let resources: any[] = [];
    if (assetIds.length > 0) {
      const resourceResult = await pool.query(
        `SELECT * FROM ${schema}.resources WHERE asset_id = ANY($1)`,
        [assetIds]
      );
      resources = resourceResult.rows;
    }

    // Map resources to assets
    const resourcesByAssetId = resources.reduce((acc: any, resource: any) => {
      if (!acc[resource.asset_id]) {
        acc[resource.asset_id] = [];
      }
      acc[resource.asset_id].push(resource);
      return acc;
    }, {});

    // Calculate health scores using batched resources
    const assetsWithHealth = assets.map((asset: any) => ({
      ...asset,
      health_score: this.calculateHealthScore(resourcesByAssetId[asset.id] || []),
      resources: resourcesByAssetId[asset.id] || []
    }));

    return { assets: assetsWithHealth, total };
  }