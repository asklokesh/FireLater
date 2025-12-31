import { FastifyInstance } from 'fastify';
import { reportTemplateService } from '../services/reporting.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateSchema } from '../middleware/validation.js';
import { reportTemplateSchema } from '../schemas/reporting.js';

export async function reportingRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);
  
  // List report templates
  fastify.get('/templates', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          reportType: { type: 'string' },
          isPublic: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            templates: { type: 'array' },
            total: { type: 'integer' },
            page: { type: 'integer' },
            perPage: { type: 'integer' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { page = 1, perPage = 20, reportType, isPublic } = request.query as any;
    
    try {
      const result = await reportTemplateService.list(
        tenantSlug,
        { page, perPage },
        { reportType, isPublic }
      );
      
      return {
        templates: result.templates,
        total: result.total,
        page,
        perPage
      };
    } catch (error) {
      request.log.error({ error, tenantSlug }, 'Failed to list report templates');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve report templates'
      });
    }
  });

  // Get report template by ID
  fastify.get('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as any;
    
    try {
      const template = await reportTemplateService.findById(tenantSlug, id);
      
      if (!template) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Report template not found'
        });
      }
      
      return template;
    } catch (error) {
      request.log.error({ error, tenantSlug, id }, 'Failed to get report template');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to retrieve report template'
      });
    }
  });

  // Create report template
  fastify.post('/templates', {
    schema: {
      body: reportTemplateSchema
    },
    preHandler: authorize(['admin', 'manager'])
  }, async (request, reply) => {
    const { tenantSlug, id: userId } = request.user!;
    const data = request.body as any;
    
    try {
      const template = await reportTemplateService.create(tenantSlug, userId, data);
      return reply.status(201).send(template);
    } catch (error) {
      request.log.error({ error, tenantSlug, data }, 'Failed to create report template');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create report template'
      });
    }
  });

  // Update report template
  fastify.put('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      body: reportTemplateSchema
    },
    preHandler: authorize(['admin', 'manager'])
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as any;
    const data = request.body as any;
    
    try {
      const template = await reportTemplateService.update(tenantSlug, id, data);
      return template;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        return reply.status(404).send({
          error: 'Not Found',
          message: error.message
        });
      }
      
      request.log.error({ error, tenantSlug, id, data }, 'Failed to update report template');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to update report template'
      });
    }
  });

  // Delete report template
  fastify.delete('/templates/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: authorize(['admin', 'manager'])
  }, async (request, reply) => {
    const { tenantSlug } = request.user!;
    const { id } = request.params as any;
    
    try {
      await reportTemplateService.delete(tenantSlug, id);
      return reply.status(204).send();
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        return reply.status(404).send({
          error: 'Not Found',
          message: error.message
        });
      }
      
      request.log.error({ error, tenantSlug, id }, 'Failed to delete report template');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to delete report template'
      });
    }
  });
}