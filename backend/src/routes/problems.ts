import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { problemService } from '../services/problems.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { isValidUUID } from '../utils/errors.js';

const createProblemSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  problemType: z.enum(['reactive', 'proactive']).optional(),
  applicationId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

const fiveWhyEntrySchema = z.object({
  why: z.string().max(500),
  answer: z.string().max(2000),
});

const fishboneDiagramSchema = z.record(z.array(z.string().max(500)));

const rcaDataSchema = z.object({
  fiveWhys: z.array(fiveWhyEntrySchema).max(10).optional(),
  fishbone: fishboneDiagramSchema.optional(),
  summary: z.string().max(5000).optional(),
  analysisDate: z.string().optional(),
  analyzedBy: z.string().optional(),
}).optional();

const updateProblemSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  assignedGroup: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  rootCause: z.string().max(10000).optional(),
  workaround: z.string().max(10000).optional(),
  resolution: z.string().max(10000).optional(),
  resolutionCode: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  rcaData: rcaDataSchema,
});

const assignSchema = z.object({
  assigneeId: z.string().uuid(),
});

const statusChangeSchema = z.object({
  status: z.enum(['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed']),
  reason: z.string().max(500).optional(),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

const worklogSchema = z.object({
  timeSpent: z.number().min(1).max(1440),
  description: z.string().min(1).max(1000),
  workType: z.enum(['analysis', 'investigation', 'documentation', 'testing', 'implementation', 'other']).optional(),
});

const linkIssueSchema = z.object({
  issueId: z.string().uuid(),
  relationshipType: z.enum(['caused_by', 'related_to', 'duplicate_of']).optional(),
  notes: z.string().max(1000).optional(),
});

const costBreakdownSchema = z.object({
  labor_hours: z.number().min(0).optional(),
  labor_rate: z.number().min(0).optional(),
  revenue_loss: z.number().min(0).optional(),
  recovery_costs: z.number().min(0).optional(),
  third_party_costs: z.number().min(0).optional(),
  customer_credits: z.number().min(0).optional(),
  other: z.number().min(0).optional(),
}).optional().nullable();

const _financialImpactSchema = z.object({
  estimated: z.number().min(0).nullable().optional(),
  actual: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
  costBreakdown: costBreakdownSchema,
});

export default async function problemRoutes(app: FastifyInstance) {
  // List problems
  app.get('/', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      priority: query.priority,
      assignedTo: query.assigned_to,
      assignedGroup: query.assigned_group,
      applicationId: query.application_id,
      reporterId: query.reporter_id,
      search: query.search || query.q,
      isKnownError: query.is_known_error === 'true' ? true : query.is_known_error === 'false' ? false : undefined,
      problemType: query.problem_type,
    };

    const { problems, total } = await problemService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(problems, total, pagination));
  });

  // Get problem by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { id } = request.params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Problem with id '${id}' not found`,
      });
    }

    const { tenantSlug } = request.user;
    const problem = await problemService.getById(tenantSlug, id);
    if (!problem) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Problem with id '${id}' not found`,
      });
    }
    reply.send(problem);
  });

  // Create problem
  app.post('/', {
    preHandler: [requirePermission('problems:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createProblemSchema.parse(request.body);

    const problem = await problemService.create(tenantSlug, userId, body);
    reply.status(201).send(problem);
  });

  // Update problem
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updateProblemSchema.parse(request.body);

    const problem = await problemService.update(tenantSlug, request.params.id, body, userId);
    reply.send(problem);
  });

  // Delete problem
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:delete')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await problemService.delete(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // Change problem status
  app.put<{ Params: { id: string } }>('/:id/status', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = statusChangeSchema.parse(request.body);

    const problem = await problemService.updateStatus(tenantSlug, request.params.id, body.status, userId, body.reason);
    reply.send(problem);
  });

  // Assign problem
  app.post<{ Params: { id: string } }>('/:id/assign', {
    preHandler: [requirePermission('problems:assign')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = assignSchema.parse(request.body);

    const problem = await problemService.assign(tenantSlug, request.params.id, body.assigneeId, userId);
    reply.send(problem);
  });

  // Get problem comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const comments = await problemService.getComments(tenantSlug, request.params.id);
    reply.send(comments);
  });

  // Add comment to problem
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = commentSchema.parse(request.body);

    const result = await problemService.addComment(tenantSlug, request.params.id, userId, body.content, body.isInternal);
    reply.status(201).send(result);
  });

  // Get problem worklogs
  app.get<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const worklogs = await problemService.getWorklogs(tenantSlug, request.params.id);
    reply.send(worklogs);
  });

  // Add worklog to problem
  app.post<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = worklogSchema.parse(request.body);

    const result = await problemService.addWorklog(
      tenantSlug,
      request.params.id,
      userId,
      body.timeSpent,
      body.description,
      body.workType
    );
    reply.status(201).send(result);
  });

  // Get linked issues
  app.get<{ Params: { id: string } }>('/:id/issues', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const issues = await problemService.getLinkedIssues(tenantSlug, request.params.id);
    reply.send(issues);
  });

  // Link issue to problem
  app.post<{ Params: { id: string } }>('/:id/issues', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = linkIssueSchema.parse(request.body);

    await problemService.linkIssue(
      tenantSlug,
      request.params.id,
      body.issueId,
      userId,
      body.relationshipType,
      body.notes
    );
    reply.status(201).send({ message: 'Issue linked successfully' });
  });

  // Unlink issue from problem
  app.delete<{ Params: { id: string; issueId: string } }>('/:id/issues/:issueId', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await problemService.unlinkIssue(tenantSlug, request.params.id, request.params.issueId);
    reply.status(204).send();
  });

  // Get status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('problems:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const history = await problemService.getStatusHistory(tenantSlug, request.params.id);
    reply.send(history);
  });

  // Convert to known error
  app.post<{ Params: { id: string } }>('/:id/convert-to-known-error', {
    preHandler: [requirePermission('problems:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const problem = await problemService.updateStatus(tenantSlug, request.params.id, 'known_error', userId, 'Converted to known error');
    reply.send(problem);
  });
}
