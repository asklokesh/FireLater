import { FastifyInstance, FastifyRequest } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/pagination.js';
import { z } from 'zod';

// Add filter validation schema
const ReportFiltersSchema = z.object({
  reportType: z.string().optional(),
  isPublic: z.boolean().optional()
}).strict();

export default async function reportingRoutes(fastify: FastifyInstance) {
  // List report templates with sanitized filters
  fastify.get('/templates', {
    preHandler: [authenticate, authorize('read:reports'), validatePagination],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      page?: number;
      perPage?: number;
      reportType?: string;
      isPublic?: boolean;
    }
  }>, reply) => {
    try {
      // Sanitize filters using Zod
      const filters = ReportFiltersSchema.parse({
        reportType: request.query.reportType,
        isPublic: request.query.isPublic
      });

      const pagination = {
        page: request.query.page || 1,
        perPage: request.query.perPage || 20
      };

      const result = await reportTemplateService.list(
        request.tenantSlug!,
        pagination,
        filters
      );
      
      return reply.send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      throw error;
    }
  });
}