import { FastifyInstance } from 'fastify';
import { tenantService } from '../services/tenant.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  updateSettingsSchema,
  type UpdateSettingsInput,
} from '../schemas/settings.js';


export default async function settingsRoutes(app: FastifyInstance) {
  // Get tenant settings
  app.get('/', {
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;

    const result = await tenantService.getSettings(tenantSlug);
    reply.send(result);
  });

  // Update tenant settings
  app.put('/', {
    preHandler: [requirePermission('settings:update'), validate({ body: updateSettingsSchema })],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = request.body as UpdateSettingsInput;

    const updated = await tenantService.updateSettings(tenantSlug, body);
    reply.send({
      tenant: updated,
      settings: updated.settings,
    });
  });
}
