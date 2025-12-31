// Replace the individual asset fetching with batch queries
fastify.get('/', {
  schema: {
    tags: ['assets'],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        search: { type: 'string' },
        categoryId: { type: 'string' },
        status: { type: 'string' },
        locationId: { type: 'string' },
        assignedTo: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          assets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                serial_number: { type: 'string' },
                status: { type: 'string' },
                category: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                location: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                  }
                },
                assigned_to: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            }
          },
          total: { type: 'integer' },
          page: { type: 'integer' },
          perPage: { type: 'integer' }
        }
      }
    }
  }
}, async (request) => {
  const { tenantSlug } = request.params as { tenantSlug: string };
  const { page = 1, perPage = 20, search, categoryId, status, locationId, assignedTo } = request.query as {
    page?: number;
    perPage?: number;
    search?: string;
    categoryId?: string;
    status?: string;
    locationId?: string;
    assignedTo?: string;
  };

  const schema = tenantService.getSchemaName(tenantSlug);
  const offset = (page - 1) * perPage;

  // Build dynamic WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (a.name ILIKE $${paramIndex++} OR a.serial_number ILIKE $${paramIndex++})`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (categoryId) {
    whereClause += ` AND a.category_id = $${paramIndex++}`;
    params.push(categoryId);
  }

  if (status) {
    whereClause += ` AND a.status = $${paramIndex++}`;
    params.push(status);
  }

  if (locationId) {
    whereClause += ` AND a.location_id = $${paramIndex++}`;
    params.push(locationId);
  }

  if (assignedTo) {
    whereClause += ` AND a.assigned_to = $${paramIndex++}`;
    params.push(assignedTo);
  }

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM ${schema}.assets a ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch assets with related data in a single query
  const query = `
    SELECT 
      a.*,
      c.id as category_id,
      c.name as category_name,
      l.id as location_id,
      l.name as location_name,
      u.id as assigned_to_id,
      u.name as assigned_to_name,
      u.email as assigned_to_email
    FROM ${schema}.assets a
    LEFT JOIN ${schema}.asset_categories c ON a.category_id = c.id
    LEFT JOIN ${schema}.locations l ON a.location_id = l.id
    LEFT JOIN ${schema}.users u ON a.assigned_to = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  const result = await pool.query(
    query,
    [...params, perPage, offset]
  );

  // Transform results to match expected structure
  const assets = result.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    serial_number: row.serial_number,
    status: row.status,
    category: row.category_id ? {
      id: row.category_id,
      name: row.category_name
    } : null,
    location: row.location_id ? {
      id: row.location_id,
      name: row.location_name
    } : null,
    assigned_to: row.assigned_to_id ? {
      id: row.assigned_to_id,
      name: row.assigned_to_name,
      email: row.assigned_to_email
    } : null
  }));

  return {
    assets,
    total,
    page,
    perPage
  };
});