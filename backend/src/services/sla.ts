import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface SlaPolicy {
  id: string;
  name: string;
  description?: string;
  entity_type: 'issue' | 'problem' | 'change';
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlaTarget {
  id: string;
  policy_id: string;
  metric_type: 'response_time' | 'resolution_time' | 'first_update' | 'escalation';
  priority: 'critical' | 'high' | 'medium' | 'low';
  target_minutes: number;
  warning_threshold_percent: number;
  created_at: string;
  updated_at: string;
}

export interface SlaPolicyWithTargets extends SlaPolicy {
  targets: SlaTarget[];
}

export interface SlaBreachRecord {
  id: string;
  issue_id?: string;
  problem_id?: string;
  breach_type: 'response' | 'resolution';
  policy_id?: string;
  target_minutes: number;
  actual_minutes: number;
  breached_at: string;
  notified_at?: string;
}

export interface SlaStats {
  total: number;
  met: number;
  breached: number;
  met_percentage: number;
  avg_response_time_minutes: number;
  avg_resolution_time_minutes: number;
  issues_within_sla: number;
  issues_approaching_sla: number;
  by_priority: {
    priority: string;
    total: number;
    met: number;
    breached: number;
    breach_percentage: number;
  }[];
}

// ============================================
// POLICY MANAGEMENT
// ============================================

export async function listSlaPolicies(
  tenantSlug: string,
  filters?: { entityType?: string; isActive?: boolean }
): Promise<SlaPolicyWithTargets[]> {
  const schema = tenantService.getSchemaName(tenantSlug);

  let query = `
    SELECT id, name, description, entity_type, is_default, created_at, updated_at
    FROM ${schema}.sla_policies
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.entityType) {
    params.push(filters.entityType);
    query += ` AND entity_type = $${params.length}`;
  }

  // Note: is_active filter removed as column doesn't exist in database schema

  query += ' ORDER BY entity_type, is_default DESC, name';

  const result = await pool.query(query, params);
  const policies = result.rows;

  // Fetch targets for all policies
  if (policies.length > 0) {
    const policyIds = policies.map(p => p.id);
    const targetsResult = await pool.query(`
      SELECT id, policy_id, metric_type, priority, target_minutes, warning_threshold_percent, created_at, updated_at
      FROM ${schema}.sla_targets
      WHERE policy_id = ANY($1)
      ORDER BY
        CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
        metric_type
    `, [policyIds]);

    // Group targets by policy_id
    const targetsByPolicy: Map<string, SlaTarget[]> = new Map();
    for (const target of targetsResult.rows) {
      if (!targetsByPolicy.has(target.policy_id)) {
        targetsByPolicy.set(target.policy_id, []);
      }
      targetsByPolicy.get(target.policy_id)!.push(target);
    }

    // Attach targets to policies
    for (const policy of policies) {
      policy.targets = targetsByPolicy.get(policy.id) || [];
    }
  }

  return policies;
}

export async function getSlaPolicy(
  tenantSlug: string,
  policyId: string
): Promise<SlaPolicyWithTargets | null> {
  const schema = tenantService.getSchemaName(tenantSlug);

  // Get policy
  const policyResult = await pool.query(`
    SELECT id, name, description, entity_type, is_default, created_at, updated_at
    FROM ${schema}.sla_policies
    WHERE id = $1
  `, [policyId]);

  if (policyResult.rows.length === 0) {
    return null;
  }

  // Get targets
  const targetsResult = await pool.query(`
    SELECT id, policy_id, metric_type, priority, target_minutes, warning_threshold_percent, created_at, updated_at
    FROM ${schema}.sla_targets
    WHERE policy_id = $1
    ORDER BY
      CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
      metric_type
  `, [policyId]);

  return {
    ...policyResult.rows[0],
    targets: targetsResult.rows,
  };
}

export async function createSlaPolicy(
  tenantSlug: string,
  data: {
    name: string;
    description?: string;
    entityType: 'issue' | 'problem' | 'change';
    isDefault?: boolean;
    targets?: {
      metricType: 'response_time' | 'resolution_time';
      priority: 'critical' | 'high' | 'medium' | 'low';
      targetMinutes: number;
      warningThresholdPercent?: number;
    }[];
  }
): Promise<SlaPolicyWithTargets> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If setting as default, unset existing default
    if (data.isDefault) {
      await client.query(`
        UPDATE ${schema}.sla_policies
        SET is_default = false
        WHERE entity_type = $1 AND is_default = true
      `, [data.entityType]);
    }

    // Create policy
    const policyResult = await client.query(`
      INSERT INTO ${schema}.sla_policies (name, description, entity_type, is_default, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `, [data.name, data.description, data.entityType, data.isDefault ?? false]);

    const policy = policyResult.rows[0];
    const targets: SlaTarget[] = [];

    // Create targets
    if (data.targets && data.targets.length > 0) {
      for (const target of data.targets) {
        const targetResult = await client.query(`
          INSERT INTO ${schema}.sla_targets (policy_id, metric_type, priority, target_minutes, warning_threshold_percent)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [policy.id, target.metricType, target.priority, target.targetMinutes, target.warningThresholdPercent ?? 80]);
        targets.push(targetResult.rows[0]);
      }
    }

    await client.query('COMMIT');

    logger.info({ tenantSlug, policyId: policy.id }, 'SLA policy created');

    return { ...policy, targets };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSlaPolicy(
  tenantSlug: string,
  policyId: string,
  data: {
    name?: string;
    description?: string;
    isDefault?: boolean;
    isActive?: boolean;
  }
): Promise<SlaPolicy | null> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // If setting as default, get entity type and unset existing default
    if (data.isDefault) {
      const policyResult = await client.query(`
        SELECT entity_type FROM ${schema}.sla_policies WHERE id = $1
      `, [policyId]);

      if (policyResult.rows.length > 0) {
        await client.query(`
          UPDATE ${schema}.sla_policies
          SET is_default = false
          WHERE entity_type = $1 AND is_default = true AND id != $2
        `, [policyResult.rows[0].entity_type, policyId]);
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      params.push(data.name);
      updates.push(`name = $${params.length}`);
    }
    if (data.description !== undefined) {
      params.push(data.description);
      updates.push(`description = $${params.length}`);
    }
    if (data.isDefault !== undefined) {
      params.push(data.isDefault);
      updates.push(`is_default = $${params.length}`);
    }
    if (data.isActive !== undefined) {
      params.push(data.isActive);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      await client.query('COMMIT');
      return getSlaPolicy(tenantSlug, policyId);
    }

    params.push(policyId);
    const result = await client.query(`
      UPDATE ${schema}.sla_policies
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING *
    `, params);

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      return null;
    }

    logger.info({ tenantSlug, policyId }, 'SLA policy updated');

    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSlaPolicy(
  tenantSlug: string,
  policyId: string
): Promise<boolean> {
  const schema = tenantService.getSchemaName(tenantSlug);

  // Don't allow deleting default policies
  const checkResult = await pool.query(`
    SELECT is_default FROM ${schema}.sla_policies WHERE id = $1
  `, [policyId]);

  if (checkResult.rows.length > 0 && checkResult.rows[0].is_default) {
    throw new Error('Cannot delete default SLA policy');
  }

  const result = await pool.query(`
    DELETE FROM ${schema}.sla_policies WHERE id = $1 AND is_default = false
  `, [policyId]);

  if (result.rowCount && result.rowCount > 0) {
    logger.info({ tenantSlug, policyId }, 'SLA policy deleted');
    return true;
  }

  return false;
}

// ============================================
// TARGET MANAGEMENT
// ============================================

export async function updateSlaTarget(
  tenantSlug: string,
  targetId: string,
  data: {
    targetMinutes?: number;
    warningThresholdPercent?: number;
  }
): Promise<SlaTarget | null> {
  const schema = tenantService.getSchemaName(tenantSlug);

  const updates: string[] = [];
  const params: any[] = [];

  if (data.targetMinutes !== undefined) {
    params.push(data.targetMinutes);
    updates.push(`target_minutes = $${params.length}`);
  }
  if (data.warningThresholdPercent !== undefined) {
    params.push(data.warningThresholdPercent);
    updates.push(`warning_threshold_percent = $${params.length}`);
  }

  if (updates.length === 0) {
    const result = await pool.query(`
      SELECT * FROM ${schema}.sla_targets WHERE id = $1
    `, [targetId]);
    return result.rows[0] || null;
  }

  params.push(targetId);
  const result = await pool.query(`
    UPDATE ${schema}.sla_targets
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $${params.length}
    RETURNING *
  `, params);

  if (result.rows.length === 0) {
    return null;
  }

  logger.info({ tenantSlug, targetId }, 'SLA target updated');

  return result.rows[0];
}

export async function createSlaTarget(
  tenantSlug: string,
  policyId: string,
  data: {
    metricType: 'response_time' | 'resolution_time';
    priority: 'critical' | 'high' | 'medium' | 'low';
    targetMinutes: number;
    warningThresholdPercent?: number;
  }
): Promise<SlaTarget> {
  const schema = tenantService.getSchemaName(tenantSlug);

  const result = await pool.query(`
    INSERT INTO ${schema}.sla_targets (policy_id, metric_type, priority, target_minutes, warning_threshold_percent)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [policyId, data.metricType, data.priority, data.targetMinutes, data.warningThresholdPercent ?? 80]);

  logger.info({ tenantSlug, policyId, targetId: result.rows[0].id }, 'SLA target created');

  return result.rows[0];
}

export async function deleteSlaTarget(
  tenantSlug: string,
  targetId: string
): Promise<boolean> {
  const schema = tenantService.getSchemaName(tenantSlug);

  const result = await pool.query(`
    DELETE FROM ${schema}.sla_targets WHERE id = $1
  `, [targetId]);

  if (result.rowCount && result.rowCount > 0) {
    logger.info({ tenantSlug, targetId }, 'SLA target deleted');
    return true;
  }

  return false;
}

// ============================================
// SLA STATISTICS
// ============================================

export async function getSlaStats(
  tenantSlug: string,
  entityType: 'issue' | 'problem' = 'issue',
  dateRange?: { start: Date; end: Date }
): Promise<SlaStats> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const table = entityType === 'issue' ? 'issues' : 'problems';

  let dateFilter = '';
  const params: any[] = [];

  if (dateRange) {
    params.push(dateRange.start, dateRange.end);
    dateFilter = `AND created_at BETWEEN $1 AND $2`;
  }

  // Get overall stats
  const overallResult = await pool.query(`
    SELECT
      COUNT(*) as total_issues,
      COUNT(*) FILTER (WHERE sla_breached = true) as breached_issues,
      COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND sla_breached = false) as issues_within_sla,
      AVG(EXTRACT(EPOCH FROM (COALESCE(first_response_at, NOW()) - created_at)) / 60)
        FILTER (WHERE first_response_at IS NOT NULL) as avg_response_time_minutes,
      AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) / 60)
        FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time_minutes
    FROM ${schema}.${table}
    WHERE 1=1 ${dateFilter}
  `, params);

  const overall = overallResult.rows[0];
  const totalIssues = parseInt(overall.total_issues) || 0;
  const breachedIssues = parseInt(overall.breached_issues) || 0;

  // Get stats by priority
  const byPriorityResult = await pool.query(`
    SELECT
      priority,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE sla_breached = true) as breached
    FROM ${schema}.${table}
    WHERE 1=1 ${dateFilter}
    GROUP BY priority
    ORDER BY
      CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END
  `, params);

  // Calculate approaching SLA (issues at >75% of resolution time)
  const approachingResult = await pool.query(`
    SELECT COUNT(*) as approaching
    FROM ${schema}.${table}
    WHERE status NOT IN ('resolved', 'closed')
    AND sla_breached = false
    AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > (
      SELECT target_minutes * 0.75
      FROM ${schema}.sla_targets st
      JOIN ${schema}.sla_policies sp ON st.policy_id = sp.id
      WHERE sp.entity_type = $1
      AND sp.is_default = true
      AND st.metric_type = 'resolution_time'
      AND st.priority = ${table}.priority
      LIMIT 1
    )
    ${dateFilter}
  `, [entityType, ...params]);

  const metIssues = totalIssues - breachedIssues;
  const metPercentage = totalIssues > 0 ? Math.round((metIssues / totalIssues) * 100 * 10) / 10 : 100;

  return {
    total: totalIssues,
    met: metIssues,
    breached: breachedIssues,
    met_percentage: metPercentage,
    avg_response_time_minutes: Math.round(parseFloat(overall.avg_response_time_minutes) || 0),
    avg_resolution_time_minutes: Math.round(parseFloat(overall.avg_resolution_time_minutes) || 0),
    issues_within_sla: parseInt(overall.issues_within_sla) || 0,
    issues_approaching_sla: parseInt(approachingResult.rows[0]?.approaching) || 0,
    by_priority: byPriorityResult.rows.map(row => {
      const total = parseInt(row.total) || 0;
      const breached = parseInt(row.breached) || 0;
      const met = total - breached;
      return {
        priority: row.priority,
        total,
        met,
        breached,
        breach_percentage: total > 0
          ? Math.round((breached / total) * 100 * 10) / 10
          : 0,
      };
    }),
  };
}

// ============================================
// GET SLA CONFIG FOR BREACH DETECTION
// ============================================

export interface SlaConfigForBreachCheck {
  priority: string;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  warningThresholdPercent: number;
}

export async function getSlaConfigFromDb(
  tenantSlug: string,
  entityType: 'issue' | 'problem' = 'issue'
): Promise<SlaConfigForBreachCheck[]> {
  const schema = tenantService.getSchemaName(tenantSlug);

  const result = await pool.query(`
    SELECT
      st.priority,
      st.metric_type,
      st.target_minutes,
      st.warning_percent
    FROM ${schema}.sla_targets st
    JOIN ${schema}.sla_policies sp ON st.policy_id = sp.id
    WHERE sp.entity_type = $1
    AND sp.is_default = true
    ORDER BY st.priority, st.metric_type
  `, [entityType]);

  // Group by priority
  const configMap: Map<string, SlaConfigForBreachCheck> = new Map();

  for (const row of result.rows) {
    if (!configMap.has(row.priority)) {
      configMap.set(row.priority, {
        priority: row.priority,
        responseTimeMinutes: 0,
        resolutionTimeMinutes: 0,
        warningThresholdPercent: row.warning_percent || 80,
      });
    }

    const config = configMap.get(row.priority)!;
    if (row.metric_type === 'response_time') {
      config.responseTimeMinutes = row.target_minutes;
    } else if (row.metric_type === 'resolution_time') {
      config.resolutionTimeMinutes = row.target_minutes;
    }
  }

  return Array.from(configMap.values());
}

// Export service
export const slaService = {
  listSlaPolicies,
  getSlaPolicy,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
  updateSlaTarget,
  createSlaTarget,
  deleteSlaTarget,
  getSlaStats,
  getSlaConfigFromDb,
};
