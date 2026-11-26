import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { assetService } from '../services/asset.js';
import { authenticate } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  assetIdSchema,
  listAssetsQuerySchema,
  type AssetIdInput,
  type ListAssetsQueryInput,
} from '../schemas/assets.js';


// Query parameter schemas


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
    preHandler: [authenticate, validate({ query: listAssetsQuerySchema })],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;

    // Validate query parameters
    const validatedQuery = request.query as ListAssetsQueryInput;
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
    preHandler: [authenticate, validate({ params: assetIdSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    // Validate ID parameter
    const { id } = request.params as AssetIdInput;

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
    preHandler: [authenticate, validate({ params: assetIdSchema })],
  }, async (request, reply) => {
    // ID is validated by the validate() preHandler even for this stub
    reply.status(501).send({ message: 'Not implemented' });
  });

  // DELETE /api/assets/:id - Delete asset (stub)
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, validate({ params: assetIdSchema })],
  }, async (request, reply) => {
    // ID is validated by the validate() preHandler even for this stub
    reply.status(501).send({ message: 'Not implemented' });
  });
}
