import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface PrivilegedGrant {
  id: string;
  requester_id: string;
  requester_email: string | null;
  approver_id: string | null;
  approver_email: string | null;
  privilege_type: string;
  resource: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'active' | 'expired' | 'revoked';
  requested_duration_hours: number;
  granted_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JitPrivilegeConfig {
  id: string;
  privilege_type: string;
  description: string | null;
  max_duration_hours: number;
  requires_approver: boolean;
  auto_approve: boolean;
  created_at: Date;
}

export interface PrivilegedSession {
  id: string;
  grant_id: string;
  user_id: string;
  activity_type: string;
  activity_detail: string | null;
  ip_address: string | null;
  recorded_at: Date;
}

export interface GrantSummary {
  total: number;
  approved: number;
  autoApproved: number;
  revoked: number;
  expired: number;
}

interface RequestGrantParams {
  requesterId: string;
  requesterEmail?: string;
  privilegeType: string;
  resource?: string;
  reason: string;
  durationHours: number;
}

interface ListGrantsFilters {
  status?: string;
  requesterId?: string;
  privilegeType?: string;
}

// ============================================
// SERVICE
// ============================================

export class PamService {
  /**
   * Request JIT privilege elevation.
   * If auto_approve=true for the privilege type, immediately activates the grant.
   */
  async requestGrant(tenantSlug: string, params: RequestGrantParams): Promise<PrivilegedGrant> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Fetch privilege config
    const configResult = await pool.query(
      `SELECT * FROM ${schema}.jit_privilege_config WHERE privilege_type = $1`,
      [params.privilegeType]
    );

    const config: JitPrivilegeConfig | null = configResult.rows[0] ?? null;

    // Validate duration against policy
    if (config) {
      if (params.durationHours > config.max_duration_hours) {
        throw new BadRequestError(
          `Requested duration (${params.durationHours}h) exceeds maximum allowed (${config.max_duration_hours}h) for privilege type '${params.privilegeType}'`
        );
      }
    }

    const autoApprove = config?.auto_approve ?? false;

    const status = autoApprove ? 'active' : 'pending';
    const grantedAt = autoApprove ? new Date() : null;
    const expiresAt = autoApprove
      ? new Date(Date.now() + params.durationHours * 60 * 60 * 1000)
      : null;

    const result = await pool.query(
      `INSERT INTO ${schema}.privileged_grants
        (requester_id, requester_email, privilege_type, resource, reason, status,
         requested_duration_hours, granted_at, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        params.requesterId,
        params.requesterEmail ?? null,
        params.privilegeType,
        params.resource ?? null,
        params.reason,
        status,
        params.durationHours,
        grantedAt,
        expiresAt,
      ]
    );

    const grant = result.rows[0] as PrivilegedGrant;

    logger.info(
      { tenantSlug, grantId: grant.id, privilegeType: params.privilegeType, autoApprove },
      'PAM grant requested'
    );

    return grant;
  }

  /**
   * Approve a pending grant and activate it.
   * Approver must differ from requester.
   */
  async approveGrant(
    tenantSlug: string,
    grantId: string,
    approverId: string,
    approverEmail?: string
  ): Promise<PrivilegedGrant> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const grantResult = await pool.query(
      `SELECT * FROM ${schema}.privileged_grants WHERE id = $1`,
      [grantId]
    );

    if (grantResult.rows.length === 0) {
      throw new NotFoundError('PrivilegedGrant', grantId);
    }

    const grant = grantResult.rows[0] as PrivilegedGrant;

    if (grant.requester_id === approverId) {
      throw new BadRequestError('Approver cannot be the same as the requester');
    }

    if (grant.status !== 'pending') {
      throw new BadRequestError(`Grant is not in 'pending' status (current: '${grant.status}')`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + grant.requested_duration_hours * 60 * 60 * 1000);

    const updateResult = await pool.query(
      `UPDATE ${schema}.privileged_grants
       SET status = 'active',
           approver_id = $1,
           approver_email = $2,
           granted_at = $3,
           expires_at = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [approverId, approverEmail ?? null, now, expiresAt, grantId]
    );

    const updated = updateResult.rows[0] as PrivilegedGrant;

    logger.info(
      { tenantSlug, grantId, approverId, expiresAt },
      'PAM grant approved and activated'
    );

    return updated;
  }

  /**
   * Revoke an active or approved grant early.
   */
  async revokeGrant(tenantSlug: string, grantId: string, revokedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const grantResult = await pool.query(
      `SELECT id, status FROM ${schema}.privileged_grants WHERE id = $1`,
      [grantId]
    );

    if (grantResult.rows.length === 0) {
      throw new NotFoundError('PrivilegedGrant', grantId);
    }

    const { status } = grantResult.rows[0] as { status: string };

    if (!['active', 'approved', 'pending'].includes(status)) {
      throw new BadRequestError(`Cannot revoke a grant with status '${status}'`);
    }

    await pool.query(
      `UPDATE ${schema}.privileged_grants
       SET status = 'revoked',
           revoked_at = NOW(),
           revoked_by = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [revokedBy, grantId]
    );

    logger.info({ tenantSlug, grantId, revokedBy }, 'PAM grant revoked');
  }

  /**
   * Record a privileged session activity event.
   */
  async logActivity(
    tenantSlug: string,
    grantId: string,
    userId: string,
    activityType: string,
    detail?: string,
    ipAddress?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Validate grant exists and is active
    const grantResult = await pool.query(
      `SELECT id, status FROM ${schema}.privileged_grants WHERE id = $1`,
      [grantId]
    );

    if (grantResult.rows.length === 0) {
      throw new NotFoundError('PrivilegedGrant', grantId);
    }

    if (grantResult.rows[0].status !== 'active') {
      throw new BadRequestError('Activity can only be logged for active grants');
    }

    await pool.query(
      `INSERT INTO ${schema}.privileged_sessions
        (grant_id, user_id, activity_type, activity_detail, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [grantId, userId, activityType, detail ?? null, ipAddress ?? null]
    );
  }

  /**
   * Mark grants whose expires_at has passed as 'expired'.
   * Returns the number of grants expired.
   */
  async expireStaleGrants(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.privileged_grants
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id`
    );

    const count = result.rowCount ?? 0;

    if (count > 0) {
      logger.info({ tenantSlug, count }, 'Expired stale PAM grants');
    }

    return count;
  }

  /**
   * List grants with optional filters.
   */
  async listGrants(tenantSlug: string, filters?: ListGrantsFilters): Promise<PrivilegedGrant[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }

    if (filters?.requesterId) {
      conditions.push(`requester_id = $${idx++}`);
      values.push(filters.requesterId);
    }

    if (filters?.privilegeType) {
      conditions.push(`privilege_type = $${idx++}`);
      values.push(filters.privilegeType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM ${schema}.privileged_grants ${where} ORDER BY created_at DESC`,
      values
    );

    return result.rows as PrivilegedGrant[];
  }

  /**
   * Get a single grant by ID.
   */
  async getGrant(tenantSlug: string, id: string): Promise<PrivilegedGrant> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.privileged_grants WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('PrivilegedGrant', id);
    }

    return result.rows[0] as PrivilegedGrant;
  }

  /**
   * Get the session activity log for a specific grant.
   */
  async getSessionActivity(tenantSlug: string, grantId: string): Promise<PrivilegedSession[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Ensure grant exists
    const grantResult = await pool.query(
      `SELECT id FROM ${schema}.privileged_grants WHERE id = $1`,
      [grantId]
    );

    if (grantResult.rows.length === 0) {
      throw new NotFoundError('PrivilegedGrant', grantId);
    }

    const result = await pool.query(
      `SELECT * FROM ${schema}.privileged_sessions WHERE grant_id = $1 ORDER BY recorded_at ASC`,
      [grantId]
    );

    return result.rows as PrivilegedSession[];
  }

  /**
   * List all JIT privilege configurations.
   */
  async listConfig(tenantSlug: string): Promise<JitPrivilegeConfig[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.jit_privilege_config ORDER BY privilege_type ASC`
    );

    return result.rows as JitPrivilegeConfig[];
  }

  /**
   * Create or update a JIT privilege configuration.
   */
  async upsertConfig(
    tenantSlug: string,
    privilegeType: string,
    config: {
      description?: string;
      maxDurationHours?: number;
      requiresApprover?: boolean;
      autoApprove?: boolean;
    }
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `INSERT INTO ${schema}.jit_privilege_config
        (privilege_type, description, max_duration_hours, requires_approver, auto_approve)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (privilege_type) DO UPDATE
         SET description        = COALESCE($2, ${schema}.jit_privilege_config.description),
             max_duration_hours = COALESCE($3, ${schema}.jit_privilege_config.max_duration_hours),
             requires_approver  = COALESCE($4, ${schema}.jit_privilege_config.requires_approver),
             auto_approve       = COALESCE($5, ${schema}.jit_privilege_config.auto_approve)`,
      [
        privilegeType,
        config.description ?? null,
        config.maxDurationHours ?? null,
        config.requiresApprover ?? null,
        config.autoApprove ?? null,
      ]
    );

    logger.info({ tenantSlug, privilegeType }, 'PAM JIT config upserted');
  }

  /**
   * Summary of grants within a date range for compliance reporting.
   */
  async getGrantSummary(tenantSlug: string, from: Date, to: Date): Promise<GrantSummary> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT
         COUNT(*)                                                      AS total,
         COUNT(*) FILTER (WHERE status IN ('active','approved','expired','revoked'))  AS approved,
         COUNT(*) FILTER (WHERE approver_id IS NULL AND status IN ('active','expired')) AS auto_approved,
         COUNT(*) FILTER (WHERE status = 'revoked')                   AS revoked,
         COUNT(*) FILTER (WHERE status = 'expired')                   AS expired
       FROM ${schema}.privileged_grants
       WHERE created_at >= $1
         AND created_at <= $2`,
      [from, to]
    );

    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10),
      approved: parseInt(row.approved, 10),
      autoApproved: parseInt(row.auto_approved, 10),
      revoked: parseInt(row.revoked, 10),
      expired: parseInt(row.expired, 10),
    };
  }
}

export const pamService = new PamService();
