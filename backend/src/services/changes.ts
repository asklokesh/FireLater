import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { getOffset } from '../utils/pagination.js';
import type { PaginationParams } from '../types/index.js';

interface ChangeWindowFilters {
  type?: string;
  status?: string;
}

interface ChangeFilters {
  status?: string;
  type?: string;
  applicationId?: string;
  requesterId?: string;
  implementerId?: string;
  riskLevel?: string;
}

// ============================================
// CHANGE WINDOW SERVICE
// ============================================

class ChangeWindowService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters: ChangeWindowFilters = {}
  ): Promise<{ windows: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.type) {
      whereClause += ` AND type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    const countQuery = `SELECT COUNT(*) FROM ${schema}.change_windows ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT * FROM ${schema}.change_windows
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pagination.perPage, offset);

    const result = await pool.query(query, params);
    return { windows: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.change_windows WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(
    tenantSlug: string,
    data: {
      name: string;
      description?: string;
      type: string;
      recurrence?: string;
      recurrenceRule?: string;
      startTime?: string;
      endTime?: string;
      startDate?: string;
      endDate?: string;
      dayOfWeek?: number[];
      timezone?: string;
      applications?: string[];
      tiers?: string[];
      notifyBeforeMinutes?: number;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.change_windows (
        name, description, type, recurrence, recurrence_rule,
        start_time, end_time, start_date, end_date, day_of_week,
        timezone, applications, tiers, notify_before_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.type,
        data.recurrence || null,
        data.recurrenceRule || null,
        data.startTime || null,
        data.endTime || null,
        data.startDate || null,
        data.endDate || null,
        data.dayOfWeek || null,
        data.timezone || 'UTC',
        data.applications || null,
        data.tiers || null,
        data.notifyBeforeMinutes || 60,
      ]
    );

    return result.rows[0];
  }

  async update(
    tenantSlug: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      type: string;
      recurrence: string;
      recurrenceRule: string;
      startTime: string;
      endTime: string;
      startDate: string;
      endDate: string;
      dayOfWeek: number[];
      timezone: string;
      applications: string[];
      tiers: string[];
      status: string;
      notifyBeforeMinutes: number;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Change window', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      type: 'type',
      recurrence: 'recurrence',
      recurrenceRule: 'recurrence_rule',
      startTime: 'start_time',
      endTime: 'end_time',
      startDate: 'start_date',
      endDate: 'end_date',
      dayOfWeek: 'day_of_week',
      timezone: 'timezone',
      applications: 'applications',
      tiers: 'tiers',
      status: 'status',
      notifyBeforeMinutes: 'notify_before_minutes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.change_windows SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Change window', id);
    }

    await pool.query(`DELETE FROM ${schema}.change_windows WHERE id = $1`, [id]);
  }

  async getUpcoming(
    tenantSlug: string,
    days: number = 30
  ): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.change_windows
       WHERE status = 'active'
       AND (
         (recurrence = 'one_time' AND start_date >= CURRENT_DATE AND start_date <= CURRENT_DATE + $1 * INTERVAL '1 day')
         OR recurrence != 'one_time'
       )
       ORDER BY start_date, start_time`,
      [days]
    );

    return result.rows;
  }
}

// ============================================
// CHANGE TEMPLATE SERVICE
// ============================================

class ChangeTemplateService {
  async list(tenantSlug: string, pagination: PaginationParams): Promise<{ templates: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.change_templates WHERE is_active = true`
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT * FROM ${schema}.change_templates
       WHERE is_active = true
       ORDER BY name
       LIMIT $1 OFFSET $2`,
      [pagination.perPage, offset]
    );

    return { templates: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.change_templates WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(
    tenantSlug: string,
    data: {
      name: string;
      description?: string;
      type?: string;
      category?: string;
      defaultRiskLevel?: string;
      implementationPlanTemplate?: string;
      rollbackPlanTemplate?: string;
      testPlanTemplate?: string;
      defaultTasks?: unknown[];
      approvalRequired?: boolean;
      approvalGroups?: string[];
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.change_templates (
        name, description, type, category, default_risk_level,
        implementation_plan_template, rollback_plan_template, test_plan_template,
        default_tasks, approval_required, approval_groups
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.type || 'standard',
        data.category || null,
        data.defaultRiskLevel || 'low',
        data.implementationPlanTemplate || null,
        data.rollbackPlanTemplate || null,
        data.testPlanTemplate || null,
        JSON.stringify(data.defaultTasks || []),
        data.approvalRequired || false,
        data.approvalGroups || null,
      ]
    );

    return result.rows[0];
  }

  async update(
    tenantSlug: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      type: string;
      category: string;
      defaultRiskLevel: string;
      implementationPlanTemplate: string;
      rollbackPlanTemplate: string;
      testPlanTemplate: string;
      defaultTasks: unknown[];
      approvalRequired: boolean;
      approvalGroups: string[];
      isActive: boolean;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Change template', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      type: 'type',
      category: 'category',
      defaultRiskLevel: 'default_risk_level',
      implementationPlanTemplate: 'implementation_plan_template',
      rollbackPlanTemplate: 'rollback_plan_template',
      testPlanTemplate: 'test_plan_template',
      approvalRequired: 'approval_required',
      approvalGroups: 'approval_groups',
      isActive: 'is_active',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (data.defaultTasks !== undefined) {
      fields.push(`default_tasks = $${paramIndex++}`);
      values.push(JSON.stringify(data.defaultTasks));
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.change_templates SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Change template', id);
    }

    // Soft delete
    await pool.query(
      `UPDATE ${schema}.change_templates SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }
}

// ============================================
// CHANGE REQUEST SERVICE
// ============================================

class ChangeRequestService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters: ChangeFilters = {}
  ): Promise<{ changes: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      whereClause += ` AND c.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.type) {
      whereClause += ` AND c.type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters.applicationId) {
      whereClause += ` AND c.application_id = $${paramIndex++}`;
      params.push(filters.applicationId);
    }

    if (filters.requesterId) {
      whereClause += ` AND c.requester_id = $${paramIndex++}`;
      params.push(filters.requesterId);
    }

    if (filters.implementerId) {
      whereClause += ` AND c.implementer_id = $${paramIndex++}`;
      params.push(filters.implementerId);
    }

    if (filters.riskLevel) {
      whereClause += ` AND c.risk_level = $${paramIndex++}`;
      params.push(filters.riskLevel);
    }

    const countQuery = `SELECT COUNT(*) FROM ${schema}.change_requests c ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT c.*,
             a.name as application_name,
             req.name as requester_name,
             impl.name as implementer_name,
             g.name as assigned_group_name,
             t.name as template_name
      FROM ${schema}.change_requests c
      LEFT JOIN ${schema}.applications a ON c.application_id = a.id
      LEFT JOIN ${schema}.users req ON c.requester_id = req.id
      LEFT JOIN ${schema}.users impl ON c.implementer_id = impl.id
      LEFT JOIN ${schema}.groups g ON c.assigned_group = g.id
      LEFT JOIN ${schema}.change_templates t ON c.template_id = t.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pagination.perPage, offset);

    const result = await pool.query(query, params);
    return { changes: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Support both UUID and change_number
    const idColumn = id.startsWith('CHG-') ? 'change_number' : 'id';

    const result = await pool.query(
      `SELECT c.*,
              a.name as application_name,
              req.name as requester_name, req.email as requester_email,
              impl.name as implementer_name, impl.email as implementer_email,
              g.name as assigned_group_name,
              t.name as template_name,
              e.name as environment_name,
              cw.name as change_window_name
       FROM ${schema}.change_requests c
       LEFT JOIN ${schema}.applications a ON c.application_id = a.id
       LEFT JOIN ${schema}.users req ON c.requester_id = req.id
       LEFT JOIN ${schema}.users impl ON c.implementer_id = impl.id
       LEFT JOIN ${schema}.groups g ON c.assigned_group = g.id
       LEFT JOIN ${schema}.change_templates t ON c.template_id = t.id
       LEFT JOIN ${schema}.environments e ON c.environment_id = e.id
       LEFT JOIN ${schema}.change_windows cw ON c.change_window_id = cw.id
       WHERE c.${idColumn} = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async create(
    tenantSlug: string,
    data: {
      title: string;
      description?: string;
      justification?: string;
      type?: string;
      category?: string;
      riskLevel?: string;
      impact?: string;
      urgency?: string;
      templateId?: string;
      applicationId?: string;
      environmentId?: string;
      assignedGroup?: string;
      plannedStart?: string;
      plannedEnd?: string;
      downtimeMinutes?: number;
      changeWindowId?: string;
      implementationPlan?: string;
      rollbackPlan?: string;
      testPlan?: string;
      communicationPlan?: string;
      riskAssessment?: Record<string, unknown>;
      cabRequired?: boolean;
      cabDate?: string;
      relatedIssueId?: string;
    },
    requesterId: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Generate change number
    const changeNumber = await this.generateChangeNumber(tenantSlug);

    // If using a template, apply template defaults
    let templateDefaults: Record<string, unknown> = {};
    if (data.templateId) {
      const template = await changeTemplateService.findById(tenantSlug, data.templateId) as Record<string, unknown> | null;
      if (template) {
        templateDefaults = {
          type: template.type,
          category: template.category,
          riskLevel: template.default_risk_level,
          implementationPlan: template.implementation_plan_template,
          rollbackPlan: template.rollback_plan_template,
          testPlan: template.test_plan_template,
        };
      }
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.change_requests (
        change_number, title, description, justification,
        type, category, risk_level, impact, urgency,
        template_id, application_id, environment_id, requester_id, assigned_group,
        planned_start, planned_end, downtime_minutes, change_window_id,
        implementation_plan, rollback_plan, test_plan, communication_plan,
        risk_assessment, cab_required, cab_date, related_issue_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        changeNumber,
        data.title,
        data.description || null,
        data.justification || null,
        data.type || templateDefaults.type || 'normal',
        data.category || templateDefaults.category || null,
        data.riskLevel || templateDefaults.riskLevel || 'medium',
        data.impact || null,
        data.urgency || null,
        data.templateId || null,
        data.applicationId || null,
        data.environmentId || null,
        requesterId,
        data.assignedGroup || null,
        data.plannedStart || null,
        data.plannedEnd || null,
        data.downtimeMinutes || null,
        data.changeWindowId || null,
        data.implementationPlan || templateDefaults.implementationPlan || null,
        data.rollbackPlan || templateDefaults.rollbackPlan || null,
        data.testPlan || templateDefaults.testPlan || null,
        data.communicationPlan || null,
        JSON.stringify(data.riskAssessment || {}),
        data.cabRequired || false,
        data.cabDate || null,
        data.relatedIssueId || null,
      ]
    );

    // Record initial status
    await this.recordStatusHistory(tenantSlug, result.rows[0].id, null, 'draft', requesterId);

    return result.rows[0];
  }

  private async generateChangeNumber(tenantSlug: string): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`SELECT ${schema}.next_id('change') as id`);
    return result.rows[0].id;
  }

  async update(
    tenantSlug: string,
    id: string,
    data: Partial<{
      title: string;
      description: string;
      justification: string;
      type: string;
      category: string;
      riskLevel: string;
      impact: string;
      urgency: string;
      applicationId: string;
      environmentId: string;
      implementerId: string;
      assignedGroup: string;
      plannedStart: string;
      plannedEnd: string;
      downtimeMinutes: number;
      changeWindowId: string;
      implementationPlan: string;
      rollbackPlan: string;
      testPlan: string;
      communicationPlan: string;
      riskAssessment: Record<string, unknown>;
      cabRequired: boolean;
      cabDate: string;
      cabNotes: string;
    }>,
    _userId: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id) as Record<string, unknown> | null;
    if (!existing) {
      throw new NotFoundError('Change request', id);
    }

    // Only allow updates in certain statuses
    const editableStatuses = ['draft', 'submitted', 'review'];
    if (!editableStatuses.includes(existing.status as string)) {
      throw new BadRequestError(`Cannot update change in status: ${existing.status}`);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      justification: 'justification',
      type: 'type',
      category: 'category',
      riskLevel: 'risk_level',
      impact: 'impact',
      urgency: 'urgency',
      applicationId: 'application_id',
      environmentId: 'environment_id',
      implementerId: 'implementer_id',
      assignedGroup: 'assigned_group',
      plannedStart: 'planned_start',
      plannedEnd: 'planned_end',
      downtimeMinutes: 'downtime_minutes',
      changeWindowId: 'change_window_id',
      implementationPlan: 'implementation_plan',
      rollbackPlan: 'rollback_plan',
      testPlan: 'test_plan',
      communicationPlan: 'communication_plan',
      cabRequired: 'cab_required',
      cabDate: 'cab_date',
      cabNotes: 'cab_notes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (data.riskAssessment !== undefined) {
      fields.push(`risk_assessment = $${paramIndex++}`);
      values.push(JSON.stringify(data.riskAssessment));
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(existing.id);

    const result = await pool.query(
      `UPDATE ${schema}.change_requests SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  }

  async submit(tenantSlug: string, id: string, userId: string): Promise<unknown> {
    return this.updateStatus(tenantSlug, id, 'draft', 'submitted', userId);
  }

  async approve(
    tenantSlug: string,
    id: string,
    userId: string,
    comments?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Check status allows approval
    const approvableStatuses = ['submitted', 'review'];
    if (!approvableStatuses.includes(change.status as string)) {
      throw new BadRequestError(`Cannot approve change in status: ${change.status}`);
    }

    // Record approval
    await pool.query(
      `INSERT INTO ${schema}.change_approvals (change_id, approver_id, status, decision_at, comments)
       VALUES ($1, $2, 'approved', NOW(), $3)`,
      [change.id, userId, comments || null]
    );

    return this.updateStatus(tenantSlug, id, change.status as string, 'approved', userId);
  }

  async reject(
    tenantSlug: string,
    id: string,
    userId: string,
    reason: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Check status allows rejection
    const rejectableStatuses = ['submitted', 'review'];
    if (!rejectableStatuses.includes(change.status as string)) {
      throw new BadRequestError(`Cannot reject change in status: ${change.status}`);
    }

    // Record rejection
    await pool.query(
      `INSERT INTO ${schema}.change_approvals (change_id, approver_id, status, decision_at, comments)
       VALUES ($1, $2, 'rejected', NOW(), $3)`,
      [change.id, userId, reason]
    );

    return this.updateStatus(tenantSlug, id, change.status as string, 'rejected', userId, reason);
  }

  async schedule(
    tenantSlug: string,
    id: string,
    userId: string,
    plannedStart?: string,
    plannedEnd?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    if (change.status !== 'approved') {
      throw new BadRequestError('Change must be approved before scheduling');
    }

    // Update schedule if provided
    if (plannedStart || plannedEnd) {
      await pool.query(
        `UPDATE ${schema}.change_requests
         SET planned_start = COALESCE($1, planned_start),
             planned_end = COALESCE($2, planned_end),
             updated_at = NOW()
         WHERE id = $3`,
        [plannedStart || null, plannedEnd || null, change.id]
      );
    }

    return this.updateStatus(tenantSlug, id, 'approved', 'scheduled', userId);
  }

  async start(tenantSlug: string, id: string, userId: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Set actual start time
    await pool.query(
      `UPDATE ${schema}.change_requests SET actual_start = NOW(), implementer_id = $1, updated_at = NOW() WHERE id = $2`,
      [userId, change.id]
    );

    return this.updateStatus(tenantSlug, id, 'scheduled', 'implementing', userId);
  }

  async complete(
    tenantSlug: string,
    id: string,
    userId: string,
    outcomeNotes?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Set actual end time and outcome
    await pool.query(
      `UPDATE ${schema}.change_requests
       SET actual_end = NOW(), outcome = 'successful', outcome_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [outcomeNotes || null, change.id]
    );

    return this.updateStatus(tenantSlug, id, 'implementing', 'completed', userId);
  }

  async fail(
    tenantSlug: string,
    id: string,
    userId: string,
    outcomeNotes: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Set actual end time and outcome
    await pool.query(
      `UPDATE ${schema}.change_requests
       SET actual_end = NOW(), outcome = 'failed', outcome_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [outcomeNotes, change.id]
    );

    return this.updateStatus(tenantSlug, id, 'implementing', 'failed', userId, outcomeNotes);
  }

  async rollback(
    tenantSlug: string,
    id: string,
    userId: string,
    outcomeNotes: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    // Set actual end time and outcome
    await pool.query(
      `UPDATE ${schema}.change_requests
       SET actual_end = NOW(), outcome = 'rolled_back', outcome_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [outcomeNotes, change.id]
    );

    return this.updateStatus(tenantSlug, id, 'implementing', 'rolled_back', userId, outcomeNotes);
  }

  async cancel(tenantSlug: string, id: string, userId: string, reason?: string): Promise<unknown> {
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    const cancelableStatuses = ['draft', 'submitted', 'review', 'approved', 'scheduled'];
    if (!cancelableStatuses.includes(change.status as string)) {
      throw new BadRequestError(`Cannot cancel change in status: ${change.status}`);
    }

    return this.updateStatus(tenantSlug, id, change.status as string, 'cancelled', userId, reason);
  }

  private async updateStatus(
    tenantSlug: string,
    id: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    reason?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, id) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', id);
    }

    if (change.status !== fromStatus && fromStatus !== null) {
      throw new BadRequestError(`Expected status '${fromStatus}' but got '${change.status}'`);
    }

    await pool.query(
      `UPDATE ${schema}.change_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [toStatus, change.id]
    );

    await this.recordStatusHistory(tenantSlug, change.id as string, fromStatus, toStatus, userId, reason);

    return this.findById(tenantSlug, id);
  }

  private async recordStatusHistory(
    tenantSlug: string,
    changeId: string,
    fromStatus: string | null,
    toStatus: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `INSERT INTO ${schema}.change_status_history (change_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [changeId, fromStatus, toStatus, userId, reason || null]
    );
  }

  async getStatusHistory(tenantSlug: string, changeId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.change_status_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.change_id = $1
       ORDER BY h.created_at`,
      [change.id]
    );

    return result.rows;
  }

  async getApprovals(tenantSlug: string, changeId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `SELECT ca.*, u.name as approver_name, u.email as approver_email, g.name as group_name
       FROM ${schema}.change_approvals ca
       LEFT JOIN ${schema}.users u ON ca.approver_id = u.id
       LEFT JOIN ${schema}.groups g ON ca.approver_group = g.id
       WHERE ca.change_id = $1
       ORDER BY ca.step_number, ca.created_at`,
      [change.id]
    );

    return result.rows;
  }

  // ==================
  // TASKS
  // ==================

  async getTasks(tenantSlug: string, changeId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `SELECT t.*, u.name as assigned_to_name
       FROM ${schema}.change_tasks t
       LEFT JOIN ${schema}.users u ON t.assigned_to = u.id
       WHERE t.change_id = $1
       ORDER BY t.sort_order, t.created_at`,
      [change.id]
    );

    return result.rows;
  }

  async createTask(
    tenantSlug: string,
    changeId: string,
    data: {
      title: string;
      description?: string;
      taskType?: string;
      sortOrder?: number;
      assignedTo?: string;
      plannedStart?: string;
      plannedEnd?: string;
      durationMinutes?: number;
      isBlocking?: boolean;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    // Generate task number
    const taskNumber = await this.generateTaskNumber(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.change_tasks (
        change_id, task_number, title, description, task_type, sort_order,
        assigned_to, planned_start, planned_end, duration_minutes, is_blocking
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        change.id,
        taskNumber,
        data.title,
        data.description || null,
        data.taskType || 'implementation',
        data.sortOrder || 0,
        data.assignedTo || null,
        data.plannedStart || null,
        data.plannedEnd || null,
        data.durationMinutes || null,
        data.isBlocking !== false,
      ]
    );

    return result.rows[0];
  }

  private async generateTaskNumber(tenantSlug: string): Promise<string> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(`SELECT ${schema}.next_id('task') as id`);
    return result.rows[0].id;
  }

  async updateTask(
    tenantSlug: string,
    changeId: string,
    taskId: string,
    data: Partial<{
      title: string;
      description: string;
      taskType: string;
      status: string;
      sortOrder: number;
      assignedTo: string;
      plannedStart: string;
      plannedEnd: string;
      actualStart: string;
      actualEnd: string;
      durationMinutes: number;
      isBlocking: boolean;
      notes: string;
    }>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      taskType: 'task_type',
      status: 'status',
      sortOrder: 'sort_order',
      assignedTo: 'assigned_to',
      plannedStart: 'planned_start',
      plannedEnd: 'planned_end',
      actualStart: 'actual_start',
      actualEnd: 'actual_end',
      durationMinutes: 'duration_minutes',
      isBlocking: 'is_blocking',
      notes: 'notes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push(data[key as keyof typeof data]);
      }
    }

    if (fields.length === 0) {
      const taskResult = await pool.query(
        `SELECT * FROM ${schema}.change_tasks WHERE id = $1 AND change_id = $2`,
        [taskId, change.id]
      );
      return taskResult.rows[0];
    }

    fields.push(`updated_at = NOW()`);
    values.push(taskId, change.id);

    const result = await pool.query(
      `UPDATE ${schema}.change_tasks SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND change_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Change task', taskId);
    }

    return result.rows[0];
  }

  async startTask(tenantSlug: string, changeId: string, taskId: string): Promise<unknown> {
    return this.updateTask(tenantSlug, changeId, taskId, {
      status: 'in_progress',
      actualStart: new Date().toISOString(),
    });
  }

  async completeTask(tenantSlug: string, changeId: string, taskId: string, notes?: string): Promise<unknown> {
    return this.updateTask(tenantSlug, changeId, taskId, {
      status: 'completed',
      actualEnd: new Date().toISOString(),
      notes,
    });
  }

  async deleteTask(tenantSlug: string, changeId: string, taskId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `DELETE FROM ${schema}.change_tasks WHERE id = $1 AND change_id = $2`,
      [taskId, change.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Change task', taskId);
    }
  }

  // ==================
  // COMMENTS
  // ==================

  async getComments(tenantSlug: string, changeId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.avatar_url
       FROM ${schema}.change_comments c
       LEFT JOIN ${schema}.users u ON c.user_id = u.id
       WHERE c.change_id = $1
       ORDER BY c.created_at`,
      [change.id]
    );

    return result.rows;
  }

  async addComment(
    tenantSlug: string,
    changeId: string,
    userId: string,
    content: string,
    isInternal: boolean = false
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const change = await this.findById(tenantSlug, changeId) as Record<string, unknown> | null;

    if (!change) {
      throw new NotFoundError('Change request', changeId);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.change_comments (change_id, user_id, content, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [change.id, userId, content, isInternal]
    );

    return result.rows[0];
  }
}

export const changeWindowService = new ChangeWindowService();
export const changeTemplateService = new ChangeTemplateService();
export const changeRequestService = new ChangeRequestService();
