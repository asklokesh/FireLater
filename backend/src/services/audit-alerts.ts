import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { AUDIT_SEVERITIES, type AuditSeverity } from '../lib/audit-search.js';

// ============================================
// AUDIT ALERT RULES
// Real-time detection of suspicious activity patterns. Each time an audit
// record is written, the matching rules count recent events for the same
// actor / IP and raise an alert (persisted + in-app notification to admins)
// when the threshold is reached inside the rule's time window.
// ============================================

export type AlertGroupBy = 'user' | 'ip' | 'none';

export interface AuditAlertRule {
  id: string;
  name: string;
  description: string | null;
  actions: string[];
  entity_types: string[];
  outcome: string | null;
  threshold: number;
  window_minutes: number;
  group_by: AlertGroupBy;
  severity: AuditSeverity;
  enabled: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditAlertRuleInput {
  name: string;
  description?: string | null;
  actions?: string[];
  entityTypes?: string[];
  outcome?: string | null;
  threshold: number;
  windowMinutes: number;
  groupBy?: AlertGroupBy;
  severity?: AuditSeverity;
  enabled?: boolean;
}

export interface AuditAlert {
  id: string;
  rule_id: string | null;
  rule_name: string;
  severity: AuditSeverity;
  group_key: string;
  event_count: number;
  window_start: Date;
  window_end: Date;
  details: Record<string, unknown>;
  status: 'open' | 'acknowledged';
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  created_at: Date;
}

/** The facts about a just-written audit record that rules match on. */
export interface AuditAlertEvent {
  action: string;
  entityType: string;
  outcome: string;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
}

const RULES_TTL_MS = 15_000;

/** Identity of the actor an event is grouped under for a rule. */
export function groupKeyFor(groupBy: AlertGroupBy, event: AuditAlertEvent): string {
  switch (groupBy) {
    case 'user':
      return event.userEmail || event.userId || '';
    case 'ip':
      return event.ipAddress || '';
    default:
      return '';
  }
}

/** Whether a rule applies to an event (before counting). */
export function ruleMatches(rule: AuditAlertRule, event: AuditAlertEvent): boolean {
  if (!rule.enabled) return false;
  if (rule.actions.length > 0 && !rule.actions.includes(event.action)) return false;
  if (rule.entity_types.length > 0 && !rule.entity_types.includes(event.entityType)) return false;
  if (rule.outcome && rule.outcome !== event.outcome) return false;
  return true;
}

// SQL for "same actor as the event" per grouping. Fixed strings, never user input.
const GROUP_SQL: Record<AlertGroupBy, string> = {
  user: `COALESCE(user_email, user_id::text, '') = $1`,
  ip: `COALESCE(host(ip_address), '') = $1`,
  none: `$1::text IS NOT NULL`,
};

class AuditAlertService {
  private rulesCache = new Map<string, { at: number; rules: AuditAlertRule[] }>();

  private async getEnabledRules(tenantSlug: string): Promise<AuditAlertRule[]> {
    const hit = this.rulesCache.get(tenantSlug);
    if (hit && Date.now() - hit.at < RULES_TTL_MS) return hit.rules;
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_alert_rules WHERE enabled = true`
    );
    this.rulesCache.set(tenantSlug, { at: Date.now(), rules: result.rows });
    return result.rows;
  }

  private invalidate(tenantSlug: string): void {
    this.rulesCache.delete(tenantSlug);
  }

  /**
   * Evaluate all enabled rules against a newly written event. Returns the
   * alerts that were raised (empty when nothing crossed a threshold).
   */
  async evaluate(tenantSlug: string, event: AuditAlertEvent): Promise<AuditAlert[]> {
    const rules = (await this.getEnabledRules(tenantSlug)).filter((r) => ruleMatches(r, event));
    if (rules.length === 0) return [];

    const schema = tenantService.getSchemaName(tenantSlug);
    const raised: AuditAlert[] = [];

    for (const rule of rules) {
      const key = groupKeyFor(rule.group_by, event);
      // An event with no identifiable actor cannot be attributed to a group.
      if (rule.group_by !== 'none' && key === '') continue;

      const counted = await pool.query(
        `SELECT COUNT(*)::int AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
           FROM ${schema}.audit_logs
          WHERE ${GROUP_SQL[rule.group_by]}
            AND created_at > NOW() - INTERVAL '1 minute' * $2
            AND (cardinality($3::text[]) = 0 OR action = ANY($3))
            AND (cardinality($4::text[]) = 0 OR entity_type = ANY($4))
            AND ($5::text IS NULL OR outcome = $5)`,
        [key, rule.window_minutes, rule.actions, rule.entity_types, rule.outcome]
      );
      const { count, first_at, last_at } = counted.rows[0];
      if (count < rule.threshold) continue;

      // One alert per rule + actor per window.
      const inserted = await pool.query(
        `INSERT INTO ${schema}.audit_alerts
           (rule_id, rule_name, severity, group_key, event_count, window_start, window_end, details)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::int,
                $6::timestamptz, $7::timestamptz, $8::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM ${schema}.audit_alerts
             WHERE rule_id = $1::uuid AND group_key = $4::varchar
               AND created_at > NOW() - INTERVAL '1 minute' * $9::int
          )
         RETURNING *`,
        [
          rule.id,
          rule.name,
          rule.severity,
          key,
          count,
          first_at,
          last_at,
          JSON.stringify({
            threshold: rule.threshold,
            windowMinutes: rule.window_minutes,
            groupBy: rule.group_by,
            action: event.action,
            ipAddress: event.ipAddress ?? null,
          }),
          rule.window_minutes,
        ]
      );
      if (inserted.rows.length === 0) continue;

      const alert: AuditAlert = inserted.rows[0];
      raised.push(alert);
      logger.warn(
        { tenantSlug, alertId: alert.id, rule: rule.name, severity: rule.severity, groupKey: key, count },
        'Suspicious activity detected by audit alert rule'
      );
      await this.notifyAdmins(tenantSlug, alert).catch((err) =>
        logger.warn({ err, tenantSlug, alertId: alert.id }, 'Failed to notify admins of audit alert')
      );
    }

    return raised;
  }

  /** In-app notification to every active admin. */
  private async notifyAdmins(tenantSlug: string, alert: AuditAlert): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.notifications (user_id, event_type, title, body, entity_type, entity_id, metadata)
       SELECT DISTINCT u.id, 'audit_alert', $1::varchar, $2::text, 'audit_alert', $3::uuid, $4::jsonb
         FROM ${schema}.users u
         JOIN ${schema}.user_roles ur ON ur.user_id = u.id
         JOIN ${schema}.roles r ON r.id = ur.role_id
        WHERE r.name = 'admin' AND u.status = 'active'`,
      [
        `Security alert: ${alert.rule_name}`,
        `${alert.event_count} matching audit events within the rule window` +
          (alert.group_key ? ` for ${alert.group_key}` : ''),
        alert.id,
        JSON.stringify({ severity: alert.severity, ruleId: alert.rule_id }),
      ]
    );
  }

  // ---------------- rule management ----------------

  async listRules(tenantSlug: string): Promise<AuditAlertRule[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`SELECT * FROM ${schema}.audit_alert_rules ORDER BY name`);
    return result.rows;
  }

  async createRule(
    tenantSlug: string,
    input: AuditAlertRuleInput,
    createdBy?: string
  ): Promise<AuditAlertRule> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `INSERT INTO ${schema}.audit_alert_rules
         (name, description, actions, entity_types, outcome, threshold, window_minutes,
          group_by, severity, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        input.name,
        input.description ?? null,
        input.actions ?? [],
        input.entityTypes ?? [],
        input.outcome ?? null,
        input.threshold,
        input.windowMinutes,
        input.groupBy ?? 'user',
        input.severity ?? 'medium',
        input.enabled ?? true,
        createdBy ?? null,
      ]
    );
    this.invalidate(tenantSlug);
    return result.rows[0];
  }

  async updateRule(
    tenantSlug: string,
    id: string,
    input: Partial<AuditAlertRuleInput>
  ): Promise<AuditAlertRule | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const map: Array<[string, unknown]> = [];
    if (input.name !== undefined) map.push(['name', input.name]);
    if (input.description !== undefined) map.push(['description', input.description]);
    if (input.actions !== undefined) map.push(['actions', input.actions]);
    if (input.entityTypes !== undefined) map.push(['entity_types', input.entityTypes]);
    if (input.outcome !== undefined) map.push(['outcome', input.outcome]);
    if (input.threshold !== undefined) map.push(['threshold', input.threshold]);
    if (input.windowMinutes !== undefined) map.push(['window_minutes', input.windowMinutes]);
    if (input.groupBy !== undefined) map.push(['group_by', input.groupBy]);
    if (input.severity !== undefined) map.push(['severity', input.severity]);
    if (input.enabled !== undefined) map.push(['enabled', input.enabled]);

    if (map.length === 0) {
      const existing = await pool.query(`SELECT * FROM ${schema}.audit_alert_rules WHERE id = $1`, [id]);
      return existing.rows[0] ?? null;
    }

    const sets = map.map(([col], i) => `${col} = $${i + 1}`);
    sets.push('updated_at = NOW()');
    const result = await pool.query(
      `UPDATE ${schema}.audit_alert_rules SET ${sets.join(', ')} WHERE id = $${map.length + 1} RETURNING *`,
      [...map.map(([, v]) => v), id]
    );
    this.invalidate(tenantSlug);
    return result.rows[0] ?? null;
  }

  async deleteRule(tenantSlug: string, id: string): Promise<boolean> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`DELETE FROM ${schema}.audit_alert_rules WHERE id = $1`, [id]);
    this.invalidate(tenantSlug);
    return (result.rowCount ?? 0) > 0;
  }

  // ---------------- alerts ----------------

  async listAlerts(
    tenantSlug: string,
    options: { status?: 'open' | 'acknowledged'; severity?: AuditSeverity; limit?: number; offset?: number } = {}
  ): Promise<{ alerts: AuditAlert[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options.status) {
      params.push(options.status);
      conditions.push(`status = $${params.length}`);
    }
    if (options.severity && (AUDIT_SEVERITIES as readonly string[]).includes(options.severity)) {
      params.push(options.severity);
      conditions.push(`severity = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM ${schema}.audit_alerts ${where}`, params);
    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_alerts ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.limit ?? 50, options.offset ?? 0]
    );
    return { alerts: result.rows, total: total.rows[0].count };
  }

  async acknowledge(tenantSlug: string, id: string, userId: string): Promise<AuditAlert | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `UPDATE ${schema}.audit_alerts
          SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW()
        WHERE id = $1 AND status = 'open'
        RETURNING *`,
      [id, userId]
    );
    return result.rows[0] ?? null;
  }
}

export const auditAlertService = new AuditAlertService();
