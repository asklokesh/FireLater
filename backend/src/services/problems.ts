import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { PaginationParams, ProblemStatus, ProblemType, ProblemPriority, IssueImpact, IssueUrgency } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';
import { sanitizeMarkdown, sanitizePlainText } from '../utils/contentSanitization.js';
import { cacheService } from '../utils/cache.js';

interface CreateProblemParams {
  title: string;
  description?: string;
  priority?: ProblemPriority;
  impact?: IssueImpact;
  urgency?: IssueUrgency;
  categoryId?: string;
  problemType?: ProblemType;
  applicationId?: string;
  assignedTo?: string;
  assignedGroup?: string;
  tags?: string[];
}

interface FiveWhyEntry {
  why: string;
  answer: string;
}

interface FishboneDiagram {
  // Categories for fishbone diagram (Ishikawa)
  people?: string[];
  process?: string[];
  equipment?: string[];
  materials?: string[];
  environment?: string[];
  management?: string[];
  // Custom categories
  [key: string]: string[] | undefined;
}

interface RcaData {
  fiveWhys?: FiveWhyEntry[];
  fishbone?: FishboneDiagram;
  summary?: string;
  analysisDate?: string;
  analyzedBy?: string;
}

interface CostBreakdown {
  labor_hours?: number;
  labor_rate?: number;
  revenue_loss?: number;
  recovery_costs?: number;
  third_party_costs?: number;
  customer_credits?: number;
  other?: number;
}

interface FinancialImpactParams {
  estimated?: number | null;
  actual?: number | null;
  currency?: string;
  notes?: string | null;
  costBreakdown?: CostBreakdown | null;
}

interface UpdateProblemParams {
  title?: string;
  description?: string;
  priority?: ProblemPriority;
  impact?: IssueImpact;
  urgency?: IssueUrgency;
  categoryId?: string;
  assignedTo?: string | null;
  assignedGroup?: string | null;
  applicationId?: string | null;
  rootCause?: string;
  workaround?: string;
  resolution?: string;
  resolutionCode?: string;
  tags?: string[];
  rcaData?: RcaData;
}

interface Problem {
  id: string;
  problem_number: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  priority: ProblemPriority;
  impact: IssueImpact | null;
  urgency: IssueUrgency | null;
  category_id: string | null;
  problem_type: ProblemType;
  application_id: string | null;
  reporter_id: string;
  assigned_to: string | null;
  assigned_group: string | null;
  root_cause: string | null;
  root_cause_identified_at: Date | null;
  root_cause_identified_by: string | null;
  workaround: string | null;
  workaround_documented_at: Date | null;
  has_workaround: boolean;
  is_known_error: boolean;
  known_error_since: Date | null;
  known_error_id: string | null;
  resolution: string | null;
  resolution_code: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  closure_code: string | null;
  affected_services_count: number;
  related_incidents_count: number;
  recurrence_count: number;
  sla_breached: boolean;
  tags: string[] | null;
  rca_data: RcaData | null;
  financial_impact_estimated: number | null;
  financial_impact_actual: number | null;
  financial_impact_currency: string;
  financial_impact_notes: string | null;
  cost_breakdown: CostBreakdown | null;
  created_at: Date;
  updated_at: Date;
}

const VALID_STATUS_TRANSITIONS: Record<ProblemStatus, ProblemStatus[]> = {
  new: ['assigned', 'investigating', 'closed'],
  assigned: ['investigating', 'closed'],
  investigating: ['root_cause_identified', 'closed'],
  root_cause_identified: ['known_error', 'resolved', 'investigating'],
  known_error: ['resolved', 'closed'],
  resolved: ['closed', 'investigating'],
  closed: ['investigating'],
};

export class ProblemService {
  async list(tenantSlug: string, params: PaginationParams, filters?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    assignedGroup?: string;
    applicationId?: string;
    reporterId?: string;
    search?: string;
    isKnownError?: boolean;
    problemType?: string;
  }): Promise<{ problems: Problem[]; total: number }> {
    const cacheKey = `${tenantSlug}:problems:list:${JSON.stringify({ params, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(params);

        let whereClause = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (filters?.status) {
          whereClause += ` AND p.status = $${paramIndex++}`;
          values.push(filters.status);
        }
        if (filters?.priority) {
          whereClause += ` AND p.priority = $${paramIndex++}`;
          values.push(filters.priority);
        }
        if (filters?.assignedTo) {
          whereClause += ` AND p.assigned_to = $${paramIndex++}`;
          values.push(filters.assignedTo);
        }
        if (filters?.assignedGroup) {
          whereClause += ` AND p.assigned_group = $${paramIndex++}`;
          values.push(filters.assignedGroup);
        }
        if (filters?.applicationId) {
          whereClause += ` AND p.application_id = $${paramIndex++}`;
          values.push(filters.applicationId);
        }
        if (filters?.reporterId) {
          whereClause += ` AND p.reporter_id = $${paramIndex++}`;
          values.push(filters.reporterId);
        }
        if (filters?.isKnownError !== undefined) {
          whereClause += ` AND p.is_known_error = $${paramIndex++}`;
          values.push(filters.isKnownError);
        }
        if (filters?.problemType) {
          whereClause += ` AND p.problem_type = $${paramIndex++}`;
          values.push(filters.problemType);
        }
        if (filters?.search) {
          whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.problem_number ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        const allowedSortColumns = ['created_at', 'updated_at', 'title', 'priority', 'status', 'problem_number'];
        const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'created_at';
        const sortOrder = params.order === 'asc' ? 'asc' : 'desc';

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.problems p ${whereClause}`,
          values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT p.*,
                  r.name as reporter_name, r.email as reporter_email,
                  a.name as assignee_name, a.email as assignee_email,
                  g.name as assigned_group_name,
                  app.name as application_name, app.app_id as application_app_id
           FROM ${schema}.problems p
           LEFT JOIN ${schema}.users r ON p.reporter_id = r.id
           LEFT JOIN ${schema}.users a ON p.assigned_to = a.id
           LEFT JOIN ${schema}.groups g ON p.assigned_group = g.id
           LEFT JOIN ${schema}.applications app ON p.application_id = app.id
           ${whereClause}
           ORDER BY p.${sortColumn} ${sortOrder}
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, params.perPage, offset]
        );

        return { problems: result.rows, total };
      },
      { ttl: 300 } // 5 minutes - problems change moderately frequently
    );
  }

  async getById(tenantSlug: string, problemId: string): Promise<Problem> {
    const cacheKey = `${tenantSlug}:problems:problem:${problemId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT p.*,
                  r.name as reporter_name, r.email as reporter_email,
                  a.name as assignee_name, a.email as assignee_email,
                  g.name as assigned_group_name,
                  app.name as application_name, app.app_id as application_app_id,
                  rca.name as root_cause_identified_by_name
           FROM ${schema}.problems p
           LEFT JOIN ${schema}.users r ON p.reporter_id = r.id
           LEFT JOIN ${schema}.users a ON p.assigned_to = a.id
           LEFT JOIN ${schema}.groups g ON p.assigned_group = g.id
           LEFT JOIN ${schema}.applications app ON p.application_id = app.id
           LEFT JOIN ${schema}.users rca ON p.root_cause_identified_by = rca.id
           WHERE p.id = $1`,
          [problemId]
        );

        if (result.rows.length === 0) {
          throw new NotFoundError('Problem', problemId);
        }

        return result.rows[0];
      },
      { ttl: 300 } // 5 minutes - problem details accessed frequently
    );
  }

  async create(tenantSlug: string, reporterId: string, params: CreateProblemParams): Promise<Problem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const problemNumber = await this.generateProblemNumber(schema);

    // Sanitize description to prevent XSS attacks
    const sanitizedDescription = params.description ? sanitizeMarkdown(params.description) : null;

    const result = await pool.query(
      `INSERT INTO ${schema}.problems (
        problem_number, title, description, priority, impact, urgency,
        category_id, problem_type, application_id, reporter_id,
        assigned_to, assigned_group, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        problemNumber,
        params.title,
        sanitizedDescription,
        params.priority || 'medium',
        params.impact || null,
        params.urgency || null,
        params.categoryId || null,
        params.problemType || 'reactive',
        params.applicationId || null,
        reporterId,
        params.assignedTo || null,
        params.assignedGroup || null,
        params.tags || null,
      ]
    );

    const problem = result.rows[0];

    await this.recordStatusChange(schema, problem.id, null, 'new', reporterId);

    logger.info({ problemId: problem.id, problemNumber }, 'Problem created');

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after problem creation');
    });

    return problem;
  }

  async update(tenantSlug: string, problemId: string, params: UpdateProblemParams, userId: string): Promise<Problem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.getById(tenantSlug, problemId);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(params.title);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      // Sanitize description to prevent XSS attacks
      values.push(sanitizeMarkdown(params.description));
    }
    if (params.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(params.priority);
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
    if (params.rootCause !== undefined) {
      updates.push(`root_cause = $${paramIndex++}`);
      // Sanitize root cause to prevent XSS attacks
      values.push(sanitizeMarkdown(params.rootCause));
      if (params.rootCause && !existing.root_cause) {
        updates.push(`root_cause_identified_at = NOW()`);
        updates.push(`root_cause_identified_by = $${paramIndex++}`);
        values.push(userId);
      }
    }
    if (params.workaround !== undefined) {
      updates.push(`workaround = $${paramIndex++}`);
      // Sanitize workaround to prevent XSS attacks
      values.push(sanitizeMarkdown(params.workaround));
      if (params.workaround) {
        updates.push(`has_workaround = true`);
        if (!existing.workaround_documented_at) {
          updates.push(`workaround_documented_at = NOW()`);
        }
      }
    }
    if (params.resolution !== undefined) {
      updates.push(`resolution = $${paramIndex++}`);
      // Sanitize resolution to prevent XSS attacks
      values.push(sanitizeMarkdown(params.resolution));
    }
    if (params.resolutionCode !== undefined) {
      updates.push(`resolution_code = $${paramIndex++}`);
      values.push(params.resolutionCode);
    }
    if (params.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(params.tags);
    }
    if (params.rcaData !== undefined) {
      updates.push(`rca_data = $${paramIndex++}`);
      values.push(JSON.stringify(params.rcaData));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE ${schema}.problems SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...values, problemId]
    );

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after problem update');
    });

    return result.rows[0];
  }

  async updateStatus(tenantSlug: string, problemId: string, newStatus: ProblemStatus, userId: string, reason?: string): Promise<Problem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const problem = await this.getById(tenantSlug, problemId);
    const currentStatus = problem.status as ProblemStatus;

    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestError(
        `Cannot transition problem from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.join(', ')}`
      );
    }

    // Require root cause before resolution or closure
    if (newStatus === 'resolved' || newStatus === 'closed') {
      if (!problem.root_cause_identified_at) {
        throw new BadRequestError(
          'Cannot resolve or close problem without identifying root cause. Please set root_cause_identified_at first.'
        );
      }

      if (!problem.root_cause || (problem.root_cause as string).trim().length === 0) {
        throw new BadRequestError(
          'Root cause description is required before resolving or closing the problem.'
        );
      }
    }

    const updates: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [newStatus];
    let paramIndex = 2;

    if (newStatus === 'resolved') {
      updates.push(`resolved_at = NOW()`);
      updates.push(`resolved_by = $${paramIndex++}`);
      values.push(userId);
    } else if (newStatus === 'closed') {
      updates.push(`closed_at = NOW()`);
      updates.push(`closed_by = $${paramIndex++}`);
      values.push(userId);
    } else if (newStatus === 'known_error') {
      updates.push(`is_known_error = true`);
      updates.push(`known_error_since = NOW()`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.problems SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...values, problemId]
    );

    await this.recordStatusChange(schema, problemId, currentStatus, newStatus, userId, reason);

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after status update');
    });

    return result.rows[0];
  }

  async assign(tenantSlug: string, problemId: string, assigneeId: string, userId: string): Promise<Problem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const problem = await this.getById(tenantSlug, problemId);

    const result = await pool.query(
      `UPDATE ${schema}.problems SET assigned_to = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [assigneeId, problemId]
    );

    if (problem.status === 'new') {
      await this.updateStatus(tenantSlug, problemId, 'assigned', userId);
    }

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after assignment');
    });

    return result.rows[0];
  }

  async delete(tenantSlug: string, problemId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.problems WHERE id = $1`,
      [problemId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Problem', problemId);
    }

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after deletion');
    });
  }

  async addComment(tenantSlug: string, problemId: string, userId: string, content: string, isInternal = false): Promise<{ id: string }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await this.getById(tenantSlug, problemId);

    // Sanitize comment content to prevent XSS attacks
    const sanitizedContent = sanitizeMarkdown(content);

    const result = await pool.query(
      `INSERT INTO ${schema}.problem_comments (problem_id, user_id, content, is_internal)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [problemId, userId, sanitizedContent, isInternal]
    );

    await pool.query(
      `UPDATE ${schema}.problems SET updated_at = NOW() WHERE id = $1`,
      [problemId]
    );

    return { id: result.rows[0].id };
  }

  async getComments(tenantSlug: string, problemId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await this.getById(tenantSlug, problemId);

    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_url
       FROM ${schema}.problem_comments c
       LEFT JOIN ${schema}.users u ON c.user_id = u.id
       WHERE c.problem_id = $1
       ORDER BY c.created_at DESC`,
      [problemId]
    );

    return result.rows;
  }

  async linkIssue(tenantSlug: string, problemId: string, issueId: string, userId: string, relationshipType = 'caused_by', notes?: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await this.getById(tenantSlug, problemId);

    const issueCheck = await pool.query(
      `SELECT id FROM ${schema}.issues WHERE id = $1`,
      [issueId]
    );
    if (issueCheck.rows.length === 0) {
      throw new NotFoundError('Issue', issueId);
    }

    await pool.query(
      `INSERT INTO ${schema}.problem_issues (problem_id, issue_id, relationship_type, linked_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (problem_id, issue_id) DO UPDATE SET
         relationship_type = EXCLUDED.relationship_type,
         notes = EXCLUDED.notes`,
      [problemId, issueId, relationshipType, userId, notes]
    );

    await pool.query(
      `UPDATE ${schema}.issues SET problem_id = $1, updated_at = NOW() WHERE id = $2`,
      [problemId, issueId]
    );

    await this.updateRelatedIncidentsCount(schema, problemId);
  }

  async unlinkIssue(tenantSlug: string, problemId: string, issueId: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `DELETE FROM ${schema}.problem_issues WHERE problem_id = $1 AND issue_id = $2`,
      [problemId, issueId]
    );

    await pool.query(
      `UPDATE ${schema}.issues SET problem_id = NULL, updated_at = NOW() WHERE id = $1`,
      [issueId]
    );

    await this.updateRelatedIncidentsCount(schema, problemId);
  }

  async getLinkedIssues(tenantSlug: string, problemId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await this.getById(tenantSlug, problemId);

    const result = await pool.query(
      `SELECT i.*, pi.relationship_type, pi.linked_at, pi.notes,
              u.name as linked_by_name
       FROM ${schema}.problem_issues pi
       JOIN ${schema}.issues i ON pi.issue_id = i.id
       LEFT JOIN ${schema}.users u ON pi.linked_by = u.id
       WHERE pi.problem_id = $1
       ORDER BY pi.linked_at DESC`,
      [problemId]
    );

    return result.rows;
  }

  async getStatusHistory(tenantSlug: string, problemId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT h.*, u.name as changed_by_name
       FROM ${schema}.problem_status_history h
       LEFT JOIN ${schema}.users u ON h.changed_by = u.id
       WHERE h.problem_id = $1
       ORDER BY h.created_at DESC`,
      [problemId]
    );

    return result.rows;
  }

  async addWorklog(tenantSlug: string, problemId: string, userId: string, timeSpent: number, description: string, workType = 'analysis'): Promise<{ id: string }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await this.getById(tenantSlug, problemId);

    // Sanitize worklog description to prevent XSS attacks
    const sanitizedDescription = sanitizePlainText(description);

    const result = await pool.query(
      `INSERT INTO ${schema}.problem_worklogs (problem_id, user_id, time_spent, description, work_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [problemId, userId, timeSpent, sanitizedDescription, workType]
    );

    return { id: result.rows[0].id };
  }

  async getWorklogs(tenantSlug: string, problemId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT w.*, u.name as user_name
       FROM ${schema}.problem_worklogs w
       LEFT JOIN ${schema}.users u ON w.user_id = u.id
       WHERE w.problem_id = $1
       ORDER BY w.created_at DESC`,
      [problemId]
    );

    return result.rows;
  }

  private async generateProblemNumber(schema: string): Promise<string> {
    const result = await pool.query(
      `SELECT ${schema}.next_id('problem') as problem_number`
    );
    return result.rows[0].problem_number;
  }

  private async recordStatusChange(
    schema: string,
    problemId: string,
    fromStatus: string | null,
    toStatus: string,
    changedBy: string,
    reason?: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO ${schema}.problem_status_history (problem_id, from_status, to_status, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [problemId, fromStatus, toStatus, changedBy, reason]
    );
  }

  private async updateRelatedIncidentsCount(schema: string, problemId: string): Promise<void> {
    await pool.query(
      `UPDATE ${schema}.problems SET
         related_incidents_count = (
           SELECT COUNT(*) FROM ${schema}.problem_issues WHERE problem_id = $1
         ),
         updated_at = NOW()
       WHERE id = $1`,
      [problemId]
    );
  }

  async updateFinancialImpact(tenantSlug: string, problemId: string, params: FinancialImpactParams): Promise<Problem> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify problem exists
    await this.getById(tenantSlug, problemId);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.estimated !== undefined) {
      updates.push(`financial_impact_estimated = $${paramIndex++}`);
      values.push(params.estimated);
    }
    if (params.actual !== undefined) {
      updates.push(`financial_impact_actual = $${paramIndex++}`);
      values.push(params.actual);
    }
    if (params.currency !== undefined) {
      updates.push(`financial_impact_currency = $${paramIndex++}`);
      values.push(params.currency);
    }
    if (params.notes !== undefined) {
      updates.push(`financial_impact_notes = $${paramIndex++}`);
      values.push(params.notes);
    }
    if (params.costBreakdown !== undefined) {
      updates.push(`cost_breakdown = $${paramIndex++}`);
      values.push(params.costBreakdown ? JSON.stringify(params.costBreakdown) : null);
    }

    if (updates.length === 0) {
      return this.getById(tenantSlug, problemId);
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE ${schema}.problems SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...values, problemId]
    );

    logger.info({ problemId, financialImpact: params }, 'Financial impact updated');

    // Invalidate cache (non-blocking)
    cacheService.invalidateTenant(tenantSlug, 'problems').catch((err) => {
      logger.warn({ err, tenantSlug }, 'Failed to invalidate cache after financial impact update');
    });

    return result.rows[0];
  }

  async getFinancialImpact(tenantSlug: string, problemId: string): Promise<{
    estimated: number | null;
    actual: number | null;
    currency: string;
    notes: string | null;
    costBreakdown: CostBreakdown | null;
    calculatedTotal: number;
  }> {
    const problem = await this.getById(tenantSlug, problemId);

    // Calculate total from cost breakdown if available
    let calculatedTotal = 0;
    if (problem.cost_breakdown) {
      const breakdown = problem.cost_breakdown;
      calculatedTotal += (breakdown.labor_hours || 0) * (breakdown.labor_rate || 0);
      calculatedTotal += breakdown.revenue_loss || 0;
      calculatedTotal += breakdown.recovery_costs || 0;
      calculatedTotal += breakdown.third_party_costs || 0;
      calculatedTotal += breakdown.customer_credits || 0;
      calculatedTotal += breakdown.other || 0;
    }

    return {
      estimated: problem.financial_impact_estimated,
      actual: problem.financial_impact_actual,
      currency: problem.financial_impact_currency,
      notes: problem.financial_impact_notes,
      costBreakdown: problem.cost_breakdown,
      calculatedTotal,
    };
  }
}

export const problemService = new ProblemService();
