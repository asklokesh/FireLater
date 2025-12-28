import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { oncallScheduleService } from './oncall.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getOffset } from '../utils/pagination.js';
import type { PaginationParams } from '../types/index.js';

// ============================================
// TYPES
// ============================================

interface ShiftSwapFilters {
  scheduleId?: string;
  status?: string;
  requesterId?: string;
  offeredToUserId?: string;
  fromDate?: string;
  toDate?: string;
}

interface CreateShiftSwapParams {
  scheduleId: string;
  originalStart: string;
  originalEnd: string;
  offeredToUserId?: string;
  originalShiftId?: string;
  reason?: string;
  expiresAt?: string;
}

interface UpdateShiftSwapParams {
  reason?: string;
  offeredToUserId?: string | null;
  expiresAt?: string | null;
}

interface ShiftSwapRequest {
  id: string;
  swap_number: string;
  schedule_id: string;
  original_shift_id: string | null;
  requester_id: string;
  original_start: Date;
  original_end: Date;
  offered_to_user_id: string | null;
  accepter_id: string | null;
  replacement_start: Date | null;
  replacement_end: Date | null;
  status: string;
  reason: string | null;
  response_message: string | null;
  requested_at: Date;
  responded_at: Date | null;
  expires_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// SHIFT SWAP SERVICE
// ============================================

class ShiftSwapService {
  /**
   * List shift swap requests with filters
   */
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters: ShiftSwapFilters = {}
  ): Promise<{ swaps: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.scheduleId) {
      whereClause += ` AND s.schedule_id = $${paramIndex++}`;
      params.push(filters.scheduleId);
    }

    if (filters.status) {
      whereClause += ` AND s.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.requesterId) {
      whereClause += ` AND s.requester_id = $${paramIndex++}`;
      params.push(filters.requesterId);
    }

    if (filters.offeredToUserId) {
      whereClause += ` AND s.offered_to_user_id = $${paramIndex++}`;
      params.push(filters.offeredToUserId);
    }

    if (filters.fromDate) {
      whereClause += ` AND s.original_start >= $${paramIndex++}`;
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      whereClause += ` AND s.original_end <= $${paramIndex++}`;
      params.push(filters.toDate);
    }

    const countQuery = `SELECT COUNT(*) FROM ${schema}.shift_swap_requests s ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT s.*,
             sched.name as schedule_name,
             req.name as requester_name,
             req.email as requester_email,
             offered.name as offered_to_name,
             offered.email as offered_to_email,
             accepter.name as accepter_name,
             accepter.email as accepter_email,
             approver.name as approved_by_name
      FROM ${schema}.shift_swap_requests s
      LEFT JOIN ${schema}.oncall_schedules sched ON s.schedule_id = sched.id
      LEFT JOIN ${schema}.users req ON s.requester_id = req.id
      LEFT JOIN ${schema}.users offered ON s.offered_to_user_id = offered.id
      LEFT JOIN ${schema}.users accepter ON s.accepter_id = accepter.id
      LEFT JOIN ${schema}.users approver ON s.approved_by = approver.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pagination.perPage, offset);

    const result = await pool.query(query, params);
    return { swaps: result.rows, total };
  }

  /**
   * Get a shift swap by ID
   */
  async getById(tenantSlug: string, swapId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Support both UUID and swap_number
    const idColumn = swapId.startsWith('SWAP-') ? 'swap_number' : 'id';

    const result = await pool.query(
      `SELECT s.*,
              sched.name as schedule_name,
              req.name as requester_name,
              req.email as requester_email,
              offered.name as offered_to_name,
              offered.email as offered_to_email,
              accepter.name as accepter_name,
              accepter.email as accepter_email,
              approver.name as approved_by_name
       FROM ${schema}.shift_swap_requests s
       LEFT JOIN ${schema}.oncall_schedules sched ON s.schedule_id = sched.id
       LEFT JOIN ${schema}.users req ON s.requester_id = req.id
       LEFT JOIN ${schema}.users offered ON s.offered_to_user_id = offered.id
       LEFT JOIN ${schema}.users accepter ON s.accepter_id = accepter.id
       LEFT JOIN ${schema}.users approver ON s.approved_by = approver.id
       WHERE s.${idColumn} = $1`,
      [swapId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError('Shift Swap Request', swapId);
    }

    return result.rows[0];
  }

  /**
   * Get current user's outgoing swap requests
   */
  async getMyRequests(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT s.*,
              sched.name as schedule_name,
              offered.name as offered_to_name,
              offered.email as offered_to_email,
              accepter.name as accepter_name,
              accepter.email as accepter_email
       FROM ${schema}.shift_swap_requests s
       LEFT JOIN ${schema}.oncall_schedules sched ON s.schedule_id = sched.id
       LEFT JOIN ${schema}.users offered ON s.offered_to_user_id = offered.id
       LEFT JOIN ${schema}.users accepter ON s.accepter_id = accepter.id
       WHERE s.requester_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get swaps available for a user to accept
   * (swaps from same schedules where they are in the rotation, or directly offered to them)
   */
  async getAvailableToAccept(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT s.*,
              sched.name as schedule_name,
              req.name as requester_name,
              req.email as requester_email
       FROM ${schema}.shift_swap_requests s
       LEFT JOIN ${schema}.oncall_schedules sched ON s.schedule_id = sched.id
       LEFT JOIN ${schema}.users req ON s.requester_id = req.id
       WHERE s.status = 'pending'
         AND s.requester_id != $1
         AND (s.expires_at IS NULL OR s.expires_at > NOW())
         AND (
           -- Directly offered to this user
           s.offered_to_user_id = $1
           OR (
             -- Open offer and user is in the same schedule rotation
             s.offered_to_user_id IS NULL
             AND EXISTS (
               SELECT 1 FROM ${schema}.oncall_rotations r
               WHERE r.schedule_id = s.schedule_id
                 AND r.user_id = $1
                 AND r.is_active = true
             )
           )
         )
       ORDER BY s.original_start ASC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Create a new swap request
   */
  async create(
    tenantSlug: string,
    requesterId: string,
    params: CreateShiftSwapParams
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify schedule exists
    const schedule = await oncallScheduleService.findById(tenantSlug, params.scheduleId);
    if (!schedule) {
      throw new NotFoundError('On-call Schedule', params.scheduleId);
    }

    // Verify requester is in the rotation
    const rotationCheck = await pool.query(
      `SELECT id FROM ${schema}.oncall_rotations
       WHERE schedule_id = $1 AND user_id = $2 AND is_active = true`,
      [params.scheduleId, requesterId]
    );

    if (rotationCheck.rows.length === 0) {
      throw new BadRequestError('You must be in the schedule rotation to request a swap');
    }

    // Validate dates
    const originalStart = new Date(params.originalStart);
    const originalEnd = new Date(params.originalEnd);

    if (originalEnd <= originalStart) {
      throw new BadRequestError('End time must be after start time');
    }

    if (originalStart < new Date()) {
      throw new BadRequestError('Cannot request swap for a shift that has already started');
    }

    // If offering to specific user, verify they're in the rotation
    if (params.offeredToUserId) {
      const offeredCheck = await pool.query(
        `SELECT id FROM ${schema}.oncall_rotations
         WHERE schedule_id = $1 AND user_id = $2 AND is_active = true`,
        [params.scheduleId, params.offeredToUserId]
      );

      if (offeredCheck.rows.length === 0) {
        throw new BadRequestError('Offered user must be in the schedule rotation');
      }

      if (params.offeredToUserId === requesterId) {
        throw new BadRequestError('Cannot offer swap to yourself');
      }
    }

    // Generate swap number
    const swapNumber = await this.generateSwapNumber(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.shift_swap_requests (
        swap_number, schedule_id, original_shift_id, requester_id,
        original_start, original_end, offered_to_user_id,
        reason, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        swapNumber,
        params.scheduleId,
        params.originalShiftId || null,
        requesterId,
        originalStart,
        originalEnd,
        params.offeredToUserId || null,
        params.reason || null,
        params.expiresAt || null,
      ]
    );

    logger.info(
      { swapId: result.rows[0].id, swapNumber, requesterId },
      'Shift swap request created'
    );

    return this.getById(tenantSlug, result.rows[0].id);
  }

  private async generateSwapNumber(tenantSlug: string): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`SELECT ${schema}.next_id('shift_swap') as id`);
    if (!result.rows[0]) {
      throw new Error('Failed to generate shift swap number - ID sequence not found');
    }
    return result.rows[0].id;
  }

  /**
   * Update a swap request (only if pending)
   */
  async update(
    tenantSlug: string,
    swapId: string,
    userId: string,
    params: UpdateShiftSwapParams
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Only requester can update their own request
    if (swap.requester_id !== userId) {
      throw new ForbiddenError('You can only update your own swap requests');
    }

    // Can only update pending requests
    if (swap.status !== 'pending') {
      throw new BadRequestError(`Cannot update swap request in status: ${swap.status}`);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.reason !== undefined) {
      fields.push(`reason = $${paramIndex++}`);
      values.push(params.reason);
    }

    if (params.offeredToUserId !== undefined) {
      // Validate new offered user if provided
      if (params.offeredToUserId !== null) {
        const offeredCheck = await pool.query(
          `SELECT id FROM ${schema}.oncall_rotations
           WHERE schedule_id = $1 AND user_id = $2 AND is_active = true`,
          [swap.schedule_id, params.offeredToUserId]
        );

        if (offeredCheck.rows.length === 0) {
          throw new BadRequestError('Offered user must be in the schedule rotation');
        }

        if (params.offeredToUserId === swap.requester_id) {
          throw new BadRequestError('Cannot offer swap to yourself');
        }
      }

      fields.push(`offered_to_user_id = $${paramIndex++}`);
      values.push(params.offeredToUserId);
    }

    if (params.expiresAt !== undefined) {
      fields.push(`expires_at = $${paramIndex++}`);
      values.push(params.expiresAt);
    }

    if (fields.length === 0) {
      return this.getById(tenantSlug, swapId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(swap.id);

    await pool.query(
      `UPDATE ${schema}.shift_swap_requests SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    logger.info({ swapId: swap.id }, 'Shift swap request updated');

    return this.getById(tenantSlug, swapId);
  }

  /**
   * Cancel own swap request
   */
  async cancel(tenantSlug: string, swapId: string, userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Only requester can cancel their own request
    if (swap.requester_id !== userId) {
      throw new ForbiddenError('You can only cancel your own swap requests');
    }

    // Can only cancel pending requests
    if (swap.status !== 'pending') {
      throw new BadRequestError(`Cannot cancel swap request in status: ${swap.status}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [swap.id]
    );

    logger.info({ swapId: swap.id, userId }, 'Shift swap request cancelled');

    return this.getById(tenantSlug, result.rows[0].id);
  }

  /**
   * Accept a swap offer
   */
  async accept(
    tenantSlug: string,
    swapId: string,
    accepterId: string,
    message?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Cannot accept own request
    if (swap.requester_id === accepterId) {
      throw new BadRequestError('You cannot accept your own swap request');
    }

    // Can only accept pending requests
    if (swap.status !== 'pending') {
      throw new BadRequestError(`Cannot accept swap request in status: ${swap.status}`);
    }

    // Check if expired
    if (swap.expires_at && new Date(swap.expires_at) < new Date()) {
      // Auto-expire and reject
      await pool.query(
        `UPDATE ${schema}.shift_swap_requests
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [swap.id]
      );
      throw new BadRequestError('This swap request has expired');
    }

    // If offered to specific user, verify accepter is that user
    if (swap.offered_to_user_id && swap.offered_to_user_id !== accepterId) {
      throw new ForbiddenError('This swap is offered to a specific user');
    }

    // Verify accepter is in the rotation (if not specifically offered)
    if (!swap.offered_to_user_id) {
      const rotationCheck = await pool.query(
        `SELECT id FROM ${schema}.oncall_rotations
         WHERE schedule_id = $1 AND user_id = $2 AND is_active = true`,
        [swap.schedule_id, accepterId]
      );

      if (rotationCheck.rows.length === 0) {
        throw new ForbiddenError('You must be in the schedule rotation to accept this swap');
      }
    }

    // Accept the swap
    await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'accepted',
           accepter_id = $1,
           replacement_start = original_start,
           replacement_end = original_end,
           response_message = $2,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [accepterId, message || null, swap.id]
    );

    // Create an override in the schedule for the accepter covering the original shift
    await oncallScheduleService.createOverride(
      tenantSlug,
      {
        scheduleId: swap.schedule_id,
        userId: accepterId,
        startTime: new Date(swap.original_start),
        endTime: new Date(swap.original_end),
        reason: `Shift swap accepted from ${swap.requester_id} (${swap.swap_number})`,
        originalUserId: swap.requester_id,
      },
      accepterId
    );

    logger.info(
      { swapId: swap.id, accepterId, requesterId: swap.requester_id },
      'Shift swap request accepted'
    );

    // TODO: Send notification to requester

    return this.getById(tenantSlug, swapId);
  }

  /**
   * Reject a swap offer (only if specifically offered to user)
   */
  async reject(
    tenantSlug: string,
    swapId: string,
    userId: string,
    message?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Can only reject if specifically offered to this user
    if (swap.offered_to_user_id !== userId) {
      throw new ForbiddenError('You can only reject swaps specifically offered to you');
    }

    // Can only reject pending requests
    if (swap.status !== 'pending') {
      throw new BadRequestError(`Cannot reject swap request in status: ${swap.status}`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'rejected',
           response_message = $1,
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [message || null, swap.id]
    );

    logger.info(
      { swapId: swap.id, userId, requesterId: swap.requester_id },
      'Shift swap request rejected'
    );

    // TODO: Send notification to requester

    return this.getById(tenantSlug, result.rows[0].id);
  }

  /**
   * Admin approve a swap (force approve without user acceptance)
   */
  async adminApprove(
    tenantSlug: string,
    swapId: string,
    adminId: string,
    accepterUserId?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Can only admin approve pending requests
    if (swap.status !== 'pending') {
      throw new BadRequestError(`Cannot admin approve swap request in status: ${swap.status}`);
    }

    // If accepter is specified, verify they're in the rotation
    if (accepterUserId) {
      const rotationCheck = await pool.query(
        `SELECT id FROM ${schema}.oncall_rotations
         WHERE schedule_id = $1 AND user_id = $2 AND is_active = true`,
        [swap.schedule_id, accepterUserId]
      );

      if (rotationCheck.rows.length === 0) {
        throw new BadRequestError('Accepter must be in the schedule rotation');
      }
    }

    const finalAccepterId = accepterUserId || swap.offered_to_user_id;

    if (!finalAccepterId) {
      throw new BadRequestError('An accepter user ID must be provided for admin approval of open swaps');
    }

    // Approve the swap
    await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'accepted',
           accepter_id = $1,
           replacement_start = original_start,
           replacement_end = original_end,
           approved_by = $2,
           approved_at = NOW(),
           responded_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [finalAccepterId, adminId, swap.id]
    );

    // Create an override in the schedule
    await oncallScheduleService.createOverride(
      tenantSlug,
      {
        scheduleId: swap.schedule_id,
        userId: finalAccepterId,
        startTime: new Date(swap.original_start),
        endTime: new Date(swap.original_end),
        reason: `Admin approved shift swap (${swap.swap_number})`,
        originalUserId: swap.requester_id,
      },
      adminId
    );

    logger.info(
      { swapId: swap.id, adminId, accepterId: finalAccepterId },
      'Shift swap request admin approved'
    );

    return this.getById(tenantSlug, swapId);
  }

  /**
   * Mark a swap as completed after the shift has passed
   */
  async complete(tenantSlug: string, swapId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const swap = await this.getSwapById(tenantSlug, swapId);

    // Can only complete accepted swaps
    if (swap.status !== 'accepted') {
      throw new BadRequestError(`Cannot complete swap request in status: ${swap.status}`);
    }

    // Verify shift has passed
    if (new Date(swap.original_end) > new Date()) {
      throw new BadRequestError('Cannot complete swap before the shift has ended');
    }

    const result = await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [swap.id]
    );

    logger.info({ swapId: swap.id }, 'Shift swap request completed');

    return this.getById(tenantSlug, result.rows[0].id);
  }

  /**
   * Expire old pending requests (to be called by cron/scheduler)
   */
  async expireOldRequests(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending'
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id`
    );

    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      logger.info(
        { tenantSlug, expiredCount },
        'Expired old shift swap requests'
      );
    }

    return expiredCount;
  }

  /**
   * Expire requests for shifts that have already started
   */
  async expirePassedShifts(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `UPDATE ${schema}.shift_swap_requests
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending'
         AND original_start < NOW()
       RETURNING id`
    );

    const expiredCount = result.rowCount || 0;

    if (expiredCount > 0) {
      logger.info(
        { tenantSlug, expiredCount },
        'Expired shift swap requests for passed shifts'
      );
    }

    return expiredCount;
  }

  /**
   * Helper to get swap by ID with minimal data
   */
  private async getSwapById(tenantSlug: string, swapId: string): Promise<ShiftSwapRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const idColumn = swapId.startsWith('SWAP-') ? 'swap_number' : 'id';

    const result = await pool.query(
      `SELECT * FROM ${schema}.shift_swap_requests WHERE ${idColumn} = $1`,
      [swapId]
    );

    if (!result.rows[0]) {
      throw new NotFoundError('Shift Swap Request', swapId);
    }

    return result.rows[0];
  }

  /**
   * Get swap statistics for a schedule
   */
  async getScheduleStats(
    tenantSlug: string,
    scheduleId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<{
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    cancelled: number;
    expired: number;
    completed: number;
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    let whereClause = 'WHERE schedule_id = $1';
    const params: unknown[] = [scheduleId];
    let paramIndex = 2;

    if (fromDate) {
      whereClause += ` AND original_start >= $${paramIndex++}`;
      params.push(fromDate);
    }

    if (toDate) {
      whereClause += ` AND original_end <= $${paramIndex++}`;
      params.push(toDate);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM ${schema}.shift_swap_requests
       ${whereClause}`,
      params
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      pending: parseInt(row.pending, 10),
      accepted: parseInt(row.accepted, 10),
      rejected: parseInt(row.rejected, 10),
      cancelled: parseInt(row.cancelled, 10),
      expired: parseInt(row.expired, 10),
      completed: parseInt(row.completed, 10),
    };
  }
}

export const shiftSwapService = new ShiftSwapService();
