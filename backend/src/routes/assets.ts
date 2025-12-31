// In the route handler where assets are fetched, modify the query to include health scores via JOIN
// Replace separate health score queries with a single JOIN query
const assetsQuery = `
  SELECT 
    a.*,
    h.score as health_score,
    h.last_checked as health_last_checked,
    h.status as health_status
  FROM ${schema}.assets a
  LEFT JOIN ${schema}.asset_health_scores h ON a.id = h.asset_id
  WHERE a.tenant_id = $1
  ORDER BY a.created_at DESC
  LIMIT $2 OFFSET $3
`;