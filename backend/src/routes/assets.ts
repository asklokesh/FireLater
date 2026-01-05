import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { assetService } from '../services/asset.js';
import { authenticate } from '../middleware/auth.js';

/**
 * Asset Management Routes
 * Stub implementation - to be fully implemented
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

  // GET /api/assets - List assets
  app.get('/', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantSlug } = request.user;

    const result = await assetService.listAssets(tenantSlug, {
      page: 1,
      limit: 50,
    });

    reply.send(result);
  });

  // GET /api/assets/:id - Get asset by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params;

    const asset = await assetService.getAsset(tenantSlug, id);

    reply.send(asset);
  });

  // POST /api/assets - Create asset
  app.post('/', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(501).send({ message: 'Not implemented' });
  });

  // PUT /api/assets/:id - Update asset
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    reply.status(501).send({ message: 'Not implemented' });
  });

  // DELETE /api/assets/:id - Delete asset
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    reply.status(501).send({ message: 'Not implemented' });
  });
}
