import { FastifyInstance } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant.js';
import { BadRequestError } from '../utils/errors.js';

// Add validation helper
const validateReportType = (reportType: string): boolean => {
  const allowedTypes = ['incident_summary', 'service_performance', 'user_activity', 'change_request', 'problem_trends'];
  return allowedTypes.includes(reportType);
};

const validateBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestError('Invalid boolean value');
};

export default async function reportingRoutes(fastify: FastifyInstance) {
  // Apply authentication and tenant validation to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize('read:reports'));
  fastify.addHook('preHandler', validateTenantAccess);

  // GET /api/v1/reporting/templates
  fastify.get('/templates', {
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
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as {
      page?: number;
      perPage?: number;
      reportType?: string;
      isPublic?: string;
    };

    // Validate parameters
    if (reportType && !validateReportType(reportType)) {
      throw new BadRequestError('Invalid report type');
    }
    
    const isPublicBool = isPublic !== undefined ? validateBoolean(isPublic) : undefined;

    const pagination = { page, perPage };
    const filters = reportType || isPublicBool !== undefined ? { 
      reportType, 
      isPublic: isPublicBool 
    } : undefined;

    const result = await reportTemplateService.list(tenantSlug, pagination, filters);
    return result;
  });

  // GET /api/v1/reporting/templates/:id
  fastify.get('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { id } = request.params as { id: string };

    // Validate UUID format
    if (!id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
      throw new BadRequestError('Invalid template ID format');
    }

    const template = await reportTemplateService.findById(tenantSlug, id);
    if (!template) {
      throw new NotFoundError('Report template', id);
    }
    return template;
  });
}