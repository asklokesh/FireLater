import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

type RequestStatus = 'submitted' | 'pending_approval' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled';

interface CreateRequestParams {
  catalogItemId: string;
  requestedForId?: string;
  priority?: string;
  formData: Record<string, unknown>;
  notes?: string;
  costCenter?: string;
}

interface UpdateRequestParams {
  priority?: string;
  formData?: Record<string, unknown>;
  notes?: string;
  costCenter?: string;
}

interface ServiceRequest {
  id: string;
  request_number: string;
  catalog_item_id: string | null;
  bundle_id: string | null;
  requester_id: string;
  requested_for_id: string | null;
  status: RequestStatus;
  priority: string;
  form_data: Record<string, unknown>;
  notes: string | null;
  cost_center: string | null;
  total_cost: number | null;
  fulfillment_group_id: string | null;
  assigned_to: string | null;
  due_date: Date | null;
  completed_at: Date | null;
  completed_by: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const _VALID_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  submitted: ['pending_approval', 'approved', 'rejected', 'in_progress', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  rejected: [],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class RequestService {
  async list(tenantSlug: string, params: PaginationParams, filters?: {
    status?: string;
    priority?: string;
    requesterId?: string;
    requestedForId?: string;
    assignedTo?: string;
    catalogItemId?: string;
    search?: string;
  }): Promise<{ requests: ServiceRequest[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClause += ` AND r.status = $${paramIndex++}`;
      values.push(filters.status);
    }
    if (filters?.priority) {
      whereClause += ` AND r.priority = $${paramIndex++}`;
      values.push(filters.priority);
    }
    if (filters?.requesterId) {
      whereClause += ` AND r.requester_id = $${paramIndex++}`;
      values.push(filters.requesterId);
    }
    if (filters?.requestedForId) {
      whereClause += ` AND r.requested_for_id = $${paramIndex++}`;
      values.push(filters.requestedForId);
    }
    if (filters?.assignedTo) {
      whereClause += ` AND r.assigned_to = $${paramIndex++}`;
      values.push(filters.assignedTo);
    }
    if (filters?.catalogItemId) {
      whereClause += ` AND r.catalog_item_id = $${paramIndex++}`;
      values.push(filters.catalogItemId);
    }
    if (filters?.search) {
      whereClause += ` AND (r.request_number ILIKE $${paramIndex} OR r.notes ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.service_requests r ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT r.*,
              req.name as requester_name, req.email as requester_email,
              rf.name as requested_for_name, rf.email as requested_for_email,
              a.name as assignee_name, a.email as assignee_email,
              ci.name as catalog_item_name,
              fg.name as fulfillment_group_name
       FROM ${schema}.service_requests r
       LEFT JOIN ${schema}.users req ON r.requester_id = req.id
       LEFT JOIN ${schema}.users rf ON r.requested_for_id = rf.id
       LEFT JOIN ${schema}.users a ON r.assigned_to = a.id
       LEFT JOIN ${schema}.catalog_items ci ON r.catalog_item_id = ci.id
       LEFT JOIN ${schema}.groups fg ON r.fulfillment_group_id = fg.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { requests: result.rows, total };
  }

  async findById(tenantSlug: string, requestId: string): Promise<ServiceRequest | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId);
    const whereClause = isUuid ? 'WHERE r.id = $1' : 'WHERE r.request_number = $1';

    const result = await pool.query(
      `SELECT r.*,
              req.name as requester_name, req.email as requester_email,
              rf.name as requested_for_name, rf.email as requested_for_email,
              a.name as assignee_name, a.email as assignee_email,
              ci.name as catalog_item_name, ci.form_schema,
              fg.name as fulfillment_group_name,
              cb.name as completed_by_name
       FROM ${schema}.service_requests r
       LEFT JOIN ${schema}.users req ON r.requester_id = req.id
       LEFT JOIN ${schema}.users rf ON r.requested_for_id = rf.id
       LEFT JOIN ${schema}.users a ON r.assigned_to = a.id
       LEFT JOIN ${schema}.catalog_items ci ON r.catalog_item_id = ci.id
       LEFT JOIN ${schema}.groups fg ON r.fulfillment_group_id = fg.id
       LEFT JOIN ${schema}.users cb ON r.completed_by = cb.id
       ${whereClause}`,
      [requestId]
    );

    return result.rows[0] || null;
  }

  async create(tenantSlug: string, params: CreateRequestParams, requesterId: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get catalog item
      const itemResult = await client.query(
        `SELECT * FROM ${schema}.catalog_items WHERE id = $1 AND is_active = true`,
        [params.catalogItemId]
      );

      if (itemResult.rows.length === 0) {
        throw new NotFoundError('Catalog item', params.catalogItemId);
      }

      const catalogItem = itemResult.rows[0];

      // Generate request_number
      const requestNumberResult = await client.query(
        `SELECT ${schema}.next_id('request') as request_number`
      );
      if (!requestNumberResult.rows[0]) {
        throw new Error('Failed to generate request number - ID sequence not found');
      }
      const requestNumber = requestNumberResult.rows[0].request_number;

      // Calculate due date (default to 5 days if not configured)
      const dueDate = new Date();
      const completionDays = catalogItem.expected_completion_days ?? 5;
      dueDate.setDate(dueDate.getDate() + completionDays);

      // Determine initial status
      let status: RequestStatus = 'submitted';
      if (catalogItem.approval_required) {
        status = 'pending_approval';
      }

      const result = await client.query(
        `INSERT INTO ${schema}.service_requests
         (request_number, catalog_item_id, requester_id, requested_for_id, status, priority,
          form_data, notes, cost_center, total_cost, fulfillment_group_id, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          requestNumber,
          params.catalogItemId,
          requesterId,
          params.requestedForId || requesterId,
          status,
          params.priority || 'medium',
          JSON.stringify(params.formData),
          params.notes || null,
          params.costCenter || catalogItem.cost_center,
          catalogItem.price,
          catalogItem.fulfillment_group_id,
          dueDate,
        ]
      );

      const request = result.rows[0];

      // Create approval records if needed
      if (catalogItem.approval_required && catalogItem.approval_group_id) {
        await client.query(
          `INSERT INTO ${schema}.request_approvals (request_id, step_number, approver_group_id, status)
           VALUES ($1, 1, $2, 'pending')`,
          [request.id, catalogItem.approval_group_id]
        );
      }

      // Record initial status
      await client.query(
        `INSERT INTO ${schema}.request_status_history (request_id, to_status, changed_by)
         VALUES ($1, $2, $3)`,
        [request.id, status, requesterId]
      );

      // Log audit
      await client.query(
        `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
         VALUES ($1, 'create', 'service_request', $2, $3)`,
        [requesterId, request.id, JSON.stringify({ requestNumber, catalogItemId: params.catalogItemId })]
      );

      await client.query('COMMIT');

      logger.info({ requestId: request.id, requestNumber }, 'Service request created');
      return this.findById(tenantSlug, request.id) as Promise<ServiceRequest>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(tenantSlug: string, requestId: string, params: UpdateRequestParams, _updatedBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, requestId);
    if (!existing) {
      throw new NotFoundError('Service request', requestId);
    }

    if (['completed', 'cancelled', 'rejected'].includes(existing.status)) {
      throw new BadRequestError('Cannot update a completed, cancelled, or rejected request');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(params.priority);
    }
    if (params.formData !== undefined) {
      updates.push(`form_data = $${paramIndex++}`);
      values.push(JSON.stringify(params.formData));
    }
    if (params.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(params.notes);
    }
    if (params.costCenter !== undefined) {
      updates.push(`cost_center = $${paramIndex++}`);
      values.push(params.costCenter);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(existing.id);

    await pool.query(
      `UPDATE ${schema}.service_requests SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    logger.info({ requestId: existing.id }, 'Service request updated');
    return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
  }

  async assign(tenantSlug: string, requestId: string, assignedTo: string, _assignedBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, requestId);
    if (!existing) {
      throw new NotFoundError('Service request', requestId);
    }

    await pool.query(
      `UPDATE ${schema}.service_requests SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
      [assignedTo, existing.id]
    );

    logger.info({ requestId: existing.id, assignedTo }, 'Service request assigned');
    return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
  }

  async approve(tenantSlug: string, requestId: string, approvalId: string, comments: string, approvedBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await this.findById(tenantSlug, requestId);
      if (!existing) {
        throw new NotFoundError('Service request', requestId);
      }

      if (existing.status !== 'pending_approval') {
        throw new BadRequestError('Request is not pending approval');
      }

      // Update approval record
      await client.query(
        `UPDATE ${schema}.request_approvals
         SET status = 'approved', decision = 'approved', comments = $1, decided_at = NOW()
         WHERE id = $2`,
        [comments, approvalId]
      );

      // Check if all approvals are complete
      const pendingResult = await client.query(
        `SELECT COUNT(*) FROM ${schema}.request_approvals
         WHERE request_id = $1 AND status = 'pending'`,
        [existing.id]
      );

      let newStatus: RequestStatus = 'pending_approval';
      if (parseInt(pendingResult.rows[0].count, 10) === 0) {
        newStatus = 'approved';
      }

      // Update request status
      await client.query(
        `UPDATE ${schema}.service_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, existing.id]
      );

      // Record status change
      if (newStatus !== existing.status) {
        await client.query(
          `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [existing.id, existing.status, newStatus, approvedBy, 'Approved']
        );
      }

      await client.query('COMMIT');

      logger.info({ requestId: existing.id, newStatus }, 'Service request approved');
      return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reject(tenantSlug: string, requestId: string, approvalId: string, comments: string, rejectedBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await this.findById(tenantSlug, requestId);
      if (!existing) {
        throw new NotFoundError('Service request', requestId);
      }

      if (existing.status !== 'pending_approval') {
        throw new BadRequestError('Request is not pending approval');
      }

      // Update approval record
      await client.query(
        `UPDATE ${schema}.request_approvals
         SET status = 'rejected', decision = 'rejected', comments = $1, decided_at = NOW()
         WHERE id = $2`,
        [comments, approvalId]
      );

      // Update request status
      await client.query(
        `UPDATE ${schema}.service_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [existing.id]
      );

      // Record status change
      await client.query(
        `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, 'rejected', $3, $4)`,
        [existing.id, existing.status, rejectedBy, comments]
      );

      await client.query('COMMIT');

      logger.info({ requestId: existing.id }, 'Service request rejected');
      return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async startWork(tenantSlug: string, requestId: string, startedBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, requestId);
    if (!existing) {
      throw new NotFoundError('Service request', requestId);
    }

    if (!['submitted', 'approved'].includes(existing.status)) {
      throw new BadRequestError('Cannot start work on this request');
    }

    await pool.query(
      `UPDATE ${schema}.service_requests SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
      [existing.id]
    );

    await pool.query(
      `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by)
       VALUES ($1, $2, 'in_progress', $3)`,
      [existing.id, existing.status, startedBy]
    );

    logger.info({ requestId: existing.id }, 'Service request work started');
    return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
  }

  async complete(tenantSlug: string, requestId: string, completedBy: string, notes?: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, requestId);
    if (!existing) {
      throw new NotFoundError('Service request', requestId);
    }

    if (existing.status !== 'in_progress') {
      throw new BadRequestError('Request must be in progress to complete');
    }

    await pool.query(
      `UPDATE ${schema}.service_requests
       SET status = 'completed', completed_at = NOW(), completed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [completedBy, existing.id]
    );

    await pool.query(
      `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by, reason)
       VALUES ($1, 'in_progress', 'completed', $2, $3)`,
      [existing.id, completedBy, notes]
    );

    logger.info({ requestId: existing.id }, 'Service request completed');
    return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
  }

  async cancel(tenantSlug: string, requestId: string, reason: string, cancelledBy: string): Promise<ServiceRequest> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, requestId);
    if (!existing) {
      throw new NotFoundError('Service request', requestId);
    }

    if (['completed', 'cancelled', 'rejected'].includes(existing.status)) {
      throw new BadRequestError('Cannot cancel this request');
    }

    await pool.query(
      `UPDATE ${schema}.service_requests
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, cancellation_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [cancelledBy, reason, existing.id]
    );

    await pool.query(
      `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'cancelled', $3, $4)`,
      [existing.id, existing.status, cancelledBy, reason]
    );

    logger.info({ requestId: existing.id }, 'Service request cancelled');
    return this.findById(tenantSlug, existing.id) as Promise<ServiceRequest>;
  }

  // Approvals
  async getPendingApprovals(tenantSlug: string, userId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT ra.*, sr.request_number, ci.name as catalog_item_name,
              req.name as requester_name, req.email as requester_email
       FROM ${schema}.request_approvals ra
       JOIN ${schema}.service_requests sr ON ra.request_id = sr.id
       LEFT JOIN ${schema}.catalog_items ci ON sr.catalog_item_id = ci.id
       LEFT JOIN ${schema}.users req ON sr.requester_id = req.id
       LEFT JOIN ${schema}.group_members gm ON ra.approver_group_id = gm.group_id
       WHERE ra.status = 'pending'
         AND (ra.approver_id = $1 OR gm.user_id = $1)
       ORDER BY ra.created_at`,
      [userId]
    );

    return result.rows;
  }

  async getApprovals(tenantSlug: string, requestId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const request = await this.findById(tenantSlug, requestId);
    if (!request) {
      throw new NotFoundError('Service request', requestId);
    }

    const result = await pool.query(
      `SELECT ra.*, u.name as approver_name, g.name as approver_group_name,
              du.name as delegated_to_name
       FROM ${schema}.request_approvals ra
       LEFT JOIN ${schema}.users u ON ra.approver_id = u.id
       LEFT JOIN ${schema}.groups g ON ra.approver_group_id = g.id
       LEFT JOIN ${schema}.users du ON ra.delegated_to = du.id
       WHERE ra.request_id = $1
       ORDER BY ra.step_number`,
      [request.id]
    );

    return result.rows;
  }

  // Comments
  async getComments(tenantSlug: string, requestId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const request = await this.findById(tenantSlug, requestId);
    if (!request) {
      throw new NotFoundError('Service request', requestId);
    }

    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_url
       FROM ${schema}.request_comments c
       LEFT JOIN ${schema}.users u ON c.user_id = u.id
       WHERE c.request_id = $1
       ORDER BY c.created_at`,
      [request.id]
    );

    return result.rows;
  }

  async addComment(tenantSlug: string, requestId: string, content: string, userId: string, isInternal: boolean = false): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const request = await this.findById(tenantSlug, requestId);
    if (!request) {
      throw new NotFoundError('Service request', requestId);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.request_comments (request_id, user_id, content, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [request.id, userId, content, isInternal]
    );

    await pool.query(
      `UPDATE ${schema}.service_requests SET updated_at = NOW() WHERE id = $1`,
      [request.id]
    );

    logger.info({ requestId: request.id }, 'Comment added to request');
    return result.rows[0];
  }

  // Delegate approval to another user
  async delegateApproval(
    tenantSlug: string,
    requestId: string,
    approvalId: string,
    delegateToUserId: string,
    comments: string,
    userId: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const request = await this.findById(tenantSlug, requestId);
    if (!request) {
      throw new NotFoundError('Service request', requestId);
    }

    // Verify the approval exists and belongs to the current user
    const approvalResult = await pool.query(
      `SELECT * FROM ${schema}.request_approvals
       WHERE id = $1 AND request_id = $2 AND approver_id = $3 AND status = 'pending'`,
      [approvalId, request.id, userId]
    );

    if (approvalResult.rows.length === 0) {
      throw new BadRequestError('Approval not found or you are not authorized to delegate it');
    }

    // Verify the delegate user exists
    const delegateUserResult = await pool.query(
      `SELECT id, name, email FROM ${schema}.users WHERE id = $1 AND status = 'active'`,
      [delegateToUserId]
    );

    if (delegateUserResult.rows.length === 0) {
      throw new NotFoundError('User to delegate to', delegateToUserId);
    }

    // Update the approval with delegation
    const result = await pool.query(
      `UPDATE ${schema}.request_approvals
       SET status = 'delegated',
           delegated_to = $1,
           comments = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [delegateToUserId, comments, approvalId]
    );

    // Create a new pending approval for the delegate
    await pool.query(
      `INSERT INTO ${schema}.request_approvals
       (request_id, approver_id, step_number, status, created_at)
       SELECT request_id, $1, step_number, 'pending', NOW()
       FROM ${schema}.request_approvals WHERE id = $2`,
      [delegateToUserId, approvalId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO ${schema}.request_status_history (request_id, from_status, to_status, changed_by, notes)
       VALUES ($1, 'pending_approval', 'pending_approval', $2, $3)`,
      [request.id, userId, `Approval delegated to ${delegateUserResult.rows[0].name}`]
    );

    logger.info({ requestId: request.id, approvalId, delegateTo: delegateToUserId }, 'Approval delegated');

    return {
      ...result.rows[0],
      delegated_to_name: delegateUserResult.rows[0].name,
      delegated_to_email: delegateUserResult.rows[0].email,
    };
  }

  // History
  async getStatusHistory(tenantSlug: string, requestId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const request = await this.findById(tenantSlug, requestId);
    if (!request) {
      throw new NotFoundError('Service request', requestId);
    }

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.request_status_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.request_id = $1
       ORDER BY h.created_at`,
      [request.id]
    );

    return result.rows;
  }
}

export const requestService = new RequestService();
