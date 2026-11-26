import { FastifyInstance } from 'fastify';
import { issueService } from '../services/issues.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import {
  createIssueSchema,
  updateIssueSchema,
  assignSchema,
  resolveSchema,
  statusChangeSchema,
  commentSchema,
  worklogSchema,
  linkProblemSchema,
  issueIdParamSchema,
  listIssuesQuerySchema,
} from '../schemas/issues.js';

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
    const body = linkProblemSchema.parse(request.body);

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
