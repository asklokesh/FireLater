import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { issueService } from '../services/issues.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createIssueSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  issueType: z.enum(['issue', 'problem', 'question']).optional(),
  source: z.enum(['portal', 'email', 'phone', 'monitoring', 'api']).optional(),
  applicationId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
});

const updateIssueSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
});

const assignSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
});

const resolveSchema = z.object({
  resolutionCode: z.string().min(1).max(100),
  resolutionNotes: z.string().min(1).max(5000),
});

const statusChangeSchema = z.object({
  status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']),
  reason: z.string().max(500).optional(),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

const worklogSchema = z.object({
  timeSpent: z.number().min(1).max(1440), // max 24 hours in minutes
  description: z.string().min(1).max(1000),
  workDate: z.string().datetime().optional(),
  billable: z.boolean().optional(),
});

// Parameter validation schemas
const issueIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter validation schema
const listIssuesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_group: z.string().uuid().optional(),
  application_id: z.string().uuid().optional(),
  reporter_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  sla_breached: z.enum(['true', 'false']).optional(),
});

export default async function issueRoutes(app: FastifyInstance) {
  // List issues
  app.get('/', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listIssuesQuerySchema.parse(query);
    const pagination = parsePagination(query);

    const filters = {
      status: validatedQuery.status,
      priority: validatedQuery.priority,
      assignedTo: validatedQuery.assigned_to,
      assignedGroup: validatedQuery.assigned_group,
      applicationId: validatedQuery.application_id,
      reporterId: validatedQuery.reporter_id,
      search: validatedQuery.search || validatedQuery.q,
      slaBreached: validatedQuery.sla_breached === 'true' ? true : validatedQuery.sla_breached === 'false' ? false : undefined,
    };

    const { issues, total } = await issueService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(issues, total, pagination));
  });

  // Get issue by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const issue = await issueService.findById(tenantSlug, id);

    if (!issue) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Issue with id '${id}' not found`,
      });
    }

    reply.send(issue);
  });

  // Create issue
  app.post('/', {
    preHandler: [requirePermission('issues:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createIssueSchema.parse(request.body);

    const issue = await issueService.create(tenantSlug, body, userId);
    reply.status(201).send(issue);
  });

  // Update issue
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = updateIssueSchema.parse(request.body);

    const issue = await issueService.update(tenantSlug, id, body, userId);
    reply.send(issue);
  });

  // Assign issue
  app.post<{ Params: { id: string } }>('/:id/assign', {
    preHandler: [requirePermission('issues:assign')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = assignSchema.parse(request.body);

    const issue = await issueService.assign(
      tenantSlug,
      id,
      body.assignedTo || null,
      body.assignedGroup || null,
      userId
    );
    reply.send(issue);
  });

  // Escalate issue
  app.post<{ Params: { id: string } }>('/:id/escalate', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const issue = await issueService.escalate(tenantSlug, id, userId);
    reply.send(issue);
  });

  // Resolve issue
  app.post<{ Params: { id: string } }>('/:id/resolve', {
    preHandler: [requirePermission('issues:resolve')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = resolveSchema.parse(request.body);

    const issue = await issueService.resolve(
      tenantSlug,
      id,
      body.resolutionCode,
      body.resolutionNotes,
      userId
    );
    reply.send(issue);
  });

  // Close issue
  app.post<{ Params: { id: string } }>('/:id/close', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const issue = await issueService.close(tenantSlug, id, userId);
    reply.send(issue);
  });

  // Reopen issue
  app.post<{ Params: { id: string } }>('/:id/reopen', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const issue = await issueService.changeStatus(tenantSlug, id, 'in_progress', userId, 'Reopened');
    reply.send(issue);
  });

  // Change issue status (generic)
  app.post<{ Params: { id: string } }>('/:id/status', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = statusChangeSchema.parse(request.body);

    const issue = await issueService.changeStatus(
      tenantSlug,
      id,
      body.status,
      userId,
      body.reason
    );
    reply.send(issue);
  });

  // ========================================
  // COMMENTS
  // ========================================

  // Get comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const comments = await issueService.getComments(tenantSlug, id);
    reply.send({ data: comments });
  });

  // Add comment
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = commentSchema.parse(request.body);

    const comment = await issueService.addComment(
      tenantSlug,
      id,
      body.content,
      userId,
      body.isInternal
    );
    reply.status(201).send(comment);
  });

  // ========================================
  // WORKLOGS
  // ========================================

  // Get worklogs
  app.get<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const worklogs = await issueService.getWorklogs(tenantSlug, id);
    reply.send({ data: worklogs });
  });

  // Add worklog
  app.post<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = worklogSchema.parse(request.body);

    const worklog = await issueService.addWorklog(
      tenantSlug,
      id,
      body.timeSpent,
      body.description,
      userId,
      body.workDate ? new Date(body.workDate) : undefined,
      body.billable
    );
    reply.status(201).send(worklog);
  });

  // ========================================
  // HISTORY
  // ========================================

  // Get status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const history = await issueService.getStatusHistory(tenantSlug, id);
    reply.send({ data: history });
  });

  // ========================================
  // CATEGORIES
  // ========================================

  // Get issue categories
  app.get('/categories', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const categories = await issueService.getCategories(tenantSlug);
    reply.send({ data: categories });
  });

  // ========================================
  // LINKED PROBLEM
  // ========================================

  // Get linked problem
  app.get<{ Params: { id: string } }>('/:id/problem', {
    preHandler: [requirePermission('issues:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    const problem = await issueService.getLinkedProblem(tenantSlug, id);
    reply.send({ data: problem });
  });

  // Link issue to problem
  app.post<{ Params: { id: string } }>('/:id/problem', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);
    const body = z.object({
      problemId: z.string().uuid(),
      relationshipType: z.enum(['caused_by', 'related_to', 'duplicate_of']).optional(),
      notes: z.string().max(1000).optional(),
    }).parse(request.body);

    await issueService.linkToProblem(
      tenantSlug,
      id,
      body.problemId,
      userId,
      body.relationshipType,
      body.notes
    );
    reply.send({ success: true });
  });

  // Unlink issue from problem
  app.delete<{ Params: { id: string } }>('/:id/problem', {
    preHandler: [requirePermission('issues:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = issueIdParamSchema.parse(request.params);

    await issueService.unlinkFromProblem(tenantSlug, id);
    reply.send({ success: true });
  });
}
