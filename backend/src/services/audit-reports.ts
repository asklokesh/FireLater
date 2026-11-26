import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { auditChainService } from './audit-chain.js';
import { auditService } from './audit.js';

// ============================================
// AUDIT TRAIL COMPLIANCE REPORTS
// SOC 2 and ISO/IEC 27001 evidence generated from the audit log. Every audit
// event is mapped to the framework control it provides evidence for; the
// summary adds chain-of-custody (hash chain verification), retention policy
// and alert evidence that auditors ask for alongside the raw trail.
// ============================================

export type AuditReportTemplate = 'audit_trail_soc2' | 'audit_trail_iso27001';

export interface AuditReportParams {
  from: Date;
  to: Date;
}

export interface AuditReportOutput {
  summary: Record<string, unknown>;
  data: Record<string, unknown>[];
}

export interface AuditControl {
  id: string;
  title: string;
}

export const AUDIT_REPORT_TEMPLATES: Record<
  AuditReportTemplate,
  { label: string; description: string; framework: string }
> = {
  audit_trail_soc2: {
    label: 'Audit Trail - SOC 2',
    description:
      'Complete audit trail with control mapping for SOC 2 CC6.1-CC6.8, CC7.2 and CC8.1: access, privileged changes, monitoring, log integrity and retention',
    framework: 'SOC2',
  },
  audit_trail_iso27001: {
    label: 'Audit Trail - ISO 27001',
    description:
      'Complete audit trail with control mapping for ISO/IEC 27001:2022 Annex A 5.15, 8.2, 8.5, 8.9, 8.15, 8.16 and 8.32: access, privileged changes, logging, monitoring and log protection',
    framework: 'ISO27001',
  },
};

const SOC2_CONTROLS: Record<string, AuditControl> = {
  'CC6.1': { id: 'CC6.1', title: 'Logical access security (authentication, data access)' },
  'CC6.2': { id: 'CC6.2', title: 'Access provisioning and removal' },
  'CC6.3': { id: 'CC6.3', title: 'Role-based access and privilege changes' },
  'CC6.6': { id: 'CC6.6', title: 'Protection against unauthorized access attempts' },
  'CC6.7': { id: 'CC6.7', title: 'Restriction of data transmission and export' },
  'CC7.2': { id: 'CC7.2', title: 'Monitoring of system activity and anomalies' },
  'CC8.1': { id: 'CC8.1', title: 'Change management' },
};

const ISO_CONTROLS: Record<string, AuditControl> = {
  'A.5.15': { id: 'A.5.15', title: 'Access control' },
  'A.8.2': { id: 'A.8.2', title: 'Privileged access rights' },
  'A.8.5': { id: 'A.8.5', title: 'Secure authentication' },
  'A.8.9': { id: 'A.8.9', title: 'Configuration management' },
  'A.8.12': { id: 'A.8.12', title: 'Data leakage prevention (export)' },
  'A.8.15': { id: 'A.8.15', title: 'Logging' },
  'A.8.16': { id: 'A.8.16', title: 'Monitoring activities' },
  'A.8.32': { id: 'A.8.32', title: 'Change management' },
};

/** Control an event provides evidence for under the given framework. */
export function controlFor(
  template: AuditReportTemplate,
  action: string,
  outcome: string
): AuditControl {
  if (template === 'audit_trail_soc2') {
    if (outcome === 'denied') return SOC2_CONTROLS['CC6.6'];
    switch (action) {
      case 'login':
      case 'logout':
      case 'login_failed':
      case 'api_key_created':
      case 'api_key_revoked':
      case 'view':
        return SOC2_CONTROLS['CC6.1'];
      case 'permission_granted':
      case 'permission_revoked':
        return SOC2_CONTROLS['CC6.3'];
      case 'assign':
        return SOC2_CONTROLS['CC6.2'];
      case 'export':
        return SOC2_CONTROLS['CC6.7'];
      case 'retention_run':
      case 'legal_hold':
        return SOC2_CONTROLS['CC7.2'];
      default:
        return SOC2_CONTROLS['CC8.1'];
    }
  }

  if (outcome === 'denied') return ISO_CONTROLS['A.8.16'];
  switch (action) {
    case 'login':
    case 'logout':
    case 'login_failed':
    case 'api_key_created':
    case 'api_key_revoked':
      return ISO_CONTROLS['A.8.5'];
    case 'permission_granted':
    case 'permission_revoked':
      return ISO_CONTROLS['A.8.2'];
    case 'view':
    case 'assign':
      return ISO_CONTROLS['A.5.15'];
    case 'export':
      return ISO_CONTROLS['A.8.12'];
    case 'config_change':
      return ISO_CONTROLS['A.8.9'];
    case 'retention_run':
    case 'legal_hold':
      return ISO_CONTROLS['A.8.15'];
    default:
      return ISO_CONTROLS['A.8.32'];
  }
}

const MAX_REPORT_ROWS = 10000;

const REPORT_COLUMNS = [
  'created_at', 'sequence', 'action', 'entity_type', 'entity_id', 'entity_name', 'user_id',
  'user_email', 'ip_address', 'outcome', 'severity', 'http_method', 'request_path',
  'status_code', 'changed_fields', 'record_hash',
].join(', ');

export async function generateAuditReport(
  tenantSlug: string,
  template: AuditReportTemplate,
  params: AuditReportParams
): Promise<AuditReportOutput> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const range = [params.from, params.to];
  // Live and archived records: a report for an older period must not lose archived events.
  const trail = `(SELECT ${REPORT_COLUMNS} FROM ${schema}.audit_logs
                  UNION ALL SELECT ${REPORT_COLUMNS} FROM ${schema}.audit_logs_archive) AS trail`;

  const [totals, byAction, byOutcome, privileged, perUser, events, alerts, chain, settings, held] =
    await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users,
                COUNT(*) FILTER (WHERE action = 'login_failed')::int AS failed_logins,
                COUNT(*) FILTER (WHERE outcome = 'denied')::int AS denied
           FROM ${trail} WHERE created_at BETWEEN $1 AND $2`,
        range
      ),
      pool.query(
        `SELECT action, COUNT(*)::int AS count FROM ${trail}
          WHERE created_at BETWEEN $1 AND $2 GROUP BY action ORDER BY count DESC`,
        range
      ),
      pool.query(
        `SELECT outcome, COUNT(*)::int AS count FROM ${trail}
          WHERE created_at BETWEEN $1 AND $2 GROUP BY outcome ORDER BY count DESC`,
        range
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM ${trail}
          WHERE created_at BETWEEN $1 AND $2
            AND action IN ('permission_granted', 'permission_revoked', 'config_change',
                           'api_key_created', 'api_key_revoked', 'legal_hold', 'retention_run')`,
        range
      ),
      pool.query(
        `SELECT COALESCE(user_email, user_id::text, 'system') AS user, COUNT(*)::int AS events,
                COUNT(*) FILTER (WHERE action IN ('create', 'update', 'delete'))::int AS changes,
                MAX(created_at) AS last_activity
           FROM ${trail} WHERE created_at BETWEEN $1 AND $2
          GROUP BY 1 ORDER BY events DESC LIMIT 50`,
        range
      ),
      pool.query(
        `SELECT created_at, sequence, action, entity_type, entity_id, entity_name, user_email,
                ip_address, outcome, severity, http_method, request_path, status_code,
                changed_fields, record_hash
           FROM ${trail} WHERE created_at BETWEEN $1 AND $2
          ORDER BY created_at, sequence LIMIT ${MAX_REPORT_ROWS + 1}`,
        range
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'open')::int AS open
           FROM ${schema}.audit_alerts WHERE created_at BETWEEN $1 AND $2`,
        range
      ),
      auditChainService.verifyChain(tenantSlug, params.from, params.to),
      auditService.getSettings(tenantSlug),
      pool.query(
        `SELECT (SELECT COUNT(*) FROM ${schema}.audit_logs WHERE legal_hold)::int +
                (SELECT COUNT(*) FROM ${schema}.audit_logs_archive WHERE legal_hold)::int AS held`
      ),
    ]);

  const truncated = events.rows.length > MAX_REPORT_ROWS;
  const rows = truncated ? events.rows.slice(0, MAX_REPORT_ROWS) : events.rows;

  const controlCounts = new Map<string, { control: AuditControl; events: number }>();
  const data = rows.map((row) => {
    const control = controlFor(template, row.action, row.outcome);
    const entry = controlCounts.get(control.id) ?? { control, events: 0 };
    entry.events += 1;
    controlCounts.set(control.id, entry);
    return { control: control.id, ...row };
  });

  const framework = AUDIT_REPORT_TEMPLATES[template].framework;

  return {
    summary: {
      framework,
      period: { from: params.from.toISOString(), to: params.to.toISOString() },
      totalEvents: totals.rows[0].total,
      distinctUsers: totals.rows[0].users,
      failedLogins: totals.rows[0].failed_logins,
      deniedAccess: totals.rows[0].denied,
      privilegedChanges: privileged.rows[0].count,
      eventsByAction: byAction.rows,
      eventsByOutcome: byOutcome.rows,
      userActivity: perUser.rows,
      controlCoverage: [...controlCounts.values()].map((c) => ({
        control: c.control.id,
        title: c.control.title,
        events: c.events,
      })),
      alerts: { raised: alerts.rows[0].total, open: alerts.rows[0].open },
      logIntegrity: {
        method: 'SHA-256 hash chain (tamper-evident)',
        valid: chain.valid,
        recordsVerified: chain.checkedCount,
        ...(chain.firstBrokenSequence !== undefined
          ? { firstBrokenSequence: chain.firstBrokenSequence }
          : {}),
      },
      retention: {
        retentionDays: settings.retention_days,
        archiveAfterDays: settings.archive_after_days,
        recordsUnderLegalHold: held.rows[0].held,
      },
      truncated,
      rowLimit: MAX_REPORT_ROWS,
    },
    data,
  };
}
