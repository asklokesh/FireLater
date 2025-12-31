import { FastifyInstance, FastifyRequest } from 'fastify';
import { knowledgeService } from '../services/knowledge.js';
import { authenticateTenant } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant-validation.js';
import { NotFoundError } from '../utils/errors.js';

export async function knowledgeRoutes(fastify: FastifyInstance) {
  // GET /api/v1/knowledge/articles
  fastify.get('/articles', {
    preHandler: [authenticateTenant, validateTenantAccess],
    schema: {
      tags: ['knowledge'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          status: { type: 'string' },
          search: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      category?: string;
      status?: string;
      search?: string;
      page?: number;
      perPage?: number;
    }
  }>, reply) => {
    const { tenantSlug } = request;
    const { category, status, search, page = 1, perPage = 20 } = request.query;

    const filters = {
      category: category || undefined,
      status: status || undefined,
      search: search || undefined
    };

    const pagination = { page, perPage };

    const result = await knowledgeService.listArticles(tenantSlug, filters, pagination);

    return {
      articles: result.articles,
      total: result.total,
      page: pagination.page,
      perPage: pagination.perPage
    };
  });
}