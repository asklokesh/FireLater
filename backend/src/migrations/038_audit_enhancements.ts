import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { AUDIT_SEARCH_VECTOR_SQL } from '../lib/audit-search.js';

/**
 * Migration 038: comprehensive audit logging
 *
 * - audit_logs: severity / outcome / HTTP context columns, content_digest and
 *   chain_position (hash chain over the whole record), entity_id becomes
 *   nullable (list views, logins and exports have no single entity), and
 *   composite / BRIN / full-text indexes for search and report queries.
 * - audit_settings: archive_after_days, alerts_enabled.
 * - audit_alert_rules + audit_alerts: configurable real-time detection rules
 *   (seeded with defaults for suspicious activity patterns).
 * - audit_logs_archive: cold storage for rows older than archive_after_days.
 *
 * New tenants pick all of this up because tenant creation clones
 * tenant_template (tables, indexes and rows).
 */

const DEFAULT_RULES: Array<{
  name: string;
  description: string;
  actions: string[];
  outcome: string | null;
  threshold: number;
  windowMinutes: number;
  groupBy: 'user' | 'ip' | 'none';
  severity: string;
}> = [
  {
    name: 'Repeated failed logins',
    description: 'Five or more failed logins for the same account within 15 minutes (possible brute force)',
    actions: ['login_failed'],
    outcome: null,
    threshold: 5,
    windowMinutes: 15,
    groupBy: 'user',
    severity: 'high',
  },
  {
    name: 'Mass deletion',
    description: 'A single user deleted ten or more records within 10 minutes',
    actions: ['delete'],
    outcome: 'success',
    threshold: 10,
    windowMinutes: 10,
    groupBy: 'user',
    severity: 'high',
  },
  {
    name: 'Bulk data export',
    description: 'A single user exported data three or more times within an hour',
    actions: ['export'],
    outcome: null,
    threshold: 3,
    windowMinutes: 60,
    groupBy: 'user',
    severity: 'medium',
  },
  {
    name: 'Access denied burst',
    description: 'Ten or more denied requests from the same user within 10 minutes (probing for access)',
    actions: [],
    outcome: 'denied',
    threshold: 10,
    windowMinutes: 10,
    groupBy: 'user',
    severity: 'medium',
  },
  {
    name: 'Privilege changes',
    description: 'Three or more permission grants/revocations within an hour',
    actions: ['permission_granted', 'permission_revoked'],
    outcome: null,
    threshold: 3,
    windowMinutes: 60,
    groupBy: 'none',
    severity: 'high',
  },
];

export async function migration038AuditEnhancements(pool: Pool): Promise<void> {
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%'`
  );
  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    // tenantService.getSchemaName() only emits letters, digits and underscores.
    if (!/^tenant_[A-Za-z0-9_]+$/.test(schema)) {
      throw new Error(`Unexpected tenant schema name: ${schema}`);
    }
    await applyToSchema(pool, `"${schema}"`);
    logger.debug(`Migration 038 applied to schema: ${schema}`);
  }

  logger.info('Migration 038 completed: audit enhancements (alerts, archive, search indexes)');
}

async function applyToSchema(pool: Pool, q: string): Promise<void> {
  // ---- audit_logs columns -------------------------------------------------
  await pool.query(`
    ALTER TABLE ${q}.audit_logs
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS outcome VARCHAR(20) NOT NULL DEFAULT 'success',
      ADD COLUMN IF NOT EXISTS http_method VARCHAR(10),
      ADD COLUMN IF NOT EXISTS request_path TEXT,
      ADD COLUMN IF NOT EXISTS status_code INTEGER,
      ADD COLUMN IF NOT EXISTS content_digest VARCHAR(64),
      ADD COLUMN IF NOT EXISTS chain_position BIGINT
  `);
  // List views, logins and exports are not tied to a single entity.
  await pool.query(`ALTER TABLE ${q}.audit_logs ALTER COLUMN entity_id DROP NOT NULL`);

  // ---- audit_logs indexes (search, reports, retention) --------------------
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON ${q}.audit_logs(user_id, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON ${q}.audit_logs(entity_type, entity_id, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON ${q}.audit_logs(action, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin ON ${q}.audit_logs USING BRIN (created_at)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON ${q}.audit_logs(severity, created_at DESC) WHERE severity <> 'info'`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_outcome ON ${q}.audit_logs(outcome, created_at DESC) WHERE outcome <> 'success'`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_chain_position ON ${q}.audit_logs(chain_position)`
  );
  // Records waiting to be sealed into the hash chain
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_unsealed ON ${q}.audit_logs(created_at) WHERE record_hash IS NULL`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_search ON${q}.audit_logs USING gin ((${AUDIT_SEARCH_VECTOR_SQL}))`
  );

  // ---- settings -----------------------------------------------------------
  await pool.query(`
    ALTER TABLE ${q}.audit_settings
      ADD COLUMN IF NOT EXISTS archive_after_days INTEGER,
      ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN NOT NULL DEFAULT true
  `);

  // ---- alert rules + alerts -----------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q}.audit_alert_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      actions TEXT[] NOT NULL DEFAULT '{}',
      entity_types TEXT[] NOT NULL DEFAULT '{}',
      outcome VARCHAR(20),
      threshold INTEGER NOT NULL DEFAULT 1 CHECK (threshold >= 1),
      window_minutes INTEGER NOT NULL DEFAULT 15 CHECK (window_minutes >= 1),
      group_by VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (group_by IN ('user', 'ip', 'none')),
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q}.audit_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID,
      rule_name VARCHAR(150) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      group_key VARCHAR(255) NOT NULL DEFAULT '',
      event_count INTEGER NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged')),
      acknowledged_by UUID,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_alerts_status ON ${q}.audit_alerts(status, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_alerts_rule ON ${q}.audit_alerts(rule_id, group_key, created_at DESC)`
  );

  for (const rule of DEFAULT_RULES) {
    await pool.query(
      `INSERT INTO ${q}.audit_alert_rules
         (name, description, actions, outcome, threshold, window_minutes, group_by, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (name) DO NOTHING`,
      [
        rule.name,
        rule.description,
        rule.actions,
        rule.outcome,
        rule.threshold,
        rule.windowMinutes,
        rule.groupBy,
        rule.severity,
      ]
    );
  }

  // ---- archive ------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q}.audit_logs_archive (
      LIKE ${q}.audit_logs INCLUDING DEFAULTS,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // The live table's sequence default must not be shared with the archive.
  await pool.query(`ALTER TABLE ${q}.audit_logs_archive ALTER COLUMN sequence DROP DEFAULT`);
  await pool.query(`ALTER TABLE ${q}.audit_logs_archive ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = '${q}.audit_logs_archive'::regclass AND contype = 'p'
      ) THEN
        ALTER TABLE ${q}.audit_logs_archive ADD PRIMARY KEY (id);
      END IF;
    END $$
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_archive_created ON ${q}.audit_logs_archive(created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_archive_retention ON ${q}.audit_logs_archive(retention_until) WHERE retention_until IS NOT NULL`
  );
}
