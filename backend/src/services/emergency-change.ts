import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';

// ============================================
// TYPES
// ============================================

export interface EmergencyChangeRequest {
  title: string;
  description: string;
  emergencyJustification: string;    // REQUIRED for emergency
  linkedIncidentId: string;          // REQUIRED - must link to incident
  implementerId?: string;
  applicationId?: string;
}

export interface PostHocReviewResult {
  changeId: string;
  decision: 'approved' | 'rejected';
  reviewedAt: Date;
}

// ============================================
// EMERGENCY CHANGE SERVICE
// ============================================

export class EmergencyChangeService {
  /**
   * Create an emergency change (break-glass workflow).
   * Bypasses pre-approval but requires justification + incident link.
   * Automatically queues for CAB review with post_review_due_at = NOW() + 48h.
   */
  async createEmergencyChange(
    tenantSlug: string,
    requesterId: string,
    data: EmergencyChangeRequest
  ): Promise<{ id: string; change: unknown; cabQueueId: string }> {
    if (!data.emergencyJustification || data.emergencyJustification.trim() === '') {
      throw new BadRequestError('Emergency justification is required for emergency changes');
    }

    if (!data.linkedIncidentId || data.linkedIncidentId.trim() === '') {
      throw new BadRequestError('A linked incident ID is required for emergency changes');
    }

    const schema = tenantService.getSchemaName(tenantSlug);

    // Generate change number using existing sequence
    const numberResult = await pool.query(`SELECT ${schema}.next_id('change') as id`);
    const changeNumber = numberResult.rows[0].id;

    // Insert the emergency change — set status to 'implementing' (bypasses pre-approval)
    const changeResult = await pool.query(
      `INSERT INTO ${schema}.change_requests (
        change_number, title, description, justification,
        type, risk_level, urgency, requester_id, implementer_id, application_id,
        is_emergency, emergency_justification, linked_incident_id,
        post_review_status, post_review_due_at,
        status, cab_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW() + INTERVAL '48 hours', $15, $16)
      RETURNING *`,
      [
        changeNumber,
        data.title,
        data.description,
        data.emergencyJustification,
        'emergency',
        'critical',
        'high',
        requesterId,
        data.implementerId || null,
        data.applicationId || null,
        true,
        data.emergencyJustification,
        data.linkedIncidentId,
        'pending',
        'implementing',
        true,
      ]
    );

    const change = changeResult.rows[0];

    // Record status history — emergency changes go directly to 'implementing'
    await pool.query(
      `INSERT INTO ${schema}.change_status_history (change_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, 'implementing', $2, $3)`,
      [change.id, requesterId, 'Emergency break-glass change — bypasses pre-approval']
    );

    // Auto-queue for CAB post-hoc review
    const queueResult = await pool.query(
      `INSERT INTO ${schema}.emergency_change_cab_queue (change_id)
       VALUES ($1)
       RETURNING *`,
      [change.id]
    );

    const cabQueueEntry = queueResult.rows[0];

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'changes');
    await cacheService.invalidateTenant(tenantSlug, 'emergency-changes');

    logger.info(
      { tenantSlug, changeId: change.id, changeNumber, requesterId, linkedIncidentId: data.linkedIncidentId },
      'Emergency change created and queued for CAB post-hoc review'
    );

    return { id: change.id, change, cabQueueId: cabQueueEntry.id };
  }

  /**
   * Submit post-hoc review (approve or reject).
   * Reviewer must not be the requester or implementer.
   */
  async submitPostHocReview(
    tenantSlug: string,
    changeId: string,
    reviewerId: string,
    reviewerEmail: string,
    decision: 'approved' | 'rejected',
    comment?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Fetch the change
    const changeResult = await pool.query(
      `SELECT * FROM ${schema}.change_requests WHERE id = $1 AND is_emergency = true`,
      [changeId]
    );

    if (changeResult.rows.length === 0) {
      throw new NotFoundError('Emergency change', changeId);
    }

    const change = changeResult.rows[0];

    // Reviewer must not be the requester
    if (change.requester_id && change.requester_id === reviewerId) {
      throw new BadRequestError('Reviewer cannot be the same person who requested the emergency change');
    }

    // Reviewer must not be the implementer
    if (change.implementer_id && change.implementer_id === reviewerId) {
      throw new BadRequestError('Reviewer cannot be the implementer of the emergency change');
    }

    // Must be in pending post-review status
    if (change.post_review_status !== 'pending') {
      throw new BadRequestError(
        `Cannot submit review: post_review_status is '${change.post_review_status}', expected 'pending'`
      );
    }

    // Apply the review decision
    await pool.query(
      `UPDATE ${schema}.change_requests
       SET post_review_status = $1,
           post_reviewer_id = $2,
           post_reviewer_email = $3,
           post_review_comment = $4,
           post_reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [decision, reviewerId, reviewerEmail, comment || null, changeId]
    );

    // Mark the CAB queue entry as reviewed
    await pool.query(
      `UPDATE ${schema}.emergency_change_cab_queue
       SET status = 'reviewed', reviewed_at = NOW()
       WHERE change_id = $1 AND status != 'reviewed'`,
      [changeId]
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'changes');
    await cacheService.invalidateTenant(tenantSlug, 'emergency-changes');

    logger.info(
      { tenantSlug, changeId, reviewerId, decision },
      'Post-hoc CAB review submitted for emergency change'
    );
  }

  /**
   * List emergency changes, optionally filtered by post_review_status.
   */
  async listEmergencyChanges(
    tenantSlug: string,
    filters?: { postReviewStatus?: string }
  ): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:emergency-changes:list:${JSON.stringify(filters || {})}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const params: unknown[] = [];
        let whereClause = 'WHERE c.is_emergency = true';
        let paramIndex = 1;

        if (filters?.postReviewStatus) {
          whereClause += ` AND c.post_review_status = $${paramIndex++}`;
          params.push(filters.postReviewStatus);
        }

        const result = await pool.query(
          `SELECT c.*,
                  req.name AS requester_name, req.email AS requester_email,
                  impl.name AS implementer_name, impl.email AS implementer_email,
                  a.name AS application_name
           FROM ${schema}.change_requests c
           LEFT JOIN ${schema}.users req ON c.requester_id = req.id
           LEFT JOIN ${schema}.users impl ON c.implementer_id = impl.id
           LEFT JOIN ${schema}.applications a ON c.application_id = a.id
           ${whereClause}
           ORDER BY c.created_at DESC`,
          params
        );

        return result.rows;
      },
      { ttl: 120 } // 2 minutes — emergency changes are time-sensitive
    );
  }

  /**
   * Get a single emergency change by ID.
   */
  async getEmergencyChangeById(tenantSlug: string, changeId: string): Promise<unknown> {
    const cacheKey = `${tenantSlug}:emergency-changes:detail:${changeId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT c.*,
                  req.name AS requester_name, req.email AS requester_email,
                  impl.name AS implementer_name, impl.email AS implementer_email,
                  a.name AS application_name,
                  q.id AS cab_queue_id, q.status AS cab_queue_status,
                  q.queued_at, q.assigned_at, q.reviewed_at AS cab_reviewed_at
           FROM ${schema}.change_requests c
           LEFT JOIN ${schema}.users req ON c.requester_id = req.id
           LEFT JOIN ${schema}.users impl ON c.implementer_id = impl.id
           LEFT JOIN ${schema}.applications a ON c.application_id = a.id
           LEFT JOIN ${schema}.emergency_change_cab_queue q ON q.change_id = c.id
           WHERE c.id = $1 AND c.is_emergency = true`,
          [changeId]
        );

        return result.rows[0] || null;
      },
      { ttl: 120 }
    );
  }

  /**
   * Get pending CAB queue items (for CAB meeting agenda assembly).
   */
  async getPendingCabQueue(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:emergency-changes:cab-queue:pending`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT q.*,
                  c.change_number, c.title, c.emergency_justification,
                  c.linked_incident_id, c.post_review_due_at,
                  c.requester_id, c.implementer_id,
                  req.name AS requester_name, req.email AS requester_email
           FROM ${schema}.emergency_change_cab_queue q
           JOIN ${schema}.change_requests c ON q.change_id = c.id
           LEFT JOIN ${schema}.users req ON c.requester_id = req.id
           WHERE q.status IN ('queued', 'assigned')
           ORDER BY q.queued_at ASC`,
          []
        );

        return result.rows;
      },
      { ttl: 60 } // 1 minute — CAB queue is very time-sensitive
    );
  }

  /**
   * Escalate overdue post-hoc reviews.
   * Finds emergency changes where post_review_due_at has passed and
   * post_review_status is still 'pending'. Returns count of escalated records.
   */
  async escalateOverdueReviews(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT c.id, c.change_number, c.title, c.post_review_due_at,
              c.requester_id, req.email AS requester_email
       FROM ${schema}.change_requests c
       LEFT JOIN ${schema}.users req ON c.requester_id = req.id
       WHERE c.is_emergency = true
         AND c.post_review_status = 'pending'
         AND c.post_review_due_at IS NOT NULL
         AND c.post_review_due_at < NOW()`,
      []
    );

    const overdueChanges = result.rows;

    if (overdueChanges.length > 0) {
      logger.warn(
        {
          tenantSlug,
          count: overdueChanges.length,
          changeIds: overdueChanges.map((c) => c.id),
        },
        'Overdue emergency change post-hoc reviews detected — escalation required'
      );

      // Invalidate cache so fresh data is returned
      await cacheService.invalidateTenant(tenantSlug, 'emergency-changes');
    }

    return overdueChanges.length;
  }
}

export const emergencyChangeService = new EmergencyChangeService();
