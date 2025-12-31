import { FastifyInstance } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateUUID } from '../utils/validation.js';

// Add this validation schema for date parameters
const dateRangeSchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' }
  },
  additionalProperties: false
};

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['admin', 'manager', 'analyst']));

  fastify.get('/templates', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as any;
    
    const result = await reportTemplateService.list(request.tenantSlug!, {
      page: parseInt(page as any),
      perPage: parseInt(perPage as any)
    }, {
      reportType,
      isPublic: isPublic !== undefined ? Boolean(isPublic) : undefined
    });
    
    return result;
  });

  // Add validation to the reports generation endpoint
  fastify.post('/generate', {
    schema: {
      body: {
        type: 'object',
        required: ['reportType'],
        properties: {
          reportType: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          filters: { type: 'object' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { reportType, startDate, endDate, filters } = request.body as any;
    
    // Validate date format and sanitize inputs
    if (startDate && isNaN(Date.parse(startDate))) {
      return reply.status(400).send({ error: 'Invalid startDate format' });
    }
    
    if (endDate && isNaN(Date.parse(endDate))) {
      return reply.status(400).send({ error: 'Invalid endDate format' });
    }
    
    // Ensure endDate is after startDate
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return reply.status(400).send({ error: 'endDate must be after startDate' });
    }
    
    // TODO: Implement report generation logic with sanitized inputs
    return { message: 'Report generation started', reportType };
  });
}