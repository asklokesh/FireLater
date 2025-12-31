class ReportTemplateService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { reportType?: string; isPublic?: boolean }
  ): Promise<{ templates: unknown[]; total: number }> {
    const offset = getOffset(pagination);

    // Use a single connection from pool with timeout
    const client = await pool.connect();
    client.query(`SET LOCAL statement_timeout = ${REPORTING_QUERY_TIMEOUT}`);
    client.query(`SET LOCAL app.current_tenant = $1`, [tenantSlug]);
    
    try {
      let whereClause = 'WHERE rt.is_active = true';
      const values: unknown[] = [];
      let paramIndex = 1;

      if (filters?.reportType) {
        whereClause += ` AND rt.report_type = $${paramIndex++}`;
        values.push(filters.reportType);
      }
      if (filters?.isPublic !== undefined) {
        whereClause += ` AND rt.is_public = $${paramIndex++}`;
        values.push(filters.isPublic);
      }

      // Use a single query with subquery for better performance
      values.push(pagination.perPage, offset);
      const result = await client.query(
        `WITH counted AS (
          SELECT COUNT(*) as total FROM report_templates rt ${whereClause}
        )
        SELECT 
          rt.*, 
          u.name as created_by_name,
          c.total
        FROM report_templates rt
        LEFT JOIN users u ON rt.created_by = u.id
        CROSS JOIN counted c
        ${whereClause}
        ORDER BY rt.name
        LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...values, ...values.slice(0, -2)] // Duplicate values for count subquery
      );

      const total = result.rows.length > 0 ? parseInt(result.rows[0].total, 10) : 0;
      return { templates: result.rows, total };
    } finally {
      client.release();
    }
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    // Use connection with timeout
    const client = await pool.connect();
    client.query(`SET LOCAL statement_timeout = ${REPORTING_QUERY_TIMEOUT}`);
    client.query(`SET LOCAL app.current_tenant = $1`, [tenantSlug]);
    
    try {
      const result = await client.query(
        `SELECT rt.*, u.name as created_by_name
         FROM report_templates rt
         LEFT JOIN users u ON rt.created_by = u.id
         WHERE rt.id = $1 AND rt.is_active = true`,
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }
}