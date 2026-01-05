import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';

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
  | 'api_key_revoked';

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
}

// ============================================
// SENSITIVE FIELD MASKING
// ============================================

const DEFAULT_SENSITIVE_FIELDS = [
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

function maskSensitiveFields(
  data: Record<string, unknown> | null | undefined,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS
): Record<string, unknown> | null {
  if (!data) return null;

  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (field in masked) {
      masked[field] = '[REDACTED]';
    }

    // Check nested objects
    for (const key of Object.keys(masked)) {
      if (typeof masked[key] === 'object' && masked[key] !== null) {
        masked[key] = maskSensitiveFields(
          masked[key] as Record<string, unknown>,
          sensitiveFields
        );
      }
    }
  }

  return masked;
}

// ============================================
// CHANGE DETECTION
// ============================================

function detectChanges(
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

// ============================================
// AUDIT SERVICE
// ============================================

class AuditService {
  private sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS;

  async log(tenantSlug: string, entry: AuditLogEntry): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Detect changed fields if not provided
    const changedFields =
      entry.changedFields || detectChanges(entry.oldValues, entry.newValues);

    // Mask sensitive data
    const maskedOldValues = maskSensitiveFields(entry.oldValues, this.sensitiveFields);
    const maskedNewValues = maskSensitiveFields(entry.newValues, this.sensitiveFields);

    try {
      const result = await pool.query(
        `INSERT INTO ${schema}.audit_logs (
          user_id, user_email, user_name,
          action, entity_type, entity_id, entity_name,
          old_values, new_values, changed_fields,
          ip_address, user_agent, request_id, session_id,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.requestId || null,
          entry.sessionId || null,
          JSON.stringify(entry.metadata || {}),
        ]
      );

      logger.debug(
        {
          auditLogId: result.rows[0].id,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
        },
        'Audit log created'
      );

      // Invalidate audit cache - audit logs are append-only, so invalidate relevant caches
      await cacheService.invalidateTenant(tenantSlug, 'audit');

      return result.rows[0].id;
    } catch (error) {
      logger.error({ err: error, entry }, 'Failed to create audit log');
      throw error;
    }
  }

  async query(
    tenantSlug: string,
    options: AuditQueryOptions
  ): Promise<{ logs: AuditLogRecord[]; total: number }> {
    const cacheKey = `${tenantSlug}:audit:query:${JSON.stringify(options)}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (options.userId) {
          conditions.push(`user_id = $${paramIndex++}`);
          params.push(options.userId);
        }

        if (options.action) {
          if (Array.isArray(options.action)) {
            conditions.push(`action = ANY($${paramIndex++})`);
            params.push(options.action);
          } else {
            conditions.push(`action = $${paramIndex++}`);
            params.push(options.action);
          }
        }

        if (options.entityType) {
          conditions.push(`entity_type = $${paramIndex++}`);
          params.push(options.entityType);
        }

        if (options.entityId) {
          conditions.push(`entity_id = $${paramIndex++}`);
          params.push(options.entityId);
        }

        if (options.ipAddress) {
          conditions.push(`ip_address = $${paramIndex++}`);
          params.push(options.ipAddress);
        }

        if (options.startDate) {
          conditions.push(`created_at >= $${paramIndex++}`);
          params.push(options.startDate);
        }

        if (options.endDate) {
          conditions.push(`created_at <= $${paramIndex++}`);
          params.push(options.endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.audit_logs ${whereClause}`,
          params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get logs with pagination
        const limit = options.limit || 50;
        const offset = options.offset || 0;

        const result = await pool.query(
          `SELECT * FROM ${schema}.audit_logs
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...params, limit, offset]
        );

        return { logs: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - audit logs are append-only, rarely change
    );
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
      { ttl: 600 } // 10 minutes - entity history accessed frequently, changes only on new audit entries
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

  async getSummaryByUser(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_summary_by_user`
    );

    return result.rows;
  }

  async getSummaryByEntity(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_summary_by_entity`
    );

    return result.rows;
  }

  async getSettings(tenantSlug: string): Promise<{
    retention_days: number;
    log_reads: boolean;
    log_exports: boolean;
    sensitive_fields: string[];
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.audit_settings LIMIT 1`
    );

    if (result.rows.length === 0) {
      return {
        retention_days: 365,
        log_reads: false,
        log_exports: true,
        sensitive_fields: DEFAULT_SENSITIVE_FIELDS,
      };
    }

    return result.rows[0];
  }

  async updateSettings(
    tenantSlug: string,
    settings: {
      retention_days?: number;
      log_reads?: boolean;
      log_exports?: boolean;
      sensitive_fields?: string[];
    },
    updatedBy: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (settings.retention_days !== undefined) {
      updates.push(`retention_days = $${paramIndex++}`);
      params.push(settings.retention_days);
    }

    if (settings.log_reads !== undefined) {
      updates.push(`log_reads = $${paramIndex++}`);
      params.push(settings.log_reads);
    }

    if (settings.log_exports !== undefined) {
      updates.push(`log_exports = $${paramIndex++}`);
      params.push(settings.log_exports);
    }

    if (settings.sensitive_fields !== undefined) {
      updates.push(`sensitive_fields = $${paramIndex++}`);
      params.push(settings.sensitive_fields);
    }

    if (updates.length === 0) return;

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${paramIndex++}`);
    params.push(updatedBy);

    await pool.query(
      `UPDATE ${schema}.audit_settings SET ${updates.join(', ')}`,
      params
    );
  }

  async cleanupOldLogs(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get retention setting
    const settings = await this.getSettings(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.audit_logs
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [settings.retention_days]
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info(
        { tenantSlug, deletedCount, retentionDays: settings.retention_days },
        'Cleaned up old audit logs'
      );
    }

    return deletedCount;
  }
}

export const auditService = new AuditService();
