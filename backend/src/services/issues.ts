import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams, IssuePriority, IssueStatus, IssueSeverity, IssueImpact, IssueUrgency, IssueType, IssueSource } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { dashboardService } from './dashboard.js';

interface CreateIssueParams {
  title: string;
  description?: string;
  priority?: IssuePriority;
  severity?: IssueSeverity;
  impact?: IssueImpact;
  urgency?: IssueUrgency;
  categoryId?: string;
  issueType?: IssueType;
  source?: IssueSource;
  applicationId?: string;
  environmentId?: string;
  assignedTo?: string;
  assignedGroup?: string;
}

interface UpdateIssueParams {
  title?: string;
  description?: string;
  priority?: IssuePriority;
  severity?: IssueSeverity;
  impact?: IssueImpact;
  urgency?: IssueUrgency;
  categoryId?: string;
  assignedTo?: string | null;
  assignedGroup?: string | null;
  applicationId?: string | null;
  environmentId?: string | null;
}

interface Issue {
  id: string;
  issue_number: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  severity: IssueSeverity | null;
  impact: IssueImpact | null;
  urgency: IssueUrgency | null;
  category_id: string | null;
  issue_type: IssueType;
  source: IssueSource | null;
  application_id: string | null;
  environment_id: string | null;
  reporter_id: string;
  assigned_to: string | null;
  assigned_group: string | null;
  escalation_level: number;
  first_response_at: Date | null;
  sla_breached: boolean;
  resolution_code: string | null;
  resolution_notes: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  closed_at: Date | null;
  problem_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const VALID_STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'pending', 'resolved', 'closed'],
  in_progress: ['pending', 'resolved', 'closed'],
  pending: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'], // can reopen
  closed: ['in_progress'], // can reopen
};

export class IssueService {
  async list(tenantSlug: string, params: PaginationParams, filters?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    assignedGroup?: string;
    applicationId?: string;
    reporterId?: string;
    search?: string;
    slaBreached?: boolean;
  }): Promise<{ issues: Issue[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(params);

    let whereClause = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClause += ` AND i.status = $${paramIndex++}`;
      values.push(filters.status);
    }
    if (filters?.priority) {
      whereClause += ` AND i.priority = $${paramIndex++}`;
      values.push(filters.priority);
    }
    if (filters?.assignedTo) {
      whereClause += ` AND i.assigned_to = $${paramIndex++}`;
      values.push(filters.assignedTo);
    }
    if (filters?.assignedGroup) {
      whereClause += ` AND i.assigned_group = $${paramIndex++}`;
      values.push(filters.assignedGroup);
    }
    if (filters?.applicationId) {
      whereClause += ` AND i.application_id = $${paramIndex++}`;
      values.push(filters.applicationId);
    }
    if (filters?.reporterId) {
      whereClause += ` AND i.reporter_id = $${paramIndex++}`;
      values.push(filters.reporterId);
    }
    if (filters?.slaBreached !== undefined) {
      whereClause += ` AND i.sla_breached = $${paramIndex++}`;
      values.push(filters.slaBreached);
    }
    if (filters?.search) {
      whereClause += ` AND (i.title ILIKE $${paramIndex} OR i.issue_number ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Validate sort column against allowed columns to prevent SQL injection
    const allowedSortColumns = ['created_at', 'updated_at', 'title', 'priority', 'status', 'severity', 'issue_number'];
    const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'created_at';
    const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.issues i ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT i.*,
              r.name as reporter_name, r.email as reporter_email,
              a.name as assignee_name, a.email as assignee_email,
              g.name as assigned_group_name,
              app.name as application_name, app.app_id as application_app_id
       FROM ${schema}.issues i
       LEFT JOIN ${schema}.users r ON i.reporter_id = r.id
       LEFT JOIN ${schema}.users a ON i.assigned_to = a.id
       LEFT JOIN ${schema}.groups g ON i.assigned_group = g.id
       LEFT JOIN ${schema}.applications app ON i.application_id = app.id
       ${whereClause}
       ORDER BY i.${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, params.perPage, offset]
    );

    return { issues: result.rows, total };
  }

  async findById(tenantSlug: string, issueId: string): Promise<Issue | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check if it's a UUID or issue_number format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issueId);
    const whereClause = isUuid ? 'WHERE i.id = $1' : 'WHERE i.issue_number = $1';

    const result = await pool.query(
      `SELECT i.*,
              r.name as reporter_name, r.email as reporter_email,
              a.name as assignee_name, a.email as assignee_email,
              g.name as assigned_group_name,
              app.name as application_name, app.app_id as application_app_id,
              env.name as environment_name,
              res.name as resolver_name
       FROM ${schema}.issues i
       LEFT JOIN ${schema}.users r ON i.reporter_id = r.id
       LEFT JOIN ${schema}.users a ON i.assigned_to = a.id
       LEFT JOIN ${schema}.groups g ON i.assigned_group = g.id
       LEFT JOIN ${schema}.applications app ON i.application_id = app.id
       LEFT JOIN ${schema}.environments env ON i.environment_id = env.id
       LEFT JOIN ${schema}.users res ON i.resolved_by = res.id
       ${whereClause}`,
      [issueId]
    );

    return result.rows[0] || null;
  }

  async create(tenantSlug: string, params: CreateIssueParams, reporterId: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate issue_number
      const issueNumberResult = await client.query(
        `SELECT ${schema}.next_id('issue') as issue_number`
      );
      if (!issueNumberResult.rows[0]) {
        throw new Error('Failed to generate issue number - ID sequence not found');
      }
      const issueNumber = issueNumberResult.rows[0].issue_number;

      // Get SLA policy and calculate due dates
      const slaResult = await client.query(
        `SELECT sp.id, st.target_minutes, st.metric_type
         FROM ${schema}.sla_policies sp
         JOIN ${schema}.sla_targets st ON sp.id = st.policy_id
         WHERE sp.entity_type = 'issue' AND sp.is_default = true
         AND st.priority = $1`,
        [params.priority || 'medium']
      );

      let responseDueAt = null;
      let resolutionDueAt = null;
      let slaPolicyId = null;

      for (const row of slaResult.rows) {
        slaPolicyId = row.id;
        const dueDate = new Date(Date.now() + row.target_minutes * 60 * 1000);
        if (row.metric_type === 'response_time') {
          responseDueAt = dueDate;
        } else if (row.metric_type === 'resolution_time') {
          resolutionDueAt = dueDate;
        }
      }

      const result = await client.query(
        `INSERT INTO ${schema}.issues
         (issue_number, title, description, priority, severity, impact, urgency, category_id,
          issue_type, source, application_id, environment_id, reporter_id, assigned_to,
          assigned_group, sla_policy_id, response_due_at, resolution_due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          issueNumber,
          params.title,
          params.description || null,
          params.priority || 'medium',
          params.severity || null,
          params.impact || null,
          params.urgency || null,
          params.categoryId || null,
          params.issueType || 'issue',
          params.source || 'portal',
          params.applicationId || null,
          params.environmentId || null,
          reporterId,
          params.assignedTo || null,
          params.assignedGroup || null,
          slaPolicyId,
          responseDueAt,
          resolutionDueAt,
        ]
      );

      const issue = result.rows[0];

      // Record initial status
      await client.query(
        `INSERT INTO ${schema}.issue_status_history (issue_id, to_status, changed_by)
         VALUES ($1, 'new', $2)`,
        [issue.id, reporterId]
      );

      // Log audit
      await client.query(
        `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
         VALUES ($1, 'create', 'issue', $2, $3)`,
        [reporterId, issue.id, JSON.stringify({ title: params.title, issueNumber })]
      );

      await client.query('COMMIT');

      logger.info({ issueId: issue.id, issueNumber }, 'Issue created');

      // Invalidate dashboard cache (non-blocking)
      dashboardService.invalidateCache(tenantSlug, 'issues').catch((err) => {
        logger.warn({ err, tenantSlug }, 'Failed to invalidate dashboard cache after issue creation');
      });

      return this.findById(tenantSlug, issue.id) as Promise<Issue>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(tenantSlug: string, issueId: string, params: UpdateIssueParams, updatedBy: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(params.title);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(params.priority);
    }
    if (params.severity !== undefined) {
      updates.push(`severity = $${paramIndex++}`);
      values.push(params.severity);
    }
    if (params.impact !== undefined) {
      updates.push(`impact = $${paramIndex++}`);
      values.push(params.impact);
    }
    if (params.urgency !== undefined) {
      updates.push(`urgency = $${paramIndex++}`);
      values.push(params.urgency);
    }
    if (params.categoryId !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      values.push(params.categoryId);
    }
    if (params.assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(params.assignedTo);
    }
    if (params.assignedGroup !== undefined) {
      updates.push(`assigned_group = $${paramIndex++}`);
      values.push(params.assignedGroup);
    }
    if (params.applicationId !== undefined) {
      updates.push(`application_id = $${paramIndex++}`);
      values.push(params.applicationId);
    }
    if (params.environmentId !== undefined) {
      updates.push(`environment_id = $${paramIndex++}`);
      values.push(params.environmentId);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(existing.id);

    await pool.query(
      `UPDATE ${schema}.issues SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'update', 'issue', $2, $3)`,
      [updatedBy, existing.id, JSON.stringify(params)]
    );

    logger.info({ issueId: existing.id }, 'Issue updated');

    // Invalidate dashboard cache (non-blocking)
    dashboardService.invalidateCache(tenantSlug, 'issues').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate dashboard cache after issue update');
    });

    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  async assign(tenantSlug: string, issueId: string, assignedTo: string | null, assignedGroup: string | null, assignedBy: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    const newStatus = existing.status === 'new' ? 'assigned' : existing.status;

    await pool.query(
      `UPDATE ${schema}.issues SET assigned_to = $1, assigned_group = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [assignedTo, assignedGroup, newStatus, existing.id]
    );

    // Record first response time if this is the first assignment
    if (!existing.first_response_at && assignedTo) {
      await pool.query(
        `UPDATE ${schema}.issues SET first_response_at = NOW(),
         time_to_first_response = EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
         WHERE id = $1`,
        [existing.id]
      );
    }

    // Record status change if it changed
    if (newStatus !== existing.status) {
      await pool.query(
        `INSERT INTO ${schema}.issue_status_history (issue_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [existing.id, existing.status, newStatus, assignedBy]
      );
    }

    logger.info({ issueId: existing.id, assignedTo, assignedGroup }, 'Issue assigned');
    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  async changeStatus(tenantSlug: string, issueId: string, newStatus: IssueStatus, changedBy: string, reason?: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[existing.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestError(`Cannot transition from '${existing.status}' to '${newStatus}'`);
    }

    await pool.query(
      `UPDATE ${schema}.issues SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, existing.id]
    );

    // Record status change
    await pool.query(
      `INSERT INTO ${schema}.issue_status_history (issue_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [existing.id, existing.status, newStatus, changedBy, reason]
    );

    logger.info({ issueId: existing.id, from: existing.status, to: newStatus }, 'Issue status changed');
    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  async resolve(tenantSlug: string, issueId: string, resolutionCode: string, resolutionNotes: string, resolvedBy: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    if (existing.status === 'resolved' || existing.status === 'closed') {
      throw new BadRequestError('Issue is already resolved or closed');
    }

    await pool.query(
      `UPDATE ${schema}.issues SET
         status = 'resolved',
         resolution_code = $1,
         resolution_notes = $2,
         resolved_at = NOW(),
         resolved_by = $3,
         time_to_resolution = EXTRACT(EPOCH FROM (NOW() - created_at)) / 60,
         updated_at = NOW()
       WHERE id = $4`,
      [resolutionCode, resolutionNotes, resolvedBy, existing.id]
    );

    // Record status change
    await pool.query(
      `INSERT INTO ${schema}.issue_status_history (issue_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, 'resolved', $3, $4)`,
      [existing.id, existing.status, resolvedBy, resolutionNotes]
    );

    logger.info({ issueId: existing.id, resolutionCode }, 'Issue resolved');
    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  async close(tenantSlug: string, issueId: string, closedBy: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    await pool.query(
      `UPDATE ${schema}.issues SET status = 'closed', closed_at = NOW(), closed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [closedBy, existing.id]
    );

    await pool.query(
      `INSERT INTO ${schema}.issue_status_history (issue_id, from_status, to_status, changed_by)
       VALUES ($1, $2, 'closed', $3)`,
      [existing.id, existing.status, closedBy]
    );

    logger.info({ issueId: existing.id }, 'Issue closed');
    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  async escalate(tenantSlug: string, issueId: string, _escalatedBy: string): Promise<Issue> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, issueId);
    if (!existing) {
      throw new NotFoundError('Issue', issueId);
    }

    await pool.query(
      `UPDATE ${schema}.issues SET
         escalation_level = escalation_level + 1,
         escalated_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [existing.id]
    );

    logger.info({ issueId: existing.id, escalationLevel: existing.escalation_level + 1 }, 'Issue escalated');
    return this.findById(tenantSlug, existing.id) as Promise<Issue>;
  }

  // Comments
  async getComments(tenantSlug: string, issueId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_url
       FROM ${schema}.issue_comments c
       LEFT JOIN ${schema}.users u ON c.user_id = u.id
       WHERE c.issue_id = $1
       ORDER BY c.created_at`,
      [issueId]
    );

    return result.rows;
  }

  async addComment(tenantSlug: string, issueId: string, content: string, userId: string, isInternal: boolean = false): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const issue = await this.findById(tenantSlug, issueId);
    if (!issue) {
      throw new NotFoundError('Issue', issueId);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.issue_comments (issue_id, user_id, content, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [issue.id, userId, content, isInternal]
    );

    // Update issue updated_at
    await pool.query(
      `UPDATE ${schema}.issues SET updated_at = NOW() WHERE id = $1`,
      [issue.id]
    );

    logger.info({ issueId: issue.id, commentId: result.rows[0].id }, 'Comment added');
    return result.rows[0];
  }

  // Worklogs
  async getWorklogs(tenantSlug: string, issueId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT w.*, u.name as user_name, u.email as user_email
       FROM ${schema}.issue_worklogs w
       LEFT JOIN ${schema}.users u ON w.user_id = u.id
       WHERE w.issue_id = $1
       ORDER BY w.work_date DESC, w.created_at DESC`,
      [issueId]
    );

    return result.rows;
  }

  async addWorklog(tenantSlug: string, issueId: string, timeSpent: number, description: string, userId: string, workDate?: Date, billable: boolean = false): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const issue = await this.findById(tenantSlug, issueId);
    if (!issue) {
      throw new NotFoundError('Issue', issueId);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.issue_worklogs (issue_id, user_id, time_spent, description, work_date, billable)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [issue.id, userId, timeSpent, description, workDate || new Date(), billable]
    );

    logger.info({ issueId: issue.id, worklogId: result.rows[0].id, timeSpent }, 'Worklog added');
    return result.rows[0];
  }

  // Status history
  async getStatusHistory(tenantSlug: string, issueId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.issue_status_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.issue_id = $1
       ORDER BY h.created_at`,
      [issueId]
    );

    return result.rows;
  }

  // Linked Problem
  async getLinkedProblem(tenantSlug: string, issueId: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const issue = await this.findById(tenantSlug, issueId);
    if (!issue) {
      throw new NotFoundError('Issue', issueId);
    }

    if (!issue.problem_id) {
      return null;
    }

    const result = await pool.query(
      `SELECT p.*,
              pi.relationship_type, pi.linked_at, pi.notes as link_notes,
              lu.name as linked_by_name,
              a.name as assignee_name,
              g.name as assigned_group_name
       FROM ${schema}.problems p
       LEFT JOIN ${schema}.problem_issues pi ON p.id = pi.problem_id AND pi.issue_id = $1
       LEFT JOIN ${schema}.users lu ON pi.linked_by = lu.id
       LEFT JOIN ${schema}.users a ON p.assigned_to = a.id
       LEFT JOIN ${schema}.groups g ON p.assigned_group = g.id
       WHERE p.id = $2`,
      [issueId, issue.problem_id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // Link issue to problem
  async linkToProblem(tenantSlug: string, issueId: string, problemId: string, userId: string, relationshipType = 'caused_by', notes?: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const issue = await this.findById(tenantSlug, issueId);
    if (!issue) {
      throw new NotFoundError('Issue', issueId);
    }

    // Verify problem exists
    const problemCheck = await pool.query(
      `SELECT id FROM ${schema}.problems WHERE id = $1`,
      [problemId]
    );
    if (problemCheck.rows.length === 0) {
      throw new NotFoundError('Problem', problemId);
    }

    // Create the link in problem_issues table
    await pool.query(
      `INSERT INTO ${schema}.problem_issues (problem_id, issue_id, relationship_type, linked_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (problem_id, issue_id) DO UPDATE SET
         relationship_type = EXCLUDED.relationship_type,
         notes = EXCLUDED.notes`,
      [problemId, issueId, relationshipType, userId, notes]
    );

    // Update the issue's problem_id
    await pool.query(
      `UPDATE ${schema}.issues SET problem_id = $1, updated_at = NOW() WHERE id = $2`,
      [problemId, issueId]
    );

    // Update problem's related_incidents_count
    await pool.query(
      `UPDATE ${schema}.problems SET
         related_incidents_count = (
           SELECT COUNT(*) FROM ${schema}.problem_issues WHERE problem_id = $1
         ),
         updated_at = NOW()
       WHERE id = $1`,
      [problemId]
    );

    logger.info({ issueId, problemId, relationshipType }, 'Issue linked to problem');
  }

  // Unlink issue from problem
  async unlinkFromProblem(tenantSlug: string, issueId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const issue = await this.findById(tenantSlug, issueId);
    if (!issue) {
      throw new NotFoundError('Issue', issueId);
    }

    if (!issue.problem_id) {
      return; // Nothing to unlink
    }

    const problemId = issue.problem_id;

    // Remove from problem_issues
    await pool.query(
      `DELETE FROM ${schema}.problem_issues WHERE problem_id = $1 AND issue_id = $2`,
      [problemId, issueId]
    );

    // Clear problem_id on issue
    await pool.query(
      `UPDATE ${schema}.issues SET problem_id = NULL, updated_at = NOW() WHERE id = $1`,
      [issueId]
    );

    // Update problem's related_incidents_count
    await pool.query(
      `UPDATE ${schema}.problems SET
         related_incidents_count = (
           SELECT COUNT(*) FROM ${schema}.problem_issues WHERE problem_id = $1
         ),
         updated_at = NOW()
       WHERE id = $1`,
      [problemId]
    );

    logger.info({ issueId, problemId }, 'Issue unlinked from problem');
  }

  // Categories
  async getCategories(tenantSlug: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.issue_categories WHERE is_active = true ORDER BY sort_order, name`
    );

    return result.rows;
  }
}

export const issueService = new IssueService();
