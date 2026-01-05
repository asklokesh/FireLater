import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { randomBytes } from 'crypto';
import { cacheService } from '../utils/cache.js';

// ============================================
// SCHEDULES
// ============================================

interface CreateScheduleParams {
  name: string;
  description?: string;
  timezone?: string;
  groupId?: string;
  rotationType?: 'daily' | 'weekly' | 'bi_weekly' | 'custom';
  rotationLength?: number;
  handoffTime?: string;
  handoffDay?: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateScheduleParams {
  name?: string;
  description?: string;
  timezone?: string;
  groupId?: string | null;
  rotationType?: 'daily' | 'weekly' | 'bi_weekly' | 'custom';
  rotationLength?: number;
  handoffTime?: string;
  handoffDay?: number;
  isActive?: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
}

interface Schedule {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  group_id: string | null;
  rotation_type: string;
  rotation_length: number;
  handoff_time: string;
  handoff_day: number;
  is_active: boolean;
  color: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ScheduleFilters {
  groupId?: string;
  isActive?: boolean;
}

interface CreateShiftParams {
  scheduleId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  shiftType?: string;
  layer?: number;
}

interface CreateOverrideParams {
  scheduleId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  reason?: string;
  originalUserId?: string;
}

export class OnCallScheduleService {
  async list(tenantSlug: string, params: PaginationParams, filters?: ScheduleFilters): Promise<{ schedules: Schedule[]; total: number }> {
    const cacheKey = `${tenantSlug}:oncall:schedules:list:${JSON.stringify({ params, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(params);

        let whereClause = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (filters?.groupId) {
          whereClause += ` AND s.group_id = $${paramIndex++}`;
          values.push(filters.groupId);
        }
        if (filters?.isActive !== undefined) {
          whereClause += ` AND s.is_active = $${paramIndex++}`;
          values.push(filters.isActive);
        }

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.oncall_schedules s ${whereClause}`,
          values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT s.*, g.name as group_name,
                  (SELECT COUNT(*) FROM ${schema}.oncall_rotations r WHERE r.schedule_id = s.id AND r.is_active = true) as member_count
           FROM ${schema}.oncall_schedules s
           LEFT JOIN ${schema}.groups g ON s.group_id = g.id
           ${whereClause}
           ORDER BY s.name
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, params.perPage, offset]
        );

        return { schedules: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - balances read frequency with schedule changes
    );
  }

  async findById(tenantSlug: string, scheduleId: string): Promise<Schedule | null> {
    const cacheKey = `${tenantSlug}:oncall:schedules:schedule:${scheduleId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT s.*, g.name as group_name
           FROM ${schema}.oncall_schedules s
           LEFT JOIN ${schema}.groups g ON s.group_id = g.id
           WHERE s.id = $1`,
          [scheduleId]
        );

        return result.rows[0] || null;
      },
      { ttl: 600 } // 10 minutes
    );
  }

  async create(tenantSlug: string, params: CreateScheduleParams, createdBy: string): Promise<Schedule> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_schedules
       (name, description, timezone, group_id, rotation_type, rotation_length, handoff_time, handoff_day, color, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        params.name,
        params.description || null,
        params.timezone || 'UTC',
        params.groupId || null,
        params.rotationType || 'weekly',
        params.rotationLength || 1,
        params.handoffTime || '09:00',
        params.handoffDay || 1,
        params.color || null,
        JSON.stringify(params.metadata || {}),
      ]
    );

    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'create', 'oncall_schedule', $2, $3)`,
      [createdBy, result.rows[0].id, JSON.stringify({ name: params.name })]
    );

    // Invalidate all oncall schedule caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ scheduleId: result.rows[0].id }, 'On-call schedule created');
    return this.findById(tenantSlug, result.rows[0].id) as Promise<Schedule>;
  }

  async update(tenantSlug: string, scheduleId: string, params: UpdateScheduleParams, _updatedBy: string): Promise<Schedule> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, scheduleId);
    if (!existing) {
      throw new NotFoundError('On-call schedule', scheduleId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(params.timezone);
    }
    if (params.groupId !== undefined) {
      updates.push(`group_id = $${paramIndex++}`);
      values.push(params.groupId);
    }
    if (params.rotationType !== undefined) {
      updates.push(`rotation_type = $${paramIndex++}`);
      values.push(params.rotationType);
    }
    if (params.rotationLength !== undefined) {
      updates.push(`rotation_length = $${paramIndex++}`);
      values.push(params.rotationLength);
    }
    if (params.handoffTime !== undefined) {
      updates.push(`handoff_time = $${paramIndex++}`);
      values.push(params.handoffTime);
    }
    if (params.handoffDay !== undefined) {
      updates.push(`handoff_day = $${paramIndex++}`);
      values.push(params.handoffDay);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }
    if (params.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(params.color);
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(scheduleId);

    await pool.query(
      `UPDATE ${schema}.oncall_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Invalidate all oncall schedule caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ scheduleId }, 'On-call schedule updated');
    return this.findById(tenantSlug, scheduleId) as Promise<Schedule>;
  }

  async delete(tenantSlug: string, scheduleId: string, _deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, scheduleId);
    if (!existing) {
      throw new NotFoundError('On-call schedule', scheduleId);
    }

    await pool.query(
      `DELETE FROM ${schema}.oncall_schedules WHERE id = $1`,
      [scheduleId]
    );

    // Invalidate all oncall schedule caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ scheduleId }, 'On-call schedule deleted');
  }

  // Rotations
  async getRotations(tenantSlug: string, scheduleId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const schedule = await this.findById(tenantSlug, scheduleId);
    if (!schedule) {
      throw new NotFoundError('On-call schedule', scheduleId);
    }

    const result = await pool.query(
      `SELECT r.*, u.name as user_name, u.email as user_email, u.avatar_url
       FROM ${schema}.oncall_rotations r
       JOIN ${schema}.users u ON r.user_id = u.id
       WHERE r.schedule_id = $1 AND r.is_active = true
       ORDER BY r.position`,
      [scheduleId]
    );

    return result.rows;
  }

  async addToRotation(tenantSlug: string, scheduleId: string, userId: string, position?: number): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const schedule = await this.findById(tenantSlug, scheduleId);
    if (!schedule) {
      throw new NotFoundError('On-call schedule', scheduleId);
    }

    // Get max position if not specified
    if (position === undefined) {
      const maxResult = await pool.query(
        `SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM ${schema}.oncall_rotations WHERE schedule_id = $1`,
        [scheduleId]
      );
      position = maxResult.rows[0].next_pos;
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_rotations (schedule_id, user_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (schedule_id, user_id) DO UPDATE SET position = $3, is_active = true
       RETURNING *`,
      [scheduleId, userId, position]
    );

    // Invalidate oncall caches (member_count changed)
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ scheduleId, userId }, 'User added to on-call rotation');
    return result.rows[0];
  }

  async updateRotationPosition(tenantSlug: string, scheduleId: string, rotationId: string, position: number): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.oncall_rotations SET position = $1 WHERE id = $2 AND schedule_id = $3 RETURNING *`,
      [position, rotationId, scheduleId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Rotation', rotationId);
    }

    return result.rows[0];
  }

  async removeFromRotation(tenantSlug: string, scheduleId: string, rotationId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `UPDATE ${schema}.oncall_rotations SET is_active = false WHERE id = $1 AND schedule_id = $2`,
      [rotationId, scheduleId]
    );

    // Invalidate oncall caches (member_count changed)
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ scheduleId, rotationId }, 'User removed from on-call rotation');
  }

  // Shifts
  async getShifts(tenantSlug: string, scheduleId: string, startDate: Date, endDate: Date): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT s.*, u.name as user_name, u.email as user_email, u.avatar_url,
              ou.name as original_user_name
       FROM ${schema}.oncall_shifts s
       LEFT JOIN ${schema}.users u ON s.user_id = u.id
       LEFT JOIN ${schema}.users ou ON s.original_user_id = ou.id
       WHERE s.schedule_id = $1 AND s.start_time >= $2 AND s.end_time <= $3
       ORDER BY s.start_time`,
      [scheduleId, startDate, endDate]
    );

    return result.rows;
  }

  async createShift(tenantSlug: string, params: CreateShiftParams, createdBy: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_shifts (schedule_id, user_id, start_time, end_time, shift_type, layer, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.scheduleId,
        params.userId,
        params.startTime,
        params.endTime,
        params.shiftType || 'primary',
        params.layer || 1,
        createdBy,
      ]
    );

    logger.info({ shiftId: result.rows[0].id }, 'On-call shift created');
    return result.rows[0];
  }

  async createOverride(tenantSlug: string, params: CreateOverrideParams, createdBy: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_shifts
       (schedule_id, user_id, start_time, end_time, shift_type, override_reason, original_user_id, created_by)
       VALUES ($1, $2, $3, $4, 'override', $5, $6, $7)
       RETURNING *`,
      [
        params.scheduleId,
        params.userId,
        params.startTime,
        params.endTime,
        params.reason || null,
        params.originalUserId || null,
        createdBy,
      ]
    );

    logger.info({ shiftId: result.rows[0].id }, 'On-call override created');
    return result.rows[0];
  }

  async deleteShift(tenantSlug: string, scheduleId: string, shiftId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.oncall_shifts WHERE id = $1 AND schedule_id = $2`,
      [shiftId, scheduleId]
    );

    logger.info({ shiftId }, 'On-call shift deleted');
  }

  // Who is on call
  async whoIsOnCall(tenantSlug: string, scheduleId?: string, applicationId?: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    let query = `
      SELECT s.id as schedule_id, s.name as schedule_name,
             sh.id as shift_id, sh.start_time, sh.end_time, sh.shift_type,
             u.id as user_id, u.name as user_name, u.email as user_email, u.phone
      FROM ${schema}.oncall_schedules s
      JOIN ${schema}.oncall_shifts sh ON sh.schedule_id = s.id
      JOIN ${schema}.users u ON sh.user_id = u.id
      WHERE s.is_active = true
        AND sh.start_time <= NOW()
        AND sh.end_time > NOW()
        AND sh.shift_type IN ('primary', 'override')
    `;

    const values: unknown[] = [];
    let paramIndex = 1;

    if (scheduleId) {
      query += ` AND s.id = $${paramIndex++}`;
      values.push(scheduleId);
    }

    if (applicationId) {
      query += ` AND EXISTS (
        SELECT 1 FROM ${schema}.oncall_schedule_applications sa
        WHERE sa.schedule_id = s.id AND sa.application_id = $${paramIndex++}
      )`;
      values.push(applicationId);
    }

    query += ' ORDER BY sh.shift_type DESC, sh.start_time';

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Link schedule to applications
  async linkToApplication(tenantSlug: string, scheduleId: string, applicationId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `INSERT INTO ${schema}.oncall_schedule_applications (schedule_id, application_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [scheduleId, applicationId]
    );
  }

  async unlinkFromApplication(tenantSlug: string, scheduleId: string, applicationId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.oncall_schedule_applications WHERE schedule_id = $1 AND application_id = $2`,
      [scheduleId, applicationId]
    );
  }

  async getLinkedApplications(tenantSlug: string, scheduleId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT a.* FROM ${schema}.applications a
       JOIN ${schema}.oncall_schedule_applications sa ON sa.application_id = a.id
       WHERE sa.schedule_id = $1
       ORDER BY a.name`,
      [scheduleId]
    );

    return result.rows;
  }
}

// ============================================
// ESCALATION POLICIES
// ============================================

interface CreatePolicyParams {
  name: string;
  description?: string;
  repeatCount?: number;
  repeatDelayMinutes?: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

interface UpdatePolicyParams {
  name?: string;
  description?: string;
  repeatCount?: number;
  repeatDelayMinutes?: number;
  isDefault?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

interface EscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  repeat_count: number;
  repeat_delay_minutes: number;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface AddStepParams {
  stepNumber?: number;
  delayMinutes?: number;
  notifyType: 'schedule' | 'user' | 'group';
  scheduleId?: string;
  userId?: string;
  groupId?: string;
  notificationChannels?: string[];
}

interface UpdateStepParams {
  delayMinutes?: number;
  notifyType?: 'schedule' | 'user' | 'group';
  scheduleId?: string | null;
  userId?: string | null;
  groupId?: string | null;
  notificationChannels?: string[];
}

export class EscalationPolicyService {
  async list(tenantSlug: string, params: PaginationParams): Promise<{ policies: EscalationPolicy[]; total: number }> {
    const cacheKey = `${tenantSlug}:oncall:escalation:list:${JSON.stringify(params)}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(params);

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.oncall_escalation_policies WHERE is_active = true`
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT ep.*,
                  (SELECT COUNT(*) FROM ${schema}.oncall_escalation_steps es WHERE es.policy_id = ep.id) as step_count
           FROM ${schema}.oncall_escalation_policies ep
           WHERE ep.is_active = true
           ORDER BY ep.is_default DESC, ep.name
           LIMIT $1 OFFSET $2`,
          [params.perPage, offset]
        );

        return { policies: result.rows, total };
      },
      { ttl: 900 } // 15 minutes - escalation policies change very infrequently
    );
  }

  async findById(tenantSlug: string, policyId: string): Promise<EscalationPolicy | null> {
    const cacheKey = `${tenantSlug}:oncall:escalation:policy:${policyId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT * FROM ${schema}.oncall_escalation_policies WHERE id = $1`,
          [policyId]
        );

        return result.rows[0] || null;
      },
      { ttl: 900 } // 15 minutes
    );
  }

  async create(tenantSlug: string, params: CreatePolicyParams, _createdBy: string): Promise<EscalationPolicy> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // If this is default, unset other defaults
    if (params.isDefault) {
      await pool.query(
        `UPDATE ${schema}.oncall_escalation_policies SET is_default = false WHERE is_default = true`
      );
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_escalation_policies
       (name, description, repeat_count, repeat_delay_minutes, is_default, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.name,
        params.description || null,
        params.repeatCount || 3,
        params.repeatDelayMinutes || 5,
        params.isDefault || false,
        JSON.stringify(params.metadata || {}),
      ]
    );

    // Invalidate all oncall escalation caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ policyId: result.rows[0].id }, 'Escalation policy created');
    return result.rows[0];
  }

  async update(tenantSlug: string, policyId: string, params: UpdatePolicyParams, _updatedBy: string): Promise<EscalationPolicy> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, policyId);
    if (!existing) {
      throw new NotFoundError('Escalation policy', policyId);
    }

    // If setting as default, unset other defaults
    if (params.isDefault) {
      await pool.query(
        `UPDATE ${schema}.oncall_escalation_policies SET is_default = false WHERE is_default = true AND id != $1`,
        [policyId]
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.repeatCount !== undefined) {
      updates.push(`repeat_count = $${paramIndex++}`);
      values.push(params.repeatCount);
    }
    if (params.repeatDelayMinutes !== undefined) {
      updates.push(`repeat_delay_minutes = $${paramIndex++}`);
      values.push(params.repeatDelayMinutes);
    }
    if (params.isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(params.isDefault);
    }
    if (params.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(params.isActive);
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(policyId);

    await pool.query(
      `UPDATE ${schema}.oncall_escalation_policies SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Invalidate all oncall escalation caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ policyId }, 'Escalation policy updated');
    return this.findById(tenantSlug, policyId) as Promise<EscalationPolicy>;
  }

  async delete(tenantSlug: string, policyId: string, _deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, policyId);
    if (!existing) {
      throw new NotFoundError('Escalation policy', policyId);
    }

    await pool.query(
      `UPDATE ${schema}.oncall_escalation_policies SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [policyId]
    );

    // Invalidate all oncall escalation caches for this tenant
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ policyId }, 'Escalation policy deleted');
  }

  // Steps
  async getSteps(tenantSlug: string, policyId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT es.*,
              s.name as schedule_name,
              u.name as user_name, u.email as user_email,
              g.name as group_name
       FROM ${schema}.oncall_escalation_steps es
       LEFT JOIN ${schema}.oncall_schedules s ON es.schedule_id = s.id
       LEFT JOIN ${schema}.users u ON es.user_id = u.id
       LEFT JOIN ${schema}.groups g ON es.group_id = g.id
       WHERE es.policy_id = $1
       ORDER BY es.step_number`,
      [policyId]
    );

    return result.rows;
  }

  async addStep(tenantSlug: string, policyId: string, params: AddStepParams): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get max step number if not specified
    let stepNumber = params.stepNumber;
    if (stepNumber === undefined) {
      const maxResult = await pool.query(
        `SELECT COALESCE(MAX(step_number), 0) + 1 as next_step FROM ${schema}.oncall_escalation_steps WHERE policy_id = $1`,
        [policyId]
      );
      stepNumber = maxResult.rows[0].next_step;
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.oncall_escalation_steps
       (policy_id, step_number, delay_minutes, notify_type, schedule_id, user_id, group_id, notification_channels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        policyId,
        stepNumber,
        params.delayMinutes || 5,
        params.notifyType,
        params.scheduleId || null,
        params.userId || null,
        params.groupId || null,
        params.notificationChannels || ['email'],
      ]
    );

    // Invalidate oncall caches (step_count changed)
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ policyId, stepNumber }, 'Escalation step added');
    return result.rows[0];
  }

  async updateStep(tenantSlug: string, policyId: string, stepId: string, params: UpdateStepParams): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.delayMinutes !== undefined) {
      updates.push(`delay_minutes = $${paramIndex++}`);
      values.push(params.delayMinutes);
    }
    if (params.notifyType !== undefined) {
      updates.push(`notify_type = $${paramIndex++}`);
      values.push(params.notifyType);
    }
    if (params.scheduleId !== undefined) {
      updates.push(`schedule_id = $${paramIndex++}`);
      values.push(params.scheduleId);
    }
    if (params.userId !== undefined) {
      updates.push(`user_id = $${paramIndex++}`);
      values.push(params.userId);
    }
    if (params.groupId !== undefined) {
      updates.push(`group_id = $${paramIndex++}`);
      values.push(params.groupId);
    }
    if (params.notificationChannels !== undefined) {
      updates.push(`notification_channels = $${paramIndex++}`);
      values.push(params.notificationChannels);
    }

    if (updates.length === 0) {
      const current = await pool.query(
        `SELECT * FROM ${schema}.oncall_escalation_steps WHERE id = $1 AND policy_id = $2`,
        [stepId, policyId]
      );
      return current.rows[0];
    }

    values.push(stepId, policyId);

    const result = await pool.query(
      `UPDATE ${schema}.oncall_escalation_steps SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND policy_id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Escalation step', stepId);
    }

    // Invalidate oncall caches (step details changed)
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    return result.rows[0];
  }

  async deleteStep(tenantSlug: string, policyId: string, stepId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.oncall_escalation_steps WHERE id = $1 AND policy_id = $2`,
      [stepId, policyId]
    );

    // Invalidate oncall caches (step_count changed)
    await cacheService.invalidateTenant(tenantSlug, 'oncall');

    logger.info({ policyId, stepId }, 'Escalation step deleted');
  }
}

// ============================================
// ICAL EXPORT
// ============================================

interface ICalShift {
  id: string;
  start_time: Date;
  end_time: Date;
  user_name: string;
  user_email?: string;
  shift_type: string;
}

interface ICalExportParams {
  scheduleId: string;
  from?: Date;
  to?: Date;
  userId?: string;
}

interface SubscriptionTokenResult {
  tenantSlug: string;
  userId: string;
  filterUserId: string | null;
}

interface CreateSubscriptionResult {
  token: string;
  url: string;
}

interface ValidateSubscriptionResult {
  userId: string;
  filterUserId: string | null;
}

export class ICalExportService {
  /**
   * Format a date to iCal format (YYYYMMDDTHHMMSSZ)
   */
  private formatDateToICal(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /**
   * Escape special characters in iCal text values
   */
  private escapeICalText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  /**
   * Generate a unique UID for an iCal event
   */
  private generateUID(shiftId: string, tenantSlug: string): string {
    return `shift-${shiftId}@${tenantSlug}.firelater.com`;
  }

  /**
   * Generate an iCalendar file for on-call shifts
   */
  async generateICalendar(
    tenantSlug: string,
    params: ICalExportParams
  ): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get schedule details
    const schedule = await oncallScheduleService.findById(tenantSlug, params.scheduleId);
    if (!schedule) {
      throw new NotFoundError('On-call schedule', params.scheduleId);
    }

    // Default date range: 30 days before to 90 days after
    const now = new Date();
    const from = params.from || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = params.to || new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Build query for shifts
    let query = `
      SELECT s.id, s.start_time, s.end_time, s.shift_type,
             u.name as user_name, u.email as user_email
      FROM ${schema}.oncall_shifts s
      LEFT JOIN ${schema}.users u ON s.user_id = u.id
      WHERE s.schedule_id = $1
        AND s.start_time >= $2
        AND s.end_time <= $3
    `;
    const values: unknown[] = [params.scheduleId, from, to];
    let paramIndex = 4;

    if (params.userId) {
      query += ` AND s.user_id = $${paramIndex++}`;
      values.push(params.userId);
    }

    query += ' ORDER BY s.start_time';

    const result = await pool.query(query, values);
    const shifts: ICalShift[] = result.rows;

    // Generate iCalendar content
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//FireLater//On-Call Schedule//${tenantSlug}//EN`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${this.escapeICalText(schedule.name)} - On-Call`,
      `X-WR-TIMEZONE:${schedule.timezone || 'UTC'}`,
    ];

    // Add timezone definition
    lines.push(
      'BEGIN:VTIMEZONE',
      `TZID:${schedule.timezone || 'UTC'}`,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0000',
      'TZOFFSETTO:+0000',
      'END:STANDARD',
      'END:VTIMEZONE'
    );

    // Add events for each shift
    for (const shift of shifts) {
      const summary = `On-Call: ${shift.user_name} - ${schedule.name}`;
      const description = `On-call shift for ${schedule.name}\\nShift type: ${shift.shift_type}`;
      const uid = this.generateUID(shift.id, tenantSlug);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${this.formatDateToICal(new Date())}`,
        `DTSTART:${this.formatDateToICal(new Date(shift.start_time))}`,
        `DTEND:${this.formatDateToICal(new Date(shift.end_time))}`,
        `SUMMARY:${this.escapeICalText(summary)}`,
        `DESCRIPTION:${this.escapeICalText(description)}`,
        `CATEGORIES:On-Call,${shift.shift_type}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT'
      );

      // Add organizer if email available
      if (shift.user_email) {
        lines.push(`ORGANIZER;CN=${this.escapeICalText(shift.user_name)}:mailto:${shift.user_email}`);
      }

      // Add alarm (15 minutes before shift)
      lines.push(
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:On-call shift starting in 15 minutes: ${this.escapeICalText(schedule.name)}`,
        'END:VALARM'
      );

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Generate a subscription token for calendar subscription
   */
  async createSubscriptionToken(
    tenantSlug: string,
    scheduleId: string,
    userId: string,
    filterUserId?: string
  ): Promise<CreateSubscriptionResult> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify schedule exists
    const schedule = await oncallScheduleService.findById(tenantSlug, scheduleId);
    if (!schedule) {
      throw new NotFoundError('On-call schedule', scheduleId);
    }

    // Generate a secure token
    const token = randomBytes(32).toString('hex');

    // Store subscription in database
    await pool.query(
      `INSERT INTO ${schema}.oncall_calendar_subscriptions
       (schedule_id, user_id, token, filter_user_id, created_at, last_accessed_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (schedule_id, user_id, filter_user_id)
       DO UPDATE SET token = $3, last_accessed_at = NOW()`,
      [scheduleId, userId, token, filterUserId || null]
    );

    // Build the subscription URL
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const url = `${baseUrl}/v1/oncall/schedules/${scheduleId}/ical/subscribe/${token}`;

    logger.info({ scheduleId, userId }, 'Calendar subscription token created');
    return { token, url };
  }

  /**
   * Validate subscription token and return schedule/filter info
   */
  async validateSubscriptionToken(
    tenantSlug: string,
    scheduleId: string,
    token: string
  ): Promise<ValidateSubscriptionResult | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT user_id, filter_user_id FROM ${schema}.oncall_calendar_subscriptions
       WHERE schedule_id = $1 AND token = $2`,
      [scheduleId, token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Update last accessed timestamp
    await pool.query(
      `UPDATE ${schema}.oncall_calendar_subscriptions
       SET last_accessed_at = NOW()
       WHERE schedule_id = $1 AND token = $2`,
      [scheduleId, token]
    );

    return {
      userId: result.rows[0].user_id,
      filterUserId: result.rows[0].filter_user_id,
    };
  }

  /**
   * Validate subscription token for public endpoint (no tenant context)
   * Searches across all tenant schemas to find the subscription
   * Optimized to avoid N+1 query pattern by using UNION ALL
   */
  async validatePublicSubscriptionToken(
    scheduleId: string,
    token: string
  ): Promise<SubscriptionTokenResult | null> {
    // Get all tenant schemas
    const schemasResult = await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
    );

    if (schemasResult.rows.length === 0) {
      return null;
    }

    // Build UNION ALL query to search all tenant schemas in single query
    const unionQueries: string[] = [];
    for (const row of schemasResult.rows) {
      const schema = row.nspname;
      unionQueries.push(`
        SELECT
          '${schema}' as schema_name,
          user_id,
          filter_user_id
        FROM ${schema}.oncall_calendar_subscriptions
        WHERE schedule_id = $1 AND token = $2
      `);
    }

    const unionQuery = unionQueries.join(' UNION ALL ');

    // Execute single query across all tenant schemas
    const result = await pool.query(unionQuery, [scheduleId, token]);

    if (result.rows.length > 0) {
      const subscription = result.rows[0];
      const schema = subscription.schema_name;
      const tenantSlug = schema.replace('tenant_', '').replace(/_/g, '-');

      // Update last accessed timestamp in the specific tenant schema
      await pool.query(
        `UPDATE ${schema}.oncall_calendar_subscriptions
         SET last_accessed_at = NOW()
         WHERE schedule_id = $1 AND token = $2`,
        [scheduleId, token]
      );

      return {
        tenantSlug,
        userId: subscription.user_id,
        filterUserId: subscription.filter_user_id,
      };
    }

    return null;
  }

  /**
   * Revoke a subscription token
   */
  async revokeSubscriptionToken(
    tenantSlug: string,
    scheduleId: string,
    userId: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.oncall_calendar_subscriptions
       WHERE schedule_id = $1 AND user_id = $2`,
      [scheduleId, userId]
    );

    logger.info({ scheduleId, userId }, 'Calendar subscription token revoked');
  }
}

export const oncallScheduleService = new OnCallScheduleService();
export const escalationPolicyService = new EscalationPolicyService();
export const icalExportService = new ICalExportService();
