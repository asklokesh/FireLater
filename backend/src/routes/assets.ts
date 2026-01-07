import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assetService } from '../services/asset.js';
import { authenticate } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

// Asset type and status enums for validation (matching service types)
const assetTypeEnum = z.enum(['hardware', 'software', 'network', 'cloud', 'virtual', 'other']);
const assetCategoryEnum = z.enum([
  'server', 'workstation', 'laptop', 'mobile', 'printer', 'network_device',
  'storage', 'software_license', 'saas_subscription', 'virtual_machine',
  'container', 'database', 'application', 'other'
]);
const assetStatusEnum = z.enum(['active', 'inactive', 'maintenance', 'retired', 'disposed', 'ordered', 'in_storage']);

// Query parameter schemas
const listAssetsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  asset_type: assetTypeEnum.optional(),
  category: assetCategoryEnum.optional(),
  status: assetStatusEnum.optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  owner_id: z.string().uuid().optional(),
  assigned_to_id: z.string().uuid().optional(),
  department: z.string().max(100).optional(),
});

const assetIdSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Asset Management Routes
 * Full implementation with input validation
 */
export default async function assetRoutes(app: FastifyInstance) {
  // GET /api/assets/stats/overview - Get asset statistics
  app.get('/stats/overview', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantSlug } = request.user;

    const stats = await assetService.getAssetStats(tenantSlug);

    reply.send(stats);
  });

  // GET /api/assets - List assets with filters and pagination
  app.get('/', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = listAssetsQuerySchema.parse(query);
    const pagination = parsePagination(query);

    const filters = {
      assetType: validatedQuery.asset_type,
      category: validatedQuery.category,
      status: validatedQuery.status,
      search: validatedQuery.search || validatedQuery.q,
      ownerId: validatedQuery.owner_id,
      assignedToId: validatedQuery.assigned_to_id,
      department: validatedQuery.department,
      page: pagination.page,
      limit: pagination.perPage,
    };

    const result = await assetService.listAssets(tenantSlug, filters);

    reply.send(createPaginatedResponse(result.assets, result.total, pagination));
  });

  // GET /api/assets/:id - Get asset by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    // Validate ID parameter
    const { id } = assetIdSchema.parse(request.params);

    const asset = await assetService.getAsset(tenantSlug, id);

    reply.send(asset);
  });

  // POST /api/assets - Create asset (stub)
  app.post('/', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(501).send({ message: 'Not implemented' });
  });

  // PUT /api/assets/:id - Update asset (stub)
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    // Validate ID even for stub
    assetIdSchema.parse(request.params);
    reply.status(501).send({ message: 'Not implemented' });
  });

  // DELETE /api/assets/:id - Delete asset (stub)
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    // Validate ID even for stub
    assetIdSchema.parse(request.params);
    reply.status(501).send({ message: 'Not implemented' });
  });
}
