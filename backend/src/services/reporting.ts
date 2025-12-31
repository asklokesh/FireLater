  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { reportType?: string; isPublic?: boolean }
  ): Promise<{ templates: unknown[]; total: number }> {
    const offset = getOffset(pagination);

    const options = {
      timeout: REPORTING_QUERY_TIMEOUT,
      tenantSlug
    };

    let whereClause = 'WHERE rt.is_active = true';
    const values: unknown[] = [];
    let paramIndex = 1;

    // Validate reportType against whitelist
    const validReportTypes = ['incident_summary', 'service_availability', 'user_activity', 'asset_inventory'];
    if (filters?.reportType) {
      if (!validReportTypes.includes(filters.reportType)) {
        throw new Error('Invalid report type');
      }
      whereClause += ` AND rt.report_type = $${paramIndex++}`;
      values.push(filters.reportType);
    }
    if (filters?.isPublic !== undefined) {
      whereClause += ` AND rt.is_public = $${paramIndex++}`;
      values.push(filters.isPublic);
    }

    // Use a single query with subquery for better performance
    values.push(pagination.perPage, offset);
    const result = await databaseService.executeQuery(
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
      [...values], // Remove duplicate values
      options
    );

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total, 10) : 0;
    return { templates: result.rows, total };
  }