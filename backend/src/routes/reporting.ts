import { FastifyInstance } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant.js';
import type { PaginationParams } from '../types/index.js';

interface ReportingQueryParams extends PaginationParams {
  reportType?: string;
  isPublic?: string;
}

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Add validation schema for query parameters
  const queryParamsSchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        reportType: { type: 'string' },
        isPublic: { type: 'string', enum: ['true', 'false'] }
      },
      additionalProperties: false
    }
  };

  // List report templates with validation
  fastify.get(
    '/templates',
    {
      preHandler: [authenticate, authorize('read:reports'), validateTenantAccess],
      schema: queryParamsSchema
    },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const { page, perPage, reportType, isPublic } = request.query as ReportingQueryParams;
      
      // Sanitize and parse query parameters
      const pagination = {
        page: Math.max(1, parseInt(String(page), 10) || 1),
        perPage: Math.min(100, Math.max(1, parseInt(String(perPage), 10) || 20))
      };
      
      const filters = {
        reportType: reportType || undefined,
        isPublic: isPublic !== undefined ? isPublic === 'true' : undefined
      };

      const result = await reportTemplateService.list(tenantSlug, pagination, filters);
      return reply.send(result);
    }
  );
}