import { FastifyInstance } from 'fastify';
import { requestService } from '../services/requests.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  addCommentSchema,
  approvalActionSchema,
  assignRequestSchema,
  cancelRequestSchema,
  completeRequestSchema,
  createRequestSchema,
  listRequestsQuerySchema,
  requestApprovalParamSchema,
  requestIdParamSchema,
  updateRequestSchema,
  type AddCommentInput,
  type ApprovalActionInput,
  type AssignRequestInput,
  type CancelRequestInput,
  type CompleteRequestInput,
  type CreateRequestInput,
  type RequestApprovalParamInput,
  type RequestIdParamInput,
  type UpdateRequestInput,
  type ListRequestsQueryInput,
} from '../schemas/requests.js';








// Parameter validation schemas


// Query parameter validation schema

export default async function requestRoutes(app: FastifyInstance) {
  // List requests
  app.get('/', {
    preHandler: [requirePermission('requests:read'), validate({ query: listRequestsQuerySchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListRequestsQueryInput;
    const pagination = parsePagination(query);

    const filters = {
      status: validatedQuery.status,
      priority: validatedQuery.priority,
      requesterId: validatedQuery.requester_id,
      requestedForId: validatedQuery.requested_for_id,
      assignedTo: validatedQuery.assigned_to,
      catalogItemId: validatedQuery.catalog_item_id,
      search: validatedQuery.search || validatedQuery.q,
    };

    const { requests, total } = await requestService.list(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(requests, total, pagination));
  });

  // Get my requests (requester view)
  app.get('/my', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { requests, total } = await requestService.list(tenantSlug, pagination, { requesterId: userId });
    reply.send(createPaginatedResponse(requests, total, pagination));
  });

  // Get requests assigned to me
  app.get('/assigned', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const { requests, total } = await requestService.list(tenantSlug, pagination, { assignedTo: userId });
    reply.send(createPaginatedResponse(requests, total, pagination));
  });

  // Get pending approvals for current user
  app.get('/pending-approvals', {
    preHandler: [requirePermission('approvals:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;

    const approvals = await requestService.getPendingApprovals(tenantSlug, userId);
    reply.send({ data: approvals });
  });

  // Get request by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('requests:read'), validate({ params: requestIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as RequestIdParamInput;

    const serviceRequest = await requestService.findById(tenantSlug, id);

    if (!serviceRequest) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Request with id '${id}' not found`,
      });
    }

    reply.send(serviceRequest);
  });

  // Create request
  app.post('/', {
    preHandler: [requirePermission('requests:create'), validate({ body: createRequestSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = request.body as CreateRequestInput;

    const serviceRequest = await requestService.create(tenantSlug, body, userId);
    reply.status(201).send(serviceRequest);
  });

  // Update request
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('requests:update'), validate({ params: requestIdParamSchema, body: updateRequestSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;
    const body = request.body as UpdateRequestInput;

    const serviceRequest = await requestService.update(tenantSlug, id, body, userId);
    reply.send(serviceRequest);
  });

  // Assign request
  app.post<{ Params: { id: string } }>('/:id/assign', {
    preHandler: [requirePermission('requests:assign'), validate({ params: requestIdParamSchema, body: assignRequestSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;
    const body = request.body as AssignRequestInput;

    const serviceRequest = await requestService.assign(tenantSlug, id, body.assignedTo, userId);
    reply.send(serviceRequest);
  });

  // Start work on request
  app.post<{ Params: { id: string } }>('/:id/start', {
    preHandler: [requirePermission('requests:update'), validate({ params: requestIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;

    const serviceRequest = await requestService.startWork(tenantSlug, id, userId);
    reply.send(serviceRequest);
  });

  // Complete request
  app.post<{ Params: { id: string } }>('/:id/complete', {
    preHandler: [requirePermission('requests:update'), validate({ params: requestIdParamSchema, body: completeRequestSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;
    const body = request.body as CompleteRequestInput;

    const serviceRequest = await requestService.complete(tenantSlug, id, userId, body.notes);
    reply.send(serviceRequest);
  });

  // Cancel request
  app.post<{ Params: { id: string } }>('/:id/cancel', {
    preHandler: [requirePermission('requests:update'), validate({ params: requestIdParamSchema, body: cancelRequestSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;
    const body = request.body as CancelRequestInput;

    const serviceRequest = await requestService.cancel(tenantSlug, id, body.reason, userId);
    reply.send(serviceRequest);
  });

  // Get request approvals
  app.get<{ Params: { id: string } }>('/:id/approvals', {
    preHandler: [requirePermission('approvals:read'), validate({ params: requestIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as RequestIdParamInput;

    const approvals = await requestService.getApprovals(tenantSlug, id);
    reply.send({ data: approvals });
  });

  // Approve request
  app.post<{ Params: { id: string; approvalId: string } }>('/:id/approvals/:approvalId/approve', {
    preHandler: [requirePermission('approvals:approve'), validate({ params: requestApprovalParamSchema, body: approvalActionSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, approvalId } = request.params as RequestApprovalParamInput;
    const body = request.body as ApprovalActionInput;

    const serviceRequest = await requestService.approve(
      tenantSlug,
      id,
      approvalId,
      body.comments || '',
      userId
    );
    reply.send(serviceRequest);
  });

  // Reject request
  app.post<{ Params: { id: string; approvalId: string } }>('/:id/approvals/:approvalId/reject', {
    preHandler: [requirePermission('approvals:approve'), validate({ params: requestApprovalParamSchema, body: approvalActionSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, approvalId } = request.params as RequestApprovalParamInput;
    const body = request.body as ApprovalActionInput;

    const serviceRequest = await requestService.reject(
      tenantSlug,
      id,
      approvalId,
      body.comments || '',
      userId
    );
    reply.send(serviceRequest);
  });

  // Get request comments
  app.get<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('requests:read'), validate({ params: requestIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as RequestIdParamInput;

    const comments = await requestService.getComments(tenantSlug, id);
    reply.send({ data: comments });
  });

  // Add comment to request
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('requests:update'), validate({ params: requestIdParamSchema, body: addCommentSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = request.params as RequestIdParamInput;
    const body = request.body as AddCommentInput;

    const comment = await requestService.addComment(
      tenantSlug,
      id,
      body.content,
      userId,
      body.isInternal
    );
    reply.status(201).send(comment);
  });

  // Get request status history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('requests:read'), validate({ params: requestIdParamSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as RequestIdParamInput;

    const history = await requestService.getStatusHistory(tenantSlug, id);
    reply.send({ data: history });
  });
}
