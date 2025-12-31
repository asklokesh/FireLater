import { FastifyInstance, FastifyRequest } from 'fastify';
import { knowledgeService } from '../services/knowledge.js';
import { authenticateTenant, validateTenantAccess } from '../middleware/auth.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

// Add validation for UUID format
export function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Add this validation function for article status
function validateArticleStatus(status?: string): void {
  const validStatuses = ['draft', 'published', 'archived'];
  if (status && !validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
}

// Add search endpoint with pagination
fastify.get('/knowledge/search', {
  preHandler: [authenticateTenant, validateTenantAccess],
  schema: {
    tags: ['Knowledge Base'],
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        category: { type: 'string' },
        status: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      }
    }
  }
}, async (request: FastifyRequest<{ 
  Querystring: { 
    q?: string; 
    category?: string; 
    status?: string;
    page?: number;
    limit?: number;
  } 
}>) => {
  const { q, category, status, page = 1, limit = 20 } = request.query;
  
  if (!request.tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
  
  validateArticleStatus(status);
  
  const offset = (page - 1) * limit;
  
  const results = await knowledgeService.searchArticles(
    request.tenantSlug,
    { q, category, status, limit, offset }
  );
  
  return {
    data: results.articles,
    pagination: {
      page,
      limit,
      total: results.total,
      pages: Math.ceil(results.total / limit)
    }
  };
});