import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { AssetService } from '../services/assets.js';

const assetService = new AssetService();

export default async function assetRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string' },
          status: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { page = 1, perPage = 20, search, status } = request.query as any;
    
    // Remove duplicate tenant validation - now handled by middleware
    const assets = await assetService.list(request.tenantSlug!, {
      page: parseInt(page),
      perPage: parseInt(perPage),
      search,
      status
    });
    
    return assets;
  });
}