// Replace the individual health score queries with a batch query
fastify.get('/assets/health', {
  schema: {
    tags: ['assets'],
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            asset_id: { type: 'string' },
            health_score: { type: 'number' },
            last_checked: { type: 'string' },
            issues_count: { type: 'number' },
            maintenance_count: { type: 'number' }
          }
        }
      }
    }
  },
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  const tenantSlug = (request as any).tenantSlug;
  const schema = tenantService.getSchemaName(tenantSlug);

  // Single batch query instead of N+1 individual queries
  const result = await pool.query(`
    SELECT 
      a.id as asset_id,
      COALESCE(ROUND(
        (1.0 - (
          COALESCE(i.critical_count, 0) * 0.5 + 
          COALESCE(i.high_count, 0) * 0.3 + 
          COALESCE(i.medium_count, 0) * 0.1 +
          COALESCE(m.pending_count, 0) * 0.1
        ) / 10.0) * 100
      ), 100) as health_score,
      GREATEST(
        COALESCE(i.latest_updated, '1970-01-01'),
        COALESCE(m.latest_updated, '1970-01-01')
      ) as last_checked,
      COALESCE(i.total_count, 0) as issues_count,
      COALESCE(m.total_count, 0) as maintenance_count
    FROM ${schema}.assets a
    LEFT JOIN (
      SELECT 
        asset_id,
        COUNT(*) as total_count,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_count,
        MAX(updated_at) as latest_updated
      FROM ${schema}.issues 
      WHERE status != 'resolved'
      GROUP BY asset_id
    ) i ON a.id = i.asset_id
    LEFT JOIN (
      SELECT 
        asset_id,
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        MAX(updated_at) as latest_updated
      FROM ${schema}.maintenance_schedules
      WHERE status IN ('pending', 'in_progress')
      GROUP BY asset_id
    ) m ON a.id = m.asset_id
    WHERE a.is_active = true
  `);

  return result.rows;
});