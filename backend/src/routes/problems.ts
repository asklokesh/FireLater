import { FastifyInstance } from 'fastify';
import { problemService } from '../services/problems.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  assignSchema,
  commentSchema,
  createProblemSchema,
  linkIssueSchema,
  listProblemsQuerySchema,
  problemIdParamSchema,
  problemIssueParamSchema,
  statusChangeSchema,
  updateProblemSchema,
  worklogSchema,
  type AssignInput,
  type CommentInput,
  type CreateProblemInput,
  type LinkIssueInput,
  type ProblemIdParamInput,
  type ProblemIssueParamInput,
  type StatusChangeInput,
  type UpdateProblemInput,
  type WorklogInput,
  type ListProblemsQueryInput,
} from '../schemas/problems.js';











// Parameter validation schemas


// Query parameter validation schema



export default async function problemRoutes(app: FastifyInstance) {
  // List problems
  app.get('/', {
    preHandler: [requirePermission('problems:read'), validate({ query: listProblemsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListProblemsQueryInput;
    const pagination = parsePagination(query);

    const filters = {
      status: validatedQuery.status,
      priority: validatedQuery.priority,
      assignedTo: validatedQuery.assigned_to,
      assignedGroup: validatedQuery.assigned_group,
      applicationId: validatedQuery.application_id,
      reporterId: validatedQuery.reporter_id,
      search: validatedQuery.search || validatedQuery.q,
      isKnownError: validatedQuery.is_known_error === 'true' ? true : validatedQuery.is_known_error === 'false' ? false : undefined,
      problemType: validatedQuery.problem_type,
    };

    const { problems, total } = await problemService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(problems, total, pagination));
  });

  // Get problem by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:read'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

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
    preHandler: [requirePermission('problems:create'), validate({ body: createProblemSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateProblemInput;

    const problem = await problemService.create(tenantSlug, userId, body);
    reply.status(201).send(problem);
  });

  // Update problem
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema, body: updateProblemSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as UpdateProblemInput;

    const problem = await problemService.update(tenantSlug, id, body, userId);
    reply.send(problem);
  });

  // Delete problem
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('problems:delete'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    await problemService.delete(tenantSlug, id);
    reply.status(204).send();
  });

  // Change problem status
  app.put<{ Params: { id: string } }>('/:id/status', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema, body: statusChangeSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as StatusChangeInput;

    const problem = await problemService.updateStatus(tenantSlug, id, body.status, userId, body.reason);
    reply.send(problem);
  });

  // Assign problem
  app.post<{ Params: { id: string } }>('/:id/assign', {
    preHandler: [requirePermission('problems:assign'), validate({ params: problemIdParamSchema, body: assignSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as AssignInput;

    const problem = await problemService.assign(tenantSlug, id, body.assigneeId, userId);
    reply.send(problem);
  });

  // Get problem comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('problems:read'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    const comments = await problemService.getComments(tenantSlug, id);
    reply.send(comments);
  });

  // Add comment to problem
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema, body: commentSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as CommentInput;

    const result = await problemService.addComment(tenantSlug, id, userId, body.content, body.isInternal);
    reply.status(201).send(result);
  });

  // Get problem worklogs
  app.get<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('problems:read'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    const worklogs = await problemService.getWorklogs(tenantSlug, id);
    reply.send(worklogs);
  });

  // Add worklog to problem
  app.post<{ Params: { id: string } }>('/:id/worklogs', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema, body: worklogSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as WorklogInput;

    const result = await problemService.addWorklog(
      tenantSlug,
      id,
      userId,
      body.timeSpent,
      body.description,
      body.workType
    );
    reply.status(201).send(result);
  });

  // Get linked issues
  app.get<{ Params: { id: string } }>('/:id/issues', {
    preHandler: [requirePermission('problems:read'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    const issues = await problemService.getLinkedIssues(tenantSlug, id);
    reply.send(issues);
  });

  // Link issue to problem
  app.post<{ Params: { id: string } }>('/:id/issues', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema, body: linkIssueSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;
    const body = request.body as LinkIssueInput;

    await problemService.linkIssue(
      tenantSlug,
      id,
      body.issueId,
      userId,
      body.relationshipType,
      body.notes
    );
    reply.status(201).send({ message: 'Issue linked successfully' });
  });

  // Unlink issue from problem
  app.delete<{ Params: { id: string; issueId: string } }>('/:id/issues/:issueId', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIssueParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id, issueId } = request.params as ProblemIssueParamInput;

    await problemService.unlinkIssue(tenantSlug, id, issueId);
    reply.status(204).send();
  });

  // Get status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('problems:read'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    const history = await problemService.getStatusHistory(tenantSlug, id);
    reply.send(history);
  });

  // Convert to known error
  app.post<{ Params: { id: string } }>('/:id/convert-to-known-error', {
    preHandler: [requirePermission('problems:update'), validate({ params: problemIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as ProblemIdParamInput;

    const problem = await problemService.updateStatus(tenantSlug, id, 'known_error', userId, 'Converted to known error');
    reply.send(problem);
  });
}
