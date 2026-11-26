import { isIP } from 'net';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';
import { auditChainService, AUDIT_CONTENT_FIELDS } from './audit-chain.js';
import { auditAlertService } from './audit-alerts.js';
import { AUDIT_SEARCH_VECTOR_SQL, type AuditOutcome, type AuditSeverity } from '../lib/audit-search.js';

// ============================================
// TYPES
// ============================================

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'escalate'
  | 'permission_granted'
  | 'permission_revoked'
  | 'config_change'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'retention_run'
  | 'legal_hold';

export interface AuditLogEntry {
  userId?: string;
  userEmail?: string;
  userName?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  httpMethod?: string;
  requestPath?: string;
  statusCode?: number;
}

export interface AuditLogRecord {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  sequence?: number | string | null;
  prev_hash?: string | null;
  record_hash?: string | null;
  retention_until?: Date | null;
  legal_hold?: boolean | null;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  http_method?: string | null;
  request_path?: string | null;
  status_code?: number | null;
}

export interface AuditQueryOptions {
  userId?: string;
  action?: AuditAction | AuditAction[];
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  /** Full-text query over user, entity, action and request path */
  q?: string;
  severity?: AuditSeverity | AuditSeverity[];
  outcome?: AuditOutcome;
  /** live (default) = audit_logs, archive = audit_logs_archive, all = both */
  source?: 'live' | 'archive' | 'all';
}

export interface AuditSettings {
  retention_days: number;
  log_reads: boolean;
  log_exports: boolean;
  sensitive_fields: string[];
  archive_after_days: number | null;
  alerts_enabled: boolean;
}

export interface AuditSettingsUpdate {
  retention_days?: number;
  log_reads?: boolean;
  log_exports?: boolean;
  sensitive_fields?: string[];
  archive_after_days?: number | null;
  alerts_enabled?: boolean;
}

// Columns shared by audit_logs and audit_logs_archive (archive adds archived_at).
const AUDIT_COLUMNS = [
  'id', 'user_id', 'user_email', 'user_name', 'action', 'entity_type', 'entity_id',
  'entity_name', 'old_values', 'new_values', 'changed_fields', 'ip_address', 'user_agent',
  'request_id', 'session_id', 'metadata', 'created_at', 'sequence', 'prev_hash',
  'record_hash', 'retention_until', 'legal_hold', 'severity', 'outcome', 'http_method',
  'request_path', 'status_code', 'content_digest', 'chain_position',
].join(', ');

/** Hard cap on the rows an export returns, so a request cannot exhaust memory. */
export const AUDIT_EXPORT_MAX_ROWS = 50000;
/** Counting stops here: exact totals on very large tables are not worth a full scan. */
const AUDIT_COUNT_CAP = 100000;
/** Strings longer than this are truncated before they are stored in old/new values. */
const MAX_VALUE_LENGTH = 4096;
const MAX_MASK_DEPTH = 8;

// ============================================
// SENSITIVE FIELD MASKING
// ============================================

export const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'private_key',
  'credentials',
  'ssn',
  'credit_card',
];

const REDACTED = '[REDACTED]';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A key is sensitive when its normalized form equals a sensitive name
 * (`apiKey` == `api_key`) or, for names of five or more characters, contains
 * it (`newPassword`, `client_secret`, `accessToken`).
 */
function isSensitiveKey(key: string, normalizedSensitive: string[]): boolean {
  const k = normalizeKey(key);
  return normalizedSensitive.some(
    (s) => s.length > 0 && (k === s || (s.length >= 5 && k.includes(s)))
  );
}

function maskValue(value: unknown, normalizedSensitive: string[], depth: number): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}...[truncated]`
      : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (depth >= MAX_MASK_DEPTH) return '[MAX_DEPTH]';

  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, normalizedSensitive, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key, normalizedSensitive)
      ? REDACTED
      : maskValue(v, normalizedSensitive, depth + 1);
  }
  return out;
}

export function maskSensitiveFields(
  data: Record<string, unknown> | null | undefined,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS
): Record<string, unknown> | null {
  if (!data) return null;
  const normalized = sensitiveFields.map(normalizeKey);
  return maskValue(data, normalized, 0) as Record<string, unknown>;
}

// ============================================
// CHANGE DETECTION
// ============================================

export function detectChanges(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined
): string[] {
  if (!oldValues || !newValues) return [];

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const key of allKeys) {
    const oldVal = JSON.stringify(oldValues[key]);
    const newVal = JSON.stringify(newValues[key]);

    if (oldVal !== newVal) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Field-level diff: only the fields that changed, with their old and new
 * values. Fields in `ignore` (e.g. updated_at) are never reported.
 */
export function diffValues(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: string[] = []
): {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  changedFields: string[];
} {
  const skip = new Set(ignore);
  const changedFields = detectChanges(before, after).filter((f) => !skip.has(f));
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const field of changedFields) {
    oldValues[field] = before?.[field];
    newValues[field] = after?.[field];
  }
  return { oldValues, newValues, changedFields };
}

// ============================================
// CSV
// ============================================

/**
 * Escape one CSV cell. Cells that start with a formula trigger are prefixed
 * with a single quote so spreadsheet software does not execute them.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  // Only text can be a formula; real numbers (e.g. -5) stay numbers.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

export const AUDIT_EXPORT_COLUMNS = [
  'created_at', 'sequence', 'severity', 'outcome', 'action', 'entity_type', 'entity_id',
  'entity_name', 'user_id', 'user_email', 'user_name', 'ip_address', 'user_agent',
  'http_method', 'request_path', 'status_code', 'changed_fields', 'old_values', 'new_values',
  'request_id', 'record_hash',
];

// ============================================
// AUDIT SERVICE
// ============================================

const SETTINGS_TTL_MS = 30_000;

const DEFAULT_SETTINGS: AuditSettings = {
  retention_days: 365,
  log_reads: false,
  log_exports: true,
  sensitive_fields: DEFAULT_SENSITIVE_FIELDS,
  archive_after_days: null,
  alerts_enabled: true,
};

class AuditService {
  private settingsCache = new Map<string, { at: number; value: AuditSettings }>();

  /** Settings used on the write path; cached briefly so logging adds no extra query per request. */
  async getCachedSettings(tenantSlug: string): Promise<AuditSettings> {
    const hit = this.settingsCache.get(tenantSlug);
    if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
    const value = await this.getSettings(tenantSlug);
    this.settingsCache.set(tenantSlug, { at: Date.now(), value });
    return value;
  }

  /** Load every active tenant's settings (called at startup so the first write is masked per tenant). */
  async warmSettings(): Promise<void> {
    const tenants = await pool.query(`SELECT slug FROM tenants WHERE status = 'active'`);
    for (const tenant of tenants.rows as Array<{ slug: string }>) {
      await this.getCachedSettings(tenant.slug).catch(() => undefined);
    }
  }

  /** Settings if already loaded; never waits and never queries. */
  private peekSettings(tenantSlug: string): AuditSettings {
    return this.settingsCache.get(tenantSlug)?.value ?? DEFAULT_SETTINGS;
  }

  /** Start a background reload when the cached settings are missing or stale. */
  private refreshSettingsIfStale(tenantSlug: string): void {
    const hit = this.settingsCache.get(tenantSlug);
    if (!hit || Date.now() - hit.at >= SETTINGS_TTL_MS) {
      void this.getCachedSettings(tenantSlug).catch(() => undefined);
    }
  }

  /**
   * Write one audit record.
   *
   * The record is inserted in a single statement (retention_until is derived
   * from the tenant's audit_settings inside that statement), then sealed into
   * the hash chain: under a per-tenant advisory lock every unsealed record is
   * given prev_hash and record_hash = SHA-256(payload | prev_hash), in
   * sequence order. A failure to seal leaves the record unsealed; the next
   * write seals it.
   */
  async log(tenantSlug: string, entry: AuditLogEntry): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const settings = this.peekSettings(tenantSlug);

    // Detect changed fields if not provided
    const changedFields =
      entry.changedFields || detectChanges(entry.oldValues, entry.newValues);

    // Mask sensitive data (defaults plus the tenant's own list once loaded)
    const sensitive = [...new Set([...DEFAULT_SENSITIVE_FIELDS, ...(settings.sensitive_fields || [])])];
    const maskedOldValues = maskSensitiveFields(entry.oldValues, sensitive);
    const maskedNewValues = maskSensitiveFields(entry.newValues, sensitive);

    const ip = entry.ipAddress && isIP(entry.ipAddress) ? entry.ipAddress : null;

    let id: string;
    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.audit_logs (
          user_id, user_email, user_name,
          action, entity_type, entity_id, entity_name,
          old_values, new_values, changed_fields,
          ip_address, user_agent, request_id, session_id,
          metadata, severity, outcome, http_method, request_path, status_code,
          retention_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  (SELECT CASE WHEN retention_days > 0
                               THEN NOW() + INTERVAL '1 day' * retention_days END
                     FROM ${schema}.audit_settings LIMIT 1))
        RETURNING id`,
        [
          entry.userId || null,
          entry.userEmail || null,
          entry.userName || null,
          entry.action,
          entry.entityType,
          entry.entityId || null,
          entry.entityName || null,
          JSON.stringify(maskedOldValues),
          JSON.stringify(maskedNewValues),
          changedFields.length > 0 ? changedFields : null,
          ip,
          entry.userAgent || null,
          entry.requestId || null,
          entry.sessionId || null,
          JSON.stringify(entry.metadata || {}),
          entry.severity || 'info',
          entry.outcome || 'success',
          entry.httpMethod || null,
          entry.requestPath || null,
          entry.statusCode ?? null,
        ]
      );
      id = result.rows[0].id as string;

      logger.debug(
        { auditLogId: id, action: entry.action, entityType: entry.entityType, entityId: entry.entityId },
        'Audit log created'
      );
    } catch (error) {
      // Never log the entry itself: it carries request values that may be secrets.
      logger.error(
        { err: error, action: entry.action, entityType: entry.entityType, entityId: entry.entityId },
        'Failed to create audit log'
      );
      throw error;
    }

    // Audit logs are append-only, so invalidate relevant caches
    await cacheService.invalidateTenant(tenantSlug, 'audit');

    // Tenant masking / alert settings for the next write (the first write of a
    // process masks with the defaults only, since it must not wait for them).
    this.refreshSettingsIfStale(tenantSlug);

    // Sealing (and the alert rules it feeds) never blocks or fails the write.
    void this.sealPending(tenantSlug).catch((err) =>
      logger.warn({ err, tenantSlug }, 'Failed to seal audit records into the hash chain')
    );

    return id;
  }

  /**
   * Give every unsealed record its place in the hash chain, whatever its age
   * and however it was inserted (auditService.log, or a service's own INSERT).
   * Under a per-tenant advisory lock each record gets the next chain position,
   * a content digest over its old/new values, user, outcome etc., and
   * record_hash = SHA-256(payload | prev_hash). The alert rules are then
   * evaluated for the sealed events, so records written without
   * auditService.log (e.g. bulk operations) are covered too.
   */
  async sealPending(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();
    const events = new Map<string, Parameters<typeof auditAlertService.evaluate>[1]>();
    let sealed = 0;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${schema}:audit_chain`]);

      const last = await client.query(
        `SELECT record_hash, chain_position FROM ${schema}.audit_logs
          WHERE record_hash IS NOT NULL
          ORDER BY chain_position DESC NULLS LAST, sequence DESC LIMIT 1`
      );
      let prevHash: string | null = last.rows[0]?.record_hash ?? null;
      let position = Number(last.rows[0]?.chain_position ?? 0);

      const pending = await client.query(
        `SELECT id, sequence, created_at, action, entity_type, entity_id, user_id,
                host(ip_address) AS ip_address, metadata,
                ${AUDIT_CONTENT_FIELDS.join(', ')}
           FROM ${schema}.audit_logs
          WHERE record_hash IS NULL
          ORDER BY sequence`
      );

      for (const row of pending.rows) {
        position += 1;
        const digest = auditChainService.computeContentDigest(row);
        const recordHash = auditChainService.computeHash(
          {
            action: row.action,
            chain_position: position,
            content: digest,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
            entity_id: row.entity_id,
            entity_type: row.entity_type,
            ip_address: row.ip_address,
            metadata: row.metadata ?? {},
            sequence: Number(row.sequence),
            user_id: row.user_id,
          },
          prevHash
        );
        await client.query(
          `UPDATE ${schema}.audit_logs
              SET prev_hash = $1, record_hash = $2, content_digest = $3, chain_position = $4
            WHERE id = $5`,
          [prevHash, recordHash, digest, position, row.id]
        );
        prevHash = recordHash;
        sealed += 1;

        const key = [row.action, row.entity_type, row.outcome, row.user_email ?? row.user_id, row.ip_address].join('|');
        if (!events.has(key)) {
          events.set(key, {
            action: row.action,
            entityType: row.entity_type,
            outcome: row.outcome || 'success',
            userId: row.user_id ?? undefined,
            userEmail: row.user_email ?? undefined,
            ipAddress: row.ip_address ?? undefined,
          });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    if (this.peekSettings(tenantSlug).alerts_enabled !== false) {
      for (const event of events.values()) {
        await auditAlertService
          .evaluate(tenantSlug, event)
          .catch((err) => logger.warn({ err, tenantSlug }, 'Audit alert evaluation failed'));
      }
    }
    return sealed;
  }

  /** Like log() but never throws; for call sites where auditing must not break the request. */
  async logSafe(tenantSlug: string, entry: AuditLogEntry): Promise<string | null> {
    try {
      // Load the tenant's masking list before the first write.
      await this.getCachedSettings(tenantSlug).catch(() => undefined);
      return await this.log(tenantSlug, entry);
    } catch {
      return null;
    }
  }

  /**
   * Build the WHERE clause shared by query() and export. Every value is bound
   * as a parameter; the only interpolated text is fixed SQL.
   */
  private buildFilter(options: AuditQueryOptions): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('$?', `$${params.length}`));
    };

    if (options.userId) add('user_id = $?', options.userId);

    if (options.action) {
      if (Array.isArray(options.action)) add('action = ANY($?)', options.action);
      else add('action = $?', options.action);
    }
    if (options.entityType) add('entity_type = $?', options.entityType);
    if (options.entityId) add('entity_id = $?', options.entityId);
    if (options.ipAddress) add('ip_address = $?', options.ipAddress);
    if (options.severity) {
      if (Array.isArray(options.severity)) add('severity = ANY($?)', options.severity);
      else add('severity = $?', options.severity);
    }
    if (options.outcome) add('outcome = $?', options.outcome);
    if (options.startDate) add('created_at >= $?', options.startDate);
    if (options.endDate) add('created_at <= $?', options.endDate);
    if (options.q && options.q.trim()) {
      add(`${AUDIT_SEARCH_VECTOR_SQL} @@ websearch_to_tsquery('simple', $?)`, options.q.trim());
    }

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  private fromClause(schema: string, source: AuditQueryOptions['source']): string {
    if (source === 'archive') return `${schema}.audit_logs_archive`;
    if (source === 'all') {
      return `(SELECT ${AUDIT_COLUMNS} FROM ${schema}.audit_logs
               UNION ALL SELECT ${AUDIT_COLUMNS} FROM ${schema}.audit_logs_archive) AS audit_all`;
    }
    return `${schema}.audit_logs`;
  }

  /**
   * Search / filter audit logs. Cached for 10 minutes; every audit write
   * invalidates the tenant's audit cache. The composite / full-text indexes keep
   * misses fast, and the total is counted up to AUDIT_COUNT_CAP rows so deep
   * tables never trigger a full count.
   */
  async query(
    tenantSlug: string,
    options: AuditQueryOptions
  ): Promise<{ logs: AuditLogRecord[]; total: number; totalCapped?: boolean }> {
    const cacheKey = `${tenantSlug}:audit:query:${JSON.stringify(options)}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const { where, params } = this.buildFilter(options);
        const from = this.fromClause(schema, options.source);

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM (SELECT 1 FROM ${from} ${where} LIMIT ${AUDIT_COUNT_CAP + 1}) c`,
          params
        );
        const counted = parseInt(countResult.rows[0].count, 10);
        const totalCapped = counted > AUDIT_COUNT_CAP;

        const limit = options.limit || 50;
        const offset = options.offset || 0;

        const result = await pool.query(
          `SELECT ${AUDIT_COLUMNS} FROM ${from}
           ${where}
           ORDER BY created_at DESC, id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        );

        return {
          logs: result.rows,
          total: Math.min(counted, AUDIT_COUNT_CAP),
          ...(totalCapped ? { totalCapped: true } : {}),
        };
      },
      { ttl: 600 } // 10 minutes - invalidated on every audit write
    );
  }

  /** Rows for an export, newest first, bounded by AUDIT_EXPORT_MAX_ROWS. */
  async exportLogs(
    tenantSlug: string,
    options: AuditQueryOptions
  ): Promise<{ rows: AuditLogRecord[]; truncated: boolean }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { where, params } = this.buildFilter(options);
    const from = this.fromClause(schema, options.source);

    const result = await pool.query(
      `SELECT ${AUDIT_COLUMNS} FROM ${from}
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ${AUDIT_EXPORT_MAX_ROWS + 1}`,
      params
    );
    const truncated = result.rows.length > AUDIT_EXPORT_MAX_ROWS;
    return { rows: truncated ? result.rows.slice(0, AUDIT_EXPORT_MAX_ROWS) : result.rows, truncated };
  }

  async getEntityHistory(
    tenantSlug: string,
    entityType: string,
    entityId: string
  ): Promise<AuditLogRecord[]> {
    const cacheKey = `${tenantSlug}:audit:entity:${entityType}:${entityId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT al.*, u.name as user_display_name
           FROM ${schema}.audit_logs al
           LEFT JOIN ${schema}.users u ON al.user_id = u.id
           WHERE al.entity_type = $1 AND al.entity_id = $2
           ORDER BY al.created_at DESC`,
          [entityType, entityId]
        );

        return result.rows;
      },
      { ttl: 600 } // 10 minutes - invalidated on every audit write
    );
  }

  async getById(tenantSlug: string, id: string): Promise<AuditLogRecord | null> {
    const cacheKey = `${tenantSlug}:audit:log:${id}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT * FROM ${schema}.audit_logs WHERE id = $1`,
          [id]
        );

        return result.rows[0] || null;
      },
      { ttl: 1800 } // 30 minutes - individual audit logs never change (immutable)
    );
  }

  async getUserActivity(
    tenantSlug: string,
    userId: string,
    days: number = 30
  ): Promise<AuditLogRecord[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_logs
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY created_at DESC
       LIMIT 1000`,
      [userId, days]
    );

    return result.rows;
  }

  async getSecurityEvents(
    tenantSlug: string,
    hours: number = 24
  ): Promise<AuditLogRecord[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_logs
       WHERE action IN ('login', 'logout', 'login_failed', 'permission_granted',
                        'permission_revoked', 'api_key_created', 'api_key_revoked')
         AND created_at > NOW() - INTERVAL '1 hour' * $1
       ORDER BY created_at DESC`,
      [hours]
    );

    return result.rows;
  }

  async getFailedLogins(
    tenantSlug: string,
    hours: number = 24,
    threshold: number = 5
  ): Promise<{ email: string; count: number; last_attempt: Date }[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT user_email as email, COUNT(*) as count, MAX(created_at) as last_attempt
       FROM ${schema}.audit_logs
       WHERE action = 'login_failed'
         AND created_at > NOW() - INTERVAL '1 hour' * $1
       GROUP BY user_email
       HAVING COUNT(*) >= $2
       ORDER BY count DESC`,
      [hours, threshold]
    );

    return result.rows;
  }

  /**
   * Summaries come from the audit_summary_* views. Views are not cloned from
   * tenant_template, so a tenant created after migration 011 falls back to the
   * equivalent aggregate over audit_logs.
   */
  async getSummaryByUser(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    try {
      const result = await pool.query(`SELECT * FROM ${schema}.audit_summary_by_user`);
      return result.rows;
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      const result = await pool.query(
        `SELECT user_id, user_email, user_name, action,
                COUNT(*) AS action_count, MAX(created_at) AS last_action
           FROM ${schema}.audit_logs
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY user_id, user_email, user_name, action
          ORDER BY action_count DESC
          LIMIT 1000`
      );
      return result.rows;
    }
  }

  async getSummaryByEntity(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    try {
      const result = await pool.query(`SELECT * FROM ${schema}.audit_summary_by_entity`);
      return result.rows;
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      const result = await pool.query(
        `SELECT entity_type, entity_id, entity_name,
                COUNT(*) AS change_count, COUNT(DISTINCT user_id) AS unique_users,
                MAX(created_at) AS last_modified
           FROM ${schema}.audit_logs
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY entity_type, entity_id, entity_name
          ORDER BY last_modified DESC
          LIMIT 1000`
      );
      return result.rows;
    }
  }

  async getSettings(tenantSlug: string): Promise<AuditSettings> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_settings LIMIT 1`
    );

    if (result.rows.length === 0) {
      return { ...DEFAULT_SETTINGS };
    }

    return result.rows[0];
  }

  async updateSettings(
    tenantSlug: string,
    settings: AuditSettingsUpdate,
    updatedBy: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const columns: Array<[string, unknown]> = [];
    if (settings.retention_days !== undefined) columns.push(['retention_days', settings.retention_days]);
    if (settings.log_reads !== undefined) columns.push(['log_reads', settings.log_reads]);
    if (settings.log_exports !== undefined) columns.push(['log_exports', settings.log_exports]);
    if (settings.sensitive_fields !== undefined) columns.push(['sensitive_fields', settings.sensitive_fields]);
    if (settings.archive_after_days !== undefined) columns.push(['archive_after_days', settings.archive_after_days]);
    if (settings.alerts_enabled !== undefined) columns.push(['alerts_enabled', settings.alerts_enabled]);

    if (columns.length === 0) return;

    const sets = columns.map(([name], i) => `${name} = $${i + 1}`);
    const params: unknown[] = columns.map(([, value]) => value);
    sets.push('updated_at = NOW()');
    sets.push(`updated_by = $${params.length + 1}`);
    params.push(updatedBy);

    const result = await pool.query(
      `UPDATE ${schema}.audit_settings SET ${sets.join(', ')}`,
      params
    );

    if ((result.rowCount ?? 0) === 0) {
      // No settings row yet (tenant provisioned before the defaults were seeded).
      const names = columns.map(([name]) => name);
      const placeholders = names.map((_, i) => `$${i + 1}`);
      await pool.query(
        `INSERT INTO ${schema}.audit_settings (${names.join(', ')}, updated_by)
         VALUES (${placeholders.join(', ')}, $${names.length + 1})`,
        [...columns.map(([, value]) => value), updatedBy]
      );
    }

    // Reload so the very next write already uses the new masking list.
    this.settingsCache.delete(tenantSlug);
    await this.getCachedSettings(tenantSlug).catch(() => undefined);
  }

  /**
   * Delete records older than the retention window from the live table and the
   * archive. Records under legal hold are never deleted, and the newest live
   * record is kept so the hash chain keeps its anchor.
   */
  async cleanupOldLogs(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get retention setting
    const settings = await this.getSettings(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.audit_logs
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
         AND (legal_hold IS NULL OR legal_hold = false)
         AND sequence < (SELECT MAX(sequence) FROM ${schema}.audit_logs)
       RETURNING id`,
      [settings.retention_days]
    );
    const archived = await pool.query(
      `DELETE FROM ${schema}.audit_logs_archive
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
         AND (legal_hold IS NULL OR legal_hold = false)
       RETURNING id`,
      [settings.retention_days]
    );

    const deletedCount = (result.rowCount || 0) + (archived.rowCount || 0);

    if (deletedCount > 0) {
      logger.info(
        { tenantSlug, deletedCount, retentionDays: settings.retention_days },
        'Cleaned up old audit logs'
      );
      await cacheService.invalidateTenant(tenantSlug, 'audit');
    }

    return deletedCount;
  }
}

export const auditService = new AuditService();
