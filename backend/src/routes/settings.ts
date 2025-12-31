import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { validateTenantSchema } from '../middleware/tenantValidation.js';
import { settingsService } from '../services/index.js';
import { BadRequestError } from '../utils/errors.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // Add tenant validation to all settings routes
  fastify.addHook('preHandler', async (request, reply) => {
    await authenticate(request, reply);
    await validateTenantSchema(request, reply);
  });

  // GET /api/v1/settings
  fastify.get('/settings', {
    schema: {
      tags: ['Settings'],
      response: {
        200: {
          type: 'object',
          properties: {
            settings: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const settings = await settingsService.getSettings(request.tenantSlug!);
    return { settings };
  });

  // PUT /api/v1/settings
  fastify.put('/settings', {
    schema: {
      tags: ['Settings'],
      body: {
        type: 'object',
        additionalProperties: true
      }
    }
  }, async (request: FastifyRequest<{ Body: Record<string, any> }>) => {
    const updatedSettings = await settingsService.updateSettings(
      request.tenantSlug!,
      request.body
    );
    
    return { settings: updatedSettings };
  });
}