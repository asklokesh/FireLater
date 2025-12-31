// In the GET /assets route handler, replace the inefficient health score fetching
// with a single query using JOINs
const assetsQuery = `
  SELECT 
    a.*,
    h.score as health_score,
    h.last_checked as health_last_checked,
    h.details as health_details
  FROM ${schema}.assets a
  LEFT JOIN ${schema}.asset_health_scores h ON a.id = h.asset_id
  WHERE a.tenant_id = $1
  ${categoryFilter}
  ${statusFilter}
  ORDER BY a.created_at DESC
  LIMIT $2 OFFSET $3
`;