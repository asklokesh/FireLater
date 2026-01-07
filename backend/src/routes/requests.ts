import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requestService } from '../services/requests.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createRequestSchema = z.object({
  catalogItemId: z.string().uuid(),
  requestedForId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  formData: z.record(z.unknown()),
  notes: z.string().max(2000).optional(),
  costCenter: z.string().max(100).optional(),
});

const updateRequestSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  formData: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
  costCenter: z.string().max(100).optional(),
});

const assignRequestSchema = z.object({
  assignedTo: z.string().uuid(),
});

const approvalActionSchema = z.object({
  comments: z.string().max(2000).optional(),
});

const cancelRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});

const completeRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

const addCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

// Parameter validation schemas
const requestIdParamSchema = z.object({
  id: z.string().uuid(),
});

const requestApprovalParamSchema = z.object({
  id: z.string().uuid(),
  approvalId: z.string().uuid(),
});

// Query parameter validation schema
const listRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['submitted', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  requester_id: z.string().uuid().optional(),
  requested_for_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  catalog_item_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});

export default async function requestRoutes(app: FastifyInstance) {
  // List requests
  app.get('/', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listRequestsQuerySchema.parse(query);
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
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);

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
    preHandler: [requirePermission('requests:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createRequestSchema.parse(request.body);

    const serviceRequest = await requestService.create(tenantSlug, body, userId);
    reply.status(201).send(serviceRequest);
  });

  // Update request
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);
    const body = updateRequestSchema.parse(request.body);

    const serviceRequest = await requestService.update(tenantSlug, id, body, userId);
    reply.send(serviceRequest);
  });

  // Assign request
  app.post<{ Params: { id: string } }>('/:id/assign', {
    preHandler: [requirePermission('requests:assign')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);
    const body = assignRequestSchema.parse(request.body);

    const serviceRequest = await requestService.assign(tenantSlug, id, body.assignedTo, userId);
    reply.send(serviceRequest);
  });

  // Start work on request
  app.post<{ Params: { id: string } }>('/:id/start', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);

    const serviceRequest = await requestService.startWork(tenantSlug, id, userId);
    reply.send(serviceRequest);
  });

  // Complete request
  app.post<{ Params: { id: string } }>('/:id/complete', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);
    const body = completeRequestSchema.parse(request.body);

    const serviceRequest = await requestService.complete(tenantSlug, id, userId, body.notes);
    reply.send(serviceRequest);
  });

  // Cancel request
  app.post<{ Params: { id: string } }>('/:id/cancel', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);
    const body = cancelRequestSchema.parse(request.body);

    const serviceRequest = await requestService.cancel(tenantSlug, id, body.reason, userId);
    reply.send(serviceRequest);
  });

  // Get request approvals
  app.get<{ Params: { id: string } }>('/:id/approvals', {
    preHandler: [requirePermission('approvals:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);

    const approvals = await requestService.getApprovals(tenantSlug, id);
    reply.send({ data: approvals });
  });

  // Approve request
  app.post<{ Params: { id: string; approvalId: string } }>('/:id/approvals/:approvalId/approve', {
    preHandler: [requirePermission('approvals:approve')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, approvalId } = requestApprovalParamSchema.parse(request.params);
    const body = approvalActionSchema.parse(request.body);

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
    preHandler: [requirePermission('approvals:approve')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id, approvalId } = requestApprovalParamSchema.parse(request.params);
    const body = approvalActionSchema.parse(request.body);

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
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);

    const comments = await requestService.getComments(tenantSlug, id);
    reply.send({ data: comments });
  });

  // Add comment to request
  app.post<{ Params: { id: string } }>('/:id/comments', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);
    const body = addCommentSchema.parse(request.body);

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
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = requestIdParamSchema.parse(request.params);

    const history = await requestService.getStatusHistory(tenantSlug, id);
    reply.send({ data: history });
  });
}
