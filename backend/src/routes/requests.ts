import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requestService } from '../services/requests.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// Add a simple in-memory debounce store (in production, use Redis)
const debounceStore = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 300; // milliseconds

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

const delegateApprovalSchema = z.object({
  delegateTo: z.string().uuid(),
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

// Add schema for catalog item position updates
const updateCatalogItemPositionSchema = z.object({
  itemId: z.string().uuid(),
  position: z.number().int().min(0),
});

export default async function requestRoutes(app: FastifyInstance) {
  // List requests
  app.get('/', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      priority: query.priority,
      requesterId: query.requester_id,
      requestedForId: query.requested_for_id,
      assignedTo: query.assigned_to,
      catalogItemId: query.catalog_item_id,
      search: query.search || query.q,
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

  // Add debounced catalog item position update endpoint
  app.put('/catalog-items/position', {
    preHandler: [requirePermission('requests:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateCatalogItemPositionSchema.parse(request.body);
    
    // Create a unique key for this tenant and item
    const debounceKey = `${tenantSlug}:${body.itemId}`;
    
    // Clear existing debounce timeout if exists
    if (debounceStore.has(debounceKey)) {
      clearTimeout(debounceStore.get(debounceKey));
    }
    
    // Set new debounce timeout
    const timeoutId = setTimeout(async () => {
      try {
        // Perform the actual position update
        await requestService.updateCatalogItemPosition(tenantSlug, body.itemId, body.position);
        // Clean up the store
        debounceStore.delete(debounceKey);
      } catch (error) {
        console.error('Error updating catalog item position:', error);
      }
    }, DEBOUNCE_DELAY);
    
    // Store the timeout ID
    debounceStore.set(debounceKey, timeoutId);
    
    reply.send({ message: 'Position update queued' });
  });

  // Get request by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('requests:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const serviceRequest = await requestService.findById(tenantSlug, request.params.id);

    if (!serviceRequest) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Request with id '${request.params.id}' not found`,
      });
    }

    reply.send(serviceRequest);
  });